import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Flame, Clock, Target, Play, CheckCircle2, MessageSquare, Route, Shield, Award, Activity, Zap, MoveRight
} from "lucide-react";
import {
  generateReviewQuestion,
  getDashboard,
  getDueReviews,
  regenerateRoadmap,
  submitReview,
} from "../api";
import BuildingIndicator from "../components/BuildingIndicator";
import RoadmapTimeline from "../components/RoadmapTimeline";
import PageSkeleton from "../components/Skeleton";
import { PageHeader } from "../components/ui/PageHeader";
import { DimensionalOrb } from "../components/ui/DimensionalOrb";
import { useAppState } from "../context/AppStateContext";
import { useToast } from "../context/ToastContext";
import type { DashboardResponse, DueReview, MCQQuestion, QuestionResult } from "../types";

export default function Dashboard() {
  const { state, updateState, auth, setTutorOpen, refreshState } = useAppState();
  const { toast } = useToast();
  const sessionId = auth?.session_id;
    
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [showRegenerateBox, setShowRegenerateBox] = useState(false);
  const [regenerateText, setRegenerateText] = useState("");

  const [dueReviews, setDueReviews] = useState<DueReview[]>([]);
  const [activeReview, setActiveReview] = useState<DueReview | null>(null);
  const [reviewQuestion, setReviewQuestion] = useState<{ index: number; question: MCQQuestion } | null>(null);
  const [reviewAnswer, setReviewAnswer] = useState("");
  const [reviewResult, setReviewResult] = useState<{ correct: boolean; result: QuestionResult; next_review_at: string | null } | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);

  useEffect(() => {
    if (!sessionId) return;
    
    Promise.all([getDashboard(sessionId), getDueReviews(sessionId)]).then(
      ([dashboardRes, reviewsRes]) => {
        setDashboard(dashboardRes);
        setDueReviews(reviewsRes.due);
      },
    );
  }, [sessionId]);

  // Review handlers
  async function handleStartReview(review: DueReview) {
    if (!sessionId) return;
    setActiveReview(review);
    setReviewQuestion(null);
    setReviewResult(null);
    setReviewAnswer("");
    setReviewBusy(true);
    try {
      const res = await generateReviewQuestion(sessionId, review.node_id);
      setReviewQuestion({ index: res.question_index, question: res.question });
    } catch {
      setActiveReview(null);
      toast("Failed to load review question.", "error");
    } finally {
      setReviewBusy(false);
    }
  }

  async function handleSubmitReview() {
    if (!sessionId || !activeReview || !reviewQuestion || !reviewAnswer) return;
    setReviewBusy(true);
    try {
      const res = await submitReview(sessionId, activeReview.node_id, reviewQuestion.index, reviewAnswer);
      setReviewResult({ correct: res.correct, result: res.result, next_review_at: res.next_review_at });
      if (res.correct) {
          setDueReviews((prev) => prev.filter((r) => r.node_id !== activeReview.node_id));
      }
      await refreshState();
    } catch {
      toast("Failed to submit review.", "error");
    } finally {
      setReviewBusy(false);
    }
  }

  async function handleRegenerateRoadmap() {
    if (!sessionId) return;
    setRegenerating(true);
    try {
      // Instructions specify not regenerating completed. Backend or prompt text will handle it.
      const fullInstructions = `Do NOT change or regenerate any nodes that are already marked as "complete". ${regenerateText.trim()}`;
      const { state: newState } = await regenerateRoadmap(sessionId, fullInstructions);
      updateState(newState);
      setShowRegenerateBox(false);
      setRegenerateText("");
      toast("Roadmap regenerated successfully.", "success");
    } catch {
      toast("Failed to regenerate roadmap.", "error");
    } finally {
      setRegenerating(false);
    }
  }

  if (!sessionId || !dashboard || !state) {
    return (
      <div className="min-h-screen bg-[#f7f5ed] text-emerald-950 flex flex-col">
        <PageSkeleton />
      </div>
    );
  }

  const { roadmap, learner_profile, skill_gap_map } = state;
  const nodes = roadmap?.nodes ?? [];
  const completableNodes = nodes.filter((n) => n.assessment !== null) ?? [];
  const completedNodes = completableNodes.filter((n) => n.status === "complete");
  
  // Available node is the one we want to "Continue Learning"
  const availableNode = dashboard.current_node || nodes.find(n => n.status === "available" || n.status === "in_progress");

  // "What's next" helper logic
  const currentNodeIdx = availableNode ? nodes.findIndex((n) => n.node_id === availableNode.node_id) : -1;
  const nextNodeAfter = currentNodeIdx >= 0 ? nodes[currentNodeIdx + 1] ?? null : null;
  const currentDone = (availableNode?.status ?? null) === "complete";
  const allTopicsDone = nodes.length > 0 && nodes.every((n) => n.status === "complete");
  const showWhatsNext = allTopicsDone || (currentDone && !!nextNodeAfter);

  // Calculate Subtopic Progress for Available Node
  const subtopics = availableNode?.subtopics ?? [];
  const completedSubtopics = subtopics.filter(s => s.status === "passed").length;
  
  // Time formatting
  const timeSpentSeconds = availableNode?.time_spent_seconds ?? 0;
  const hours = Math.floor(timeSpentSeconds / 3600);
  const minutes = Math.floor((timeSpentSeconds % 3600) / 60);
  const formattedTime = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  // Skill Overview counts
  const assessments = skill_gap_map?.assessments ?? [];
  const skillsCount = {
    known: assessments.filter(a => a.status === "known").length,
    learned: assessments.filter(a => a.status === "learned").length,
    claimed_unconfirmed: assessments.filter(a => a.status === "claimed_unconfirmed").length,
    gap: assessments.filter(a => a.status === "gap").length,
  };
  const totalSkills = assessments.length || 1; // avoid division by zero

  return (
    <div className="min-h-screen bg-[#f7f5ed] text-emerald-950 pb-24 font-sans">
      <div className="mx-auto max-w-7xl px-4 py-8 relative">
        {/* Background glow effects */}

        <div className="relative z-10 flex flex-col gap-8 md:grid md:grid-cols-12 md:items-start">
          
          {/* Main Column (Prioritized on Mobile) */}
          <div className="md:col-span-7 flex flex-col gap-8 order-1">
            
            {/* Section 1: Welcome Header */}
            <PageHeader eyebrow="Your learning space" title={`Welcome back, ${learner_profile.name || "Learner"}!`} description={learner_profile.goal ? `Your goal: ${learner_profile.goal}` : "Your next focused step is ready."} actions={<DimensionalOrb />} className="animate-fade-in-up" />

            {/* Section 2: Continue Learning */}
            {availableNode && (
              <div className="glass-panel relative overflow-hidden rounded-3xl p-6 md:p-8 animate-fade-in-up border border-slate-400/30 group shadow-lg shadow-slate-950/50" style={{ animationDelay: "0.1s" }}>
                <div className="absolute inset-0 bg-gradient-to-br from-slate-400/20 to-slate-500/20 opacity-50 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div className="space-y-4">
                    <div className="inline-flex items-center gap-2 rounded-full bg-slate-400/20 px-3 py-1 border border-slate-400/40">
                      <Target className="w-4 h-4 text-slate-300" />
                      <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Current Topic</span>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-bold font-display text-slate-100">{availableNode.topic}</h2>
                    <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-slate-400">
                      <span className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-800"><Clock className="w-4 h-4 text-slate-300" /> ~{availableNode.estimated_days} days</span>
                      <span className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-800"><Activity className="w-4 h-4 text-slate-300" /> {completedSubtopics}/{subtopics.length} Subtopics</span>
                      {timeSpentSeconds > 60 && (
                        <span className="flex items-center gap-1.5 bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-800">Spent: {formattedTime}</span>
                      )}
                    </div>
                  </div>
                  <Link
                    to={`/topic/${availableNode.node_id}`}
                    className="shrink-0 flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-8 py-4 text-base font-bold text-slate-900 transition-all hover:bg-slate-200 hover:scale-105 shadow-[0_0_30px_rgba(148,163,184,0.35)] active:scale-95"
                  >
                    Continue Learning <Play className="w-5 h-5 fill-current" />
                  </Link>
                </div>
              </div>
            )}

            {/* Section 5.5: What's Next helper */}
            {showWhatsNext && (
              <div className="glass-panel-light p-6 rounded-3xl border border-emerald-500/20 animate-fade-in-up" style={{ animationDelay: "0.35s" }}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                  <div className="flex items-start gap-3">
                    <div className="bg-emerald-500/10 p-3 rounded-xl shrink-0">
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    </div>
                    <div>
                      {allTopicsDone ? (
                        <>
                          <h4 className="font-bold text-slate-100">Roadmap complete. Amazing work!</h4>
                          <p className="text-sm text-slate-400 mt-0.5">You've mastered every topic. See your achievement summary.</p>
                        </>
                      ) : (
                        <>
                          <h4 className="font-bold text-slate-100">"{availableNode?.topic}" is complete!</h4>
                          <p className="text-sm text-slate-400 mt-0.5">Ready for the next step. Great momentum, keep going.</p>
                        </>
                      )}
                    </div>
                  </div>
                  <Link
                    to={allTopicsDone ? "/complete" : `/topic/${nextNodeAfter?.node_id}`}
                    className="shrink-0 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-slate-200 hover:gap-3"
                  >
                    {allTopicsDone ? "View summary" : `Start "${nextNodeAfter?.topic}"`} <MoveRight className="w-4 h-4" />
                  </Link>
                </div>
              </div>
            )}

            {/* Section 6: Roadmap Overview */}
            <div className="space-y-4 animate-fade-in-up" style={{ animationDelay: "0.4s" }}>
              <div className="flex items-center gap-3">
                <Route className="w-6 h-6 text-slate-300" />
                <h3 className="text-xl font-bold font-display">Roadmap</h3>
              </div>
              <div className="glass-panel-light rounded-3xl border border-slate-800/50 pt-6 pb-4 px-2 sm:px-4">
                <RoadmapTimeline nodes={nodes} />
              </div>
            </div>

            {/* Section 9: AI Actions */}
            <div className="grid gap-4 sm:grid-cols-2 animate-fade-in-up" style={{ animationDelay: "0.6s" }}>
              <button 
                onClick={() => setTutorOpen(true)}
                className="flex items-center gap-3 p-4 rounded-2xl glass-panel-light border border-slate-400/20 hover:border-slate-400/50 hover:bg-slate-400/10 transition-all text-left"
              >
                <div className="p-3 rounded-xl bg-slate-400/20">
                  <MessageSquare className="w-6 h-6 text-slate-300" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-100">Ask Tutor</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Get help with your concepts</p>
                </div>
              </button>
              
              <div className="relative">
                <button 
                  onClick={() => setShowRegenerateBox(!showRegenerateBox)}
                  className="w-full flex items-center gap-3 p-4 rounded-2xl glass-panel-light border border-slate-400/20 hover:border-slate-400/50 hover:bg-slate-400/10 transition-all text-left"
                >
                  <div className="p-3 rounded-xl bg-slate-400/20">
                    <Zap className="w-6 h-6 text-slate-300" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-100">Regenerate</h4>
                    <p className="text-xs text-slate-400 mt-0.5">Adjust roadmap direction</p>
                  </div>
                </button>
                {showRegenerateBox && (
                  <div className="absolute top-full mt-2 w-full z-20 rounded-2xl border border-slate-400/40 bg-slate-900 p-4 shadow-xl shadow-black">
                    <label className="mb-2 block text-xs font-semibold text-slate-400">
                      Give AI instructions to regenerate upcoming topics. (Completed topics will remain).
                    </label>
                    <textarea
                      autoFocus
                      value={regenerateText}
                      onChange={(e) => setRegenerateText(e.target.value)}
                      rows={3}
                      placeholder="e.g. Focus more on practical frontend dev..."
                      className="w-full resize-y rounded-xl bg-slate-950 border border-slate-700 p-3 text-sm text-slate-100 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-all"
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={handleRegenerateRoadmap}
                        disabled={regenerating}
className="flex-1 rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-900 transition hover:bg-slate-200 disabled:opacity-50"
                        >
                          {regenerating ? "Working..." : "Confirm"}
                      </button>
                      <button
                        onClick={() => setShowRegenerateBox(false)}
                        disabled={regenerating}
                        className="rounded-xl bg-slate-800 border border-slate-700 px-4 py-2 text-sm font-semibold transition hover:bg-slate-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* Sidebar (Secondary Info, stacked on mobile) */}
          <div className="md:col-span-5 flex flex-col gap-6 order-2">
            
            {/* Section 3: Overall Progress */}
            <div className="glass-panel-light p-6 rounded-3xl animate-fade-in-up border border-slate-800/50" style={{ animationDelay: "0.2s" }}>
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Overall Progress</h3>
              <div className="flex items-end justify-between mb-2">
                <span className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-slate-300 to-slate-400">
                  {dashboard.percent_complete}%
                </span>
                <span className="text-sm font-medium text-slate-400 mb-1">
                  {completedNodes.length} / {completableNodes.length} Topics
                </span>
              </div>
              <div className="h-3 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div 
                  className="h-full bg-gradient-to-r from-slate-400 to-slate-300 rounded-full shadow-[0_0_10px_rgba(148,163,184,0.4)] transition-all duration-1000"
                  style={{ width: `${dashboard.percent_complete}%` }}
                />
              </div>
            </div>

            {/* Section 4: Streak */}
            <div className="relative overflow-hidden p-6 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-800/60 to-slate-900/60 animate-fade-in-up group" style={{ animationDelay: "0.25s" }}>
              <div className="absolute top-0 right-0 p-4 opacity-10 transform translate-x-4 -translate-y-4 group-hover:scale-110 transition-transform duration-500">
                <Flame className="w-32 h-32 text-slate-400" />
              </div>
              <div className="relative z-10">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-2">
                  <Flame className="w-4 h-4 text-orange-500" /> Current Streak
                </h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-black text-slate-100">{dashboard.current_streak_days}</span>
                  <span className="text-slate-300 font-medium">Days</span>
                </div>
                <p className="text-xs text-slate-400/70 mt-2 font-medium">Longest Streak: {dashboard.longest_streak_days} days</p>
              </div>
            </div>

            {/* Section 5: Due Reviews */}
            <div className="glass-panel-light p-6 rounded-3xl border border-amber-500/30 animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Target className="w-4 h-4" /> Spaced Repetition
              </h3>
              
              {dueReviews.length === 0 && !activeReview ? (
                <div className="flex flex-col items-center justify-center p-6 text-center">
                  <div className="bg-emerald-500/10 p-4 rounded-full mb-3">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h4 className="text-slate-100 font-bold">You're caught up.</h4>
                  <p className="text-sm text-slate-400 mt-1">No reviews due right now.</p>
                </div>
              ) : activeReview ? (
                 <div className="bg-amber-950/30 p-4 rounded-2xl border border-amber-500/20">
                   <div className="flex justify-between items-center mb-3">
                     <h4 className="font-semibold text-amber-200 text-sm">{activeReview.topic}</h4>
                     <button onClick={() => setActiveReview(null)} className="text-xs text-amber-500 hover:text-amber-400">Cancel</button>
                   </div>
                   {reviewBusy && !reviewQuestion && (
                     <BuildingIndicator label="Loading..." />
                   )}
                   {reviewQuestion && !reviewResult && (
                     <div className="space-y-3">
                       <p className="text-sm text-slate-100 leading-relaxed">{reviewQuestion.question.question}</p>
                       <div className="space-y-2">
                         {reviewQuestion.question.options.map((option) => (
                           <label
                             key={option}
                             className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                               reviewAnswer === option
                                 ? "border-amber-500 bg-amber-500/20 text-amber-100"
                                 : "border-slate-700/50 hover:bg-slate-800"
                             }`}
                           >
                             <input
                               type="radio"
                               checked={reviewAnswer === option}
                               onChange={() => setReviewAnswer(option)}
                               className="hidden"
                             />
                             <div className={`w-4 h-4 rounded-full border flex-shrink-0 flex items-center justify-center ${reviewAnswer === option ? 'border-amber-400' : 'border-slate-500'}`}>
                               {reviewAnswer === option && <div className="w-2 h-2 rounded-full bg-amber-400" />}
                             </div>
                             <span className="flex-1">{option}</span>
                           </label>
                         ))}
                       </div>
                       <button
                         onClick={handleSubmitReview}
                         disabled={!reviewAnswer || reviewBusy}
                         className="w-full rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-amber-500 disabled:opacity-50 mt-2"
                       >
                         {reviewBusy ? "Checking..." : "Submit Answer"}
                       </button>
                     </div>
                   )}
                   {reviewResult && (
                     <div className="space-y-3 animate-fade-in-up text-sm">
                       <div className={`flex items-center gap-2 p-3 rounded-xl border ${reviewResult.correct ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-slate-400/10 border-slate-400/30 text-slate-300"}`}>
                         {reviewResult.correct ? <CheckCircle2 className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
                         <span className="font-bold">{reviewResult.correct ? "Correct! Well done." : "Good effort! Let's review the answer."}</span>
                       </div>
                       <div className="text-slate-400 bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                         {!reviewResult.correct && (
                           <>
                             <p className="font-semibold text-slate-100 mb-1">Correct answer:</p>
                             <p className="mb-3 text-emerald-300">{reviewResult.result.correct_answer}</p>
                           </>
                         )}
                         <p className="text-slate-400">{reviewResult.result.explanation}</p>
                       </div>
                       
                       {reviewResult.next_review_at && (
                         <div className="flex items-center justify-center gap-2 text-xs text-amber-200/60 bg-amber-500/10 p-2 rounded-lg">
                           <Clock className="w-3 h-3" />
                           Next review scheduled for: {new Date(reviewResult.next_review_at).toLocaleDateString()}
                         </div>
                       )}

                       <button
                         onClick={() => setActiveReview(null)}
                         className="w-full rounded-xl bg-amber-600 px-4 py-2.5 font-bold hover:bg-amber-500 text-slate-100 transition mt-2"
                       >
                         Continue
                       </button>
                     </div>
                   )}
                 </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-sm font-semibold text-slate-100">{dueReviews.length} reviews due</span>
                  </div>
                  <div className="space-y-2">
                    {dueReviews.slice(0, 3).map((review) => (
                      <div key={review.node_id} className="flex items-center justify-between p-3 rounded-2xl bg-amber-950/20 border border-amber-500/10 group hover:border-amber-500/30 transition">
                        <span className="text-sm font-medium text-amber-100/90 truncate mr-2">{review.topic}</span>
                        <button
                          onClick={() => handleStartReview(review)}
                          className="shrink-0 text-xs font-bold bg-amber-500 text-slate-100 px-4 py-1.5 rounded-lg hover:bg-amber-400 transition shadow-[0_0_10px_rgba(245,158,11,0.2)]"
                        >
                          Review now
                        </button>
                      </div>
                    ))}
                    {dueReviews.length > 3 && (
                      <p className="text-xs text-center text-amber-500/70 mt-3 font-medium">+{dueReviews.length - 3} more pending</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            </div>

          {/* Section 7 & 8: Skills + Achievements (full-width bottom row) */}
          <div className="md:col-span-12 grid gap-6 lg:grid-cols-2 animate-fade-in-up" style={{ animationDelay: "0.5s" }}>
            <div className="glass-panel-light p-6 rounded-3xl border border-slate-800/50">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-5 flex items-center gap-2">
                <Shield className="w-4 h-4" /> Skill Profile
              </h3>
              
              <div className="space-y-4">
                {[
                  { label: "Learned", count: skillsCount.learned, color: "bg-emerald-500" },
                  { label: "Known (Prior)", count: skillsCount.known, color: "bg-slate-400" },
                  { label: "Claimed (TBD)", count: skillsCount.claimed_unconfirmed, color: "bg-amber-500" },
                  { label: "Skill Gaps", count: skillsCount.gap, color: "bg-red-500" },
                ].map(stat => {
                  const width = Math.max(5, (stat.count / totalSkills) * 100);
                  return (
                    <div key={stat.label} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-400">{stat.label}</span>
                        <span className="text-slate-400">{stat.count}</span>
                      </div>
                      <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                        <div className={`h-full ${stat.color} rounded-full`} style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="glass-panel-light p-6 rounded-3xl border border-slate-800/50">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Award className="w-4 h-4" /> Achievements
              </h3>
              <div className="flex flex-wrap gap-2">
                {dashboard.badges.map((badge) => (
                  <div
                    key={badge.id}
                    title={badge.label}
                    className={`flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-semibold transition-all ${
                      badge.achieved
                        ? "bg-gradient-to-r from-slate-400/20 to-slate-400/20 border border-slate-400/30 text-slate-100 shadow-[0_0_15px_rgba(148,163,184,0.15)] hover:scale-105"
                        : "bg-slate-900/50 border border-slate-800 text-slate-600 grayscale opacity-60"
                    }`}
                  >
                    <span className="text-lg">{badge.icon}</span>
                    <span className="text-xs">{badge.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

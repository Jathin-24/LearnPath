import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import {
  addRoadmapNode,
  generateReviewQuestion,
  getAnalytics,
  getDashboard,
  getDueReviews,
  getState,
  regenerateRoadmap,
  submitReview,
} from "../api";
import { Button, Card, Input, Textarea, Badge } from "../components/nb";
import BuildingIndicator from "../components/BuildingIndicator";
import NavBar from "../components/NavBar";
import RoadmapGraph from "../components/RoadmapGraph";
import RoadmapList from "../components/RoadmapList";
import PageSkeleton from "../components/Skeleton";
import SkillRadarChart from "../components/SkillRadarChart";
import { getSessionId } from "../session";
import type { AnalyticsResponse, AppState, DashboardResponse, DueReview, MCQQuestion, QuestionResult } from "../types";

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.06, delayChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const sessionId = getSessionId();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [view, setView] = useState<"graph" | "list">("graph");
  const [regenerating, setRegenerating] = useState(false);
  const [showRegenerateBox, setShowRegenerateBox] = useState(false);
  const [regenerateText, setRegenerateText] = useState("");
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [savingTopic, setSavingTopic] = useState(false);

  const [dueReviews, setDueReviews] = useState<DueReview[]>([]);
  const [activeReview, setActiveReview] = useState<DueReview | null>(null);
  const [reviewQuestion, setReviewQuestion] = useState<{ index: number; question: MCQQuestion } | null>(null);
  const [reviewAnswer, setReviewAnswer] = useState("");
  const [reviewResult, setReviewResult] = useState<{ correct: boolean; result: QuestionResult } | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    if (!sessionId) {
      navigate("/login", { replace: true });
      return;
    }
    Promise.all([getDashboard(sessionId), getState(sessionId), getDueReviews(sessionId)]).then(
      ([dashboardRes, stateRes, reviewsRes]) => {
        setDashboard(dashboardRes);
        setState(stateRes.state);
        setDueReviews(reviewsRes.due);
        if (dashboardRes.percent_complete >= 100) {
          navigate("/complete", { replace: true });
        }
      },
    );
    getAnalytics(sessionId)
      .then(setAnalytics)
      .catch(() => setAnalytics(null));
  }, [sessionId, navigate]);

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
    } finally {
      setReviewBusy(false);
    }
  }

  async function handleSubmitReview() {
    if (!sessionId || !activeReview || !reviewQuestion || !reviewAnswer) return;
    setReviewBusy(true);
    try {
      const res = await submitReview(sessionId, activeReview.node_id, reviewQuestion.index, reviewAnswer);
      setReviewResult({ correct: res.correct, result: res.result });
      setDueReviews((prev) => prev.filter((r) => r.node_id !== activeReview.node_id));
    } catch {
    } finally {
      setReviewBusy(false);
    }
  }

  async function handleRegenerateRoadmap() {
    if (!sessionId) return;
    setRegenerating(true);
    try {
      const { state: newState } = await regenerateRoadmap(sessionId, regenerateText.trim() || undefined);
      setState(newState);
      setShowRegenerateBox(false);
      setRegenerateText("");
    } catch {
    } finally {
      setRegenerating(false);
    }
  }

  async function handleAddTopic() {
    if (!sessionId || !newTopic.trim()) return;
    setSavingTopic(true);
    try {
      const { state: newState } = await addRoadmapNode(sessionId, newTopic.trim());
      setState(newState);
      setNewTopic("");
      setAddingTopic(false);
    } catch {
    } finally {
      setSavingTopic(false);
    }
  }

  if (!sessionId || !dashboard || !state) {
    return (
      <div className="min-h-screen bg-bg text-fg">
        <NavBar />
        <PageSkeleton />
      </div>
    );
  }

  const availableNode = state.roadmap?.nodes.find((n) => n.status === "available");
  const completableNodes = state.roadmap?.nodes.filter((n) => n.assessment !== null) ?? [];
  const completedNodes = completableNodes.filter((n) => n.status === "complete");
  const totalTimeSeconds = completableNodes.reduce((sum, n) => sum + n.time_spent_seconds, 0);
  const totalHours = Math.floor(totalTimeSeconds / 3600);
  const totalMinutes = Math.round((totalTimeSeconds % 3600) / 60);
  const timeLabel = totalHours > 0 ? `${totalHours}h ${totalMinutes}m` : `${totalMinutes}m`;

  const lastTs = state.progress_log.at(-1)?.timestamp;
  const daysSinceActivity = lastTs
    ? (now - new Date(lastTs).getTime()) / (1000 * 60 * 60 * 24)
    : 0;
  const showReminder = daysSinceActivity >= 1;

  return (
    <div className="min-h-screen bg-bg text-fg">
      <NavBar hasRoadmap />
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="mx-auto max-w-6xl space-y-5 px-6 py-6"
      >
        <AnimatePresence>
          {showReminder && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex items-center gap-3 px-4 py-3 rounded-lg bg-accent/10 border border-accent/20 text-sm"
            >
              <span className="text-accent">→</span>
              <span>Welcome back! It's been {Math.floor(daysSinceActivity)} day{Math.floor(daysSinceActivity) === 1 ? "" : "s"} since your last activity.</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {dueReviews.length > 0 && !activeReview && (
            <motion.div variants={itemVariants}>
              <Card className="border-accent/20 bg-accent/5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-fg-secondary mb-0.5">SPACED REPETITION</p>
                    <p className="text-sm text-fg-secondary">
                      {dueReviews.length} topic{dueReviews.length === 1 ? "" : "s"} due for review
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {dueReviews.slice(0, 3).map((review) => (
                      <Button
                        key={review.node_id}
                        variant="secondary"
                        size="sm"
                        onClick={() => handleStartReview(review)}
                      >
                        {review.topic}
                      </Button>
                    ))}
                  </div>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {activeReview && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <Card>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold">
                    Review: {activeReview.topic}
                  </h2>
                  <Button variant="ghost" size="sm" onClick={() => setActiveReview(null)}>
                    Close
                  </Button>
                </div>
                {reviewBusy && !reviewQuestion && (
                  <BuildingIndicator label="Loading question..." />
                )}
                {reviewQuestion && !reviewResult && (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">{reviewQuestion.question.question}</p>
                    <div className="space-y-2">
                      {reviewQuestion.question.options.map((option) => (
                        <label
                          key={option}
                          className={`flex cursor-pointer items-center gap-3 border rounded-lg px-3 py-2.5 text-sm transition-all duration-150 ${
                            reviewAnswer === option
                              ? "border-accent bg-accent/5"
                              : "border-border hover:border-border-strong"
                          }`}
                        >
                          <input
                            type="radio"
                            name="review-answer"
                            checked={reviewAnswer === option}
                            onChange={() => setReviewAnswer(option)}
                            className="accent-accent"
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                    <Button
                      onClick={handleSubmitReview}
                      disabled={!reviewAnswer || reviewBusy}
                      size="sm"
                    >
                      {reviewBusy ? "Checking..." : "Submit"}
                    </Button>
                  </div>
                )}
                {reviewResult && (
                  <div>
                    <Badge variant={reviewResult.correct ? "success" : "danger"}>
                      {reviewResult.correct ? "Correct" : "Incorrect"}
                    </Badge>
                    {!reviewResult.correct && (
                      <p className="mt-2 text-xs text-fg-secondary">
                        {reviewResult.result.correct_answer} — {reviewResult.result.explanation}
                      </p>
                    )}
                    <Button variant="ghost" size="sm" className="mt-3" onClick={() => setActiveReview(null)}>
                      Done
                    </Button>
                  </div>
                )}
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div variants={itemVariants} className="grid gap-5 md:grid-cols-[2fr_1fr]">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Progress</p>
                <p className="text-sm text-fg-secondary mt-1">
                  {completedNodes.length} of {completableNodes.length} topics
                </p>
              </div>
              <p className="text-3xl font-bold tracking-tight">
                {dashboard.percent_complete}%
              </p>
            </div>
            <div className="mt-3 h-1.5 w-full rounded-full bg-bg-secondary overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${dashboard.percent_complete}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full bg-accent rounded-full"
              />
            </div>
            <Link to="/analytics">
              <Button variant="ghost" size="sm" className="mt-2">
                View analytics →
              </Button>
            </Link>
          </Card>

          <Card>
            <p className="text-[11px] font-medium text-fg-muted uppercase tracking-wider mb-2">Current Topic</p>
            <p className="text-lg font-semibold">
              {availableNode ? availableNode.topic : "—"}
            </p>
            {availableNode && (
              <Link to={`/topic/${availableNode.node_id}`}>
                <Button size="sm" className="mt-3">
                  Continue →
                </Button>
              </Link>
            )}
          </Card>
        </motion.div>

        <motion.div variants={itemVariants} className="grid gap-5 sm:grid-cols-3">
          <Card>
            <p className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Completed</p>
            <p className="mt-2 text-2xl font-bold">
              {completedNodes.length}
              <span className="text-sm text-fg-muted font-normal"> / {completableNodes.length}</span>
            </p>
          </Card>
          <Card>
            <p className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Time</p>
            <p className="mt-2 text-2xl font-bold">{timeLabel}</p>
          </Card>
          <Card>
            <p className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Streak</p>
            <p className="mt-2 text-2xl font-bold">
              {dashboard.current_streak_days}d
            </p>
            <p className="text-[11px] text-fg-muted mt-0.5">Best: {dashboard.longest_streak_days}d</p>
          </Card>
        </motion.div>

        {analytics && (
          <motion.div variants={itemVariants} className="grid gap-5 sm:grid-cols-4">
            <Card>
              <p className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Pass Rate</p>
              <p className="mt-2 text-lg font-bold">{Math.round(analytics.quiz_pass_rate * 100)}%</p>
            </Card>
            <Card>
              <p className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">This Week</p>
              <p className="mt-2 text-lg font-bold">{analytics.topics_completed_this_week}</p>
            </Card>
            <Card>
              <p className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Avg Score</p>
              <p className="mt-2 text-lg font-bold">{Math.round(analytics.average_score)}%</p>
            </Card>
            <Card>
              <p className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Badges</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {dashboard.badges.map((badge) => (
                  <span
                    key={badge.id}
                    title={badge.label}
                    className={`text-base ${badge.achieved ? "" : "opacity-20"}`}
                  >
                    {badge.icon}
                  </span>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        <motion.div variants={itemVariants} className="grid gap-5 md:grid-cols-2">
          <Card>
            <p className="text-[11px] font-medium text-fg-muted uppercase tracking-wider mb-3">Skills</p>
            <SkillRadarChart skillRadar={dashboard.skill_radar} />
          </Card>
          <Card>
            <p className="text-[11px] font-medium text-fg-muted uppercase tracking-wider mb-2">AI Insight</p>
            <p className="text-sm text-fg-secondary leading-relaxed">{dashboard.next_recommended_action}</p>
            {availableNode && (
              <Link to={`/topic/${availableNode.node_id}`}>
                <Button variant="secondary" size="sm" className="mt-3">
                  Start '{availableNode.topic}' →
                </Button>
              </Link>
            )}
          </Card>
        </motion.div>

        {state.roadmap && (
          <motion.div variants={itemVariants}>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <p className="text-[11px] font-medium text-fg-muted uppercase tracking-wider">Roadmap</p>
                <div className="flex flex-wrap items-center gap-2">
                  {regenerating && <BuildingIndicator label="Regenerating..." />}
                  <Button variant="secondary" size="sm" onClick={() => setAddingTopic((v) => !v)}>
                    + Add Topic
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowRegenerateBox((v) => !v)}
                    disabled={regenerating}
                  >
                    Regenerate
                  </Button>
                  <div className="flex border border-border rounded-md overflow-hidden">
                    <button
                      onClick={() => setView("graph")}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        view === "graph" ? "bg-fg text-white dark:bg-accent dark:text-[#0A0A0A]" : "text-fg-secondary hover:bg-bg-secondary"
                      }`}
                    >
                      Graph
                    </button>
                    <button
                      onClick={() => setView("list")}
                      className={`px-3 py-1 text-xs font-medium transition-colors border-l border-border ${
                        view === "list" ? "bg-fg text-white dark:bg-accent dark:text-[#0A0A0A]" : "text-fg-secondary hover:bg-bg-secondary"
                      }`}
                    >
                      List
                    </button>
                  </div>
                </div>
              </div>
              <AnimatePresence>
                {addingTopic && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-4 flex gap-2 overflow-hidden"
                  >
                    <Input
                      autoFocus
                      value={newTopic}
                      onChange={(e) => setNewTopic(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddTopic()}
                      placeholder="e.g. GraphQL"
                    />
                    <Button size="sm" onClick={handleAddTopic} disabled={savingTopic || !newTopic.trim()}>
                      {savingTopic ? "..." : "Add"}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {showRegenerateBox && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-4 overflow-hidden"
                  >
                    <Textarea
                      autoFocus
                      value={regenerateText}
                      onChange={(e) => setRegenerateText(e.target.value)}
                      rows={2}
                      placeholder="Any changes or additions? (optional)"
                    />
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" onClick={handleRegenerateRoadmap} disabled={regenerating}>
                        {regenerating ? "Working..." : "Regenerate"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setShowRegenerateBox(false)} disabled={regenerating}>
                        Cancel
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {view === "graph" ? (
                <RoadmapGraph nodes={state.roadmap.nodes} colorByStatus />
              ) : (
                <RoadmapList nodes={state.roadmap.nodes} sessionId={sessionId} onChanged={setState} />
              )}
            </Card>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

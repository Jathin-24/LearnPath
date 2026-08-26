import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import BuildingIndicator from "../components/BuildingIndicator";
import NavBar from "../components/NavBar";
import RoadmapGraph from "../components/RoadmapGraph";
import RoadmapList from "../components/RoadmapList";
import PageSkeleton from "../components/Skeleton";
import SkillRadarChart from "../components/SkillRadarChart";
import { getSessionId } from "../session";
import type { AnalyticsResponse, AppState, DashboardResponse, DueReview, MCQQuestion, QuestionResult } from "../types";

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
      // no-op - the question staying put communicates the failure well enough here
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
      // no-op - the box staying put communicates the failure well enough here
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
      // no-op - the form staying open communicates the failure well enough here
    } finally {
      setSavingTopic(false);
    }
  }

  if (!sessionId || !dashboard || !state) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <NavBar />
        <PageSkeleton />
      </div>
    );
  }

  const availableNode = state.roadmap?.nodes.find((n) => n.status === "available");
  // Both dataset (Path A) and web-sourced (Path B) topics count toward
  // progress once they have real content - only unfilled Path-B stubs
  // (shouldn't normally reach the learner) are excluded.
  const completableNodes = state.roadmap?.nodes.filter((n) => n.assessment !== null) ?? [];
  const completedNodes = completableNodes.filter((n) => n.status === "complete");
  const totalTimeSeconds = completableNodes.reduce((sum, n) => sum + n.time_spent_seconds, 0);
  const totalHours = Math.floor(totalTimeSeconds / 3600);
  const totalMinutes = Math.round((totalTimeSeconds % 3600) / 60);
  const timeLabel = totalHours > 0 ? `${totalHours}h ${totalMinutes}m` : `${totalMinutes}m`;

  // Reminder: purely derived from data already on state, no backend call.
  // If it's been a while since the last logged activity, nudge them back.
  const lastTs = state.progress_log.at(-1)?.timestamp;
  const daysSinceActivity = lastTs
    ? (now - new Date(lastTs).getTime()) / (1000 * 60 * 60 * 24)
    : 0;
  const showReminder = daysSinceActivity >= 1;
  const milestone =
    dashboard.percent_complete >= 100
      ? "🏆 Complete!"
      : dashboard.percent_complete >= 75
        ? "🔥 Almost there"
        : dashboard.percent_complete >= 50
          ? "⭐ Halfway there"
          : dashboard.percent_complete >= 25
            ? "🌱 Building momentum"
            : null;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <NavBar hasRoadmap />
      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        {showReminder && (
          <div className="rounded-lg border border-indigo-800 bg-indigo-950/40 px-4 py-3 text-sm text-indigo-200">
            Welcome back! It's been {Math.floor(daysSinceActivity)} day
            {Math.floor(daysSinceActivity) === 1 ? "" : "s"} since your last activity -
            let's pick up where you left off.
          </div>
        )}

        {dueReviews.length > 0 && !activeReview && (
          <div className="rounded-lg border border-amber-800 bg-amber-950/30 px-4 py-3">
            <p className="text-sm text-amber-200">
              📌 Quick review available - a one-question recall check keeps what you've already
              learned from fading.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {dueReviews.map((review) => (
                <button
                  key={review.node_id}
                  onClick={() => handleStartReview(review)}
                  className="rounded-full bg-amber-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-amber-500"
                >
                  Review "{review.topic}"
                </button>
              ))}
            </div>
          </div>
        )}

        {activeReview && (
          <div className="rounded-xl border border-amber-800 bg-amber-950/20 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-amber-200">
                📌 Quick Review: {activeReview.topic}
              </h2>
              <button
                onClick={() => setActiveReview(null)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Close
              </button>
            </div>
            {reviewBusy && !reviewQuestion && (
              <BuildingIndicator label="Pulling up a recall question..." />
            )}
            {reviewQuestion && !reviewResult && (
              <div className="space-y-3">
                <p className="text-sm text-slate-200">{reviewQuestion.question.question}</p>
                <div className="space-y-1.5">
                  {reviewQuestion.question.options.map((option) => (
                    <label
                      key={option}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
                        reviewAnswer === option
                          ? "border-amber-500 bg-amber-500/10"
                          : "border-slate-800 hover:border-slate-600"
                      }`}
                    >
                      <input
                        type="radio"
                        name="review-answer"
                        checked={reviewAnswer === option}
                        onChange={() => setReviewAnswer(option)}
                        className="accent-amber-500"
                      />
                      {option}
                    </label>
                  ))}
                </div>
                <button
                  onClick={handleSubmitReview}
                  disabled={!reviewAnswer || reviewBusy}
                  className="rounded-full bg-amber-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:opacity-50"
                >
                  {reviewBusy ? "Checking..." : "Submit"}
                </button>
              </div>
            )}
            {reviewResult && (
              <div>
                <p className={`text-sm font-medium ${reviewResult.correct ? "text-green-400" : "text-red-400"}`}>
                  {reviewResult.correct ? "✓ Still sharp!" : "Not quite."}
                </p>
                {!reviewResult.correct && (
                  <p className="mt-1 text-xs text-slate-400">
                    Correct answer: {reviewResult.result.correct_answer} - {reviewResult.result.explanation}
                  </p>
                )}
                <button
                  onClick={() => setActiveReview(null)}
                  className="mt-3 rounded-full bg-slate-700 px-4 py-1.5 text-xs font-semibold hover:bg-slate-600"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-indigo-950/60 via-slate-900 to-slate-900 p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Dashboard</h1>
              <p className="mt-1 text-sm text-slate-400">
                {completedNodes.length} of {completableNodes.length} topics complete ·{" "}
                <Link to="/analytics" className="text-indigo-400 hover:underline">
                  View full analytics
                </Link>
              </p>
            </div>
            <div className="text-right">
              <p className="text-4xl font-bold text-indigo-400">{dashboard.percent_complete}%</p>
              {milestone && (
                <p className="mt-1 text-xs font-medium text-slate-400">{milestone}</p>
              )}
            </div>
          </div>
          <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
              style={{ width: `${dashboard.percent_complete}%` }}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs font-medium text-slate-400">Topics Completed</p>
            <p className="mt-2 text-2xl font-bold text-white">
              {completedNodes.length}
              <span className="text-sm font-medium text-slate-500"> / {completableNodes.length}</span>
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs font-medium text-slate-400">Time Invested</p>
            <p className="mt-2 text-2xl font-bold text-white">{timeLabel}</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs font-medium text-slate-400">Current Topic</p>
            <p className="mt-2 truncate text-2xl font-bold text-white">
              {availableNode ? availableNode.topic : "-"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔥</span>
            <div>
              <p className="text-sm font-bold text-white">
                {dashboard.current_streak_days} day{dashboard.current_streak_days === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-slate-500">Best: {dashboard.longest_streak_days}</p>
            </div>
          </div>
          {analytics && (
            <div className="flex items-center gap-2 border-l border-slate-800 pl-4">
              <span className="text-2xl">📅</span>
              <div>
                <p className="text-sm font-bold text-white">
                  {analytics.topics_completed_this_week} this week
                </p>
                <p className="text-xs text-slate-500">
                  {Math.round(analytics.quiz_pass_rate * 100)}% quiz pass rate
                </p>
              </div>
            </div>
          )}
          <div className="ml-auto flex flex-wrap gap-2">
            {dashboard.badges.map((badge) => (
              <span
                key={badge.id}
                title={badge.label}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                  badge.achieved
                    ? "bg-indigo-500/20 text-indigo-300"
                    : "bg-slate-800 text-slate-600 opacity-50"
                }`}
              >
                <span>{badge.icon}</span>
                <span className="hidden sm:inline">{badge.label}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-300">Skill Radar</h2>
            <SkillRadarChart skillRadar={dashboard.skill_radar} />
          </div>
          <div className="flex flex-col justify-between rounded-xl border border-indigo-900/60 bg-gradient-to-br from-indigo-950/50 to-slate-900 p-4">
            <div>
              <h2 className="mb-2 text-sm font-semibold text-slate-300">Next up</h2>
              <p className="text-sm text-slate-200">{dashboard.next_recommended_action}</p>
            </div>
            {availableNode && (
              <Link
                to={`/topic/${availableNode.node_id}`}
                className="mt-4 inline-block w-fit rounded-full bg-indigo-500 px-5 py-2 text-sm font-semibold transition hover:bg-indigo-400"
              >
                Start '{availableNode.topic}'
              </Link>
            )}
          </div>
        </div>

        {state.roadmap && (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-300">Your Roadmap</h2>
              {regenerating && <BuildingIndicator label="Regenerating with AI..." />}
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={() => setAddingTopic((v) => !v)}
                  className="rounded-md bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-700"
                >
                  + Add topic
                </button>
                <button
                  onClick={() => setShowRegenerateBox((v) => !v)}
                  disabled={regenerating}
                  className="rounded-md bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
                >
                  ♻ Regenerate roadmap
                </button>
                <div className="flex gap-1 rounded-full bg-slate-900 p-1">
                  <button
                    onClick={() => setView("graph")}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      view === "graph" ? "bg-indigo-500 text-white" : "text-slate-400"
                    }`}
                  >
                    Graph
                  </button>
                  <button
                    onClick={() => setView("list")}
                    className={`rounded-full px-3 py-1 text-xs font-medium ${
                      view === "list" ? "bg-indigo-500 text-white" : "text-slate-400"
                    }`}
                  >
                    List
                  </button>
                </div>
              </div>
            </div>
            {addingTopic && (
              <div className="mb-3 flex gap-2 rounded-xl border border-slate-800 bg-slate-900 p-3">
                <input
                  autoFocus
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTopic()}
                  placeholder="e.g. GraphQL"
                  className="flex-1 rounded-md bg-slate-950 p-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={handleAddTopic}
                  disabled={savingTopic || !newTopic.trim()}
                  className="rounded-md bg-indigo-500 px-4 py-2 text-xs font-semibold transition hover:bg-indigo-400 disabled:opacity-50"
                >
                  {savingTopic ? "Adding..." : "Add"}
                </button>
              </div>
            )}
            {showRegenerateBox && (
              <div className="mb-3 rounded-xl border border-slate-800 bg-slate-900 p-3">
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Regenerate every not-yet-completed topic's project and quiz. Anything to add or
                  change? (optional)
                </label>
                <textarea
                  autoFocus
                  value={regenerateText}
                  onChange={(e) => setRegenerateText(e.target.value)}
                  rows={2}
                  placeholder="e.g. 'more real-world examples, less theory'"
                  className="w-full resize-y rounded-md bg-slate-950 p-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleRegenerateRoadmap}
                    disabled={regenerating}
                    className="rounded-full bg-indigo-500 px-4 py-1.5 text-xs font-semibold transition hover:bg-indigo-400 disabled:opacity-50"
                  >
                    {regenerating ? "Regenerating..." : "Regenerate"}
                  </button>
                  <button
                    onClick={() => setShowRegenerateBox(false)}
                    disabled={regenerating}
                    className="rounded-full bg-slate-800 px-4 py-1.5 text-xs text-slate-300 transition hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {view === "graph" ? (
              <RoadmapGraph nodes={state.roadmap.nodes} colorByStatus />
            ) : (
              <RoadmapList nodes={state.roadmap.nodes} sessionId={sessionId} onChanged={setState} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

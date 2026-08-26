import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { addRoadmapNode, getDashboard, getState, regenerateRoadmap } from "../api";
import BuildingIndicator from "../components/BuildingIndicator";
import NavBar from "../components/NavBar";
import RoadmapGraph from "../components/RoadmapGraph";
import RoadmapList from "../components/RoadmapList";
import PageSkeleton from "../components/Skeleton";
import SkillRadarChart from "../components/SkillRadarChart";
import { getSessionId } from "../session";
import type { AppState, DashboardResponse } from "../types";

export default function Dashboard() {
  const navigate = useNavigate();
  const sessionId = getSessionId();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<"graph" | "list">("graph");
  const [regenerating, setRegenerating] = useState(false);
  const [addingTopic, setAddingTopic] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [savingTopic, setSavingTopic] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      navigate("/login", { replace: true });
      return;
    }
    Promise.all([getDashboard(sessionId), getState(sessionId)]).then(
      ([dashboardRes, stateRes]) => {
        setDashboard(dashboardRes);
        setState(stateRes.state);
        if (dashboardRes.percent_complete >= 100) {
          navigate("/complete", { replace: true });
        }
      },
    );
  }, [sessionId, navigate]);

  async function handleRegenerateRoadmap() {
    if (!sessionId) return;
    const instructions = window.prompt(
      "Regenerate every not-yet-completed topic's project and quiz. Anything you'd like added or " +
        "changed? (Leave blank to just regenerate as-is.)",
    );
    if (instructions === null) return; // cancelled
    setRegenerating(true);
    try {
      const { state: newState } = await regenerateRoadmap(sessionId, instructions || undefined);
      setState(newState);
    } catch {
      // no-op - the button staying put communicates the failure well enough here
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
  const lastActivity = state.progress_log.at(-1)?.timestamp;
  const daysSinceActivity = lastActivity
    ? (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24)
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
                  onClick={handleRegenerateRoadmap}
                  disabled={regenerating}
                  className="rounded-md bg-slate-800 px-3 py-1 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
                >
                  {regenerating ? "Regenerating..." : "♻ Regenerate roadmap"}
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

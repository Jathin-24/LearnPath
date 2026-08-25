import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getDashboard, getState } from "../api";
import NavBar from "../components/NavBar";
import RoadmapGraph from "../components/RoadmapGraph";
import RoadmapList from "../components/RoadmapList";
import SkillRadarChart from "../components/SkillRadarChart";
import { getSessionId } from "../session";
import type { AppState, DashboardResponse } from "../types";

export default function Dashboard() {
  const navigate = useNavigate();
  const sessionId = getSessionId();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<"graph" | "list">("graph");

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

  if (!sessionId || !dashboard || !state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading your dashboard...
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
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300">Your Roadmap</h2>
              <div className="flex shrink-0 gap-1 rounded-full bg-slate-900 p-1">
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

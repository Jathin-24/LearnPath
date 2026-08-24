import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getDashboard, getState } from "../api";
import RoadmapGraph from "../components/RoadmapGraph";
import SkillRadarChart from "../components/SkillRadarChart";
import { getSessionId } from "../session";
import type { AppState, DashboardResponse } from "../types";

export default function Dashboard() {
  const navigate = useNavigate();
  const sessionId = getSessionId();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [state, setState] = useState<AppState | null>(null);

  useEffect(() => {
    if (!sessionId) {
      navigate("/", { replace: true });
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

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-8 text-white">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-indigo-500 transition-all"
              style={{ width: `${dashboard.percent_complete}%` }}
            />
          </div>
          <p className="mt-1 text-sm text-slate-400">{dashboard.percent_complete}% complete</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-300">Skill Radar</h2>
            <SkillRadarChart skillRadar={dashboard.skill_radar} />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-300">Next up</h2>
            <p className="text-sm text-slate-200">{dashboard.next_recommended_action}</p>
            {availableNode && (
              <Link
                to={`/topic/${availableNode.node_id}`}
                className="mt-4 inline-block rounded-full bg-indigo-500 px-5 py-2 text-sm font-semibold transition hover:bg-indigo-400"
              >
                Start '{availableNode.topic}'
              </Link>
            )}
          </div>
        </div>

        {state.roadmap && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-300">Your Roadmap</h2>
            <RoadmapGraph nodes={state.roadmap.nodes} colorByStatus />
          </div>
        )}
      </div>
    </div>
  );
}

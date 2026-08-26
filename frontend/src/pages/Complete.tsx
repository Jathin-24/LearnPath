import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getState, restartGoal } from "../api";
import NavBar from "../components/NavBar";
import PageSkeleton from "../components/Skeleton";
import { getSessionId } from "../session";
import type { AppState } from "../types";

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function buildRecapText(state: AppState): string {
  const nodes = state.roadmap?.nodes ?? [];
  const totalSeconds = nodes.reduce((sum, n) => sum + n.time_spent_seconds, 0);
  const lines = [
    `Learning Roadmap Complete: ${state.learner_profile.goal ?? "your goal"}`,
    `Completed by: ${state.learner_profile.name ?? "you"}`,
    `Total time invested: ${formatDuration(totalSeconds)}`,
    "",
    "Topics completed:",
    ...nodes.map((n) => `  - ${n.topic}`),
    "",
    "Projects built:",
    ...nodes.filter((n) => n.project).map((n) => `  - ${n.project!.title}`),
  ];
  return lines.join("\n");
}

function downloadRecap(state: AppState) {
  const text = buildRecapText(state);
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "learning-roadmap-recap.txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Complete() {
  const navigate = useNavigate();
  const sessionId = getSessionId();
  const [state, setState] = useState<AppState | null>(null);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      navigate("/login", { replace: true });
      return;
    }
    getState(sessionId).then(({ state }) => setState(state)).catch(() => navigate("/login", { replace: true }));
  }, [sessionId, navigate]);

  async function handleStartNewGoal() {
    if (!sessionId || restarting) return;
    setRestarting(true);
    try {
      await restartGoal(sessionId);
      navigate("/chat");
    } catch {
      setRestarting(false);
    }
  }

  if (!state) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <NavBar hasRoadmap />
        <PageSkeleton />
      </div>
    );
  }

  const nodes = state.roadmap?.nodes ?? [];
  const totalSeconds = nodes.reduce((sum, n) => sum + n.time_spent_seconds, 0);
  const projects = nodes.filter((n) => n.project);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <NavBar hasRoadmap />
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <div className="animate-celebrate text-5xl">🎉</div>
        <h1 className="animate-celebrate mt-4 text-4xl font-bold">Roadmap Complete!</h1>
        <p className="mt-3 text-slate-400">
          You finished every topic in your roadmap for{" "}
          <span className="text-slate-200">{state.learner_profile.goal ?? "your goal"}</span>.
          Nice work.
        </p>

        <div className="mt-8 grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-2xl font-bold text-indigo-400">{nodes.length}</p>
            <p className="mt-1 text-xs text-slate-400">Topics finished</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-2xl font-bold text-indigo-400">{projects.length}</p>
            <p className="mt-1 text-xs text-slate-400">Projects built</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-2xl font-bold text-indigo-400">{formatDuration(totalSeconds)}</p>
            <p className="mt-1 text-xs text-slate-400">Time invested</p>
          </div>
        </div>

        {projects.length > 0 && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-4 text-left">
            <h2 className="mb-2 text-sm font-semibold text-slate-300">What you built</h2>
            <ul className="space-y-1">
              {projects.map((n) => (
                <li key={n.node_id} className="text-sm text-slate-300">
                  <span className="text-indigo-400">✓</span> {n.project!.title}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => downloadRecap(state)}
            className="rounded-full bg-slate-800 px-6 py-3 font-semibold transition hover:bg-slate-700"
          >
            Download recap
          </button>
          <button
            onClick={handleStartNewGoal}
            disabled={restarting}
            className="rounded-full bg-indigo-500 px-6 py-3 font-semibold transition hover:bg-indigo-400 disabled:opacity-50"
          >
            {restarting ? "Starting..." : "Start a new goal"}
          </button>
        </div>
        <button
          onClick={() => navigate("/dashboard")}
          className="mt-4 text-sm text-slate-500 hover:text-slate-300 hover:underline"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}

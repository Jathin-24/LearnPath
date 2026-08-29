import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getState, restartGoal } from "../api";
import { Button, Card } from "../components/nb";
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
      <div className="min-h-screen bg-bg text-fg">
        <NavBar hasRoadmap />
        <PageSkeleton />
      </div>
    );
  }

  const nodes = state.roadmap?.nodes ?? [];
  const totalSeconds = nodes.reduce((sum, n) => sum + n.time_spent_seconds, 0);
  const projects = nodes.filter((n) => n.project);

  return (
    <div className="min-h-screen bg-bg text-fg">
      <NavBar hasRoadmap />
      <div className="mx-auto max-w-2xl px-6 py-12 text-center">
        <div className="animate-celebrate text-6xl mb-4">🎉</div>
        <h1 className="animate-celebrate text-3xl font-semibold tracking-tight">
          Roadmap Complete!
        </h1>
        <p className="mt-3 text-sm text-fg-secondary">
          You finished every topic in your roadmap for{" "}
          <span className="font-medium">{state.learner_profile.goal ?? "your goal"}</span>.
          Nice work.
        </p>

        <div className="mt-8 grid grid-cols-3 gap-4">
          <Card>
            <p className="text-2xl font-semibold">{nodes.length}</p>
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mt-1">Topics Finished</p>
          </Card>
          <Card>
            <p className="text-2xl font-semibold">{projects.length}</p>
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mt-1">Projects Built</p>
          </Card>
          <Card>
            <p className="text-2xl font-semibold">{formatDuration(totalSeconds)}</p>
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mt-1">Time Invested</p>
          </Card>
        </div>

        {projects.length > 0 && (
          <Card className="mt-6 text-left">
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">What You Built</p>
            <ul className="space-y-1">
              {projects.map((n) => (
                <li key={n.node_id} className="text-sm font-medium">
                  <span className="text-success font-bold mr-2">✓</span> {n.project!.title}
                </li>
              ))}
            </ul>
          </Card>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button variant="secondary" onClick={() => downloadRecap(state)}>
            Download Recap
          </Button>
          <Button onClick={handleStartNewGoal} disabled={restarting}>
            {restarting ? "Starting..." : "Start a New Goal →"}
          </Button>
        </div>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => navigate("/dashboard")}
        >
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}

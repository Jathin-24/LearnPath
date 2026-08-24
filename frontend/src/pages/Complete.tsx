import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createSession, getDashboard } from "../api";
import { clearSessionId, getSessionId, setSessionId } from "../session";
import type { DashboardResponse } from "../types";

export default function Complete() {
  const navigate = useNavigate();
  const sessionId = getSessionId();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);

  useEffect(() => {
    if (!sessionId) {
      navigate("/", { replace: true });
      return;
    }
    getDashboard(sessionId).then(setDashboard);
  }, [sessionId, navigate]);

  async function handleNewGoal() {
    // No route exists yet to reset an existing session's routing back to
    // Profiler while keeping the old profile (next_agent would just stay
    // DONE forever) - start a fresh session instead of silently no-op-ing.
    clearSessionId();
    const { session_id } = await createSession();
    setSessionId(session_id);
    navigate("/chat");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-white">
      <h1 className="text-4xl font-bold">Roadmap Complete</h1>
      <p className="mt-4 max-w-md text-slate-400">
        You've completed every topic in your roadmap
        {dashboard ? ` (${dashboard.percent_complete}%)` : ""}. Nice work.
      </p>
      <button
        onClick={handleNewGoal}
        className="mt-8 rounded-full bg-indigo-500 px-6 py-3 font-semibold transition hover:bg-indigo-400"
      >
        Start a New Goal
      </button>
    </div>
  );
}

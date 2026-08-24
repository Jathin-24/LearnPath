import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createSession, getState } from "../api";
import { routeForStage } from "../routing";
import { getSessionId, setSessionId } from "../session";

export default function Landing() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const existing = getSessionId();
    if (!existing) {
      setChecking(false);
      return;
    }
    getState(existing)
      .then(({ state }) => navigate(routeForStage(state.stage), { replace: true }))
      .catch(() => setChecking(false));
  }, [navigate]);

  async function handleGetStarted() {
    setStarting(true);
    setError(null);
    try {
      const { session_id } = await createSession();
      setSessionId(session_id);
      navigate("/chat");
    } catch {
      setError("Couldn't reach the server. Is the backend running?");
      setStarting(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-white">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Learn exactly what gets you there.
      </h1>
      <p className="mt-4 max-w-xl text-lg text-slate-400">
        Tell us your goal. We'll check what you already know, then build a
        personalized, prerequisite-aware roadmap of courses, projects, and
        checkpoints to get you there.
      </p>
      <button
        onClick={handleGetStarted}
        disabled={starting}
        className="mt-8 rounded-full bg-indigo-500 px-8 py-3 text-lg font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
      >
        {starting ? "Starting..." : "Get Started"}
      </button>
      {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
    </div>
  );
}

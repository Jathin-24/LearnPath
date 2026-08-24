import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getDashboard } from "../api";
import NavBar from "../components/NavBar";
import { getSessionId } from "../session";
import type { DashboardResponse } from "../types";

export default function Complete() {
  const navigate = useNavigate();
  const sessionId = getSessionId();
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);

  useEffect(() => {
    if (!sessionId) {
      navigate("/login", { replace: true });
      return;
    }
    getDashboard(sessionId).then(setDashboard);
  }, [sessionId, navigate]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <NavBar />
      <div className="flex min-h-[calc(100vh-57px)] flex-col items-center justify-center px-6 text-center">
        <h1 className="text-4xl font-bold">Roadmap Complete</h1>
        <p className="mt-4 max-w-md text-slate-400">
          You've completed every topic in your roadmap
          {dashboard ? ` (${dashboard.percent_complete}%)` : ""}. Nice work.
        </p>
        <button
          onClick={() => navigate("/dashboard")}
          className="mt-8 rounded-full bg-indigo-500 px-6 py-3 font-semibold transition hover:bg-indigo-400"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}

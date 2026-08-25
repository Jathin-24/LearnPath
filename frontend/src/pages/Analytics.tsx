import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAnalytics } from "../api";
import NavBar from "../components/NavBar";
import { getSessionId } from "../session";
import type { AnalyticsResponse } from "../types";

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

export default function Analytics() {
  const navigate = useNavigate();
  const sessionId = getSessionId();
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);

  useEffect(() => {
    if (!sessionId) {
      navigate("/login", { replace: true });
      return;
    }
    getAnalytics(sessionId).then(setAnalytics);
  }, [sessionId, navigate]);

  if (!sessionId || !analytics) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading your analytics...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <NavBar />
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-2xl font-bold">Your Analytics</h1>
        <p className="mt-2 text-sm text-slate-400">A quick look at how your learning is going.</p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs font-medium text-slate-400">Quiz Pass Rate</p>
            <p className="mt-2 text-3xl font-bold text-indigo-400">
              {Math.round(analytics.quiz_pass_rate * 100)}%
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs font-medium text-slate-400">Topics This Week</p>
            <p className="mt-2 text-3xl font-bold text-indigo-400">
              {analytics.topics_completed_this_week}
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs font-medium text-slate-400">Time Spent</p>
            <p className="mt-2 text-3xl font-bold text-indigo-400">
              {formatDuration(analytics.total_time_spent_seconds)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

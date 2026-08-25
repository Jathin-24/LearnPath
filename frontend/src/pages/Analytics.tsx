import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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

const SKILL_LABELS: Record<keyof AnalyticsResponse["skill_summary"], string> = {
  known: "Known",
  learned: "Learned",
  claimed_unconfirmed: "Unconfirmed",
  gap: "Gaps",
};

const SKILL_COLORS: Record<keyof AnalyticsResponse["skill_summary"], string> = {
  known: "bg-emerald-500",
  learned: "bg-indigo-500",
  claimed_unconfirmed: "bg-amber-500",
  gap: "bg-slate-600",
};

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

  const chartData = analytics.per_topic_time.map((t) => ({
    topic: t.topic.length > 18 ? `${t.topic.slice(0, 16)}...` : t.topic,
    minutes: Math.round(t.seconds / 60),
  }));

  const skillTotal =
    analytics.skill_summary.known +
    analytics.skill_summary.learned +
    analytics.skill_summary.claimed_unconfirmed +
    analytics.skill_summary.gap;

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <NavBar />
      <div className="mx-auto max-w-3xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-2xl font-bold">Your Analytics</h1>
          <p className="mt-2 text-sm text-slate-400">A detailed look at how your learning is going.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
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
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs font-medium text-slate-400">Topics Completed</p>
            <p className="mt-2 text-3xl font-bold text-indigo-400">
              {analytics.topics_completed}
              <span className="text-base font-medium text-slate-500"> / {analytics.topics_total}</span>
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="text-xs font-medium text-slate-400">Average Quiz Score</p>
            <p className="mt-2 text-3xl font-bold text-indigo-400">
              {Math.round(analytics.average_score * 100)}%
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-1 text-sm font-semibold text-slate-300">Skill Breakdown</h2>
          {skillTotal === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No skills assessed yet.</p>
          ) : (
            <>
              <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-slate-800">
                {(Object.keys(SKILL_LABELS) as (keyof AnalyticsResponse["skill_summary"])[]).map(
                  (key) =>
                    analytics.skill_summary[key] > 0 && (
                      <div
                        key={key}
                        className={SKILL_COLORS[key]}
                        style={{ width: `${(analytics.skill_summary[key] / skillTotal) * 100}%` }}
                      />
                    ),
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                {(Object.keys(SKILL_LABELS) as (keyof AnalyticsResponse["skill_summary"])[]).map((key) => (
                  <span key={key} className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${SKILL_COLORS[key]}`} />
                    {SKILL_LABELS[key]}: {analytics.skill_summary[key]}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <h2 className="mb-2 text-sm font-semibold text-slate-300">Time per Topic</h2>
          {chartData.length === 0 ? (
            <p className="text-sm text-slate-500">No time logged yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 40)}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid stroke="#1e293b" horizontal={false} />
                <XAxis
                  type="number"
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                  label={{ value: "minutes", position: "insideBottom", offset: -2, fill: "#64748b", fontSize: 10 }}
                />
                <YAxis
                  type="category"
                  dataKey="topic"
                  width={120}
                  tick={{ fill: "#94a3b8", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8 }}
                  labelStyle={{ color: "#e2e8f0" }}
                  formatter={(value: number) => [`${value} min`, "Time spent"]}
                />
                <Bar dataKey="minutes" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import {
  Activity,
  BarChart3,
  Brain,
  CheckCircle2,
  Clock,
  Target,
  Trophy,
  Flame,
  ArrowRight,
} from "lucide-react";

import { getAnalytics } from "../api";
import PageSkeleton from "../components/Skeleton";
import { useAppState } from "../context/AppStateContext";
import type { AnalyticsResponse } from "../types";

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${totalSeconds}s`;
}

const SKILL_LABELS: Record<keyof AnalyticsResponse["skill_summary"], string> = {
  known: "Known (Prior)",
  learned: "Learned",
  claimed_unconfirmed: "Claimed (TBD)",
  gap: "Skill Gaps",
};

const SKILL_COLORS: Record<keyof AnalyticsResponse["skill_summary"], string> = {
  learned: "bg-emerald-500",
  known: "bg-slate-400",
  claimed_unconfirmed: "bg-amber-500",
  gap: "bg-red-500",
};

export default function Analytics() {
  const { auth, state } = useAppState();
  const sessionId = auth?.session_id;
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    if (!sessionId) return;
    setFailed(false);
    getAnalytics(sessionId).then(setAnalytics).catch(() => setFailed(true));
  }, [sessionId, loadKey]);

  if (!sessionId || !analytics || !state) {
    if (failed) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4">
          <div className="glass-panel p-10 rounded-3xl flex flex-col items-center text-center max-w-md border border-slate-400/20">
            <Activity className="w-12 h-12 text-slate-400 mb-4" />
            <h2 className="text-xl font-bold font-display mb-2">Analytics couldn't load</h2>
            <p className="text-sm text-slate-400 mb-6">
              Something went wrong while fetching your analytics. Try again in a moment.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setLoadKey((k) => k + 1)}
                className="rounded-xl bg-slate-100 px-6 py-2.5 text-sm font-bold text-slate-900 transition hover:bg-slate-200"
              >
                Try again
              </button>
              <Link
                to="/app"
                className="rounded-xl bg-slate-800 border border-slate-700 px-6 py-2.5 text-sm font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <PageSkeleton />
      </div>
    );
  }

  // Determine if there is enough activity to show meaningful charts
  // If no topics are completed and total time spent is extremely low (< 1 min),
  // we consider it an empty state to avoid misleading 0-value charts.
  const isNewLearner =
    analytics.topics_completed === 0 && analytics.total_time_spent_seconds < 60;

  const chartData = analytics.per_topic_time.map((t) => ({
    topic: t.topic.length > 20 ? `${t.topic.slice(0, 18)}...` : t.topic,
    minutes: Math.round(t.seconds / 60),
    fullTopic: t.topic,
  }));

  const skillTotal =
    analytics.skill_summary.known +
    analytics.skill_summary.learned +
    analytics.skill_summary.claimed_unconfirmed +
    analytics.skill_summary.gap;

  const percentComplete =
    analytics.topics_total > 0
      ? Math.round((analytics.topics_completed / analytics.topics_total) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24 font-sans">
      <div className="mx-auto max-w-5xl px-4 py-8 relative">
        {/* Background glow effects */}

        <div className="relative z-10 flex flex-col gap-8">
          {/* Header */}
          <div className="space-y-2 animate-fade-in-up">
            <h1 className="text-3xl font-bold font-display text-slate-100 tracking-tight flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-slate-300" />
              Learning Analytics
            </h1>
            <p className="text-slate-200/80 text-sm font-medium">
              Track your progress, time investment, and skill growth.
            </p>
          </div>

          {isNewLearner ? (
            /* Empty State */
            <div className="glass-panel p-12 rounded-3xl flex flex-col items-center justify-center text-center animate-fade-in-up border border-slate-400/20 mt-8">
              <div className="bg-slate-400/10 p-6 rounded-full mb-6">
                <Target className="w-12 h-12 text-slate-300" />
              </div>
              <h2 className="text-2xl font-bold text-slate-100 mb-2 font-display">
                Not enough learning activity yet
              </h2>
              <p className="text-slate-400 max-w-md mx-auto mb-8">
                Your analytics dashboard will populate with insights, charts, and progress metrics once you start completing topics and logging study time.
              </p>
              <Link
                to="/app"
className="flex items-center gap-2 rounded-xl bg-slate-100 px-6 py-3 font-bold text-slate-900 transition hover:bg-slate-200 shadow-lg shadow-slate-950/50"
                >
                  Go to Dashboard <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <>
              {/* Top Summary Cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
                
                {/* Weekly Activity Highlight */}
                <div className="glass-panel-light p-6 rounded-3xl border border-slate-400/30 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                    <Flame className="w-16 h-16 text-slate-400" />
                  </div>
                  <div className="relative z-10">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Flame className="w-4 h-4" /> This Week
                    </h3>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-slate-100">{analytics.topics_completed_this_week}</span>
                    </div>
                    <p className="text-xs text-slate-200/70 mt-1 font-medium">Topics completed</p>
                  </div>
                </div>

                {/* Pass Rate */}
                <div className="glass-panel-light p-6 rounded-3xl border border-emerald-500/30 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                    <Trophy className="w-16 h-16 text-emerald-500" />
                  </div>
                  <div className="relative z-10">
                    <h3 className="text-xs font-bold text-emerald-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Pass Rate
                    </h3>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-slate-100">{Math.round(analytics.quiz_pass_rate * 100)}%</span>
                    </div>
                    <p className="text-xs text-emerald-200/70 mt-1 font-medium">Average score: {Math.round(analytics.average_score * 100)}%</p>
                  </div>
                </div>

                {/* Study Time */}
                <div className="glass-panel-light p-6 rounded-3xl border border-slate-400/30 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                    <Clock className="w-16 h-16 text-slate-400" />
                  </div>
                  <div className="relative z-10">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Clock className="w-4 h-4" /> Study Time
                    </h3>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-slate-100">{formatDuration(analytics.total_time_spent_seconds).replace(/[a-z]/g, '')}</span>
                      <span className="text-slate-200 font-medium text-sm">
                         {formatDuration(analytics.total_time_spent_seconds).replace(/[0-9 ]/g, '')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-200/70 mt-1 font-medium">Total time invested</p>
                  </div>
                </div>

                {/* Progress */}
                <div className="glass-panel-light p-6 rounded-3xl border border-slate-400/30 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                    <Target className="w-16 h-16 text-slate-400" />
                  </div>
                  <div className="relative z-10">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <Target className="w-4 h-4" /> Completion
                    </h3>
                    <div className="flex items-baseline gap-2">
                      <span className="text-4xl font-black text-slate-100">{analytics.topics_completed}</span>
                      <span className="text-slate-300 font-medium text-sm">/ {analytics.topics_total}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden mt-3">
                      <div className="h-full bg-slate-400 rounded-full" style={{ width: `${percentComplete}%` }} />
                    </div>
                  </div>
                </div>

              </div>

              {/* Charts Section */}
              <div className="grid gap-6 md:grid-cols-2 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
                
                {/* Time Analysis Chart */}
                <div className="glass-panel p-6 rounded-3xl border border-slate-800/50 flex flex-col h-full">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-slate-300" /> Time per Topic
                  </h3>
                  
                  {chartData.length === 0 ? (
                    <div className="flex-1 flex items-center justify-center py-12">
                      <p className="text-sm text-slate-500">No time logged on specific topics yet.</p>
                    </div>
                  ) : (
                    <div className="w-full overflow-x-auto pb-2">
                      <div className="min-w-[400px]">
                        <ResponsiveContainer width="100%" height={Math.max(250, chartData.length * 45)}>
                          <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 0, bottom: 0 }}>
                            <CartesianGrid stroke="#1e293b" horizontal={false} strokeDasharray="3 3" />
                            <XAxis
                              type="number"
                              tick={{ fill: "#64748b", fontSize: 11 }}
                              label={{ value: "Minutes", position: "insideBottom", offset: -5, fill: "#64748b", fontSize: 10 }}
                              axisLine={{ stroke: '#334155' }}
                              tickLine={{ stroke: '#334155' }}
                            />
                            <YAxis
                              type="category"
                              dataKey="topic"
                              width={140}
                              tick={{ fill: "#cbd5e1", fontSize: 12, fontWeight: 500 }}
                              axisLine={{ stroke: '#334155' }}
                              tickLine={false}
                            />
                            <Tooltip
                              cursor={{ fill: '#1e293b' }}
                              contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12, boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.5)" }}
                              labelStyle={{ color: "#f8fafc", fontWeight: 600, marginBottom: 4 }}
                              itemStyle={{ color: "#e2e8f0" }}
                              formatter={(value: any) => [`${value} min`, "Time spent"]}
                              labelFormatter={(_, payload) => payload?.[0]?.payload?.fullTopic || "Topic"}
                            />
                            <Bar dataKey="minutes" radius={[0, 6, 6, 0]} barSize={24}>
                              {chartData.map((_, index) => (
                                <Cell key={`cell-${index}`} fill="url(#colorIndigo)" />
                              ))}
                            </Bar>
                            <defs>
                              <linearGradient id="colorIndigo" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stopColor="#64748b" />
                                <stop offset="100%" stopColor="#94a3b8" />
                              </linearGradient>
                            </defs>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>

                {/* Skill Summary */}
                <div className="glass-panel p-6 rounded-3xl border border-slate-800/50 flex flex-col h-full">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                    <Brain className="w-4 h-4 text-emerald-400" /> Skill Assessment
                  </h3>
                  
                  {skillTotal === 0 ? (
                    <div className="flex-1 flex items-center justify-center py-12">
                      <p className="text-sm text-slate-500">No skills assessed yet.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-6 justify-center flex-1">
                      {/* Horizontal Stacked Bar */}
                      <div className="relative pt-8">
                        <div className="w-full h-8 bg-slate-900 rounded-2xl overflow-hidden flex border border-slate-800 shadow-inner">
                          {(Object.keys(SKILL_LABELS) as (keyof AnalyticsResponse["skill_summary"])[]).map(
                            (key) => {
                              const value = analytics.skill_summary[key];
                              if (value === 0) return null;
                              return (
                                <div
                                  key={key}
                                  className={`${SKILL_COLORS[key]} h-full transition-all duration-1000 group relative flex items-center justify-center hover:opacity-90`}
                                  style={{ width: `${(value / skillTotal) * 100}%` }}
                                >
                                  {/* Tooltip on hover for narrow segments */}
                                  <div className="absolute -top-10 scale-0 group-hover:scale-100 transition-transform bg-slate-800 text-slate-100 text-xs px-2 py-1 rounded whitespace-nowrap border border-slate-700 z-10">
                                    {SKILL_LABELS[key]}: {value}
                                  </div>
                                </div>
                              );
                            }
                          )}
                        </div>
                      </div>

                      {/* Legend */}
                      <div className="grid grid-cols-2 gap-4 mt-4">
                        {(Object.keys(SKILL_LABELS) as (keyof AnalyticsResponse["skill_summary"])[]).map((key) => {
                          const value = analytics.skill_summary[key];
                          const percent = skillTotal > 0 ? Math.round((value / skillTotal) * 100) : 0;
                          return (
                            <div key={key} className="bg-slate-800 border border-slate-800 rounded-2xl p-4 flex items-center gap-4 hover:bg-slate-800/50 transition">
                              <div className={`w-3 h-10 rounded-full ${SKILL_COLORS[key]} shrink-0 shadow-[0_0_10px_currentColor] opacity-80`} />
                              <div>
                                <p className="text-xs font-semibold text-slate-400">{SKILL_LABELS[key]}</p>
                                <div className="flex items-baseline gap-2 mt-0.5">
                                  <span className="text-xl font-bold text-slate-100">{value}</span>
                                  <span className="text-xs text-slate-500">({percent}%)</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}

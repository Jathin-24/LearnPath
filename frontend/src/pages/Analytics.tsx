import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, type Variants } from "framer-motion";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getAnalytics } from "../api";
import { Card } from "../components/nb";
import NavBar from "../components/NavBar";
import PageSkeleton from "../components/Skeleton";
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
  known: "bg-success",
  learned: "bg-purple",
  claimed_unconfirmed: "bg-warning",
  gap: "bg-border",
};

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

export default function Analytics() {
  const navigate = useNavigate();
  const sessionId = getSessionId();
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!sessionId) {
      navigate("/login", { replace: true });
      return;
    }
    getAnalytics(sessionId).then(setAnalytics);
  }, [sessionId, navigate]);

  if (!sessionId || !analytics) {
    return (
      <div className="min-h-screen bg-bg text-fg">
        <NavBar hasRoadmap />
        <PageSkeleton />
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
    <div className="min-h-screen bg-bg text-fg">
      <NavBar hasRoadmap />
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="mx-auto max-w-4xl space-y-6 px-6 py-8"
      >
        <motion.div variants={itemVariants}>
          <h1 className="text-2xl font-semibold tracking-tight">Your Analytics</h1>
          <p className="mt-2 text-sm text-fg-secondary">A detailed look at how your learning is going.</p>
        </motion.div>

        <motion.div variants={itemVariants} className="grid gap-4 sm:grid-cols-3">
          <Card>
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Quiz Pass Rate</p>
            <p className="mt-2 text-2xl font-semibold">{Math.round(analytics.quiz_pass_rate * 100)}%</p>
          </Card>
          <Card>
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Topics This Week</p>
            <p className="mt-2 text-2xl font-semibold">{analytics.topics_completed_this_week}</p>
          </Card>
          <Card>
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Time Spent</p>
            <p className="mt-2 text-2xl font-semibold">{formatDuration(analytics.total_time_spent_seconds)}</p>
          </Card>
          <Card>
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Topics Completed</p>
            <p className="mt-2 text-2xl font-semibold">
              {analytics.topics_completed}
              <span className="text-sm text-fg-muted font-normal"> / {analytics.topics_total}</span>
            </p>
          </Card>
          <Card>
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Avg Quiz Score</p>
            <p className="mt-2 text-2xl font-semibold">{Math.round(analytics.average_score * 100)}%</p>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card>
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-3">Skill Breakdown</p>
            {skillTotal === 0 ? (
              <p className="text-sm text-fg-muted">No skills assessed yet.</p>
            ) : (
              <>
                <div className="flex h-2.5 w-full rounded-full overflow-hidden">
                  {(Object.keys(SKILL_LABELS) as (keyof AnalyticsResponse["skill_summary"])[]).map(
                    (key) =>
                      analytics.skill_summary[key] > 0 && (
                        <motion.div
                          key={key}
                          initial={{ width: 0 }}
                          animate={{ width: `${(analytics.skill_summary[key] / skillTotal) * 100}%` }}
                          transition={{ duration: 0.8, delay: 0.5 }}
                          className={`${SKILL_COLORS[key]} h-full`}
                        />
                      ),
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-secondary">
                  {(Object.keys(SKILL_LABELS) as (keyof AnalyticsResponse["skill_summary"])[]).map((key) => (
                    <span key={key} className="flex items-center gap-1.5">
                      <span className={`h-2.5 w-2.5 rounded-full ${SKILL_COLORS[key]}`} />
                      {SKILL_LABELS[key]}: {analytics.skill_summary[key]}
                    </span>
                  ))}
                </div>
              </>
            )}
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card>
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-3">Time Per Topic</p>
            {chartData.length === 0 ? (
              <p className="text-sm text-fg-muted">No time logged yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(160, chartData.length * 40)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid stroke={isDark ? "#2A2A2A" : "#E2E2DC"} strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fill: isDark ? "#A0A0A0" : "#666666", fontSize: 11 }}
                    label={{ value: "minutes", position: "insideBottom", offset: -2, fill: isDark ? "#666666" : "#999999", fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="topic"
                    width={120}
                    tick={{ fill: isDark ? "#A0A0A0" : "#666666", fontSize: 11 }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: isDark ? "#1A1A1A" : "#FFFFFF",
                      border: `1px solid ${isDark ? "#2A2A2A" : "#E2E2DC"}`,
                      borderRadius: 8,
                      fontWeight: 500,
                    }}
                    labelStyle={{ color: isDark ? "#F5F5F5" : "#171717" }}
                    formatter={(value) => [`${value} min`, "Time spent"]}
                  />
                  <Bar dataKey="minutes" fill={isDark ? "#F5F5F5" : "#171717"} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
        </motion.div>
      </motion.div>
    </div>
  );
}

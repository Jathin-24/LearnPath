import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Trophy,
  Target,
  Flame,
  Award,
  ShieldCheck,
  RefreshCw,
  BookOpen,
  ArrowRight,
  Sparkles
} from "lucide-react";
import { restartGoal, getDashboard, getAnalytics } from "../api";
import Celebration from "../components/Celebration";
import PageSkeleton from "../components/Skeleton";
import { DimensionalOrb } from "../components/ui/DimensionalOrb";
import { useAppState } from "../context/AppStateContext";
import { useToast } from "../context/ToastContext";
import type { DashboardResponse, AnalyticsResponse } from "../types";

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function Complete() {
  const navigate = useNavigate();
  const { state, updateState, auth } = useAppState();
  const { toast } = useToast();
  const sessionId = auth?.session_id;
  
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [restarting, setRestarting] = useState(false);
  const [loadingMetrics, setLoadingMetrics] = useState(true);

  useEffect(() => {
    if (!sessionId) return;
    Promise.all([
      getDashboard(sessionId).catch(() => null),
      getAnalytics(sessionId).catch(() => null)
    ]).then(([dash, an]) => {
      setDashboard(dash);
      setAnalytics(an);
      setLoadingMetrics(false);
    });
  }, [sessionId]);

  async function handleStartNewGoal() {
    if (!sessionId || restarting) return;
    setRestarting(true);
    try {
      const { state: newState } = await restartGoal(sessionId);
      updateState(newState);
      navigate("/app");
    } catch {
      setRestarting(false);
      toast("Failed to start new goal. Try again.", "error");
    }
  }

  if (!state || loadingMetrics) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <PageSkeleton />
      </div>
    );
  }

  const nodes = state.roadmap?.nodes ?? [];
  const learnedSkills = state.skill_gap_map?.assessments.filter(a => a.status === "learned") ?? [];
  
  // Safe fallbacks if APIs fail
  const topicsCompleted = analytics?.topics_completed ?? nodes.filter(n => n.status === "complete").length;
  const timeSpent = analytics?.total_time_spent_seconds ?? nodes.reduce((sum, n) => sum + n.time_spent_seconds, 0);
  const avgScore = analytics ? Math.round(analytics.average_score * 100) : null;
  
    const longestStreak = dashboard?.longest_streak_days ?? 0;
  const achievedBadges = dashboard?.badges.filter(b => b.achieved) ?? [];

  return (
    <div className="min-h-screen pb-24 font-sans overflow-x-hidden relative">
      
      {/* Celebration Effects */}

      <DimensionalOrb className="pointer-events-none absolute -left-20 top-20 h-64 w-64 opacity-45" />
      <DimensionalOrb className="pointer-events-none absolute -right-24 top-96 h-72 w-72 opacity-30" />
      <div className="mx-auto max-w-4xl px-4 py-12 relative z-10 space-y-12">
        
        {/* Section 1: Completion Hero */}
        <div className="lp-surface relative overflow-hidden text-center space-y-6 animate-fade-in-up rounded-[2rem] px-6 py-10 sm:px-10">
          <Celebration count={42} />
          <div className="relative z-20 inline-flex items-center justify-center p-6 rounded-[1.4rem] bg-gradient-to-br from-emerald-100 to-lime-100 border border-emerald-200 shadow-[0_20px_50px_rgba(22,120,76,0.16)] mb-1">
            <Trophy className="w-16 h-16 text-emerald-800" />
          </div>
          <p className="relative z-20 text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">Milestone reached</p>
          <h1 className="relative z-20 text-4xl md:text-5xl font-black font-display lp-text-gradient tracking-tight">
            Roadmap complete.
          </h1>
          <p className="relative z-20 text-base text-emerald-950/65 max-w-2xl mx-auto leading-relaxed">
            Congratulations, <span className="text-emerald-950 font-semibold">{state.learner_profile.name || "Learner"}</span>. You have completed the learning path for <span className="text-emerald-800 font-semibold">{state.learner_profile.goal}</span>.
          </p>
        </div>

        <div className="grid md:grid-cols-12 gap-6">
          
          {/* Main Column */}
          <div className="md:col-span-8 space-y-6">
            
            {/* Section 2: Statistics */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-400/30 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
              <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-6 flex items-center gap-2">
                <Target className="w-4 h-4" /> Journey Statistics
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-400">Topics Finished</p>
                  <p className="text-3xl font-black text-slate-100">{topicsCompleted}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-400">Time Invested</p>
                  <p className="text-3xl font-black text-slate-100">{formatDuration(timeSpent)}</p>
                </div>
                {avgScore !== null && (
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-400">Avg Score</p>
                    <p className="text-3xl font-black text-slate-100">{avgScore}%</p>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-400">Max Streak</p>
                  <p className="text-3xl font-black text-slate-100 flex items-baseline gap-1">
                    {longestStreak} <span className="text-sm text-orange-400"><Flame className="w-4 h-4 inline-block" /></span>
                  </p>
                </div>
              </div>
            </div>

            {/* Section 4: Skills Acquired */}
            <div className="glass-panel-light p-6 rounded-3xl border border-emerald-500/30 animate-fade-in-up" style={{ animationDelay: "0.2s" }}>
              <h2 className="text-sm font-bold text-emerald-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" /> Newly Mastered Skills
              </h2>
              {learnedSkills.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {learnedSkills.map(skill => (
                    <span key={skill.concept} className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-3 py-1.5 rounded-lg text-sm font-semibold">
                      {skill.concept}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">You solidified your existing knowledge base throughout this journey.</p>
              )}
            </div>

            {/* Section 5: Review & Spaced Repetition */}
            <div className="glass-panel p-6 rounded-3xl border border-amber-500/30 flex items-start gap-4 animate-fade-in-up" style={{ animationDelay: "0.3s" }}>
              <div className="bg-amber-500/20 p-3 rounded-2xl shrink-0 mt-1">
                <BookOpen className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-lg">The learning doesn't stop here.</h3>
                <p className="text-sm text-slate-400 mt-2 leading-relaxed">
                  Knowledge fades if it isn't used. Topics you've completed will continue to appear in your 
                  <span className="text-amber-300 font-semibold"> Spaced-Repetition Reviews</span> on your dashboard 
                  to ensure you retain this information for the long term. Check in occasionally to keep your streak alive!
                </p>
                <Link to="/app" className="inline-block mt-4 text-sm font-bold text-amber-400 hover:text-amber-300 transition underline underline-offset-4 decoration-amber-500/30 hover:decoration-amber-400">
                  View pending reviews
                </Link>
              </div>
            </div>

          </div>

          {/* Sidebar */}
          <div className="md:col-span-4 space-y-6">
            
            {/* Section 6: Next Goal CTA */}
            <div className="glass-panel p-6 rounded-3xl border border-slate-400/50 bg-slate-400/5 animate-fade-in-up group" style={{ animationDelay: "0.4s" }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-xl bg-slate-400/20 text-slate-300">
                  <Sparkles className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-100 text-lg">Ready for more?</h3>
              </div>
              <p className="text-sm text-slate-400 mb-6">
                Start a completely new roadmap tailored to your next big objective. Your achievements and profile history will be saved.
              </p>
              <button
                onClick={handleStartNewGoal}
                disabled={restarting}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-6 py-4 font-bold text-slate-900 transition hover:bg-slate-200 disabled:opacity-50 shadow-[0_0_20px_rgba(148,163,184,0.3)] hover:shadow-[0_0_30px_rgba(148,163,184,0.5)] active:scale-95"
              >
                {restarting ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <>Start New Goal <ArrowRight className="w-5 h-5" /></>
                )}
              </button>
            </div>

            {/* Section 3: Achievements */}
            <div className="glass-panel-light p-6 rounded-3xl border border-slate-400/30 animate-fade-in-up" style={{ animationDelay: "0.5s" }}>
              <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Award className="w-4 h-4" /> Achievements
              </h3>
              {achievedBadges.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {achievedBadges.map(badge => (
                    <div key={badge.id} className="flex items-center gap-3 p-3 rounded-2xl bg-slate-800/20 border border-slate-400/20 shadow-inner">
                      <div className="text-3xl filter drop-shadow-md">{badge.icon}</div>
                      <span className="font-semibold text-slate-100 text-sm">{badge.label}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 text-center py-4">No badges achieved yet.</p>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

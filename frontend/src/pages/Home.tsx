import { Link } from "react-router-dom";
import { ArrowRight, Target, CheckCircle, Route } from "lucide-react";

const STEPS = [
  {
    title: "Tell us your goal",
    body: "Say what you want to learn, in plain language - no forms, just a conversation.",
    icon: Target,
    color: "text-slate-300",
    bg: "bg-slate-300/10",
    border: "border-slate-400/20"
  },
  {
    title: "Quick skill check",
    body: "We show you a concept checklist and a short quiz to see what you actually know.",
    icon: CheckCircle,
    color: "text-slate-300",
    bg: "bg-slate-300/10",
    border: "border-slate-400/20"
  },
  {
    title: "Your personalized roadmap",
    body: "A sequenced set of topics with projects and checkpoints, built around your gaps.",
    icon: Route,
    color: "text-slate-300",
    bg: "bg-slate-300/10",
    border: "border-slate-400/20"
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 overflow-hidden relative">
      {/* Background ambient glow */}

      <header className="relative z-10 flex items-center justify-between px-6 py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center">
            <Route className="w-5 h-5 text-slate-100" />
          </div>
          <span className="text-xl font-bold tracking-tight text-slate-100">LearnPath</span>
        </div>
        <Link
          to="/login"
          className="rounded-full bg-slate-800 backdrop-blur-md border border-slate-800 px-5 py-2 text-sm font-semibold transition hover:bg-white/20 hover:scale-105"
        >
          Sign In
        </Link>
      </header>

      <section className="relative z-10 mx-auto max-w-4xl px-6 pb-16 pt-24 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-400/10 border border-slate-400/20 text-slate-300 text-xs font-semibold uppercase tracking-wider mb-8 animate-fade-in-up">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-slate-300 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-400"></span>
          </span>
          AI-Powered Learning
        </div>
        
        <h1 className="text-5xl font-bold tracking-tight sm:text-7xl mb-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
          Learn exactly what <br className="hidden sm:block" />
          <span className="text-gradient font-extrabold">gets you there.</span>
        </h1>
        
        <p className="mx-auto mt-6 max-w-2xl text-xl text-slate-400 leading-relaxed animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
          Tell us your goal. We'll check what you already know, then build a personalized,
          prerequisite-aware roadmap of courses, projects, and checkpoints.
        </p>
        
        <div className="mt-10 flex justify-center gap-4 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
          <Link
            to="/login"
            className="group relative inline-flex items-center justify-center gap-2 rounded-full bg-slate-100 px-8 py-4 text-lg font-bold text-slate-900 transition-all hover:bg-slate-200 hover:scale-105 hover:shadow-[0_0_40px_rgba(148,163,184,0.4)]"
          >
            Start Your Journey
            <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-6xl px-6 pb-32 pt-16">
        <div className="text-center mb-16 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
          <h2 className="text-3xl font-bold">How it works</h2>
          <p className="mt-4 text-slate-400">A smarter way to reach your goals.</p>
        </div>
        
        <div className="grid gap-8 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <div 
              key={step.title} 
              className="group glass-panel rounded-2xl p-8 transition-all hover:-translate-y-2 hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] hover:border-slate-400/30 animate-fade-in-up"
              style={{ animationDelay: `${0.5 + (i * 0.1)}s` }}
            >
              <div className={`mb-6 inline-flex h-12 w-12 items-center justify-center rounded-xl ${step.bg} ${step.border} border transition-transform group-hover:scale-110`}>
                <step.icon className={`w-6 h-6 ${step.color}`} />
              </div>
              <h3 className="text-xl font-bold mb-3">{step.title}</h3>
              <p className="text-slate-400 leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 border-t border-slate-800 bg-slate-950/50 backdrop-blur-lg px-6 py-8 text-center text-sm text-slate-500">
        <div className="flex items-center justify-center gap-2 mb-2">
          <Route className="w-4 h-4" />
          <span className="font-semibold text-slate-400">LearnPath</span>
        </div>
        <p>Built for a personalized, one-topic-at-a-time learning journey.</p>
      </footer>
    </div>
  );
}

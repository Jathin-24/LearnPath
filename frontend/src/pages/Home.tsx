import { Link } from "react-router-dom";

const STEPS = [
  {
    title: "Tell us your goal",
    body: "Say what you want to learn, in plain language - no forms, just a conversation.",
  },
  {
    title: "Quick skill check",
    body: "We show you a concept checklist and a short quiz to see what you actually know.",
  },
  {
    title: "Your personalized roadmap",
    body: "A sequenced set of topics with projects and checkpoints, built around your gaps.",
  },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <header className="flex items-center justify-between px-6 py-5">
        <span className="text-lg font-bold">LearnPath</span>
        <Link
          to="/login"
          className="rounded-full bg-indigo-500 px-5 py-2 text-sm font-semibold transition hover:bg-indigo-400"
        >
          Get Started
        </Link>
      </header>

      <section className="mx-auto max-w-3xl px-6 pb-16 pt-12 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Learn exactly what gets you there.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400">
          Tell us your goal. We'll check what you already know, then build a personalized,
          prerequisite-aware roadmap of courses, projects, and checkpoints - one topic at a
          time, no overload.
        </p>
        <Link
          to="/login"
          className="mt-8 inline-block rounded-full bg-indigo-500 px-8 py-3 text-lg font-semibold transition hover:bg-indigo-400"
        >
          Get Started
        </Link>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-20">
        <h2 className="text-center text-sm font-semibold uppercase tracking-wide text-indigo-400">
          How it works
        </h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="rounded-xl border border-slate-800 bg-slate-900 p-5">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500 text-sm font-bold">
                {i + 1}
              </div>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-slate-800 px-6 py-6 text-center text-xs text-slate-500">
        Built for a personalized, one-topic-at-a-time learning journey.
      </footer>
    </div>
  );
}

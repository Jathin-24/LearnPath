import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Compass, GraduationCap, Route, Sparkles, Target } from "lucide-react";

const steps = [
  { title: "Share the destination", body: "Tell LearnPath what you want to become or build. Your goal can be as specific—or open-ended—as you need.", icon: Target },
  { title: "Find the real starting point", body: "A quick skills check separates what you know from the concepts that will make the biggest difference.", icon: CheckCircle2 },
  { title: "Move with clarity", body: "Follow a focused, prerequisite-aware path with resources, practical checkpoints, and an AI tutor beside you.", icon: Route },
];

export default function Home() {
  return (
    <div className="relative isolate min-h-screen overflow-hidden bg-[#f7f5ed] text-emerald-950">
      <div className="lp-grid pointer-events-none absolute inset-x-0 top-0 h-[38rem] opacity-70" aria-hidden="true" />
      <div className="pointer-events-none absolute left-[-13rem] top-20 h-96 w-96 rounded-full bg-emerald-300/25 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute right-[-12rem] top-[-4rem] h-[30rem] w-[30rem] rounded-full bg-lime-200/40 blur-3xl" aria-hidden="true" />

      <header className="relative mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Link to="/" className="group inline-flex items-center gap-2.5 rounded-xl focus-visible:outline-none">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-800 text-amber-50 shadow-[0_10px_22px_rgba(13,89,55,0.24)] transition-transform duration-300 group-hover:rotate-[-6deg] group-hover:scale-105">
            <Compass className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold tracking-[-0.03em]">LearnPath</span>
        </Link>
        <nav aria-label="Account navigation">
          <Link to="/login" className="rounded-full border border-emerald-950/12 bg-amber-50/60 px-4 py-2 text-sm font-semibold text-emerald-900 transition hover:border-emerald-800/30 hover:bg-white sm:px-5">
            Sign in
          </Link>
        </nav>
      </header>

      <main>
        <section className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.08fr_.92fr] lg:px-10 lg:pb-32 lg:pt-28">
          <div className="max-w-3xl">
            <div className="lp-enter inline-flex items-center gap-2 rounded-full border border-emerald-800/15 bg-emerald-100/75 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Learning, made personal
            </div>
            <h1 className="lp-enter lp-enter-delay-1 mt-6 text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.065em] sm:text-6xl lg:text-7xl">
              A learning path that <span className="lp-text-gradient">keeps up with you.</span>
            </h1>
            <p className="lp-enter lp-enter-delay-2 mt-7 max-w-xl text-pretty text-lg leading-8 text-emerald-950/65 sm:text-xl">
              LearnPath turns your goal, existing skills, and time horizon into one clear next step—then stays with you through every concept, quiz, and project.
            </p>
            <div className="lp-enter lp-enter-delay-3 mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link to="/signup" className="group inline-flex h-13 items-center justify-center gap-2 rounded-2xl bg-emerald-800 px-6 py-3.5 text-base font-semibold text-amber-50 shadow-[0_16px_34px_rgba(13,89,55,0.25)] transition hover:-translate-y-0.5 hover:bg-emerald-900 hover:shadow-[0_20px_38px_rgba(13,89,55,0.32)]">
                Build my learning path
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" aria-hidden="true" />
              </Link>
              <Link to="/login" className="inline-flex h-13 items-center justify-center rounded-2xl px-5 py-3.5 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-900/7">
                I already have an account
              </Link>
            </div>
            <p className="mt-5 text-sm text-emerald-950/48">Start free. Your path is built around your pace—not a template.</p>
          </div>

          <div className="lp-enter lp-enter-delay-2 relative mx-auto w-full max-w-md lg:max-w-none" aria-label="Example learning path preview">
            <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-gradient-to-br from-emerald-200/70 via-lime-100/30 to-transparent blur-2xl" aria-hidden="true" />
            <div className="lp-surface rounded-[2rem] p-4 shadow-[0_28px_70px_rgba(18,66,43,0.16)] sm:p-5">
              <div className="flex items-center justify-between border-b border-emerald-950/8 pb-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.13em] text-emerald-800/65">Your current focus</p>
                  <h2 className="mt-1 text-lg font-semibold tracking-[-0.03em]">Backend foundations</h2>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-emerald-800 text-amber-50"><GraduationCap className="h-5 w-5" aria-hidden="true" /></span>
              </div>
              <div className="mt-5 space-y-3">
                {[
                  ["1", "Programming foundations", "Complete", "bg-emerald-100 text-emerald-800"],
                  ["2", "Databases & SQL", "In progress", "bg-lime-100 text-lime-900"],
                  ["3", "Build your API", "Up next", "bg-amber-100 text-amber-900"],
                ].map(([number, title, status, tone], index) => (
                  <div key={title} className={`flex items-center gap-3 rounded-2xl border p-3.5 transition duration-300 ${index === 1 ? "border-emerald-700/25 bg-emerald-50 shadow-sm" : "border-emerald-950/8 bg-white/50"}`}>
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-bold ${index === 1 ? "bg-emerald-800 text-amber-50" : "bg-emerald-950/6 text-emerald-900"}`}>{number}</span>
                    <span className="min-w-0 flex-1 text-sm font-semibold text-emerald-950">{title}</span>
                    <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${tone}`}>{status}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl bg-emerald-900 px-4 py-3.5 text-amber-50">
                <div className="flex items-center justify-between text-xs"><span className="font-medium text-emerald-50/70">Path progress</span><span className="font-bold">34%</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-50/20"><div className="h-full w-[34%] rounded-full bg-lime-300" /></div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative border-y border-emerald-950/8 bg-white/35 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
            <div className="max-w-xl">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">A calmer way forward</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">From ambition to a plan you can actually follow.</h2>
            </div>
            <div className="mt-11 grid gap-4 md:grid-cols-3">
              {steps.map(({ title, body, icon: Icon }) => (
                <article key={title} className="lp-surface lp-surface--interactive rounded-[1.5rem] p-6 sm:p-7">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-800"><Icon className="h-5 w-5" aria-hidden="true" /></div>
                  <h3 className="mt-6 text-xl font-semibold tracking-[-0.035em]">{title}</h3>
                  <p className="mt-3 text-sm leading-6 text-emerald-950/62">{body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="relative mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-sm text-emerald-950/52 sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <span className="inline-flex items-center gap-2 font-medium text-emerald-950"><Compass className="h-4 w-4 text-emerald-700" aria-hidden="true" /> LearnPath</span>
        <span>Built for focused, one-topic-at-a-time progress.</span>
      </footer>
    </div>
  );
}

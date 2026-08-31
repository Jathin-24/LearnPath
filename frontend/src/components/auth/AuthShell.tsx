import type { ReactNode } from "react";
import { Compass, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  form: ReactNode;
  error?: string | null;
  onGuest: () => void;
  guestBusy: boolean;
  formBusy: boolean;
  footer: ReactNode;
};

export function AuthShell({ eyebrow, title, description, form, error, onGuest, guestBusy, formBusy, footer }: AuthShellProps) {
  return (
    <div className="relative -m-4 flex min-h-screen overflow-hidden bg-[#f7f5ed] px-4 py-5 sm:-m-6 sm:px-6 lg:-m-8 lg:px-8">
      <div className="lp-grid pointer-events-none absolute inset-x-0 top-0 h-[34rem] opacity-60" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-40 top-8 h-[32rem] w-[32rem] rounded-full bg-emerald-200/45 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-40 bottom-0 h-[28rem] w-[28rem] rounded-full bg-lime-200/45 blur-3xl" aria-hidden="true" />
      <div className="relative mx-auto grid w-full max-w-6xl overflow-hidden rounded-[2rem] border border-emerald-950/10 bg-amber-50/60 shadow-[0_28px_80px_rgba(18,66,43,0.15)] backdrop-blur-xl lg:grid-cols-[.9fr_1.1fr]">
        <aside className="relative hidden overflow-hidden bg-emerald-900 p-10 text-amber-50 lg:flex lg:flex-col">
          <div className="absolute -right-28 top-16 h-72 w-72 rounded-full border border-emerald-100/15" aria-hidden="true" />
          <div className="absolute -right-7 top-36 h-44 w-44 rounded-full bg-lime-300/15 blur-xl" aria-hidden="true" />
          <Link to="/" className="relative inline-flex w-fit items-center gap-2.5 text-amber-50 focus-visible:outline-none"><span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-50 text-emerald-900"><Compass className="h-5 w-5" aria-hidden="true" /></span><span className="text-lg font-semibold tracking-[-0.03em]">LearnPath</span></Link>
          <div className="relative my-auto py-16"><span className="inline-flex items-center gap-2 rounded-full border border-emerald-100/15 bg-emerald-50/8 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.13em] text-emerald-50/80"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Your learning companion</span><h2 className="mt-6 text-4xl font-semibold leading-[1.04] tracking-[-0.055em] text-amber-50">One clear next step, every time.</h2><p className="mt-5 max-w-sm text-base leading-7 text-emerald-50/68">Build a path around the skills you have, the goal you want, and the pace that works for your life.</p></div>
          <p className="relative text-sm text-emerald-50/55">Personalized learning paths, projects, and support—without the noise.</p>
        </aside>
        <section className="flex min-h-[42rem] flex-col p-6 sm:p-10 lg:p-12">
          <Link to="/" className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-emerald-900 lg:hidden"><Compass className="h-4 w-4" aria-hidden="true" /> LearnPath</Link>
          <div className="my-auto w-full max-w-md py-10 lg:mx-auto"><p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">{eyebrow}</p><h1 className="mt-3 text-4xl font-semibold tracking-[-0.055em] text-emerald-950 sm:text-5xl">{title}</h1><p className="mt-4 text-base leading-7 text-emerald-950/62">{description}</p><div className="mt-8">{form}</div>{error && <div role="alert" className="mt-5 rounded-2xl border border-red-700/15 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{error}</div>}<div className="my-7 flex items-center gap-3" aria-hidden="true"><span className="h-px flex-1 bg-emerald-950/10" /><span className="text-xs font-medium uppercase tracking-[0.12em] text-emerald-950/42">or</span><span className="h-px flex-1 bg-emerald-950/10" /></div><button type="button" onClick={onGuest} disabled={formBusy || guestBusy} className="flex w-full items-center justify-center rounded-2xl border border-emerald-950/14 bg-white/50 px-5 py-3.5 text-sm font-semibold text-emerald-900 transition hover:-translate-y-0.5 hover:border-emerald-700/30 hover:bg-emerald-50 disabled:pointer-events-none disabled:opacity-50">{guestBusy ? "Setting up your space…" : "Continue as a guest"}</button><div className="mt-7 text-center text-sm text-emerald-950/62">{footer}</div></div>
        </section>
      </div>
    </div>
  );
}

type AuthFieldProps = { label: string; icon: ReactNode; children: ReactNode };
export function AuthField({ label, icon, children }: AuthFieldProps) {
  return <label className="block"><span className="mb-2 block text-sm font-semibold text-emerald-950/78">{label}</span><span className="relative block"><span className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-4 text-emerald-800/55">{icon}</span>{children}</span></label>;
}

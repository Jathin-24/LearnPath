import { AlertTriangle, ArrowLeft } from "lucide-react";
import { Link, isRouteErrorResponse, useRouteError } from "react-router-dom";
import { DimensionalOrb } from "../components/ui/DimensionalOrb";

export default function RouteError() {
  const error = useRouteError();
  const notFound = !error || (isRouteErrorResponse(error) && error.status === 404);

  return (
    <div className="lp-app-shell relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <DimensionalOrb className="pointer-events-none absolute -right-16 top-2 h-56 w-56 opacity-60" />
      <section className="lp-surface relative max-w-lg rounded-[2rem] px-7 py-12 text-center sm:px-12">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-emerald-800">{notFound ? "404 · Off the path" : "Something went wrong"}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-emerald-950">{notFound ? "That page isn’t part of your roadmap." : "We couldn’t open that view."}</h1>
        <p className="mt-3 text-sm leading-6 text-emerald-950/65">{notFound ? "Let’s get you back to a place where your learning plan can keep moving." : "Please return to your learning space and try again."}</p>
        <Link to="/app" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-950/15 transition hover:-translate-y-0.5 hover:bg-emerald-900">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to my path
        </Link>
      </section>
    </div>
  );
}

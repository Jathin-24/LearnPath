import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "../../utils/classNames";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <section className={cn("lp-surface rounded-[1.75rem] px-6 py-12 text-center sm:px-10", className)}>
      <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800 shadow-sm">
        {icon ?? <Sparkles className="h-5 w-5" aria-hidden="true" />}
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-emerald-950">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-emerald-950/60">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </section>
  );
}

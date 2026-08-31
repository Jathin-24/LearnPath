import type { ReactNode } from "react";
import { cn } from "../../utils/classNames";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn("lp-surface rounded-[1.75rem] px-6 py-6 sm:px-8", className)}>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">{eyebrow}</p>}
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] text-emerald-950 sm:text-4xl">{title}</h1>
          {description && <p className="mt-3 text-sm leading-6 text-emerald-950/62 sm:text-base">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

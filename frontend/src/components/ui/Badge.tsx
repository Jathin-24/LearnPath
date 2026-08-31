import * as React from "react";
import { cn } from "../../utils/classNames";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "secondary" | "outline" | "success" | "warning";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants = {
    default: "border border-emerald-800/15 bg-emerald-100/70 text-emerald-900",
    secondary: "border border-emerald-950/10 bg-amber-50 text-emerald-950/70",
    outline: "border-emerald-950/15 text-emerald-950/60",
    success: "border border-emerald-700/20 bg-emerald-100 text-emerald-800",
    warning: "border border-amber-700/20 bg-amber-100 text-amber-900",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };

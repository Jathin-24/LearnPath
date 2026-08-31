import { cn } from "../../utils/classNames";

export function DimensionalOrb({ className = "" }: { className?: string }) {
  return (
    <div className={cn("lp-float relative h-16 w-16 shrink-0", className)} aria-hidden="true">
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-lime-200 via-emerald-500 to-emerald-950 shadow-[inset_-12px_-14px_22px_rgba(5,60,38,.28),inset_10px_8px_18px_rgba(255,255,220,.58),0_18px_28px_rgba(13,89,55,.22)]" />
      <div className="absolute left-[18%] top-[14%] h-[28%] w-[28%] rounded-full bg-white/65 blur-[2px]" />
      <div className="absolute -inset-2 -z-10 rounded-full bg-emerald-300/25 blur-xl" />
    </div>
  );
}

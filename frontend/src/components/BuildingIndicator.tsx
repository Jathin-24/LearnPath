// Visual "the AI is working on this" indicator - used anywhere a request
// kicks off a real LLM call the learner has to wait on (resume parsing,
// roadmap modify/regenerate, subtopic quiz generation), so the wait reads
// as active work rather than a stalled button.

interface Props {
  label?: string;
  size?: "sm" | "lg";
  className?: string;
}

export default function BuildingIndicator({
  label = "Building with AI...",
  size = "sm",
  className = "",
}: Props) {
  const dim = size === "lg" ? "h-8 w-8" : "h-4 w-4";
  const textSize = size === "lg" ? "text-sm" : "text-xs";
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className={`relative flex ${dim} shrink-0`}>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-slate-300 opacity-40" />
        <span
          className={`relative inline-flex ${dim} rounded-full border-2 border-slate-400 border-t-transparent animate-spin`}
        />
      </span>
      <span className={`${textSize} text-slate-400`}>{label}</span>
    </div>
  );
}

// Full-width card variant - for blocking waits where the indicator is the
// whole point of the panel (e.g. "rebuilding your roadmap").
export function BuildingPanel({ label = "Building with AI - this can take a moment..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-slate-800 bg-slate-900 p-8">
      <BuildingIndicator label={label} size="lg" />
    </div>
  );
}

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
  const dim = size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5";
  const textSize = size === "lg" ? "text-sm" : "text-xs";
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <span className={`relative flex ${dim} shrink-0`}>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple opacity-30" />
        <span
          className={`relative inline-flex ${dim} rounded-full border-2 border-purple border-t-transparent animate-spin`}
        />
      </span>
      <span className={`${textSize} text-fg-secondary`}>{label}</span>
    </div>
  );
}

export function BuildingPanel({ label = "Building with AI - this can take a moment..." }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface p-8">
      <BuildingIndicator label={label} size="lg" />
    </div>
  );
}

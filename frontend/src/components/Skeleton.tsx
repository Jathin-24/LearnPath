interface Props {
  className?: string;
}

export function SkeletonBlock({ className = "" }: Props) {
  return <div className={`skeleton ${className}`} />;
}

export default function PageSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
      <SkeletonBlock className="h-8 w-64" />
      <div className="grid gap-4 sm:grid-cols-3">
        <SkeletonBlock className="h-20" />
        <SkeletonBlock className="h-20" />
        <SkeletonBlock className="h-20" />
      </div>
      <SkeletonBlock className="h-40" />
      <SkeletonBlock className="h-40" />
    </div>
  );
}

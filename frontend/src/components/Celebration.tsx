import { useMemo } from "react";
import type { CSSProperties } from "react";

const COLORS = ["#94a3b8", "#cbd5e1", "#e2e8f0", "#64748b", "#34d399", "#a7f3d0", "#fbbf24"];

interface Piece {
  left: number;
  delay: number;
  duration: number;
  size: number;
  color: string;
  drift: number;
}

export default function Celebration({ count = 26 }: { count?: number }) {
  /* oxlint-disable react/purity */
  const pieces = useMemo<Piece[]>(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.8,
        duration: 2 + Math.random() * 1.6,
        size: 6 + Math.random() * 7,
        color: COLORS[i % COLORS.length],
        drift: (Math.random() - 0.5) * 140,
      })),
    [count],
  );
  /* oxlint-enable react/purity */

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 block animate-confetti"
          style={
            {
              left: `${p.left}%`,
              width: p.size,
              height: p.size * 0.5,
              backgroundColor: p.color,
              borderRadius: 2,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              "--drift": `${p.drift}px`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
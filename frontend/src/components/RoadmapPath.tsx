import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import type { CSSProperties } from "react";
import { CarFront, Check, FastForward, Flag, Lock, Play, Trophy } from "lucide-react";
import type { RoadmapNode } from "../types";

const PER_ROW = 4;

interface Pt {
  x: number;
  y: number;
}

interface Seg {
  from: Pt;
  c1: Pt;
  c2: Pt;
  to: Pt;
}

function cubic(p: Seg, t: number): { x: number; y: number } {
  const u = 1 - t;
  const x = u * u * u * p.from.x + 3 * u * u * t * p.c1.x + 3 * u * t * t * p.c2.x + t * t * t * p.to.x;
  const y = u * u * u * p.from.y + 3 * u * u * t * p.c1.y + 3 * u * t * t * p.c2.y + t * t * t * p.to.y;
  return { x, y };
}

function tangent(p: Seg, t: number): number {
  const u = 1 - t;
  const dx = 3 * u * u * (p.c1.x - p.from.x) + 6 * u * t * (p.c2.x - p.c1.x) + 3 * t * t * (p.to.x - p.c2.x);
  const dy = 3 * u * u * (p.c1.y - p.from.y) + 6 * u * t * (p.c2.y - p.c1.y) + 3 * t * t * (p.to.y - p.c2.y);
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

function pathOf(segs: Seg[]): string {
  if (segs.length === 0) return "";
  return segs.reduce((acc, s) => {
    const start = acc === "" ? `M ${s.from.x.toFixed(2)} ${s.from.y.toFixed(2)}` : acc;
    return `${start} C ${s.c1.x.toFixed(2)} ${s.c1.y.toFixed(2)}, ${s.c2.x.toFixed(2)} ${s.c2.y.toFixed(2)}, ${s.to.x.toFixed(2)} ${s.to.y.toFixed(2)}`;
  }, "");
}

export default function RoadmapPath({ nodes }: { nodes: RoadmapNode[] }) {
  const carRef = useRef<HTMLDivElement>(null);

  const { positions, segs, fullPath, progressPaths } = useMemo(() => {
    const points: Pt[] = [];
    const rows = Math.max(1, Math.ceil(nodes.length / PER_ROW));
    const rowStep = 80 / rows;
    const topMargin = 12;
    for (let i = 0; i < nodes.length; i++) {
      const row = Math.floor(i / PER_ROW);
      const col = i % PER_ROW;
      const x = row % 2 === 0 ? 10 + col * (80 / (PER_ROW - 1)) : 90 - col * (80 / (PER_ROW - 1));
      points.push({ x, y: topMargin + row * rowStep });
    }

    const segments: Seg[] = [];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const mx = (a.x + b.x) / 2;
      segments.push({ from: a, c1: { x: mx, y: a.y }, c2: { x: mx, y: b.y }, to: b });
    }

    const full = pathOf(segments);

    const progressPatches: string[] = [];
    let runStart: number | null = null;
    for (let i = 1; i < nodes.length; i++) {
      const completeSeg = nodes[i].status === "complete";
      if (completeSeg && runStart === null) runStart = i - 1;
      else if (completeSeg) continue;
      else if (runStart !== null) {
        progressPatches.push(pathOf(segments.slice(runStart, i - 1)));
        runStart = null;
      }
    }
    if (runStart !== null && runStart < segments.length) {
      progressPatches.push(pathOf(segments.slice(runStart)));
    }

    return { positions: points, segs: segments, fullPath: full, progressPaths: progressPatches };
  }, [nodes]);

  // Travelling "you" car - moves along the whole road, HTML element so it
  // stays crisp even though the SVG is non-uniformly scaled.
  useEffect(() => {
    if (segs.length === 0 || !carRef.current) return;
    const DURATION_MS = 16000;
    let raf = 0;
    const step = (ts: number) => {
      const tt = (ts / DURATION_MS) % 1;
      const idx = Math.min(segs.length - 1, Math.floor(tt * segs.length));
      const local = tt * segs.length - idx;
      const p = cubic(segs[idx], local);
      const angle = tangent(segs[idx], local);
      if (carRef.current) {
        carRef.current.style.transform = `translate(-50%, -50%) translate(${p.x}%, ${p.y}%) rotate(${angle}deg)`;
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [segs]);

  if (nodes.length === 0) return null;

  const statusFor = (n: RoadmapNode) =>
    n.status === "complete"
      ? { ring: "border-emerald-400/70 bg-emerald-500/15", icon: Check, iconCls: "text-emerald-300" }
      : n.status === "skipped"
        ? { ring: "border-slate-600 bg-slate-800/80", icon: FastForward, iconCls: "text-slate-400" }
        : n.status === "available" || n.status === "in_progress"
          ? { ring: "border-slate-100 bg-slate-100", icon: Play, iconCls: "text-slate-900" }
          : { ring: "border-slate-700 bg-slate-900/80", icon: Lock, iconCls: "text-slate-500" };

  return (
    <div
      className="relative w-full max-w-3xl"
      style={{ height: 110 + Math.ceil(nodes.length / PER_ROW) * 86 }}
    >
      {/* The road - SVG underneath, node stations + car are HTML on top */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full overflow-visible"
        aria-hidden="true"
      >
        {/* road shoulder + asphalt bed */}
        <path d={fullPath} fill="none" stroke="#0b1220" strokeWidth={13} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <path d={fullPath} fill="none" stroke="#1e293b" strokeWidth={9} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {/* animated centre dashes */}
        <path
          d={fullPath}
          fill="none"
          stroke="#475569"
          strokeWidth={0.9}
          strokeDasharray="3 3"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          className="road-dash"
        />
        {/* completed stretch: glow + solid emerald line */}
        {progressPaths.map((d, i) => (
          <g key={i}>
            <path d={d} fill="none" stroke="#34d399" strokeWidth={7} opacity={0.15} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            <path d={d} fill="none" stroke="#34d399" strokeWidth={2.6} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
        ))}
      </svg>

      {/* travelling learner marker */}
      {segs.length > 0 && (
        <div
          ref={carRef}
          className="pointer-events-none absolute left-0 top-0 z-20 h-5 w-5 rounded-full bg-slate-100 text-slate-900 shadow-[0_0_12px_rgba(148,163,184,0.8)] ring-2 ring-slate-900/60"
          aria-hidden="true"
        >
          <CarFront className="h-5 w-5 p-0.5" />
        </div>
      )}

      {/* start / finish markers */}
      {positions.length > 0 && (
        <div
          className="pointer-events-none absolute z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-slate-700 bg-slate-900/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400"
          style={{ left: `${positions[0].x}%`, top: `calc(${positions[0].y}% - 44px)` }}
        >
          <Flag className="h-2.5 w-2.5 text-slate-500" /> Start
        </div>
      )}
      {positions.length > 1 && (
        <div
          className="pointer-events-none absolute z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-emerald-500/30 bg-slate-900/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300"
          style={{ left: `${positions[positions.length - 1].x}%`, top: `calc(${positions[positions.length - 1].y}% - 44px)` }}
        >
          <Trophy className="h-2.5 w-2.5" /> Finish
        </div>
      )}

      {/* node stations */}
      {nodes.map((n, i) => {
        const p = positions[i];
        const s = statusFor(n);
        const isCurrent = n.status === "available" || n.status === "in_progress";
        const Icon = s.icon;
        return (
          <Link
            key={n.node_id}
            to={`/topic/${n.node_id}`}
            className="group/station absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${p.x}%`, top: `${p.y}%` } as CSSProperties}
          >
            <span
              className={`relative flex h-10 w-10 items-center justify-center rounded-full shadow-lg ring-1 ring-black/40 transition hover:scale-110 hover:ring-2 hover:ring-slate-300 ${s.ring}`}
            >
              {isCurrent && <span className="absolute inset-0 animate-ping rounded-full bg-slate-200/30" />}
              <Icon className={`h-4 w-4 ${s.iconCls}`} />
            </span>
            <span
              className={`mt-1.5 max-w-[120px] truncate px-1 text-center text-[11px] leading-tight ${
                isCurrent ? "font-semibold text-slate-50" : "text-slate-400"
              }`}
            >
              {n.topic}
            </span>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              {isCurrent ? "You are here" : n.estimated_days > 0 ? `${n.estimated_days}d` : "short"}
            </span>

            {/* hover tooltip */}
            <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-48 -translate-x-1/2 -translate-y-1 rounded-xl border border-slate-700 bg-slate-900 p-3 text-left opacity-0 shadow-2xl shadow-black/60 transition group-hover/station:translate-y-0 group-hover/station:opacity-100">
              <span className="block text-xs font-bold text-slate-100">{n.topic}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${isCurrent ? "bg-slate-100 text-slate-900" : n.status === "complete" ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-800 text-slate-400"}`}
                >
                  {n.status === "complete" ? "Complete" : n.status === "skipped" ? "Skipped" : isCurrent ? "In progress" : "Locked"}
                </span>
                <span className="text-[10px] text-slate-500">~{n.estimated_days || 1} days</span>
                <span className="text-[10px] text-slate-500">• {n.key_concepts.length} concepts</span>
              </span>
              <span
                className={`mt-2 block text-[10px] font-bold ${isCurrent ? "text-slate-200" : "text-slate-500"}`}
              >
                {isCurrent ? "Open to continue →" : n.status === "complete" ? "Review this topic →" : "Locked until this topic is complete"}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
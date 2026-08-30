import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  ChevronDown,
  Circle,
  Clock,
  FastForward,
  Flag,
  Layers,
  Lock,
  Play,
  Trophy,
} from "lucide-react";
import type { RoadmapNode } from "../types";

const PHASE_SIZE = 4;

const STATUS_META: Record<
  string,
  { label: string; dot: string; badge: string; card: string; icon: typeof Play }
> = {
  complete: {
    label: "Complete",
    dot: "bg-emerald-400 ring-emerald-400/30 text-slate-900",
    badge: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    card: "border-slate-800/60",
    icon: Check,
  },
  in_progress: {
    label: "In progress",
    dot: "bg-amber-400 ring-amber-400/40 text-slate-900",
    badge: "bg-amber-400/15 text-amber-300 border-amber-400/30",
    card: "border-amber-400/40",
    icon: Play,
  },
  available: {
    label: "Up next",
    dot: "bg-slate-100 ring-slate-100/30 text-slate-900",
    badge: "bg-slate-100 text-slate-900 border-slate-100/30",
    card: "border-slate-100/40",
    icon: Play,
  },
  skipped: {
    label: "Skipped",
    dot: "bg-slate-700 ring-slate-700/40 text-slate-300",
    badge: "bg-slate-800 text-slate-400 border-slate-700",
    card: "border-slate-800/60",
    icon: FastForward,
  },
  locked: {
    label: "Locked",
    dot: "bg-slate-800 ring-slate-800 text-slate-500",
    badge: "bg-slate-800/70 text-slate-500 border-slate-700/70",
    card: "border-slate-800/60",
    icon: Lock,
  },
};

function phaseLabel(index: number): string {
  const labels = ["Foundations", "Core skills", "Intermediate", "Advanced", "Mastery", "Capstone"];
  return labels[index] ?? `Phase ${index + 1}`;
}

function RoadmapNodeCard({ node, defaultOpen }: { node: RoadmapNode; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const meta = STATUS_META[node.status] ?? STATUS_META.locked;
  const isCurrent = node.status === "available" || node.status === "in_progress";
  const passedSubtopics = node.subtopics.filter((s) => s.status === "passed").length;
  const Icon = meta.icon;

  return (
    <Link
      to={`/topic/${node.node_id}`}
      className="group block rounded-2xl border bg-slate-900/40 transition hover:bg-slate-900/70"
    >
      {/* Card body */}
      <div className={`rounded-2xl bg-slate-900/40 p-4 transition group-hover:bg-slate-900/70 sm:p-5 ${meta.card}`}>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setOpen((o) => !o);
            }}
            className="flex w-full items-start gap-3 text-left"
          >
            <span
              className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ${meta.dot}`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className={`text-sm font-bold leading-snug ${isCurrent ? "text-slate-50" : "text-slate-200"}`}>
                  {node.topic}
                </span>
                <span
                  className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${meta.badge}`}
                >
                  {isCurrent && node.status === "in_progress"
                    ? "You are here"
                    : meta.label}
                </span>
              </span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                {node.estimated_days > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" /> ~{node.estimated_days} days
                  </span>
                )}
                {node.key_concepts.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Layers className="h-3 w-3" /> {node.key_concepts.length} concepts
                  </span>
                )}
                {node.subtopics.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Circle className="h-3 w-3" /> {passedSubtopics}/{node.subtopics.length} subtopics
                  </span>
                )}
              </span>
            </span>
            <ChevronDown
              className={`mt-1 h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                open ? "rotate-180" : ""
              }`}
            />
          </button>

          {open && (
            <div className="mt-3 border-t border-slate-800/70 pt-3">
              {node.course_summary ? (
                <p className="text-xs leading-relaxed text-slate-400">{node.course_summary}</p>
              ) : (
                <p className="text-xs leading-relaxed text-slate-500">
                  No summary available for this topic yet.
                </p>
              )}
              {node.key_concepts.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {node.key_concepts.slice(0, 6).map((k) => (
                    <span
                      key={k}
                      className="rounded-md border border-slate-700/70 bg-slate-800/60 px-2 py-0.5 text-[10px] font-medium text-slate-300"
                    >
                      {k}
                    </span>
                  ))}
                  {node.key_concepts.length > 6 && (
                    <span className="px-1 py-0.5 text-[10px] text-slate-500">
                      +{node.key_concepts.length - 6} more
                    </span>
                  )}
                </div>
              )}
              <span className="mt-3 inline-block text-[11px] font-semibold text-slate-300">
                {node.status === "complete"
                  ? "Review this topic →"
                  : isCurrent
                    ? "Open to continue learning →"
                    : "Locked until previous topics are complete"}
              </span>
            </div>
          )}
        </div>
      </Link>
  );
}

export default function RoadmapTimeline({ nodes }: { nodes: RoadmapNode[] }) {
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set([0]));

  if (nodes.length === 0) return null;

  const done = nodes.filter((n) => n.status === "complete").length;
  const total = nodes.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const phases: RoadmapNode[][] = [];
  for (let i = 0; i < nodes.length; i += PHASE_SIZE) {
    phases.push(nodes.slice(i, i + PHASE_SIZE));
  }

  const togglePhase = (idx: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    setExpanded((prev) => {
      if (prev.size === phases.length) return new Set();
      return new Set(phases.map((_, i) => i));
    });
  };

  const allOpen = expanded.size === phases.length;

  return (
    <div className="w-full px-1 sm:px-2">
      {/* Header: progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Trophy className="h-4 w-4 text-emerald-400" />
            Journey progress
          </span>
          <span className="text-sm font-black text-slate-100">{pct}%</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300 transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            {done} of {total} topics complete
          </span>
          <button
            type="button"
            onClick={toggleAll}
            className="font-semibold text-slate-400 transition hover:text-slate-100"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>
      </div>

      {/* Phases */}
      <div className="space-y-4">
        {phases.map((phase, pi) => {
          const phaseDone = phase.filter((n) => n.status === "complete").length;
          const phaseActive = expanded.has(pi);
          const firstCurrent = phase.find((n) => n.status === "available" || n.status === "in_progress") ?? phase[0];
          const autoOpenId = pi === 0 ? firstCurrent.node_id : null;
          return (
            <div key={pi} className="overflow-hidden">
              {/* Phase header */}
              <button
                type="button"
                onClick={() => togglePhase(pi)}
                className="group flex w-full items-center gap-3 rounded-xl border border-slate-800/80 bg-slate-900/40 px-4 py-3 text-left transition hover:border-slate-700 hover:bg-slate-900/70"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300">
                  <Flag className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-100">
                      Phase {pi + 1}: {phaseLabel(pi)}
                    </span>
                    <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
                      {phaseDone}/{phase.length}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {phase[0].topic} → {phase[phase.length - 1].topic}
                  </span>
                </span>
                <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-slate-800">
                  <span
                    className="block h-full bg-emerald-400/80"
                    style={{ width: `${(phaseDone / phase.length) * 100}%` }}
                  />
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${
                    phaseActive ? "rotate-180" : ""
                  }`}
                />
              </button>

              {/* Phase body */}
              {phaseActive && (
                <div className="mt-2">
                  {phase.map((node, ni) => (
                    <div key={node.node_id} className="flex gap-3 pb-1">
                      {/* rail: dot + connecting line */}
                      <div className="flex shrink-0 flex-col items-center">
                        <span
                          className={`mt-4 flex h-3.5 w-3.5 items-center justify-center rounded-full ring-2 transition ${
                            STATUS_META[node.status]?.dot ?? STATUS_META.locked.dot
                          }`}
                          aria-hidden="true"
                        />
                        {ni < phase.length - 1 && (
                          <span className="w-0.5 flex-1 bg-slate-800" aria-hidden="true" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 pb-3">
                        <RoadmapNodeCard node={node} defaultOpen={node.node_id === autoOpenId} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

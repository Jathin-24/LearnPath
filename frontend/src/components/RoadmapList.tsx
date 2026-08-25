import { useState } from "react";
import { reorderRoadmapNode, skipRoadmapNode } from "../api";
import type { AppState, RoadmapNode } from "../types";

const STATUS_LABEL: Record<string, string> = {
  locked: "Locked",
  available: "Available",
  in_progress: "In Progress",
  complete: "Complete",
};

const STATUS_COLOR: Record<string, string> = {
  locked: "text-slate-500",
  available: "text-indigo-400",
  in_progress: "text-yellow-400",
  complete: "text-green-400",
};

interface Props {
  nodes: RoadmapNode[];
  onNodeClick?: (nodeId: string) => void;
  sessionId?: string;
  onChanged?: (state: AppState) => void;
}

export default function RoadmapList({ nodes, onNodeClick, sessionId, onChanged }: Props) {
  const topicById = Object.fromEntries(nodes.map((n) => [n.node_id, n.topic]));
  const [busyNodeId, setBusyNodeId] = useState<string | null>(null);
  const editable = !!(sessionId && onChanged);

  async function handleReorder(e: React.MouseEvent, nodeId: string, direction: "up" | "down") {
    e.stopPropagation();
    if (!sessionId || !onChanged) return;
    setBusyNodeId(nodeId);
    try {
      const { state } = await reorderRoadmapNode(sessionId, nodeId, direction);
      onChanged(state);
    } catch {
      // no-op - the button staying put communicates the failure well enough here
    } finally {
      setBusyNodeId(null);
    }
  }

  async function handleSkip(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation();
    if (!sessionId || !onChanged) return;
    setBusyNodeId(nodeId);
    try {
      const { state } = await skipRoadmapNode(sessionId, nodeId);
      onChanged(state);
    } catch {
      // no-op
    } finally {
      setBusyNodeId(null);
    }
  }

  return (
    <div className="space-y-3">
      {nodes.map((node, i) => (
        <div
          key={node.node_id}
          onClick={() => onNodeClick?.(node.node_id)}
          className={`rounded-xl border p-4 ${
            node.path_type === "path_b_open_web"
              ? "border-dashed border-red-800 bg-red-950/20"
              : "border-slate-800 bg-slate-900"
          } ${onNodeClick ? "cursor-pointer hover:border-indigo-500" : ""}`}
        >
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">
              {i + 1}. {node.topic}
            </h3>
            <div className="flex shrink-0 items-center gap-2">
              {node.estimated_days > 0 && (
                <span className="text-xs text-slate-500">~{node.estimated_days}d</span>
              )}
              <span className={`text-xs font-medium ${STATUS_COLOR[node.status]}`}>
                {STATUS_LABEL[node.status]}
              </span>
            </div>
          </div>

          {node.course_summary && <p className="mt-1 text-sm text-slate-400">{node.course_summary}</p>}

          {node.key_concepts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {node.key_concepts.map((concept) => (
                <span
                  key={concept}
                  className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300"
                >
                  {concept}
                </span>
              ))}
            </div>
          )}

          {node.project && (
            <div className="mt-2 rounded-md bg-slate-950 p-2">
              <p className="text-xs font-medium text-indigo-300">Project: {node.project.title}</p>
              <p className="mt-0.5 text-xs text-slate-400">{node.project.description}</p>
            </div>
          )}

          {node.internal_prerequisites.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Requires: {node.internal_prerequisites.map((id) => topicById[id] ?? id).join(", ")}
            </p>
          )}

          {editable && node.status === "locked" && (
            <div className="mt-3 flex gap-2 border-t border-slate-800 pt-2">
              <button
                onClick={(e) => handleReorder(e, node.node_id, "up")}
                disabled={busyNodeId === node.node_id || i === 0}
                className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300 transition hover:bg-slate-700 disabled:opacity-30"
              >
                ▲ Move up
              </button>
              <button
                onClick={(e) => handleReorder(e, node.node_id, "down")}
                disabled={busyNodeId === node.node_id || i === nodes.length - 1}
                className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300 transition hover:bg-slate-700 disabled:opacity-30"
              >
                ▼ Move down
              </button>
              <button
                onClick={(e) => handleSkip(e, node.node_id)}
                disabled={busyNodeId === node.node_id}
                className="rounded-md bg-red-950 px-2 py-1 text-xs text-red-300 transition hover:bg-red-900"
              >
                Skip
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

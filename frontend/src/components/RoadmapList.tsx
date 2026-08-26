import { useState } from "react";
import {
  editRoadmapNode,
  refreshWebResources,
  regenerateTopic,
  reorderRoadmapNode,
  skipRoadmapNode,
} from "../api";
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
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState("");
  const [regenerateBoxNodeId, setRegenerateBoxNodeId] = useState<string | null>(null);
  const [regenerateText, setRegenerateText] = useState("");
  const editable = !!(sessionId && onChanged);

  function startEditing(e: React.MouseEvent, node: RoadmapNode) {
    e.stopPropagation();
    setEditingNodeId(node.node_id);
    setEditTopic(node.topic);
  }

  async function handleSaveEdit(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation();
    if (!sessionId || !onChanged || !editTopic.trim()) return;
    setBusyNodeId(nodeId);
    try {
      const { state } = await editRoadmapNode(sessionId, nodeId, { topic: editTopic.trim() });
      onChanged(state);
      setEditingNodeId(null);
    } catch {
      // no-op - stay in edit mode so the learner can retry
    } finally {
      setBusyNodeId(null);
    }
  }

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

  async function handleRefreshWeb(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation();
    if (!sessionId || !onChanged) return;
    setBusyNodeId(nodeId);
    try {
      const { state } = await refreshWebResources(sessionId, nodeId);
      onChanged(state);
    } catch {
      // no-op - the button staying put communicates the failure well enough here
    } finally {
      setBusyNodeId(null);
    }
  }

  function openRegenerateBox(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation();
    setRegenerateBoxNodeId(nodeId);
    setRegenerateText("");
  }

  async function handleRegenerate(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation();
    if (!sessionId || !onChanged) return;
    setBusyNodeId(nodeId);
    try {
      const { state } = await regenerateTopic(sessionId, nodeId, regenerateText.trim() || undefined);
      onChanged(state);
      setRegenerateBoxNodeId(null);
      setRegenerateText("");
    } catch {
      // no-op - the box staying put communicates the failure well enough here
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
            {editingNodeId === node.node_id ? (
              <input
                autoFocus
                value={editTopic}
                onChange={(e) => setEditTopic(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded-md bg-slate-950 p-1.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
              />
            ) : (
              <h3 className="font-semibold">
                {i + 1}. {node.topic}
              </h3>
            )}
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

          {node.project && node.status === "complete" && (
            <div className="mt-2 rounded-md bg-slate-950 p-2">
              <p className="text-xs font-medium text-indigo-300">Project: {node.project.title}</p>
              <p className="mt-0.5 text-xs text-slate-400">{node.project.description}</p>
              {node.project.success_criteria.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {node.project.success_criteria.map((c, i) => (
                    <li key={i} className="flex items-start gap-1 text-xs text-slate-500">
                      <span className="mt-0.5 text-indigo-400">✓</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {node.cheat_sheet_notes && (
            <details className="mt-2 rounded-md bg-slate-950 p-2">
              <summary className="cursor-pointer text-xs font-medium text-indigo-300">
                Study notes
              </summary>
              <p className="mt-1 whitespace-pre-wrap text-xs text-slate-400">
                {node.cheat_sheet_notes}
              </p>
            </details>
          )}

          {(node.web_sources.length > 0 || node.youtube_links.length > 0) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {node.web_sources.map((r) => (
                <a
                  key={r.url}
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  title={r.snippet || r.title}
                  onClick={(e) => e.stopPropagation()}
                  className="max-w-[14rem] truncate rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300 hover:text-indigo-300"
                >
                  🔗 {r.title}
                </a>
              ))}
              {node.youtube_links.map((r) => (
                <a
                  key={r.url}
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  title={r.snippet || r.title}
                  onClick={(e) => e.stopPropagation()}
                  className="max-w-[14rem] truncate rounded-full bg-red-950/50 px-2 py-0.5 text-xs text-red-300 hover:text-red-200"
                >
                  ▶ {r.title}
                </a>
              ))}
            </div>
          )}

          {node.internal_prerequisites.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Requires: {node.internal_prerequisites.map((id) => topicById[id] ?? id).join(", ")}
            </p>
          )}

          {editable && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-2">
              <button
                onClick={(e) => handleRefreshWeb(e, node.node_id)}
                disabled={busyNodeId === node.node_id}
                className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300 transition hover:bg-slate-700 disabled:opacity-30"
              >
                {busyNodeId === node.node_id ? "Searching..." : "🔎 Find more resources"}
              </button>
              {node.status !== "complete" && regenerateBoxNodeId !== node.node_id && (
                <button
                  onClick={(e) => openRegenerateBox(e, node.node_id)}
                  disabled={busyNodeId === node.node_id}
                  className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300 transition hover:bg-slate-700 disabled:opacity-30"
                >
                  ♻ Regenerate
                </button>
              )}
            </div>
          )}

          {regenerateBoxNodeId === node.node_id && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-2 rounded-md border border-slate-800 bg-slate-950 p-3"
            >
              <label className="mb-1.5 block text-xs font-medium text-slate-400">
                Anything to add or change? (optional)
              </label>
              <textarea
                autoFocus
                value={regenerateText}
                onChange={(e) => setRegenerateText(e.target.value)}
                rows={2}
                placeholder="e.g. 'more real-world examples'"
                className="w-full resize-y rounded-md bg-slate-900 p-2 text-xs text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={(e) => handleRegenerate(e, node.node_id)}
                  disabled={busyNodeId === node.node_id}
                  className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                >
                  {busyNodeId === node.node_id ? "Regenerating..." : "Regenerate"}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRegenerateBoxNodeId(null);
                  }}
                  disabled={busyNodeId === node.node_id}
                  className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300 transition hover:bg-slate-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {editable && node.status === "locked" && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-2">
              {editingNodeId === node.node_id ? (
                <>
                  <button
                    onClick={(e) => handleSaveEdit(e, node.node_id)}
                    disabled={busyNodeId === node.node_id || !editTopic.trim()}
                    className="rounded-md bg-indigo-600 px-2 py-1 text-xs text-white transition hover:bg-indigo-500 disabled:opacity-30"
                  >
                    Save
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingNodeId(null);
                    }}
                    className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300 transition hover:bg-slate-700"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
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
                    onClick={(e) => startEditing(e, node)}
                    disabled={busyNodeId === node.node_id}
                    className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300 transition hover:bg-slate-700 disabled:opacity-30"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => handleSkip(e, node.node_id)}
                    disabled={busyNodeId === node.node_id}
                    className="rounded-md bg-red-950 px-2 py-1 text-xs text-red-300 transition hover:bg-red-900"
                  >
                    Skip
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

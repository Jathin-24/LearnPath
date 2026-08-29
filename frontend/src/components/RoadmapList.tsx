import { useState } from "react";
import {
  deleteRoadmapNode,
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
  locked: "text-fg-muted",
  available: "text-fg",
  in_progress: "text-accent-dark",
  complete: "text-success",
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
    } finally {
      setBusyNodeId(null);
    }
  }

  async function handleDelete(e: React.MouseEvent, nodeId: string) {
    e.stopPropagation();
    if (!sessionId || !onChanged) return;
    setBusyNodeId(nodeId);
    try {
      const { state } = await deleteRoadmapNode(sessionId, nodeId);
      onChanged(state);
    } catch {
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
              ? "border-dashed border-pink/30 bg-pink/5"
              : "border-border bg-surface"
          } ${onNodeClick ? "cursor-pointer hover:border-border-strong" : ""}`}
        >
          <div className="flex items-center justify-between gap-3">
            {editingNodeId === node.node_id ? (
              <input
                autoFocus
                value={editTopic}
                onChange={(e) => setEditTopic(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded-lg border border-border bg-bg px-3 py-1.5 text-sm font-medium outline-none focus:border-fg/30"
              />
            ) : (
              <h3 className="font-medium text-fg">
                {i + 1}. {node.topic}
              </h3>
            )}
            <div className="flex shrink-0 items-center gap-2">
              {node.estimated_days > 0 && (
                <span className="text-xs text-fg-muted">~{node.estimated_days}d</span>
              )}
              <span className={`text-xs font-medium ${STATUS_COLOR[node.status]}`}>
                {STATUS_LABEL[node.status]}
              </span>
            </div>
          </div>

          {node.course_summary && <p className="mt-1 text-sm text-fg-secondary">{node.course_summary}</p>}

          {node.key_concepts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {node.key_concepts.map((concept) => (
                <span
                  key={concept}
                  className="rounded-md bg-bg-secondary px-2 py-0.5 text-xs text-fg-secondary"
                >
                  {concept}
                </span>
              ))}
            </div>
          )}

          {node.project && node.status === "complete" && (
            <div className="mt-2 rounded-lg bg-bg-secondary p-3">
              <p className="text-xs font-medium text-fg">Project: {node.project.title}</p>
              <p className="mt-0.5 text-xs text-fg-secondary">{node.project.description}</p>
              {node.project.success_criteria.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {node.project.success_criteria.map((c, i) => (
                    <li key={i} className="flex items-start gap-1 text-xs text-fg-muted">
                      <span className="mt-0.5 text-success">✓</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {node.cheat_sheet_notes && (
            <details className="mt-2 rounded-lg bg-bg-secondary p-3">
              <summary className="cursor-pointer text-xs font-medium text-fg-secondary">
                Study notes
              </summary>
              <p className="mt-1 whitespace-pre-wrap text-xs text-fg-muted">
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
                  className="max-w-[14rem] truncate rounded-md bg-bg-secondary px-2 py-0.5 text-xs text-fg-secondary hover:text-fg"
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
                  className="max-w-[14rem] truncate rounded-md bg-pink/5 px-2 py-0.5 text-xs text-pink hover:text-pink/80"
                >
                  ▶ {r.title}
                </a>
              ))}
            </div>
          )}

          {node.internal_prerequisites.length > 0 && (
            <p className="mt-2 text-xs text-fg-muted">
              Requires: {node.internal_prerequisites.map((id) => topicById[id] ?? id).join(", ")}
            </p>
          )}

          {editable && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
              <button
                onClick={(e) => handleRefreshWeb(e, node.node_id)}
                disabled={busyNodeId === node.node_id}
                className="rounded-lg bg-bg-secondary px-3 py-1.5 text-xs text-fg-secondary transition hover:bg-border disabled:opacity-30"
              >
                {busyNodeId === node.node_id ? "Searching..." : "🔎 Find more resources"}
              </button>
              {node.status !== "complete" && regenerateBoxNodeId !== node.node_id && (
                <button
                  onClick={(e) => openRegenerateBox(e, node.node_id)}
                  disabled={busyNodeId === node.node_id}
                  className="rounded-lg bg-bg-secondary px-3 py-1.5 text-xs text-fg-secondary transition hover:bg-border disabled:opacity-30"
                >
                  ♻ Regenerate
                </button>
              )}
            </div>
          )}

          {regenerateBoxNodeId === node.node_id && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="mt-3 rounded-lg border border-border bg-bg p-3"
            >
              <label className="mb-1.5 block text-xs font-medium text-fg-secondary">
                Anything to add or change? (optional)
              </label>
              <textarea
                autoFocus
                value={regenerateText}
                onChange={(e) => setRegenerateText(e.target.value)}
                rows={2}
                placeholder="e.g. 'more real-world examples'"
                className="w-full resize-y rounded-lg border border-border bg-surface p-2 text-xs text-fg outline-none focus:border-fg/30"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={(e) => handleRegenerate(e, node.node_id)}
                  disabled={busyNodeId === node.node_id}
                  className="rounded-lg bg-fg px-3 py-1.5 text-xs font-medium text-white transition hover:bg-fg/90 dark:bg-accent dark:text-[#0A0A0A] dark:hover:bg-accent-dark disabled:opacity-50"
                >
                  {busyNodeId === node.node_id ? "Regenerating..." : "Regenerate"}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRegenerateBoxNodeId(null);
                  }}
                  disabled={busyNodeId === node.node_id}
                  className="rounded-lg bg-bg-secondary px-3 py-1.5 text-xs text-fg-secondary transition hover:bg-border"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {editable && node.status === "locked" && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
              {editingNodeId === node.node_id ? (
                <>
                  <button
                    onClick={(e) => handleSaveEdit(e, node.node_id)}
                    disabled={busyNodeId === node.node_id || !editTopic.trim()}
                    className="rounded-lg bg-fg px-3 py-1.5 text-xs font-medium text-white transition hover:bg-fg/90 dark:bg-accent dark:text-[#0A0A0A] dark:hover:bg-accent-dark disabled:opacity-30"
                  >
                    Save
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingNodeId(null);
                    }}
                    className="rounded-lg bg-bg-secondary px-3 py-1.5 text-xs text-fg-secondary transition hover:bg-border"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={(e) => handleReorder(e, node.node_id, "up")}
                    disabled={busyNodeId === node.node_id || i === 0}
                    className="rounded-lg bg-bg-secondary px-3 py-1.5 text-xs text-fg-secondary transition hover:bg-border disabled:opacity-30"
                  >
                    ▲ Move up
                  </button>
                  <button
                    onClick={(e) => handleReorder(e, node.node_id, "down")}
                    disabled={busyNodeId === node.node_id || i === nodes.length - 1}
                    className="rounded-lg bg-bg-secondary px-3 py-1.5 text-xs text-fg-secondary transition hover:bg-border disabled:opacity-30"
                  >
                    ▼ Move down
                  </button>
                  <button
                    onClick={(e) => startEditing(e, node)}
                    disabled={busyNodeId === node.node_id}
                    className="rounded-lg bg-bg-secondary px-3 py-1.5 text-xs text-fg-secondary transition hover:bg-border disabled:opacity-30"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => handleSkip(e, node.node_id)}
                    disabled={busyNodeId === node.node_id}
                    className="rounded-lg bg-danger/5 px-3 py-1.5 text-xs text-danger transition hover:bg-danger/10"
                  >
                    Skip
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, node.node_id)}
                    disabled={busyNodeId === node.node_id}
                    className="rounded-lg bg-danger/5 px-3 py-1.5 text-xs text-danger transition hover:bg-danger/10"
                  >
                    Delete
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

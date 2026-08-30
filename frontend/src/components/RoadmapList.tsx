import { useState } from "react";
import {
  addRoadmapNode,
  editRoadmapNode,
  refreshWebResources,
  regenerateTopic,
  reorderRoadmapNode,
  skipRoadmapNode,
} from "../api";
import { Plus } from "lucide-react";
import type { AppState, RoadmapNode } from "../types";

const STATUS_LABEL: Record<string, string> = {
  locked: "Locked",
  available: "Available",
  in_progress: "In Progress",
  complete: "Complete",
  skipped: "Skipped",
};

const STATUS_COLOR: Record<string, string> = {
  locked: "text-slate-500",
  available: "text-slate-300",
  in_progress: "text-yellow-400",
  complete: "text-green-400",
  skipped: "text-slate-600 line-through",
};

interface Props {
  nodes: RoadmapNode[];
  onNodeClick?: (nodeId: string) => void;
  sessionId?: string;
  onChanged?: (state: AppState) => void;
  editable?: boolean;
}

export default function RoadmapList({ nodes, onNodeClick, sessionId, onChanged, editable }: Props) {
  const topicById = Object.fromEntries(nodes.map((n) => [n.node_id, n.topic]));
  const [busyNodeId, setBusyNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editTopic, setEditTopic] = useState("");
  const [regenerateBoxNodeId, setRegenerateBoxNodeId] = useState<string | null>(null);
  const [regenerateText, setRegenerateText] = useState("");
  
  const [addingNode, setAddingNode] = useState(false);
  const [newNodeTopic, setNewNodeTopic] = useState("");
  const [newNodeConcepts, setNewNodeConcepts] = useState("");
  
  const isEditable = editable && !!(sessionId && onChanged);

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

  async function handleAddNode() {
    if (!sessionId || !onChanged || !newNodeTopic.trim()) return;
    setBusyNodeId("new-node");
    try {
      const concepts = newNodeConcepts
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const { state } = await addRoadmapNode(sessionId, newNodeTopic.trim(), concepts);
      onChanged(state);
      setAddingNode(false);
      setNewNodeTopic("");
      setNewNodeConcepts("");
    } catch {
      // no-op
    } finally {
      setBusyNodeId(null);
    }
  }

  return (
    <div className="space-y-4 relative before:absolute before:inset-y-0 before:left-[15px] before:w-0.5 before:bg-slate-800 ml-2 pl-8">
      {nodes.map((node, i) => (
        <div key={node.node_id} className="relative">
          <div className={`absolute -left-[31px] top-6 w-4 h-4 rounded-full border-4 border-slate-950 ${node.status === 'complete' ? 'bg-green-500' : node.status === 'in_progress' ? 'bg-yellow-500' : node.status === 'skipped' ? 'bg-slate-800' : 'bg-slate-400'}`} />
          <div
            onClick={() => onNodeClick?.(node.node_id)}
            className={`rounded-xl border p-4 transition-all ${
              node.status === "skipped" ? "opacity-50 grayscale" : ""
            } ${
              node.path_type === "path_b_open_web"
                ? "border-dashed border-red-800 bg-red-950/20"
                : "border-slate-800 bg-slate-900"
            } ${onNodeClick ? "cursor-pointer hover:border-slate-400" : ""}`}
          >
          <div className="flex items-center justify-between gap-3">
            {editingNodeId === node.node_id ? (
              <input
                autoFocus
                value={editTopic}
                onChange={(e) => setEditTopic(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full rounded-md bg-slate-950 p-1.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-slate-400"
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
                  className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400"
                >
                  {concept}
                </span>
              ))}
            </div>
          )}

          {node.project && node.status === "complete" && (
            <div className="mt-2 rounded-md bg-slate-950 p-2">
              <p className="text-xs font-medium text-slate-300">Project: {node.project.title}</p>
              <p className="mt-0.5 text-xs text-slate-400">{node.project.description}</p>
              {node.project.success_criteria.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {node.project.success_criteria.map((c, i) => (
                    <li key={i} className="flex items-start gap-1 text-xs text-slate-500">
                      <span className="mt-0.5 text-slate-300">âœ“</span>
                      <span>{c}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {node.cheat_sheet_notes && (
            <details className="mt-2 rounded-md bg-slate-950 p-2">
              <summary className="cursor-pointer text-xs font-medium text-slate-300">
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
                  title={[r.snippet, r.reason].filter(Boolean).join(" · ") || r.title}
                  onClick={(e) => e.stopPropagation()}
                  className="max-w-[14rem] truncate rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-400 hover:text-slate-300"
                >
                  ðŸ"— {r.title}
                </a>
              ))}
              {node.youtube_links.map((r) => (
                <a
                  key={r.url}
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  title={[r.snippet, r.reason].filter(Boolean).join(" · ") || r.title}
                  onClick={(e) => e.stopPropagation()}
                  className="max-w-[14rem] truncate rounded-full bg-red-950/50 px-2 py-0.5 text-xs text-red-300 hover:text-red-200"
                >
                  â–¶ {r.title}
                </a>
              ))}
            </div>
          )}

          {node.internal_prerequisites.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              Requires: {node.internal_prerequisites.map((id) => topicById[id] ?? id).join(", ")}
            </p>
          )}

          {isEditable && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-2">
              <button
                onClick={(e) => handleRefreshWeb(e, node.node_id)}
                disabled={busyNodeId === node.node_id}
                className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800 disabled:opacity-30"
              >
                {busyNodeId === node.node_id ? "Searching..." : "ðŸ”Ž Find more resources"}
              </button>
              {node.status !== "complete" && regenerateBoxNodeId !== node.node_id && (
                <button
                  onClick={(e) => openRegenerateBox(e, node.node_id)}
                  disabled={busyNodeId === node.node_id}
                  className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800 disabled:opacity-30"
                >
                  â™» Regenerate
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
                className="w-full resize-y rounded-md bg-slate-900 p-2 text-xs text-slate-100 outline-none focus:ring-2 focus:ring-slate-400"
              />
              <div className="mt-2 flex gap-2">
                <button
                  onClick={(e) => handleRegenerate(e, node.node_id)}
                  disabled={busyNodeId === node.node_id}
                  className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-900 transition hover:bg-slate-200 disabled:opacity-50"
                >
                  {busyNodeId === node.node_id ? "Regenerating..." : "Regenerate"}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setRegenerateBoxNodeId(null);
                  }}
                  disabled={busyNodeId === node.node_id}
                  className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400 transition hover:bg-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {isEditable && node.status === "locked" && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800 pt-2">
              {editingNodeId === node.node_id ? (
                <>
                  <button
                    onClick={(e) => handleSaveEdit(e, node.node_id)}
                    disabled={busyNodeId === node.node_id || !editTopic.trim()}
                    className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-900 transition hover:bg-slate-200 disabled:opacity-30"
                  >
                    Save
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingNodeId(null);
                    }}
                    className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={(e) => handleReorder(e, node.node_id, "up")}
                    disabled={busyNodeId === node.node_id || i === 0}
                    className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800 disabled:opacity-30"
                  >
                    â–² Move up
                  </button>
                  <button
                    onClick={(e) => handleReorder(e, node.node_id, "down")}
                    disabled={busyNodeId === node.node_id || i === nodes.length - 1}
                    className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800 disabled:opacity-30"
                  >
                    â–¼ Move down
                  </button>
                  <button
                    onClick={(e) => startEditing(e, node)}
                    disabled={busyNodeId === node.node_id}
                    className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-400 transition hover:bg-slate-800 disabled:opacity-30"
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
        </div>
      ))}
      
      {isEditable && (
        <div className="relative">
          <div className="absolute -left-[31px] top-4 w-4 h-4 rounded-full border-4 border-slate-950 bg-slate-800" />
          {addingNode ? (
            <div className="rounded-xl border border-slate-400/50 bg-slate-800 p-4">
              <h3 className="text-sm font-semibold mb-3 text-slate-100">Add a New Topic</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Topic Name</label>
                  <input
                    autoFocus
                    value={newNodeTopic}
                    onChange={(e) => setNewNodeTopic(e.target.value)}
                    placeholder="e.g. WebSockets"
                    className="w-full rounded-md bg-slate-950 p-2 text-sm text-slate-100 outline-none border border-slate-800 focus:border-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Key Concepts (comma-separated)</label>
                  <input
                    value={newNodeConcepts}
                    onChange={(e) => setNewNodeConcepts(e.target.value)}
                    placeholder="e.g. pub/sub, socket.io, realtime"
                    className="w-full rounded-md bg-slate-950 p-2 text-sm text-slate-100 outline-none border border-slate-800 focus:border-slate-400"
                  />
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={handleAddNode}
                    disabled={busyNodeId === "new-node" || !newNodeTopic.trim()}
                    className="rounded-md bg-slate-100 px-4 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-200 disabled:opacity-30"
                  >
                    {busyNodeId === "new-node" ? "Adding..." : "Add Topic"}
                  </button>
                  <button
                    onClick={() => {
                      setAddingNode(false);
                      setNewNodeTopic("");
                      setNewNodeConcepts("");
                    }}
                    className="rounded-md bg-slate-800 px-4 py-1.5 text-sm font-medium text-slate-400 transition hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingNode(true)}
              className="flex items-center gap-2 rounded-xl border border-dashed border-slate-700 p-4 text-sm font-semibold text-slate-400 hover:border-slate-500 hover:text-slate-400 transition-colors w-full justify-center"
            >
              <Plus className="w-4 h-4" /> Add Topic
            </button>
          )}
        </div>
      )}
    </div>
  );
}

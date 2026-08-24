import type { RoadmapNode } from "../types";

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
}

export default function RoadmapList({ nodes, onNodeClick }: Props) {
  const topicById = Object.fromEntries(nodes.map((n) => [n.node_id, n.topic]));

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
            <span className={`shrink-0 text-xs font-medium ${STATUS_COLOR[node.status]}`}>
              {STATUS_LABEL[node.status]}
            </span>
          </div>

          {node.course_summary && <p className="mt-1 text-sm text-slate-400">{node.course_summary}</p>}

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
        </div>
      ))}
    </div>
  );
}

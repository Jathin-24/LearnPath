import { useCallback, useMemo } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "reactflow";
import "reactflow/dist/style.css";
import type { RoadmapNode } from "../types";

const COLUMN_WIDTH = 260;
const ROW_HEIGHT = 90;

const STATUS_COLORS: Record<string, string> = {
  locked: "#334155",
  available: "#6366f1",
  in_progress: "#eab308",
  complete: "#22c55e",
};

interface Props {
  nodes: RoadmapNode[];
  colorByStatus?: boolean;
  onNodeClick?: (nodeId: string) => void;
}

export default function RoadmapGraph({ nodes, colorByStatus = false, onNodeClick }: Props) {
  const { flowNodes, flowEdges } = useMemo(() => {
    // Layered layout: x = depth in the prerequisite DAG, y = position within
    // that layer. Nodes arrive already topologically sorted (Path-A
    // guarantees prereqs appear before dependents), so a single left-to-right
    // pass is enough to compute depth.
    const depth: Record<string, number> = {};
    for (const node of nodes) {
      const prereqDepths = node.internal_prerequisites.map((id) => depth[id] ?? 0);
      depth[node.node_id] = prereqDepths.length ? Math.max(...prereqDepths) + 1 : 0;
    }

    const countPerDepth: Record<number, number> = {};
    const flowNodes: Node[] = nodes.map((node) => {
      const d = depth[node.node_id];
      const row = countPerDepth[d] ?? 0;
      countPerDepth[d] = row + 1;

      const background = colorByStatus
        ? STATUS_COLORS[node.status]
        : node.path_type === "path_b_open_web"
          ? "#7c2d12"
          : "#4338ca";

      return {
        id: node.node_id,
        position: { x: d * COLUMN_WIDTH, y: row * ROW_HEIGHT },
        data: { label: node.topic },
        style: {
          background,
          color: "white",
          border:
            node.path_type === "path_b_open_web"
              ? "2px dashed #fca5a5"
              : "1px solid #6366f1",
          borderRadius: 10,
          padding: 8,
          fontSize: 12,
          width: 220,
          cursor: onNodeClick ? "pointer" : "default",
        },
      };
    });

    const flowEdges: Edge[] = nodes.flatMap((node) =>
      node.internal_prerequisites.map((prereqId) => ({
        id: `${prereqId}->${node.node_id}`,
        source: prereqId,
        target: node.node_id,
        animated: colorByStatus && node.status === "available",
      })),
    );

    return { flowNodes, flowEdges };
  }, [nodes, colorByStatus, onNodeClick]);

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => onNodeClick?.(node.id),
    [onNodeClick],
  );

  return (
    <div className="h-[500px] w-full rounded-xl border border-slate-800 bg-slate-950">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodeClick={onNodeClick ? handleNodeClick : undefined}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1e293b" gap={16} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "reactflow";
import "reactflow/dist/style.css";
import type { RoadmapNode } from "../types";

const COLUMN_WIDTH = 280;
const ROW_HEIGHT = 100;
const NODE_WIDTH = 240;
const NODE_PADDING_X = 14;
const NODE_PADDING_Y = 10;

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  locked: { bg: "#F3F3EF", border: "#E2E2DC", text: "#666666" },
  available: { bg: "#171717", border: "#171717", text: "#FFFFFF" },
  in_progress: { bg: "#B8FF3D", border: "#9AE020", text: "#171717" },
  complete: { bg: "#22C55E", border: "#16A34A", text: "#FFFFFF" },
};

const STATUS_COLORS_DARK: Record<string, { bg: string; border: string; text: string }> = {
  locked: { bg: "#1A1A1A", border: "#2A2A2A", text: "#A0A0A0" },
  available: { bg: "#F5F5F5", border: "#F5F5F5", text: "#0A0A0A" },
  in_progress: { bg: "#B8FF3D", border: "#C9FF66", text: "#0A0A0A" },
  complete: { bg: "#34D399", border: "#22C55E", text: "#0A0A0A" },
};

interface Props {
  nodes: RoadmapNode[];
  colorByStatus?: boolean;
  onNodeClick?: (nodeId: string) => void;
}

export default function RoadmapGraph({ nodes, colorByStatus = false, onNodeClick }: Props) {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"));

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const colors = isDark ? STATUS_COLORS_DARK : STATUS_COLORS;

  const { flowNodes, flowEdges } = useMemo(() => {
    const depth: Record<string, number> = {};
    for (const node of nodes) {
      const prereqDepths = node.internal_prerequisites.map((id) => depth[id] ?? 0);
      depth[node.node_id] = prereqDepths.length ? Math.max(...prereqDepths) + 1 : 0;
    }

    const countPerDepth: Record<number, number> = {};
    const maxPerDepth: Record<number, number> = {};
    for (const node of nodes) {
      const d = depth[node.node_id];
      maxPerDepth[d] = (maxPerDepth[d] ?? 0) + 1;
    }

    const flowNodes: Node[] = nodes.map((node) => {
      const d = depth[node.node_id];
      const row = countPerDepth[d] ?? 0;
      countPerDepth[d] = row + 1;

      const statusColor = colors[node.status] ?? colors.locked;
      let bgColor = statusColor.bg;
      let borderColor = statusColor.border;
      let textColor = statusColor.text;

      if (!colorByStatus) {
        if (node.path_type === "path_b_open_web") {
          bgColor = isDark ? "#2A1A2A" : "#FFF0F3";
          borderColor = isDark ? "#FF8FA3" : "#FF6B8A";
          textColor = isDark ? "#FF8FA3" : "#FF6B8A";
        } else {
          bgColor = isDark ? "#1A1A1A" : "#FFFFFF";
          borderColor = isDark ? "#2A2A2A" : "#E2E2DC";
          textColor = isDark ? "#F5F5F5" : "#171717";
        }
      }

      const nodesInColumn = maxPerDepth[d] ?? 1;
      const columnHeight = nodesInColumn * ROW_HEIGHT;
      const yOffset = (columnHeight - ROW_HEIGHT) / 2;

      return {
        id: node.node_id,
        position: {
          x: d * COLUMN_WIDTH,
          y: row * ROW_HEIGHT + yOffset,
        },
        data: { label: node.topic },
        style: {
          background: bgColor,
          color: textColor,
          border: `2px solid ${borderColor}`,
          borderRadius: 12,
          padding: `${NODE_PADDING_Y}px ${NODE_PADDING_X}px`,
          fontSize: 13,
          fontWeight: 600,
          width: NODE_WIDTH,
          boxShadow: isDark
            ? "0 2px 8px rgba(0,0,0,0.4)"
            : "0 2px 8px rgba(0,0,0,0.06)",
          cursor: onNodeClick ? "pointer" : "default",
          transition: "all 0.2s ease",
        },
      };
    });

    const flowEdges: Edge[] = nodes.flatMap((node) =>
      node.internal_prerequisites.map((prereqId) => ({
        id: `${prereqId}->${node.node_id}`,
        source: prereqId,
        target: node.node_id,
        animated: colorByStatus && node.status === "available",
        style: {
          stroke: isDark ? "#3A3A3A" : "#D0D0C8",
          strokeWidth: 2,
        },
        type: "smoothstep",
      })),
    );

    return { flowNodes, flowEdges };
  }, [nodes, colorByStatus, onNodeClick, isDark, colors]);

  const handleNodeClick = useCallback<NodeMouseHandler>(
    (_event, node) => onNodeClick?.(node.id),
    [onNodeClick],
  );

  return (
    <div className="h-[500px] w-full overflow-hidden rounded-xl border border-border bg-bg">
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        onNodeClick={onNodeClick ? handleNodeClick : undefined}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={1.5}
      >
        <Background color={isDark ? "#2A2A2A" : "#E2E2DC"} gap={20} />
        <Controls />
      </ReactFlow>
    </div>
  );
}

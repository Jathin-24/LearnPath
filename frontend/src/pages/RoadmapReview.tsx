import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { confirmRoadmap, explainNode, getState } from "../api";
import NavBar from "../components/NavBar";
import RoadmapGraph from "../components/RoadmapGraph";
import RoadmapList from "../components/RoadmapList";
import PageSkeleton from "../components/Skeleton";
import { getSessionId } from "../session";
import type { AppState, RoadmapNode } from "../types";

export default function RoadmapReview() {
  const navigate = useNavigate();
  const sessionId = getSessionId();
  const [state, setState] = useState<AppState | null>(null);
  const [view, setView] = useState<"graph" | "list">("graph");
  const [selected, setSelected] = useState<RoadmapNode | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      navigate("/login", { replace: true });
      return;
    }
    getState(sessionId).then(({ state }) => setState(state));
  }, [sessionId, navigate]);

  if (!sessionId || !state || !state.roadmap) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <NavBar hasRoadmap />
        <PageSkeleton />
      </div>
    );
  }

  const roadmap = state.roadmap;

  async function handleNodeClick(nodeId: string) {
    const node = roadmap.nodes.find((n) => n.node_id === nodeId) ?? null;
    setSelected(node);
    setExplanation(null);
    if (!node) return;
    setExplaining(true);
    try {
      const { explanation } = await explainNode(sessionId!, nodeId);
      setExplanation(explanation);
    } catch {
      setExplanation("Couldn't load an explanation right now.");
    } finally {
      setExplaining(false);
    }
  }

  async function handleConfirm() {
    setConfirming(true);
    try {
      await confirmRoadmap(sessionId!);
      navigate("/dashboard");
    } catch {
      setConfirming(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <NavBar hasRoadmap />
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Your Roadmap</h1>
            <p className="mt-1 text-sm text-slate-400">
              {roadmap.nodes.length} topics, sequenced by prerequisite. Click a topic to see
              why it's here.
            </p>
          </div>
          <div className="flex shrink-0 gap-1 rounded-full bg-slate-900 p-1">
            <button
              onClick={() => setView("graph")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                view === "graph" ? "bg-indigo-500 text-white" : "text-slate-400"
              }`}
            >
              Graph
            </button>
            <button
              onClick={() => setView("list")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                view === "list" ? "bg-indigo-500 text-white" : "text-slate-400"
              }`}
            >
              List
            </button>
          </div>
        </div>

        <div className="mt-6">
          {view === "graph" ? (
            <RoadmapGraph nodes={roadmap.nodes} onNodeClick={handleNodeClick} />
          ) : (
            <RoadmapList
              nodes={roadmap.nodes}
              onNodeClick={handleNodeClick}
              sessionId={sessionId}
              onChanged={setState}
            />
          )}
        </div>

        {selected && (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-lg font-semibold">{selected.topic}</h2>
            {selected.course_summary && (
              <p className="mt-1 text-sm text-slate-400">{selected.course_summary}</p>
            )}
            <p className="mt-3 text-sm text-slate-200">
              {explaining ? "Thinking..." : explanation}
            </p>
          </div>
        )}

        <button
          onClick={handleConfirm}
          disabled={confirming}
          className="mt-6 rounded-full bg-indigo-500 px-8 py-3 text-lg font-semibold transition hover:bg-indigo-400 disabled:opacity-50"
        >
          {confirming ? "Confirming..." : "Confirm Roadmap"}
        </button>
      </div>
    </div>
  );
}

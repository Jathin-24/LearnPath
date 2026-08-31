import { useState } from "react";
// No useNavigate
import { confirmRoadmap, explainNode, modifyRoadmap } from "../api";
import BuildingIndicator from "../components/BuildingIndicator";
import RoadmapGraph from "../components/RoadmapGraph";
import RoadmapList from "../components/RoadmapList";
import PageSkeleton from "../components/Skeleton";
import { useAppState } from "../context/AppStateContext";
import type { RoadmapNode } from "../types";
import { Link } from "react-router-dom";
import { ChevronLeft, Sparkles } from "lucide-react";

export default function RoadmapReview() {
  const { state, updateState, auth } = useAppState();
  const sessionId = auth?.session_id;
  const [view, setView] = useState<"graph" | "list">("graph");
  const [selected, setSelected] = useState<RoadmapNode | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [modifying, setModifying] = useState(false);
  const [showModifyBox, setShowModifyBox] = useState(false);
  const [modifyText, setModifyText] = useState("");
  const [modifyError, setModifyError] = useState<string | null>(null);

  if (!sessionId || !state || !state.roadmap) {
    return (
      <div className="min-h-screen bg-[#f7f5ed] text-emerald-950">
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
      const { state: newState } = await confirmRoadmap(sessionId!);
      updateState(newState);
      // StageRouter will navigate automatically based on new stage
    } catch {
      setConfirming(false);
    }
  }

  async function handleModify() {
    if (!sessionId || !modifyText.trim()) return;
    setModifying(true);
    setModifyError(null);
    try {
      const { state: newState } = await modifyRoadmap(sessionId, modifyText.trim());
      updateState(newState);
      setSelected(null);
      setShowModifyBox(false);
      setModifyText("");
    } catch {
      setModifyError("Couldn't rebuild your roadmap - please try again.");
    } finally {
      setModifying(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f5ed] text-emerald-950">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link to="/app" className="mb-4 flex items-center gap-1 text-sm font-medium text-emerald-950/58 transition hover:text-emerald-800">
          <ChevronLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-display text-emerald-950">Your personalized path</h1>
            <p className="mt-1 text-sm text-emerald-950/60">
              {roadmap.nodes.length} topics · {roadmap.nodes.reduce((acc, n) => acc + n.estimated_days, 0)} days total · Path {roadmap.path_type === "path_a_dataset" ? "A" : "B"}
            </p>
          </div>
          <div className="flex shrink-0 gap-1 rounded-full border border-emerald-950/10 bg-white/55 p-1">
            <button
              onClick={() => setView("graph")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                view === "graph" ? "bg-emerald-800 text-amber-50" : "text-emerald-950/58"
              }`}
            >
              Graph
            </button>
            <button
              onClick={() => setView("list")}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                view === "list" ? "bg-emerald-800 text-amber-50" : "text-emerald-950/58"
              }`}
            >
              List
            </button>
          </div>
        </div>

        {modifying ? (
          <div className="mt-6">
            <BuildingIndicator label="Rebuilding your roadmap with those preferences..." size="lg" />
          </div>
        ) : (
          <div className="mt-6">
            {view === "graph" ? (
              <RoadmapGraph nodes={roadmap.nodes} onNodeClick={handleNodeClick} />
            ) : (
              <RoadmapList
                nodes={roadmap.nodes}
                onNodeClick={handleNodeClick}
                sessionId={sessionId}
                onChanged={updateState}
                editable={state.stage === "roadmap_review"}
              />
            )}
          </div>
        )}

        {selected && (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="text-lg font-semibold">{selected.topic}</h2>
            {selected.course_summary && (
              <p className="mt-1 text-sm text-slate-400">{selected.course_summary}</p>
            )}
            <p className="mt-3 text-sm text-slate-100">
              {explaining ? "Thinking..." : explanation}
            </p>
          </div>
        )}

        {showModifyBox && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
            <label className="mb-2 block text-sm font-semibold text-slate-400">
              What would you like to change?
            </label>
            <textarea
              value={modifyText}
              onChange={(e) => setModifyText(e.target.value)}
              rows={3}
              placeholder="e.g. 'Skip anything about mobile, add more on databases, keep it under 3 months'"
              className="w-full resize-y rounded-md bg-slate-950 p-3 text-sm text-slate-100 outline-none focus:ring-2 focus:ring-slate-400"
            />
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleModify}
                disabled={modifying || !modifyText.trim()}
                className="rounded-full bg-slate-100 px-5 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-200 disabled:opacity-50"
              >
                {modifying ? "Rebuilding..." : "Rebuild Roadmap"}
              </button>
              <button
                onClick={() => {
                  setShowModifyBox(false);
                  setModifyText("");
                  setModifyError(null);
                }}
                disabled={modifying}
                className="rounded-full bg-slate-800 px-4 py-2 text-sm text-slate-400 transition hover:bg-slate-700"
              >
                Cancel
              </button>
            </div>
            {modifyError && <p className="mt-2 text-sm text-red-400">{modifyError}</p>}
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={handleConfirm}
            disabled={confirming || modifying}
            className="rounded-full bg-slate-100 px-8 py-3 text-lg font-semibold text-slate-900 transition hover:bg-slate-200 disabled:opacity-50"
          >
            {confirming ? "Confirming..." : "Start Learning"}
          </button>
          {!showModifyBox && state.stage === "roadmap_review" && (
            <button
              onClick={() => setShowModifyBox(true)}
              disabled={confirming || modifying}
              className="rounded-full bg-slate-800 px-5 py-3 text-sm font-medium text-slate-400 transition hover:bg-slate-700 disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" /> Modify with AI
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

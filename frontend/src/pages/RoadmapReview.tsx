import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { confirmRoadmap, explainNode, getState, modifyRoadmap } from "../api";
import BuildingIndicator from "../components/BuildingIndicator";
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
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [modifying, setModifying] = useState(false);
  const [showModifyBox, setShowModifyBox] = useState(false);
  const [modifyText, setModifyText] = useState("");
  const [modifyError, setModifyError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      navigate("/login", { replace: true });
      return;
    }
    getState(sessionId).then(({ state }) => setState(state)).catch(() => navigate("/login", { replace: true }));
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
    setConfirmError(null);
    try {
      await confirmRoadmap(sessionId!);
      navigate("/dashboard");
    } catch {
      setConfirmError("Couldn't confirm roadmap - try again.");
      setConfirming(false);
    }
  }

  async function handleModify() {
    if (!sessionId || !modifyText.trim()) return;
    setModifying(true);
    setModifyError(null);
    try {
      const { state: newState } = await modifyRoadmap(sessionId, modifyText.trim());
      setState(newState);
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
                onChanged={setState}
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
            <p className="mt-3 text-sm text-slate-200">
              {explaining ? "Thinking..." : explanation}
            </p>
          </div>
        )}

        {showModifyBox && (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-900 p-4">
            <label className="mb-2 block text-sm font-semibold text-slate-300">
              What would you like to change?
            </label>
            <textarea
              value={modifyText}
              onChange={(e) => setModifyText(e.target.value)}
              rows={3}
              placeholder="e.g. 'Skip anything about mobile, add more on databases, keep it under 3 months'"
              className="w-full resize-y rounded-md bg-slate-950 p-3 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={handleModify}
                disabled={modifying || !modifyText.trim()}
                className="rounded-full bg-indigo-500 px-5 py-2 text-sm font-semibold transition hover:bg-indigo-400 disabled:opacity-50"
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
                className="rounded-full bg-slate-800 px-4 py-2 text-sm text-slate-300 transition hover:bg-slate-700"
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
            className="rounded-full bg-indigo-500 px-8 py-3 text-lg font-semibold transition hover:bg-indigo-400 disabled:opacity-50"
          >
            {confirming ? "Confirming..." : "Confirm Roadmap"}
          </button>
          {confirmError && <p className="w-full text-sm text-red-400">{confirmError}</p>}
          {!showModifyBox && (
            <button
              onClick={() => setShowModifyBox(true)}
              disabled={confirming || modifying}
              className="rounded-full bg-slate-800 px-5 py-3 text-sm font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
            >
              ✨ Modify with AI
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

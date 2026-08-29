import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { confirmRoadmap, explainNode, getState, modifyRoadmap } from "../api";
import { Button, Card, Textarea } from "../components/nb";
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
      <div className="min-h-screen bg-bg text-fg">
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
    <div className="min-h-screen bg-bg text-fg">
      <NavBar hasRoadmap />
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Your Roadmap</h1>
            <p className="mt-1 text-sm text-fg-secondary">
              {roadmap.nodes.length} topics, sequenced by prerequisite. Click a topic to see why it's here.
            </p>
          </div>
          <div className="flex border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setView("graph")}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                view === "graph" ? "bg-fg text-white dark:bg-accent dark:text-[#0A0A0A]" : "bg-surface text-fg-secondary hover:bg-bg-secondary"
              }`}
            >
              Graph
            </button>
            <button
              onClick={() => setView("list")}
              className={`px-3 py-1 text-xs font-medium transition-colors border-l border-border ${
                view === "list" ? "bg-fg text-white dark:bg-accent dark:text-[#0A0A0A]" : "bg-surface text-fg-secondary hover:bg-bg-secondary"
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
          <Card className="mt-4">
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">Topic Details</p>
            <h2 className="text-lg font-semibold">{selected.topic}</h2>
            {selected.course_summary && (
              <p className="mt-2 text-sm text-fg-secondary">{selected.course_summary}</p>
            )}
            <div className="mt-3 p-3 rounded-lg bg-bg-secondary">
              <p className="text-sm text-fg-secondary">
                {explaining ? "Thinking..." : explanation}
              </p>
            </div>
          </Card>
        )}

        {showModifyBox && (
          <Card className="mt-6">
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">Modify with AI</p>
            <label className="mb-2 block text-sm font-medium">
              What would you like to change?
            </label>
            <Textarea
              value={modifyText}
              onChange={(e) => setModifyText(e.target.value)}
              rows={3}
              placeholder="e.g. 'Skip anything about mobile, add more on databases, keep it under 3 months'"
            />
            <div className="mt-3 flex items-center gap-2">
              <Button
                onClick={handleModify}
                disabled={modifying || !modifyText.trim()}
              >
                {modifying ? "Rebuilding..." : "Rebuild Roadmap"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowModifyBox(false);
                  setModifyText("");
                  setModifyError(null);
                }}
                disabled={modifying}
              >
                Cancel
              </Button>
            </div>
            {modifyError && <p className="mt-2 text-sm text-danger">{modifyError}</p>}
          </Card>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button
            size="lg"
            onClick={handleConfirm}
            disabled={confirming || modifying}
          >
            {confirming ? "Confirming..." : "Confirm Roadmap →"}
          </Button>
          {confirmError && <p className="w-full text-sm text-danger">{confirmError}</p>}
          {!showModifyBox && (
            <Button
              variant="secondary"
              onClick={() => setShowModifyBox(true)}
              disabled={confirming || modifying}
            >
              Modify with AI ✨
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

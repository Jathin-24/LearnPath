import { useEffect, useRef, useState, type FormEvent } from "react";
import { useParams, Navigate, Link, useNavigate } from "react-router-dom";
import {
  Clock, CheckCircle, PlayCircle, BookOpen,
  ExternalLink, Link as LinkIcon, PenTool, Lightbulb, Lock, Trophy,
  FastForward, Check, Copy, Target, Activity, AlertTriangle, RefreshCw,
  Tag, Info, Route, ChevronLeft, ChevronDown, GitBranch, ArrowRight
} from "lucide-react";
import {
  expandProject,
  explainNode,
  generateSubtopicQuiz,
  recordTimeSpent,
  refreshWebResources,
  regenerateTopic,
  skipSubtopic,
  submitAssessment,
  submitSubtopicQuiz,
  updateTopicNotes,
} from "../api";
import BuildingIndicator from "../components/BuildingIndicator";
import Celebration from "../components/Celebration";
import FirstRunTips from "../components/FirstRunTips";
import QuizForm from "../components/QuizForm";
import QuizResults from "../components/QuizResults";
import PageSkeleton from "../components/Skeleton";
import { useClipboardCopy } from "../hooks/useClipboardCopy";
import { buildTopicPrompt } from "../promptTemplates";
import { useAppState } from "../context/AppStateContext";
import { useToast } from "../context/ToastContext";
import type { AppState, QuestionResult, RoadmapNode, Subtopic } from "../types";

function formatTimer(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function subtopicStatusIcon(status: Subtopic["status"]) {
  switch (status) {
    case "passed":
      return <CheckCircle className="w-5 h-5 text-emerald-400" />;
    case "skipped":
      return <FastForward className="w-5 h-5 text-slate-500" />;
    case "available":
      return <PlayCircle className="w-5 h-5 text-slate-300" />;
    default:
      return <Lock className="w-4 h-4 text-slate-600" />;
  }
}

function subtopicStatusColor(status: Subtopic["status"]): string {
  switch (status) {
    case "passed":
      return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
    case "skipped":
      return "text-slate-500 bg-slate-500/10 border-slate-500/30";
    case "available":
      return "text-slate-300 bg-slate-400/10 border-slate-400/40 shadow-[0_0_15px_rgba(148,163,184,0.2)]";
    default:
      return "text-slate-600 bg-slate-900 border-slate-800 opacity-60";
  }
}

interface SubtopicResult {
  subtopicId: string;
  score: number;
  passed: boolean;
  results: QuestionResult[];
}

export default function TopicDetail() {
  const { nodeId } = useParams<{ nodeId: string }>();
    const { state, updateState, auth, refreshState } = useAppState();
  const { toast } = useToast();
  const sessionId = auth?.session_id;
  const navigate = useNavigate();
  
  const [node, setNode] = useState<RoadmapNode | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; passed: boolean; results: QuestionResult[] } | null>(null);
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [refreshingWeb, setRefreshingWeb] = useState(false);
  
  // Notes
  const [notesText, setNotesText] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);
  
  // Regeneration
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [regenerateInstructions, setRegenerateInstructions] = useState("");
  const [regenerating, setRegenerating] = useState(false);

  // Skip warning
  const [skipWarningId, setSkipWarningId] = useState<string | null>(null);

  const [expanding, setExpanding] = useState(false);
  const [showAllResources, setShowAllResources] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const { copy: copyToClipboard } = useClipboardCopy();
  const [copiedSubtopicId, setCopiedSubtopicId] = useState<string | null>(null);

  const [subtopicBusyId, setSubtopicBusyId] = useState<string | null>(null);
  const [subtopicSubmitting, setSubtopicSubmitting] = useState(false);
  const [subtopicResult, setSubtopicResult] = useState<SubtopicResult | null>(null);
  const autoExpandedRef = useRef(false);

  // Project wrap-up (link stored locally, no backend endpoint yet)
  const [projectUrl, setProjectUrl] = useState("");
  const [projectSubmitted, setProjectSubmitted] = useState(false);

  const secondsRef = useRef(0);
  const lastFlushRef = useRef(0);
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastLoadedNodeId = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId || !nodeId || !state) return;
    const found = state.roadmap?.nodes.find((n) => n.node_id === nodeId) ?? null;
    setNode(found);
    if (lastLoadedNodeId.current !== nodeId) {
      setNotesText(found?.notes ?? "");
      lastLoadedNodeId.current = nodeId;
    }
  }, [sessionId, nodeId, state]);

  useEffect(() => {
    try {
      const existing = nodeId ? localStorage.getItem(`lpr_project_${sessionId}_${nodeId}`) : null;
      setProjectUrl(existing ?? "");
      setProjectSubmitted(!!existing);
    } catch {
      /* ignore */
    }
  }, [sessionId, nodeId]);

  // Notes debounced auto-save
  function handleNotesChange(value: string) {
    setNotesText(value);
    setNotesSaved(false);
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(() => {
      if (sessionId && nodeId) {
        updateTopicNotes(sessionId, nodeId, value)
          .then(() => refreshState())
          .then(() => setNotesSaved(true))
          .catch(() => {});
      }
    }, 1000);
  }

  useEffect(() => {
    return () => {
      if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    };
  }, []);

  // Study timer locally tracks and POSTs every 30s
  useEffect(() => {
    if (!sessionId || !nodeId) return;

    secondsRef.current = 0;
    lastFlushRef.current = 0;
    setDisplaySeconds(0);

    const tick = setInterval(() => {
      secondsRef.current += 1;
      setDisplaySeconds(secondsRef.current);
    }, 1000);

    const flush = () => {
      const unsent = secondsRef.current - lastFlushRef.current;
      if (unsent > 0) {
        lastFlushRef.current = secondsRef.current;
        recordTimeSpent(sessionId, nodeId, unsent)
          .then(() => refreshState())
          .catch(() => {});
      }
    };

    const flushInterval = setInterval(flush, 30000);

    return () => {
      clearInterval(tick);
      clearInterval(flushInterval);
      flush();
    };
  }, [sessionId, nodeId]);

  async function handleExplain() {
    if (!sessionId || !nodeId) return;
    setExplaining(true);
    try {
      const { explanation } = await explainNode(sessionId, nodeId);
      setExplanation(explanation);
    } catch {
      setExplanation("Couldn't load an explanation right now.");
      toast("Failed to generate explanation.", "error");
    } finally {
      setExplaining(false);
    }
  }

  async function handleRefreshWeb() {
    if (!sessionId || !nodeId) return;
    setRefreshingWeb(true);
    try {
      const { state: newState } = await refreshWebResources(sessionId, nodeId);
      applyNewState(newState);
      toast("Web resources refreshed.", "success");
    } catch {
      toast("Failed to refresh resources.", "error");
    } finally {
      setRefreshingWeb(false);
    }
  }
  
  async function handleRegenerateTopic() {
    if (!sessionId || !nodeId) return;
    setRegenerating(true);
    try {
      const { state: newState } = await regenerateTopic(sessionId, nodeId, regenerateInstructions.trim() || undefined);
      applyNewState(newState);
      setShowRegenerate(false);
      setRegenerateInstructions("");
      toast("Topic regenerated successfully.", "success");
    } catch {
      toast("Failed to regenerate topic.", "error");
    } finally {
      setRegenerating(false);
    }
  }

  function applyNewState(newState: AppState) {
    updateState(newState);
    setNode(newState.roadmap?.nodes.find((n) => n.node_id === nodeId) ?? null);
  }

  async function handleGenerateSubtopicQuiz(subtopicId: string) {
    if (!sessionId || !nodeId) return;
    setSubtopicBusyId(subtopicId);
    try {
      const { state: newState } = await generateSubtopicQuiz(sessionId, nodeId, subtopicId);
      applyNewState(newState);
    } catch {
    } finally {
      setSubtopicBusyId(null);
    }
  }

  async function handleSubmitSubtopicQuiz(subtopicId: string, answers: string[]) {
    if (!sessionId || !nodeId) return;
    setSubtopicSubmitting(true);
    try {
      const res = await submitSubtopicQuiz(sessionId, nodeId, subtopicId, answers);
      setSubtopicResult({ subtopicId, score: res.score, passed: res.passed, results: res.results });
      applyNewState(res.state);
    } catch {
    } finally {
      setSubtopicSubmitting(false);
    }
  }

  async function handleSkipSubtopic(subtopicId: string) {
    if (!sessionId || !nodeId) return;
    setSubtopicBusyId(subtopicId);
    try {
      const { state: newState } = await skipSubtopic(sessionId, nodeId, subtopicId);
      setSubtopicResult(null);
      setSkipWarningId(null);
      applyNewState(newState);
      toast("Subtopic skipped.", "success");
    } catch {
      toast("Failed to skip subtopic.", "error");
    } finally {
      setSubtopicBusyId(null);
    }
  }

  async function handleCopyTopicPrompt(subtopicName: string, subtopicId: string) {
    if (!node) return;
    const prompt = buildTopicPrompt(node, subtopicName, state?.learner_profile.goal ?? null, node.project);
    await copyToClipboard(prompt);
    setCopiedSubtopicId(subtopicId);
    setTimeout(() => setCopiedSubtopicId(null), 2000);
  }

  async function handleExpandProject() {
    if (!sessionId || !nodeId) return;
    setExpanding(true);
    try {
      const { detailed_description } = await expandProject(sessionId, nodeId);
      setNode((prev) =>
        prev && prev.project ? { ...prev, project: { ...prev.project, detailed_description } } : prev,
      );
      await refreshState();
    } catch {
    } finally {
      setExpanding(false);
    }
  }

  async function handleSubmitQuiz(answers: string[]) {
    if (!sessionId || !nodeId) return;
    setSubmitting(true);
    try {
      const res = await submitAssessment(sessionId, nodeId, answers);
      setResult(res);
      if (res.passed) {
        await refreshState();
      }
    } catch {
      setResult(null);
    } finally {
      setSubmitting(false);
    }
  }

  const resolvedSubtopicCount =
    node?.subtopics.filter((s) => s.status === "passed" || s.status === "skipped").length ?? 0;
  const allSubtopicsResolved =
    !node ||
    node.subtopics.length === 0 ||
    node.subtopics.every((s) => s.status === "passed" || s.status === "skipped");

  useEffect(() => {
    if (
      node?.status === "complete" &&
      node.project &&
      !node.project.detailed_description &&
      !autoExpandedRef.current
    ) {
      autoExpandedRef.current = true;
      handleExpandProject();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node?.status, node?.project?.detailed_description]);

  if (!state || !node) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <PageSkeleton />
      </div>
    );
  }

  if (node.status === "locked") {
    return <Navigate to="/app" replace />;
  }

  const activeSubtopic = node.subtopics.find(s => s.status === "available");
  const isComplete = node.status === "complete";
  const roadmapNodes = state.roadmap?.nodes ?? [];
  const nodeIdx = roadmapNodes.findIndex((n) => n.node_id === node.node_id);
  const nextNode = nodeIdx >= 0 ? roadmapNodes[nodeIdx + 1] ?? null : null;
  const totalResources = node.youtube_links.length + node.web_sources.length;
  const previewCount = 3;
  const youtubeToShow = showAllResources ? node.youtube_links : node.youtube_links.slice(0, previewCount);
  const webToShow = showAllResources ? node.web_sources : node.web_sources.slice(0, previewCount);
  const hiddenResourceCount = totalResources - (youtubeToShow.length + webToShow.length);

  function goToNextTopic() {
    if (nextNode) navigate(`/topic/${nextNode.node_id}`);
    else navigate("/app");
  }

  function handleSubmitProject(e?: FormEvent) {
    if (e) e.preventDefault();
    if (!sessionId || !nodeId) return;
    const trimmed = (projectUrl || "").trim();
    if (!trimmed) {
      toast("Paste a link to your project first.", "error");
      return;
    }
    const full = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      localStorage.setItem(`lpr_project_${sessionId}_${nodeId}`, full);
    } catch {
      /* ignore */
    }
    setProjectSubmitted(true);
    toast("Project saved. Great work — moving on!", "success");
    goToNextTopic();
  }

  function handleSkipProject() {
    if (!sessionId || !nodeId) return;
    try {
      localStorage.setItem(`lpr_project_${sessionId}_${nodeId}`, "skipped");
    } catch {
      /* ignore */
    }
    setProjectSubmitted(true);
    toast("Project skipped. You can add the link anytime.", "success");
    goToNextTopic();
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-24 font-sans">
      
      {/* Sticky Progress Header (Mobile mostly) */}
      <div className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800 px-4 py-3 lg:hidden">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <Link to="/app" className="flex items-center gap-1 text-sm font-medium text-slate-400 hover:text-white transition">
            <ChevronLeft className="w-4 h-4" /> Back
          </Link>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-slate-400">Progress</span>
            <span className="text-sm font-bold text-slate-100">{resolvedSubtopicCount} / {node.subtopics.length} done</span>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-slate-900 border border-slate-700 px-3 py-1.5 text-xs font-mono text-slate-300">
            <Clock className="w-3.5 h-3.5 text-slate-300" />
            {formatTimer(displaySeconds)}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 relative">
        <div className="relative z-20">
          <FirstRunTips />
        </div>
        {/* Ambient glow */}

        {/* Full-width Topic header */}
        <Link to="/app" className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-slate-400 hover:text-white transition">
          <ChevronLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
        <div className="glass-panel p-6 rounded-3xl animate-fade-in-up border border-slate-400/20">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-400/10 border border-slate-400/30 px-2.5 py-1 text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                <Route className="w-3.5 h-3.5" />
                {node.path_type === "path_a_dataset" ? "Dataset Path" : node.path_type === "path_b_open_web" ? "Open Web Path" : "Mixed Path"}
              </span>
              <h1 className="text-2xl md:text-3xl font-bold font-display leading-tight">{node.topic}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2 text-sm text-slate-400 bg-slate-800 p-3 rounded-xl border border-slate-800">
              <Clock className="w-4 h-4 text-slate-300 shrink-0" />
              <span className="font-medium whitespace-nowrap">Est. {node.estimated_days} days</span>
              <div className="flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-mono text-slate-300">
                <Clock className="w-3.5 h-3.5" /> {formatTimer(displaySeconds)}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {node.key_concepts.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" /> Key Concepts
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {node.key_concepts.map(kc => (
                    <span key={kc} className="px-2 py-1 rounded-md bg-slate-800 text-xs text-slate-400 border border-slate-700">{kc}</span>
                  ))}
                </div>
              </div>
            )}
            {node.internal_prerequisites.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <LinkIcon className="w-3.5 h-3.5" /> Prerequisites
                </h4>
                <ul className="list-disc pl-4 text-xs text-slate-400 space-y-1">
                  {node.internal_prerequisites.map(pr => <li key={pr}>{pr}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* 2-Column Layout (Center: Learning, Right: Progression/Res/Notes) */}
        <div className="relative z-10 flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start lg:gap-8">

          {/* CENTER COLUMN: Learning / Quiz / Project */}
          <div className="lg:col-span-8 flex flex-col gap-6 order-1 lg:order-2">
            
            {/* Active Learning Area */}
            {activeSubtopic && !allSubtopicsResolved && (
              <div className="glass-panel p-6 md:p-8 rounded-3xl animate-fade-in-up border border-slate-400/40 relative overflow-hidden shadow-lg shadow-slate-950/50" style={{ animationDelay: '0.2s' }}>
                <div className="absolute inset-0 bg-gradient-to-br from-slate-400/10 to-slate-400/10" />
                <div className="relative z-10">
                  <span className="inline-block px-3 py-1 bg-slate-400/20 border border-slate-400/40 rounded-full text-xs font-bold text-slate-300 uppercase tracking-widest mb-4">
                    Current Focus
                  </span>
                  <h2 className="text-2xl md:text-3xl font-bold font-display text-slate-100 mb-6 leading-tight">
                    {activeSubtopic.name}
                  </h2>
                  
                  <div className="flex flex-col gap-4 bg-slate-800 p-5 rounded-2xl border border-slate-800 mb-6">
                    <p className="text-sm text-slate-400 leading-relaxed font-medium">
                      Study this concept using your preferred external resources or the ones provided. Once you feel confident, take the quiz to proceed.
                    </p>
                    <button
                      onClick={() => handleCopyTopicPrompt(activeSubtopic.name, activeSubtopic.subtopic_id)}
                      className="group/ai self-start inline-flex items-center gap-3 rounded-2xl border border-slate-400/30 bg-slate-400/10 py-2 pl-2 pr-4 transition-all hover:border-slate-400/50 hover:bg-slate-400/15 hover:shadow-lg hover:shadow-slate-950/40"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-400/20 transition-colors group-hover/ai:bg-slate-400/30">
                        {copiedSubtopicId === activeSubtopic.subtopic_id ? (
                          <Check className="h-4 w-4 text-emerald-300" />
                        ) : (
                          <Copy className="h-4 w-4 text-slate-200" />
                        )}
                      </span>
                      <span className="flex flex-col items-start leading-tight">
                        <span className={`text-sm font-bold ${copiedSubtopicId === activeSubtopic.subtopic_id ? "text-emerald-200" : "text-slate-100"}`}>
                          {copiedSubtopicId === activeSubtopic.subtopic_id ? "Prompt copied!" : "Copy AI Tutor Prompt"}
                        </span>
                        <span className="text-[11px] font-medium text-slate-400">
                          Ask the AI to explain or tutor this concept
                        </span>
                      </span>
                    </button>
                  </div>

                  {/* Subtopic Action Area */}
                  {subtopicBusyId === activeSubtopic.subtopic_id && !activeSubtopic.quiz && (
                    <BuildingIndicator label="Putting together a quick quiz..." className="my-6" />
                  )}

                  {!activeSubtopic.quiz && subtopicBusyId !== activeSubtopic.subtopic_id && (
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => handleGenerateSubtopicQuiz(activeSubtopic.subtopic_id)}
                        className="rounded-xl bg-slate-100 px-6 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-200 hover:scale-105 shadow-md shadow-slate-950/50"
                      >
                        Done Learning — Take Quiz
                      </button>
                      <button
                        onClick={() => setSkipWarningId(activeSubtopic.subtopic_id)}
                        className="rounded-xl bg-slate-800 border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-400 transition hover:bg-slate-700 hover:text-white"
                      >
                        Skip
                      </button>
                    </div>
                  )}

                  {skipWarningId === activeSubtopic.subtopic_id && (
                    <div className="mt-4 p-4 rounded-xl bg-red-950/40 border border-red-900/50 flex flex-col gap-3 animate-fade-in-up">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                        <p className="text-sm font-medium text-red-200/90 leading-relaxed">
                          Skipping means you'll move forward without passing the quiz. You might miss important foundational knowledge for later topics.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSkipSubtopic(activeSubtopic.subtopic_id)}
                          className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-red-500"
                        >
                          I understand, skip anyway
                        </button>
                        <button
                          onClick={() => setSkipWarningId(null)}
                          className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-400 transition hover:bg-slate-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {activeSubtopic.quiz && !subtopicResult && (
                    <div className="mt-6 border-t border-slate-400/20 pt-6">
                      <QuizForm
                        questions={activeSubtopic.quiz.questions}
                        onSubmit={(answers) => handleSubmitSubtopicQuiz(activeSubtopic.subtopic_id, answers)}
                        submitting={subtopicSubmitting}
                      />
                    </div>
                  )}

                  {subtopicResult && subtopicResult.subtopicId === activeSubtopic.subtopic_id && (
                    <div className={`mt-6 relative rounded-2xl border p-5 ${subtopicResult.passed ? "overflow-hidden animate-celebrate border-emerald-500/40 bg-emerald-950/20 shadow-[0_0_20px_rgba(16,185,129,0.15)]" : "border-red-500/40 bg-red-950/20"}`}>
                      {subtopicResult.passed && <Celebration count={18} />}
                      <div className="relative z-20 flex items-center gap-3 mb-2">
                        {subtopicResult.passed ? <CheckCircle className="w-6 h-6 text-emerald-400" /> : <Activity className="w-6 h-6 text-red-400" />}
                        <p className="text-lg font-bold text-slate-100">
                          {subtopicResult.passed ? "Passed! Great job." : "Not quite - try again."}
                        </p>
                      </div>
                      <p className="text-sm text-slate-400 font-medium ml-9 mb-4">Score: <span className="text-white font-bold">{Math.round(subtopicResult.score * 100)}%</span></p>
                      
                      {subtopicResult.results.length > 0 && (
                        <div className="bg-slate-800 rounded-xl p-4 border border-slate-800 mb-4">
                          <QuizResults results={subtopicResult.results} />
                        </div>
                      )}

                      {!subtopicResult.passed && (
                        <button
                          onClick={() => setSubtopicResult(null)}
                          className="rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-700 transition"
                        >
                          Retry Quiz
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Final Quiz & Project Sections */}
            {allSubtopicsResolved && (
              <div className="space-y-6 animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                {/* Final Quiz */}
                <div className={`glass-panel p-6 md:p-8 rounded-3xl ${result?.passed ? "border-emerald-500/30" : "border-slate-400/30"}`}>
                  <h2 className="mb-6 text-xl font-bold font-display text-slate-100 flex items-center gap-3">
                    <Target className={`w-6 h-6 ${result?.passed ? "text-emerald-400" : "text-slate-300"}`} /> 
                    Final Assessment
                  </h2>
                  
                  {!node.assessment ? (
                    <div className="flex items-center gap-3 bg-slate-800 p-4 rounded-xl border border-slate-800">
                      <Lock className="w-5 h-5 text-slate-500" />
                      <p className="text-sm text-slate-400 font-medium">Final assessment is locked.</p>
                    </div>
                  ) : result ? (
                    <div className={`relative rounded-2xl border p-6 transition-all duration-500 ${result.passed ? "overflow-hidden border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
                      {result.passed && <Celebration count={26} />}
                      <div className="relative z-20 flex items-center gap-3 mb-2">
                        {result.passed ? <Trophy className="w-6 h-6 text-emerald-400" /> : <Activity className="w-6 h-6 text-red-400" />}
                        <p className="text-lg font-semibold text-slate-100">
                          {result.passed ? "Passed! Excellent work." : "Not quite there yet."}
                        </p>
                      </div>
                      <p className="text-sm text-slate-400 font-medium ml-9 mb-6">Score: <span className="text-white font-bold">{Math.round(result.score * 100)}%</span></p>
                      
                      {result.results.length > 0 && (
                        <div className="mt-4 bg-slate-800 rounded-xl p-5 border border-slate-800">
                          <QuizResults results={result.results} />
                        </div>
                      )}
                      
                      {!result.passed && (
                        <button
                          onClick={() => setResult(null)}
                          className="mt-6 rounded-full bg-slate-800 border border-slate-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 transition-all"
                        >
                          Try Again
                        </button>
                      )}
                    </div>
                  ) : (
                    <QuizForm
                      questions={node.assessment.questions}
                      onSubmit={handleSubmitQuiz}
                      submitting={submitting}
                    />
                  )}
                </div>

                {/* Project */}
                {!isComplete ? (
                  <div className="glass-panel-light p-6 rounded-3xl border-dashed opacity-70 border-slate-700">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-slate-800 rounded-lg"><Lock className="w-4 h-4 text-slate-400" /></div>
                      <h2 className="text-base font-semibold text-slate-400 font-display">Hands-on Project</h2>
                    </div>
                    <p className="mt-3 text-sm text-slate-400 ml-11 font-medium">
                      Pass the final assessment to unlock a project built around this topic.
                    </p>
                  </div>
                ) : node.project ? (
                  <div className="glass-panel p-6 md:p-8 rounded-3xl border-slate-400/40 bg-slate-400/5 relative overflow-hidden shadow-lg shadow-slate-950/50 animate-celebrate">
                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-slate-400/20 rounded-xl">
                          <Trophy className="w-6 h-6 text-slate-300" />
                        </div>
                        <h2 className="text-xl font-semibold text-slate-100 font-display">Project Unlocked</h2>
                      </div>
                      <h3 className="text-xl font-bold text-slate-100">{node.project.title}</h3>
                      <p className="mt-3 text-sm text-slate-400 leading-relaxed font-medium">{node.project.description}</p>
                      
                      {node.project.success_criteria.length > 0 && (
                        <div className="mt-6 border-t border-slate-400/20 pt-6">
                          <p className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                            <Target className="w-4 h-4" /> Success looks like:
                          </p>
                          <ul className="grid gap-3">
                            {node.project.success_criteria.map((c, i) => (
                              <li key={i} className="flex items-start gap-3 text-sm text-slate-100 bg-slate-800 p-4 rounded-xl border border-slate-800">
                                <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                                <span className="leading-relaxed">{c}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {node.project.detailed_description ? (
                        <div className="mt-6 border-t border-slate-400/20 pt-6">
                          <p className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                            <BookOpen className="w-4 h-4" /> Step-by-step Instructions:
                          </p>
                          <div className="bg-slate-800 p-6 rounded-2xl border border-slate-800">
                            <p className="whitespace-pre-wrap text-sm text-slate-100 leading-relaxed">
                              {node.project.detailed_description}
                            </p>
                          </div>
                        </div>
                      ) : expanding ? (
                        <div className="mt-6">
                          <BuildingIndicator label="Writing out the full step-by-step version..." />
                        </div>
                      ) : (
                        <button
                          onClick={handleExpandProject}
                          className="mt-6 rounded-xl bg-slate-800 border border-slate-400/40 px-6 py-3 text-sm font-bold text-slate-300 transition-all hover:bg-slate-700 hover:text-white w-full sm:w-auto"
                        >
                          Expand Project Details
                        </button>
                      )}

                      {/* Wrap up: submit project link or skip */}
                      <div className="mt-6 border-t border-slate-400/20 pt-6">
                        <p className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                          <GitBranch className="w-4 h-4" /> Finished? Share your project
                        </p>
                        {projectSubmitted ? (
                          <div className="flex flex-col gap-3">
                            <p className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-300/90">
                              <Check className="w-4 h-4" /> Project noted. Time for the next step.
                            </p>
                            <button
                              onClick={goToNextTopic}
                              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-200"
                            >
                              {nextNode ? `Continue to "${nextNode.topic}"` : "Back to dashboard"} <ArrowRight className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <form onSubmit={handleSubmitProject} className="flex flex-col gap-3">
                            <input
                              value={projectUrl}
                              onChange={(e) => setProjectUrl(e.target.value)}
                              placeholder="Paste GitHub repo URL of your project"
                              className="w-full rounded-xl bg-slate-900 border border-slate-700 p-3 text-sm text-slate-100 outline-none transition-all placeholder:text-slate-600 focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
                            />
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <button
                                type="submit"
                                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-slate-100 px-5 py-3 text-sm font-bold text-slate-900 transition hover:bg-slate-200"
                              >
                                Submit link & continue <ArrowRight className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={handleSkipProject}
                                className="rounded-xl bg-slate-800 border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-400 transition hover:bg-slate-700 hover:text-white"
                              >
                                Skip for now
                              </button>
                            </div>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Next topic CTA when this module is fully complete */}
                {isComplete && (
                  nextNode ? (
                    <Link
                      to={`/topic/${nextNode.node_id}`}
                      className="group flex items-center justify-center gap-2 rounded-2xl bg-slate-100 px-6 py-4 text-base font-bold text-slate-900 transition-all hover:gap-3 hover:bg-slate-200 hover:scale-[1.02] shadow-[0_0_30px_rgba(148,163,184,0.3)]"
                    >
                      Next up: "{nextNode.topic}"
                      <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                    </Link>
                  ) : (
                    <Link
                      to="/app"
                      className="block rounded-2xl border border-slate-700 bg-slate-800/60 px-6 py-4 text-center text-sm font-bold text-slate-200 transition hover:bg-slate-800"
                    >
                      You finished the whole roadmap — see your dashboard
                    </Link>
                  )
                )}
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Progression / Why / Resources / Notes */}
          <div className="lg:col-span-4 flex flex-col gap-4 order-2 lg:order-3">

            {/* Subtopic Progression */}
            <div className="glass-panel p-5 rounded-3xl animate-fade-in-up border border-slate-400/20" style={{ animationDelay: '0.15s' }}>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <h2 className="text-sm font-semibold font-display text-slate-100 uppercase tracking-wider">Progression</h2>
                <span className="text-xs font-bold text-slate-300">{resolvedSubtopicCount}/{node.subtopics.length}</span>
              </div>
              <ul className="space-y-2 relative before:absolute before:inset-y-2 before:left-[15px] before:w-px before:bg-slate-800">
                {node.subtopics.map((sub) => {
                  const isActive = sub.status === "available";
                  return (
                    <li key={sub.subtopic_id} className={`relative z-10 flex items-center gap-3 p-2 rounded-xl transition-all ${isActive ? "bg-slate-400/10 border border-slate-400/30" : sub.status === "locked" ? "opacity-60" : ""}`}>
                      <div className={`shrink-0 flex items-center justify-center w-8 h-8 rounded-full border bg-slate-950 ${subtopicStatusColor(sub.status)}`}>
                        {subtopicStatusIcon(sub.status)}
                      </div>
                      <span className={`text-sm font-medium line-clamp-2 ${isActive ? "text-slate-200" : sub.status === "locked" ? "text-slate-500" : sub.status === "skipped" ? "text-slate-500 line-through" : "text-emerald-100"}`}>
                        {sub.name}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>

            {/* Why am I learning this? */}
            <section className="glass-panel rounded-3xl p-5 animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
              <div className="mb-3 flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Why this topic?</h3>
              </div>
              {explanation ? (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
                  <p className="text-xs text-amber-100/90 leading-relaxed">{explanation}</p>
                </div>
              ) : (
                <button
                  onClick={handleExplain}
                  disabled={explaining}
                  className="flex items-center gap-2 text-xs font-semibold text-slate-400 transition hover:text-slate-200 disabled:opacity-50"
                >
                  <Lightbulb className="w-3.5 h-3.5" />
                  {explaining ? "Thinking..." : "Generate explanation"}
                </button>
              )}
            </section>

            {/* Resources (If Path B or mixed) */}
            {(node.web_sources.length > 0 || node.youtube_links.length > 0 || node.cheat_sheet_notes) && (
              <section className="glass-panel rounded-3xl p-5 animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <button
                    onClick={() => setResourcesOpen(v => !v)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 text-left transition hover:bg-slate-800/60"
                    aria-expanded={resourcesOpen}
                  >
                    <BookOpen className="w-4 h-4 shrink-0 text-slate-300" />
                    <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Resources</h3>
                    {totalResources > 0 && (
                      <span className="text-[10px] font-bold text-slate-500">{totalResources}</span>
                    )}
                    <ChevronDown className={`ml-auto h-4 w-4 shrink-0 text-slate-500 transition-transform duration-200 ${resourcesOpen ? "rotate-180" : ""}`} />
                  </button>
                  <button onClick={handleRefreshWeb} disabled={refreshingWeb} className="shrink-0 rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-800 hover:text-slate-300" title="Refresh Web Sources">
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshingWeb ? "animate-spin" : ""}`} />
                  </button>
                </div>

                {resourcesOpen && (
                  <div className={`mt-2 flex flex-col gap-2 ${showAllResources ? "max-h-[24rem] overflow-y-auto pr-1" : ""}`}>
                    {node.cheat_sheet_notes && (
                      <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
                        <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                          <Check className="w-3.5 h-3.5 text-emerald-400" /> Cheat Sheet
                        </p>
                        <p className="text-xs leading-relaxed text-slate-400 line-clamp-2">{node.cheat_sheet_notes}</p>
                      </div>
                    )}

                    {node.youtube_links.length > 0 && node.web_sources.length > 0 && (
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <PlayCircle className="w-3 h-3" /> Videos ({node.youtube_links.length})
                      </div>
                    )}

                    {node.youtube_links.slice(0, youtubeToShow.length).map(r => (
                      <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 transition group hover:border-slate-600 hover:bg-slate-800">
                        <PlayCircle className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-slate-200" />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-slate-300 line-clamp-1 group-hover:text-white">{r.title}</span>
                          {r.snippet && <span className="block text-[10px] text-slate-500 truncate">{r.snippet}</span>}
                          {r.reason && <span className="block text-[10px] italic text-slate-500 truncate">{r.reason}</span>}
                        </span>
                      </a>
                    ))}

                    {node.youtube_links.length > 0 && node.web_sources.length > 0 && (
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <ExternalLink className="w-3 h-3" /> Articles ({node.web_sources.length})
                      </div>
                    )}

                    {node.web_sources.slice(0, webToShow.length).map(r => (
                      <a key={r.url} href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2.5 transition group hover:border-slate-600 hover:bg-slate-800">
                        <ExternalLink className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-slate-200" />
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold text-slate-300 line-clamp-1 group-hover:text-white">{r.title}</span>
                          {r.snippet && <span className="block text-[10px] text-slate-500 truncate">{r.snippet}</span>}
                          {r.reason && <span className="block text-[10px] italic text-slate-500 truncate">{r.reason}</span>}
                        </span>
                      </a>
                    ))}

                    {hiddenResourceCount > 0 && (
                      <button
                        onClick={() => setShowAllResources(v => !v)}
                        className="mt-1 flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-bold text-slate-400 transition hover:text-white"
                      >
                        {showAllResources ? "Show fewer" : `Show all ${totalResources} resources`}
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAllResources ? "rotate-180" : ""}`} />
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* My Notes */}
            <section className="glass-panel rounded-3xl p-5 animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-slate-300" />
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">My Notes</h3>
                </div>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${notesSaved ? "bg-slate-800 text-slate-500" : "bg-slate-400/20 text-slate-300"}`}>
                  {notesSaved ? "Saved" : "Saving..."}
                </span>
              </div>
              <textarea
                value={notesText}
                onChange={(e) => handleNotesChange(e.target.value)}
                placeholder="Jot down important points..."
                rows={5}
                className="w-full resize-y rounded-xl bg-slate-900 border border-slate-700 p-3 text-sm text-slate-100 outline-none transition-all placeholder:text-slate-600 focus:border-slate-500 focus:ring-1 focus:ring-slate-500"
              />
            </section>

            {/* Advanced: Regenerate (subtle footer link) */}
            {!isComplete && (
              <section>
                {!showRegenerate ? (
                  <button
                    onClick={() => setShowRegenerate(true)}
                    className="flex w-full items-center justify-center gap-1.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:text-slate-400"
                  >
                    <Info className="w-3.5 h-3.5" /> Regenerate topic content with AI
                  </button>
                ) : (
                  <div className="glass-panel-light rounded-2xl p-4">
                    <p className="mb-2 text-xs font-medium text-slate-400">Instructions to regenerate this topic's content (optional):</p>
                    <textarea
                      value={regenerateInstructions}
                      onChange={e => setRegenerateInstructions(e.target.value)}
                      placeholder="e.g. Focus more on intuition, fewer formulas"
                      className="w-full rounded-lg bg-slate-900 border border-slate-700 p-2.5 text-xs text-white outline-none focus:border-slate-500"
                      rows={2}
                    />
                    <div className="mt-2 flex gap-2">
                      <button onClick={handleRegenerateTopic} disabled={regenerating} className="flex-1 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-900 transition hover:bg-slate-200 disabled:opacity-50">
                        {regenerating ? "Working..." : "Confirm"}
                      </button>
                      <button onClick={() => setShowRegenerate(false)} disabled={regenerating} className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-slate-400 transition hover:bg-slate-700">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

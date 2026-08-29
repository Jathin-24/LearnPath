import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  expandProject,
  explainNode,
  generateSubtopicQuiz,
  getState,
  recordTimeSpent,
  refreshWebResources,
  skipSubtopic,
  submitAssessment,
  submitSubtopicQuiz,
  updateTopicNotes,
} from "../api";
import { Button, Card, Badge, Textarea } from "../components/nb";
import BuildingIndicator from "../components/BuildingIndicator";
import NavBar from "../components/NavBar";
import QuizForm from "../components/QuizForm";
import QuizResults from "../components/QuizResults";
import PageSkeleton from "../components/Skeleton";
import { useClipboardCopy } from "../hooks/useClipboardCopy";
import { buildTopicPrompt } from "../promptTemplates";
import { getSessionId } from "../session";
import type { AppState, QuestionResult, RoadmapNode, Subtopic } from "../types";

function formatTimer(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function subtopicStatusIcon(status: Subtopic["status"]): string {
  switch (status) {
    case "passed": return "✓";
    case "skipped": return "↷";
    case "available": return "●";
    default: return "○";
  }
}

function subtopicStatusColor(status: Subtopic["status"]): string {
  switch (status) {
    case "passed": return "text-success";
    case "skipped": return "text-fg-muted";
    case "available": return "text-fg";
    default: return "text-fg-muted opacity-50";
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
  const navigate = useNavigate();
  const sessionId = getSessionId();
  const [state, setState] = useState<AppState | null>(null);
  const [node, setNode] = useState<RoadmapNode | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; passed: boolean; results: QuestionResult[] } | null>(null);
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [refreshingWeb, setRefreshingWeb] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [notesSaved, setNotesSaved] = useState(true);
  const [expanding, setExpanding] = useState(false);
  const { copy: copyToClipboard } = useClipboardCopy();
  const [copiedSubtopicId, setCopiedSubtopicId] = useState<string | null>(null);

  const [subtopicBusyId, setSubtopicBusyId] = useState<string | null>(null);
  const [subtopicSubmitting, setSubtopicSubmitting] = useState(false);
  const [subtopicResult, setSubtopicResult] = useState<SubtopicResult | null>(null);
  const autoExpandedRef = useRef(false);

  const secondsRef = useRef(0);
  const lastFlushRef = useRef(0);
  const notesSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!sessionId || !nodeId) {
      navigate("/login", { replace: true });
      return;
    }
    getState(sessionId).then(({ state }) => {
      setState(state);
      const found = state.roadmap?.nodes.find((n) => n.node_id === nodeId) ?? null;
      setNode(found);
      setNotesText(found?.notes ?? "");
    }).catch(() => navigate("/login", { replace: true }));
  }, [sessionId, nodeId, navigate]);

  function handleNotesChange(value: string) {
    setNotesText(value);
    setNotesSaved(false);
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(() => {
      if (sessionId && nodeId) {
        updateTopicNotes(sessionId, nodeId, value)
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
        recordTimeSpent(sessionId, nodeId, unsent).catch(() => {});
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
    } finally {
      setExplaining(false);
    }
  }

  async function handleRefreshWeb() {
    if (!sessionId || !nodeId) return;
    setRefreshingWeb(true);
    try {
      const { state: newState } = await refreshWebResources(sessionId, nodeId);
      setState(newState);
      setNode(newState.roadmap?.nodes.find((n) => n.node_id === nodeId) ?? null);
    } catch {} finally {
      setRefreshingWeb(false);
    }
  }

  function applyNewState(newState: AppState) {
    setState(newState);
    setNode(newState.roadmap?.nodes.find((n) => n.node_id === nodeId) ?? null);
  }

  async function handleGenerateSubtopicQuiz(subtopicId: string) {
    if (!sessionId || !nodeId) return;
    setSubtopicBusyId(subtopicId);
    try {
      const { state: newState } = await generateSubtopicQuiz(sessionId, nodeId, subtopicId);
      applyNewState(newState);
    } catch {} finally {
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
    } catch {} finally {
      setSubtopicSubmitting(false);
    }
  }

  async function handleSkipSubtopic(subtopicId: string) {
    if (!sessionId || !nodeId) return;
    setSubtopicBusyId(subtopicId);
    try {
      const { state: newState } = await skipSubtopic(sessionId, nodeId, subtopicId);
      setSubtopicResult(null);
      applyNewState(newState);
    } catch {} finally {
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
      setState((prev) => {
        if (!prev?.roadmap) return prev;
        const nodes = prev.roadmap.nodes.map((n) =>
          n.node_id === nodeId && n.project
            ? { ...n, project: { ...n.project, detailed_description } }
            : n,
        );
        return { ...prev, roadmap: { ...prev.roadmap, nodes } };
      });
    } catch {} finally {
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
        const { state: newState } = await getState(sessionId);
        applyNewState(newState);
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
  }, [node?.status, node?.project?.detailed_description]);

  if (!state || !node) {
    return (
      <div className="min-h-screen bg-bg text-fg">
        <NavBar hasRoadmap />
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-fg">
      <NavBar hasRoadmap />
      <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 md:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card className="animate-fade-in-up delay-100 group transition-all duration-300 group-hover:border-[var(--border-glow)]">
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-2xl font-semibold tracking-tight font-display">{node.topic}</h1>
              <Badge variant="default">
                <span className="font-mono">{formatTimer(displaySeconds)}</span>
              </Badge>
            </div>
            {node.course_summary && (
              <p className="mt-2 text-sm text-fg-secondary">{node.course_summary}</p>
            )}
            {node.course_search_link && (
              <a
                href={node.course_search_link}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block"
              >
                <Button variant="ghost" size="sm">Find this course →</Button>
              </a>
            )}
          </Card>

          {node.subtopics.length > 0 && (
            <Card className="animate-fade-in-up delay-200">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Sub-concepts</p>
                <Badge variant="muted">
                  {node.subtopics.filter((s) => s.status === "passed" || s.status === "skipped").length}/
                  {node.subtopics.length} done
                </Badge>
              </div>
              <ul className="space-y-2">
                {node.subtopics.map((sub) => {
                  const activeResult = subtopicResult?.subtopicId === sub.subtopic_id ? subtopicResult : null;
                  const busy = subtopicBusyId === sub.subtopic_id;
                  return (
                    <li key={sub.subtopic_id} className="border border-border rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`shrink-0 font-bold ${subtopicStatusColor(sub.status)} ${sub.status === "available" ? "animate-subtle-pulse" : ""}`}>
                            {subtopicStatusIcon(sub.status)}
                          </span>
                          <span
                            className={`truncate text-sm font-medium ${
                              sub.status === "locked"
                                ? "opacity-30"
                                : sub.status === "skipped"
                                  ? "line-through opacity-50"
                                  : ""
                            }`}
                          >
                            {sub.name}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyTopicPrompt(sub.name, sub.subtopic_id)}
                        >
                          {copiedSubtopicId === sub.subtopic_id ? "Copied!" : "Copy Prompt"}
                        </Button>
                      </div>

                      {sub.status === "available" && !sub.quiz && !activeResult && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleGenerateSubtopicQuiz(sub.subtopic_id)}
                            disabled={busy}
                            className="hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:scale-[1.02] transition-all duration-300"
                          >
                            {busy ? "Preparing quiz..." : "Done learning →"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSkipSubtopic(sub.subtopic_id)}
                            disabled={busy}
                            className="hover:shadow-[0_0_20px_rgba(134,142,150,0.3)] hover:scale-[1.02] transition-all duration-300"
                          >
                            Skip
                          </Button>
                        </div>
                      )}
                      {busy && !sub.quiz && (
                        <BuildingIndicator label="Putting together a quick quiz..." className="mt-2.5" />
                      )}

                      {sub.status === "available" && sub.quiz && !activeResult && (
                        <div className="mt-3">
                          <QuizForm
                            key={sub.subtopic_id}
                            questions={sub.quiz.questions}
                            onSubmit={(answers) => handleSubmitSubtopicQuiz(sub.subtopic_id, answers)}
                            submitting={subtopicSubmitting}
                          />
                        </div>
                      )}

                      {activeResult && (
                        <div
                          className={`mt-3 p-3 rounded-lg border ${
                            activeResult.passed
                              ? "animate-celebrate bg-success/10 border-success/20"
                              : "bg-danger/10 border-danger/20"
                          }`}
                        >
                          <p className="text-sm font-medium">
                            {activeResult.passed ? "Passed!" : "Not quite - try again."}
                          </p>
                          <p className="text-xs text-fg-secondary">Score: {Math.round(activeResult.score * 100)}%</p>
                          {activeResult.results.length > 0 && (
                            <div className="mt-2">
                              <QuizResults results={activeResult.results} />
                            </div>
                          )}
                          {!activeResult.passed && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mt-2"
                              onClick={() => setSubtopicResult(null)}
                            >
                              Try again
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          {node.cheat_sheet_notes && (
            <Card>
              <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">Study Notes</p>
              <p className="whitespace-pre-wrap text-sm text-fg-secondary">
                {node.cheat_sheet_notes}
              </p>
            </Card>
          )}

          {(node.web_sources.length > 0 || node.youtube_links.length > 0) && (
            <Card className="animate-fade-in-up delay-400">
              <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-3">Resources</p>
              <div className="space-y-2">
                {node.web_sources.map((r) => (
                  <a
                    key={r.url}
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block border border-border rounded-lg p-3 transition-transform duration-300 hover:border-border-strong hover:scale-[1.02]"
                  >
                    <p className="truncate text-sm font-medium">🔗 {r.title}</p>
                    {r.snippet && <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{r.snippet}</p>}
                    <p className="mt-1 truncate text-xs text-fg-secondary font-medium">
                      {(() => { try { return new URL(r.url).hostname.replace("www.", ""); } catch { return r.url; } })()}
                    </p>
                  </a>
                ))}
                {node.youtube_links.map((r) => (
                  <a
                    key={r.url}
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block border border-pink/20 bg-pink/5 rounded-lg p-3 transition-transform duration-300 hover:border-pink/30 hover:scale-[1.02]"
                  >
                    <p className="truncate text-sm font-medium text-pink">▶ {r.title}</p>
                    {r.snippet && <p className="mt-1 line-clamp-2 text-xs text-fg-muted">{r.snippet}</p>}
                  </a>
                ))}
              </div>
            </Card>
          )}

          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefreshWeb}
            disabled={refreshingWeb}
          >
            {refreshingWeb ? "Searching..." : "🔎 Find more resources"}
          </Button>

          {node.subtopics.length > 0 && !allSubtopicsResolved && (
            <Card className="opacity-60">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔒</span>
                <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Final Quiz</p>
              </div>
              <p className="mt-1.5 text-xs text-fg-muted">
                Unlocks once every sub-concept above is done ({resolvedSubtopicCount}/
                {node.subtopics.length} so far).
              </p>
            </Card>
          )}

          {node.assessment && allSubtopicsResolved && (
            <div>
              <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-3">Final Quiz</p>
              {result ? (
                <Card
                  className={`${
                    result.passed
                      ? "animate-celebrate bg-success/10 border-success/20"
                      : "bg-danger/10 border-danger/20"
                  }`}
                >
                  <p className="font-semibold">
                    {result.passed ? "🎉 Passed!" : "Not quite there yet."}
                  </p>
                  <p className="text-sm text-fg-secondary">Score: {Math.round(result.score * 100)}%</p>
                  {result.results.length > 0 && (
                    <div className="mt-3">
                      <QuizResults results={result.results} />
                    </div>
                  )}
                  {result.passed ? (
                    <Button
                      className="mt-3"
                      onClick={() => navigate("/dashboard")}
                    >
                      Back to Dashboard
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      className="mt-3"
                      onClick={() => setResult(null)}
                    >
                      Try again
                    </Button>
                  )}
                </Card>
              ) : (
                <QuizForm
                  questions={node.assessment.questions}
                  onSubmit={handleSubmitQuiz}
                  submitting={submitting}
                />
              )}
            </div>
          )}

          {node.status !== "complete" && (
            <Card className="opacity-60">
              <div className="flex items-center gap-2">
                <span>🔒</span>
                <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">Project</p>
              </div>
              <p className="mt-1.5 text-xs text-fg-muted">
                Pass this topic's final quiz to unlock a hands-on project built around what you
                just learned.
              </p>
            </Card>
          )}

          {node.status === "complete" && node.project && (
            <Card>
              <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">🏆 Project</p>
              <h3 className="font-semibold">{node.project.title}</h3>
              <p className="mt-1 text-sm text-fg-secondary">{node.project.description}</p>
              {node.project.success_criteria.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-1">Success looks like:</p>
                  <ul className="space-y-1">
                    {node.project.success_criteria.map((c, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs">
                        <span className="mt-0.5 text-success font-bold">✓</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {node.project.detailed_description ? (
                <div className="mt-3 border-t border-border pt-3">
                  <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-1">Step-by-step:</p>
                  <p className="whitespace-pre-wrap text-xs text-fg-secondary">
                    {node.project.detailed_description}
                  </p>
                </div>
              ) : expanding ? (
                <BuildingIndicator label="Writing out the full step-by-step version..." className="mt-3" />
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  onClick={handleExpandProject}
                >
                  Make this more detailed
                </Button>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <p className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">Why this topic?</p>
            {explanation ? (
              <p className="text-sm text-fg-secondary">{explanation}</p>
            ) : (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExplain}
                disabled={explaining}
              >
                {explaining ? "Thinking..." : "Why this?"}
              </Button>
            )}
          </Card>

          <Card className="animate-fade-in-up delay-500">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-fg-muted uppercase tracking-wider">My Notes</p>
              <span className="text-xs text-fg-muted">{notesSaved ? "Saved" : "Saving..."}</span>
            </div>
            <Textarea
              value={notesText}
              onChange={(e) => handleNotesChange(e.target.value)}
              rows={8}
              placeholder="Jot down anything that clicked for you here - only you can see this."
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

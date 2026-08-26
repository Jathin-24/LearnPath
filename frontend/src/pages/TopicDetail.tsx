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
    case "passed":
      return "✓"; // check
    case "skipped":
      return "↷"; // skip arrow
    case "available":
      return "●"; // filled dot
    default:
      return "○"; // hollow dot
  }
}

function subtopicStatusColor(status: Subtopic["status"]): string {
  switch (status) {
    case "passed":
      return "text-green-400";
    case "skipped":
      return "text-slate-500";
    case "available":
      return "text-indigo-400";
    default:
      return "text-slate-700";
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
  const [result, setResult] = useState<{ score: number; passed: boolean; results: QuestionResult[] } | null>(
    null,
  );
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
    });
  }, [sessionId, nodeId, navigate]);

  // Notes: debounce-autosaved 1s after the learner stops typing, plus a
  // final flush on unmount/navigation - same "don't block the UI, don't
  // lose the tail end" spirit as the study timer below.
  function handleNotesChange(value: string) {
    setNotesText(value);
    setNotesSaved(false);
    if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    notesSaveTimer.current = setTimeout(() => {
      if (sessionId && nodeId) {
        updateTopicNotes(sessionId, nodeId, value)
          .then(() => setNotesSaved(true))
          .catch(() => {
            // best-effort - the learner can just keep typing/retry
          });
      }
    }, 1000);
  }

  useEffect(() => {
    return () => {
      if (notesSaveTimer.current) clearTimeout(notesSaveTimer.current);
    };
  }, []);

  // Study timer: ticks locally every second, periodically flushes the
  // accumulated delta to the backend (best-effort - never blocks the UI),
  // and flushes whatever's left on unmount/navigation away.
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
        recordTimeSpent(sessionId, nodeId, unsent).catch(() => {
          // best-effort - a lost timer tick shouldn't interrupt studying
        });
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
    } catch {
      // no-op - the button staying put communicates the failure well enough here
    } finally {
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
    } catch {
      // no-op - the button staying put communicates the failure well enough here
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
      // no-op
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
      applyNewState(newState);
    } catch {
      // no-op
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
    } catch {
      // no-op - the button staying put communicates the failure well enough here
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
        // Passing flips node.status to COMPLETE server-side, which is what
        // reveals the project section below - refetch so that shows up
        // immediately instead of only after the next page load.
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

  // The project should read as a reward, not a checklist item at the top -
  // it only appears once the topic is actually COMPLETE (final quiz
  // passed), and gets its longer step-by-step version pulled in
  // automatically right then rather than waiting on a manual click.
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
      <div className="min-h-screen bg-slate-950 text-white">
        <NavBar hasRoadmap />
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <NavBar hasRoadmap />
      <div className="mx-auto grid max-w-5xl gap-6 px-6 py-8 md:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-2xl font-bold">{node.topic}</h1>
              <span
                title="Time spent on this topic this session"
                className="shrink-0 rounded-full bg-slate-900 px-3 py-1 text-xs font-mono text-slate-400"
              >
                {formatTimer(displaySeconds)}
              </span>
            </div>
            {node.course_summary && (
              <p className="mt-2 text-sm text-slate-400">{node.course_summary}</p>
            )}
            {node.course_search_link && (
              <a
                href={node.course_search_link}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-sm text-indigo-400 hover:underline"
              >
                Find this course &rarr;
              </a>
            )}
          </div>

          {node.subtopics.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-300">Sub-concepts</h2>
                <span className="text-xs text-slate-500">
                  {node.subtopics.filter((s) => s.status === "passed" || s.status === "skipped").length}/
                  {node.subtopics.length} done
                </span>
              </div>
              <ul className="space-y-2">
                {node.subtopics.map((sub) => {
                  const activeResult = subtopicResult?.subtopicId === sub.subtopic_id ? subtopicResult : null;
                  const busy = subtopicBusyId === sub.subtopic_id;
                  return (
                    <li key={sub.subtopic_id} className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className={`shrink-0 ${subtopicStatusColor(sub.status)}`}>
                            {subtopicStatusIcon(sub.status)}
                          </span>
                          <span
                            className={`truncate text-sm ${
                              sub.status === "locked"
                                ? "text-slate-600"
                                : sub.status === "skipped"
                                  ? "text-slate-500 line-through"
                                  : "text-slate-200"
                            }`}
                          >
                            {sub.name}
                          </span>
                        </div>
                        <button
                          onClick={() => handleCopyTopicPrompt(sub.name, sub.subtopic_id)}
                          title="Copy a prompt to learn this sub-concept in another AI tool"
                          className="shrink-0 rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
                        >
                          {copiedSubtopicId === sub.subtopic_id ? "Copied!" : "Copy prompt"}
                        </button>
                      </div>

                      {sub.status === "available" && !sub.quiz && !activeResult && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <button
                            onClick={() => handleGenerateSubtopicQuiz(sub.subtopic_id)}
                            disabled={busy}
                            className="rounded-full bg-indigo-500 px-4 py-1.5 text-xs font-semibold transition hover:bg-indigo-400 disabled:opacity-50"
                          >
                            {busy ? "Preparing quiz..." : "Done Learning →"}
                          </button>
                          <button
                            onClick={() => handleSkipSubtopic(sub.subtopic_id)}
                            disabled={busy}
                            className="rounded-full bg-slate-800 px-3 py-1.5 text-xs text-slate-400 transition hover:bg-slate-700 disabled:opacity-50"
                          >
                            Skip
                          </button>
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
                          className={`mt-3 rounded-lg border p-3 ${
                            activeResult.passed
                              ? "animate-celebrate border-green-700 bg-green-900/20"
                              : "border-red-700 bg-red-900/20"
                          }`}
                        >
                          <p className="text-sm font-medium">
                            {activeResult.passed ? "Passed!" : "Not quite - try again."}
                          </p>
                          <p className="text-xs text-slate-400">Score: {Math.round(activeResult.score * 100)}%</p>
                          {activeResult.results.length > 0 && (
                            <div className="mt-2">
                              <QuizResults results={activeResult.results} />
                            </div>
                          )}
                          {!activeResult.passed && (
                            <button
                              onClick={() => setSubtopicResult(null)}
                              className="mt-2 rounded-full bg-slate-700 px-4 py-1.5 text-xs font-semibold hover:bg-slate-600"
                            >
                              Try Again
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {node.cheat_sheet_notes && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="text-sm font-semibold text-slate-300">Study Notes</h2>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-300">
                {node.cheat_sheet_notes}
              </p>
            </div>
          )}

          {(node.web_sources.length > 0 || node.youtube_links.length > 0) && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-300">Resources</h2>
              <div className="space-y-2">
                {node.web_sources.map((r) => (
                  <a
                    key={r.url}
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border border-slate-800 bg-slate-950/50 p-3 transition hover:border-indigo-600"
                  >
                    <p className="truncate text-sm font-medium text-slate-200">🔗 {r.title}</p>
                    {r.snippet && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{r.snippet}</p>}
                    <p className="mt-1 truncate text-xs text-indigo-400">
                      {new URL(r.url).hostname.replace("www.", "")}
                    </p>
                  </a>
                ))}
                {node.youtube_links.map((r) => (
                  <a
                    key={r.url}
                    href={r.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border border-red-900/60 bg-red-950/10 p-3 transition hover:border-red-600"
                  >
                    <p className="truncate text-sm font-medium text-red-200">▶ {r.title}</p>
                    {r.snippet && <p className="mt-1 line-clamp-2 text-xs text-red-300/70">{r.snippet}</p>}
                  </a>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleRefreshWeb}
            disabled={refreshingWeb}
            className="rounded-md bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
          >
            {refreshingWeb ? "Searching..." : "🔎 Find more resources"}
          </button>

          {node.subtopics.length > 0 && !allSubtopicsResolved && (
            <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/40 p-4 opacity-70">
              <div className="flex items-center gap-2">
                <span className="text-slate-500">🔒</span>
                <h2 className="text-sm font-semibold text-slate-400">Final Quiz</h2>
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Unlocks once every sub-concept above is done ({resolvedSubtopicCount}/
                {node.subtopics.length} so far).
              </p>
            </div>
          )}

          {node.assessment && allSubtopicsResolved && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-slate-300">Final Quiz</h2>
              {result ? (
                <div
                  className={`rounded-xl border p-4 ${
                    result.passed
                      ? "animate-celebrate border-green-700 bg-green-900/30"
                      : "border-red-700 bg-red-900/30"
                  }`}
                >
                  <p className="font-medium">
                    {result.passed ? "🎉 Passed!" : "Not quite there yet."}
                  </p>
                  <p className="text-sm text-slate-300">Score: {Math.round(result.score * 100)}%</p>
                  {result.results.length > 0 && (
                    <div className="mt-3">
                      <QuizResults results={result.results} />
                    </div>
                  )}
                  {result.passed ? (
                    <button
                      onClick={() => navigate("/dashboard")}
                      className="mt-3 rounded-full bg-indigo-500 px-5 py-2 text-sm font-semibold hover:bg-indigo-400"
                    >
                      Back to Dashboard
                    </button>
                  ) : (
                    <button
                      onClick={() => setResult(null)}
                      className="mt-3 rounded-full bg-slate-700 px-5 py-2 text-sm font-semibold hover:bg-slate-600"
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
          )}

          {node.status !== "complete" && (
            <details className="group rounded-xl border border-dashed border-slate-700 bg-slate-900/40 opacity-70">
              <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-sm font-semibold text-slate-400">
                <span className="text-slate-500">🔒</span>
                <span>Project</span>
                <span className="ml-auto text-xs text-slate-600 transition group-open:rotate-180">▾</span>
              </summary>
              <p className="px-4 pb-4 text-xs text-slate-500">
                Pass this topic's final quiz to unlock a hands-on project built around what you
                just learned.
              </p>
            </details>
          )}

          {node.status === "complete" && node.project && (
            <div className="rounded-xl border border-indigo-800 bg-indigo-950/20 p-4">
              <h2 className="text-sm font-semibold text-indigo-300">🏆 Project</h2>
              <h3 className="mt-1 font-medium">{node.project.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{node.project.description}</p>
              {node.project.success_criteria.length > 0 && (
                <div className="mt-3 border-t border-slate-800 pt-3">
                  <p className="text-xs font-medium text-slate-400">Success looks like:</p>
                  <ul className="mt-1.5 space-y-1">
                    {node.project.success_criteria.map((c, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-slate-300">
                        <span className="mt-0.5 text-indigo-400">✓</span>
                        <span>{c}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {node.project.detailed_description ? (
                <div className="mt-3 border-t border-slate-800 pt-3">
                  <p className="text-xs font-medium text-slate-400">Step-by-step:</p>
                  <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-300">
                    {node.project.detailed_description}
                  </p>
                </div>
              ) : expanding ? (
                <BuildingIndicator label="Writing out the full step-by-step version..." className="mt-3" />
              ) : (
                <button
                  onClick={handleExpandProject}
                  className="mt-3 rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300 transition hover:bg-slate-700"
                >
                  Make this more detailed
                </button>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-300">Why this topic?</h2>
            {explanation ? (
              <p className="text-sm text-slate-200">{explanation}</p>
            ) : (
              <button
                onClick={handleExplain}
                disabled={explaining}
                className="rounded-full bg-slate-800 px-4 py-2 text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
              >
                {explaining ? "Thinking..." : "Why this?"}
              </button>
            )}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-300">My Notes</h2>
              <span className="text-xs text-slate-500">{notesSaved ? "Saved" : "Saving..."}</span>
            </div>
            <textarea
              value={notesText}
              onChange={(e) => handleNotesChange(e.target.value)}
              rows={8}
              placeholder="Jot down anything that clicked for you here - only you can see this."
              className="w-full resize-y rounded-md bg-slate-950 p-3 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

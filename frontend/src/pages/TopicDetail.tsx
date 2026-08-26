import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  expandProject,
  explainNode,
  getState,
  recordTimeSpent,
  refreshWebResources,
  submitAssessment,
  toggleSubtopic,
  updateTopicNotes,
} from "../api";
import NavBar from "../components/NavBar";
import QuizForm from "../components/QuizForm";
import QuizResults from "../components/QuizResults";
import PageSkeleton from "../components/Skeleton";
import { useClipboardCopy } from "../hooks/useClipboardCopy";
import { buildTopicPrompt } from "../promptTemplates";
import { getSessionId } from "../session";
import type { AppState, QuestionResult, RoadmapNode } from "../types";

function formatTimer(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
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

  async function handleToggleSubtopic(subtopicId: string, checked: boolean) {
    if (!sessionId || !nodeId || !node) return;
    // Optimistic - this is a purely informational tracker, not worth a
    // loading state for.
    setNode({
      ...node,
      subtopics: node.subtopics.map((s) => (s.subtopic_id === subtopicId ? { ...s, checked } : s)),
    });
    try {
      await toggleSubtopic(sessionId, nodeId, subtopicId, checked);
    } catch {
      // revert on failure
      setNode((prev) =>
        prev
          ? {
              ...prev,
              subtopics: prev.subtopics.map((s) =>
                s.subtopic_id === subtopicId ? { ...s, checked: !checked } : s,
              ),
            }
          : prev,
      );
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
    } catch {
      setResult(null);
    } finally {
      setSubmitting(false);
    }
  }

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

          {node.project && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="text-sm font-semibold text-slate-300">Project</h2>
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
              ) : (
                <button
                  onClick={handleExpandProject}
                  disabled={expanding}
                  className="mt-3 rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-300 transition hover:bg-slate-700 disabled:opacity-50"
                >
                  {expanding ? "Expanding..." : "Make this more detailed"}
                </button>
              )}
            </div>
          )}

          {node.subtopics.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-300">Sub-concepts</h2>
                <span className="text-xs text-slate-500">
                  {node.subtopics.filter((s) => s.checked).length}/{node.subtopics.length} done
                </span>
              </div>
              <ul className="space-y-1.5">
                {node.subtopics.map((sub) => (
                  <li key={sub.subtopic_id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={sub.checked}
                      onChange={(e) => handleToggleSubtopic(sub.subtopic_id, e.target.checked)}
                      className="h-4 w-4 rounded border-slate-700 bg-slate-950 accent-indigo-500"
                    />
                    <span
                      className={`flex-1 text-sm ${sub.checked ? "text-slate-500 line-through" : "text-slate-200"}`}
                    >
                      {sub.name}
                    </span>
                    <button
                      onClick={() => handleCopyTopicPrompt(sub.name, sub.subtopic_id)}
                      title="Copy a prompt to learn this sub-concept in another AI tool"
                      className="shrink-0 rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-400 transition hover:bg-slate-700 hover:text-slate-200"
                    >
                      {copiedSubtopicId === sub.subtopic_id ? "Copied!" : "Copy prompt"}
                    </button>
                  </li>
                ))}
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
              <h2 className="mb-2 text-sm font-semibold text-slate-300">Resources</h2>
              <div className="flex flex-wrap gap-2">
                {node.web_sources.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300 hover:text-indigo-300"
                  >
                    🔗 {new URL(url).hostname.replace("www.", "")}
                  </a>
                ))}
                {node.youtube_links.map((url) => (
                  <a
                    key={url}
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-red-950/50 px-3 py-1 text-xs text-red-300 hover:text-red-200"
                  >
                    ▶ YouTube
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

          {node.assessment && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-slate-300">Checkpoint Quiz</h2>
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

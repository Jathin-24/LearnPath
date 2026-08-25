import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { explainNode, getState, recordTimeSpent, submitAssessment } from "../api";
import NavBar from "../components/NavBar";
import QuizForm from "../components/QuizForm";
import { getSessionId } from "../session";
import type { AppState, RoadmapNode } from "../types";

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
  const [result, setResult] = useState<{ score: number; passed: boolean } | null>(null);
  const [displaySeconds, setDisplaySeconds] = useState(0);

  const secondsRef = useRef(0);
  const lastFlushRef = useRef(0);

  useEffect(() => {
    if (!sessionId || !nodeId) {
      navigate("/login", { replace: true });
      return;
    }
    getState(sessionId).then(({ state }) => {
      setState(state);
      setNode(state.roadmap?.nodes.find((n) => n.node_id === nodeId) ?? null);
    });
  }, [sessionId, nodeId, navigate]);

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
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <NavBar />
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
            </div>
          )}

          {node.assessment && (
            <div>
              <h2 className="mb-3 text-sm font-semibold text-slate-300">Checkpoint Quiz</h2>
              {result ? (
                <div
                  className={`rounded-xl border p-4 ${
                    result.passed
                      ? "border-green-700 bg-green-900/30"
                      : "border-red-700 bg-red-900/30"
                  }`}
                >
                  <p className="font-medium">{result.passed ? "Passed!" : "Not quite there yet."}</p>
                  <p className="text-sm text-slate-300">Score: {Math.round(result.score * 100)}%</p>
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
      </div>
    </div>
  );
}

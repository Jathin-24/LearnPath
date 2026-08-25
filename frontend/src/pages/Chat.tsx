import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { sendChatMessage, getState, submitChecklist, submitOnboardingQuiz } from "../api";
import ChatBubble from "../components/ChatBubble";
import NavBar from "../components/NavBar";
import QuizForm from "../components/QuizForm";
import QuizResults from "../components/QuizResults";
import { routeForStage } from "../routing";
import { getSessionId } from "../session";
import type { AppState, QuestionResult } from "../types";
import { Link } from "react-router-dom";

export default function Chat() {
  const navigate = useNavigate();
  const sessionId = getSessionId();

  const [state, setState] = useState<AppState | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Checklist phase (state.pending_checklist_concepts)
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [submittingChecklist, setSubmittingChecklist] = useState(false);

  // Quiz phase (state.pending_quiz) + its post-grade review, shown before
  // moving on so a wrong answer isn't just a silent number - see
  // backend/agents/assessment.py's module docstring for why this replaced
  // free-text chat parsing entirely.
  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [quizResults, setQuizResults] = useState<QuestionResult[] | null>(null);

  useEffect(() => {
    if (!sessionId) {
      navigate("/login", { replace: true });
      return;
    }
    getState(sessionId).then(({ state }) => setState(state));
  }, [sessionId, navigate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state?.conversation_history, quizResults]);

  async function handleSend() {
    if (!sessionId || !input.trim() || sending) return;
    const message = input.trim();
    setInput("");
    setSending(true);
    setError(null);
    setState((prev) =>
      prev
        ? {
            ...prev,
            conversation_history: [
              ...prev.conversation_history,
              { role: "user", content: message, timestamp: new Date().toISOString() },
            ],
          }
        : prev,
    );

    try {
      const { state: newState } = await sendChatMessage(sessionId, message);
      setState(newState);
      if (newState.stage === "roadmap_review") {
        navigate(routeForStage(newState.stage));
      }
    } catch {
      setError("Message didn't go through - try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleChecklistConfirm() {
    if (!sessionId || submittingChecklist) return;
    setSubmittingChecklist(true);
    setError(null);
    try {
      const { state: newState } = await submitChecklist(sessionId, Array.from(checked));
      setState(newState);
      setChecked(new Set());
    } catch {
      setError("Couldn't submit that - try again.");
    } finally {
      setSubmittingChecklist(false);
    }
  }

  async function handleQuizSubmit(answers: string[]) {
    if (!sessionId || submittingQuiz) return;
    setSubmittingQuiz(true);
    setError(null);
    try {
      const { state: newState, results } = await submitOnboardingQuiz(sessionId, answers);
      setState(newState);
      setQuizResults(results);
    } catch {
      setError("Couldn't submit your answers - try again.");
    } finally {
      setSubmittingQuiz(false);
    }
  }

  function handleContinueAfterQuiz() {
    setQuizResults(null);
    if (state) navigate(routeForStage(state.stage));
  }

  function toggleConcept(concept: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(concept)) next.delete(concept);
      else next.add(concept);
      return next;
    });
  }

  if (!sessionId || !state) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading...
      </div>
    );
  }

  const history = state.conversation_history;
  const hasRoadmap = !!state.roadmap;
  const showChecklist = state.pending_checklist_concepts.length > 0;
  const showQuiz = state.pending_quiz.length > 0 && !quizResults;
  const showQuizReview = quizResults !== null;
  const showComposer = !showChecklist && !showQuiz && !showQuizReview;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      <NavBar hasRoadmap={hasRoadmap} />
      <header className="border-b border-slate-800 px-6 py-4">
        <h1 className="text-lg font-semibold">Let's figure out your path</h1>
        {history.length === 0 ? (
          <div className="mt-2 flex items-center justify-between rounded-lg border border-indigo-800 bg-indigo-950/40 px-4 py-2 text-sm text-indigo-200">
            <span>Already talked to another AI about your goals? Bring that context in.</span>
            <Link to="/import" className="shrink-0 font-semibold text-indigo-300 hover:underline">
              Import AI Context
            </Link>
          </div>
        ) : (
          <p className="mt-1 text-xs text-slate-500">
            Already talked to another AI about your goals?{" "}
            <Link to="/import" className="text-indigo-400 hover:underline">
              Import AI Context
            </Link>
          </p>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-6">
        {history.length === 0 && (
          <ChatBubble
            role="assistant"
            content="Hi! What's your learning goal - and roughly how much time do you have for it?"
          />
        )}
        {history.map((turn, i) => (
          <ChatBubble key={i} role={turn.role} content={turn.content} />
        ))}
        {sending && <ChatBubble role="assistant" content="..." />}

        {showChecklist && (
          <div className="mx-auto max-w-xl rounded-xl border border-slate-800 bg-slate-900 p-4">
            <p className="mb-3 text-xs font-medium text-slate-400">
              Tap anything you're already confident with, then confirm.
            </p>
            <div className="flex flex-wrap gap-2">
              {state.pending_checklist_concepts.map((concept) => (
                <button
                  key={concept}
                  onClick={() => toggleConcept(concept)}
                  className={`rounded-full border px-3 py-1.5 text-sm transition ${
                    checked.has(concept)
                      ? "border-indigo-500 bg-indigo-500/20 text-indigo-200"
                      : "border-slate-700 text-slate-300 hover:border-slate-500"
                  }`}
                >
                  {checked.has(concept) ? "✓ " : ""}
                  {concept}
                </button>
              ))}
            </div>
            <button
              onClick={handleChecklistConfirm}
              disabled={submittingChecklist}
              className="mt-4 rounded-full bg-indigo-500 px-6 py-2 text-sm font-semibold transition hover:bg-indigo-400 disabled:opacity-50"
            >
              {submittingChecklist
                ? "Thinking..."
                : checked.size === 0
                  ? "None of these"
                  : `Confirm ${checked.size} selected`}
            </button>
          </div>
        )}

        {showQuiz && (
          <div className="mx-auto max-w-xl rounded-xl border border-slate-800 bg-slate-900 p-4">
            <QuizForm
              questions={state.pending_quiz}
              onSubmit={handleQuizSubmit}
              submitting={submittingQuiz}
            />
          </div>
        )}

        {showQuizReview && quizResults && (
          <div className="mx-auto max-w-xl space-y-3">
            <QuizResults results={quizResults} />
            <button
              onClick={handleContinueAfterQuiz}
              className="w-full rounded-full bg-indigo-500 px-6 py-2 text-sm font-semibold transition hover:bg-indigo-400"
            >
              See my roadmap
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {error && <p className="px-6 pb-2 text-sm text-red-400">{error}</p>}

      {showComposer && (
        <div className="border-t border-slate-800 p-4">
          <div className="mx-auto flex max-w-3xl gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type your message..."
              className="flex-1 rounded-full bg-slate-800 px-4 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="rounded-full bg-indigo-500 px-5 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

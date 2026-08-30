import { useEffect, useRef, useState } from "react";
// Removed duplicate link
import { sendChatMessage, submitChecklist, submitOnboardingQuiz, ApiError } from "../api";
import { roadmapApi } from "../api/roadmap";
import ChatBubble from "../components/ChatBubble";
import QuizForm from "../components/QuizForm";
import QuizResults from "../components/QuizResults";
import OnboardingProgress from "../components/OnboardingProgress";
import PageSkeleton from "../components/Skeleton";
import { useAppState } from "../context/AppStateContext";
import type { QuestionResult } from "../types";
import { Link } from "react-router-dom";
import { MessageCircle, Check, Sparkles, Import, Send, ArrowRight } from "lucide-react";

export default function Chat() {
  const { state, updateState, auth, refreshState } = useAppState();
  const sessionId = auth?.session_id;

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [generatingRoadmap, setGeneratingRoadmap] = useState(false);

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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state?.conversation_history, quizResults]);

  async function handleSend() {
    if (!sessionId || !input.trim() || sending) return;
    const message = input.trim();
    setInput("");
    setSending(true);
    setError(null);
    if (state) {
      updateState({
        ...state,
        conversation_history: [
          ...state.conversation_history,
          { role: "user", content: message, timestamp: new Date().toISOString(), agent: null },
        ],
      });
    }

    try {
      const { state: newState } = await sendChatMessage(sessionId, message);
      updateState(newState);
      // StageRouter will handle navigation automatically since we updated the global state!
    } catch (err) {
      if (err instanceof ApiError && err.status === 502) {
        setError("The AI service is temporarily unavailable. Please try again.");
      } else if (err instanceof ApiError && err.status === 400) {
        setError(err.detail);
      } else {
        setError("Message didn't go through - try again.");
      }
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
      updateState(newState);
      setChecked(new Set());
    } catch (err) {
      if (err instanceof ApiError && err.status === 502) {
        setError("The AI service is temporarily unavailable. Please try again.");
      } else if (err instanceof ApiError && err.status === 400) {
        setError(err.detail);
      } else {
        setError("Couldn't submit that - try again.");
      }
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
      updateState(newState);
      setQuizResults(results);
    } catch (err) {
      if (err instanceof ApiError && err.status === 502) {
        setError("The AI service is temporarily unavailable. Please try again.");
      } else if (err instanceof ApiError && err.status === 400) {
        setError(err.detail);
      } else {
        setError("Couldn't submit your answers - try again.");
      }
    } finally {
      setSubmittingQuiz(false);
    }
  }

  function handleContinueAfterQuiz() {
    setQuizResults(null);
    // State is already updated, StageRouter will take over if stage changed.
  }

  function toggleConcept(concept: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(concept)) next.delete(concept);
      else next.add(concept);
      return next;
    });
  }

  async function handleGenerateRoadmap() {
    if (!sessionId || generatingRoadmap) return;
    setGeneratingRoadmap(true);
    setError(null);
    try {
      await roadmapApi.generatePathA(sessionId);
      await refreshState();
    } catch (err) {
      if (err instanceof ApiError && err.status === 502) {
        setError("The AI service is temporarily unavailable. Please try again.");
      } else if (err instanceof ApiError && err.status === 400) {
        setError(err.detail);
      } else {
        setError("Failed to generate roadmap. Please try again.");
      }
    } finally {
      setGeneratingRoadmap(false);
    }
  }

  if (!sessionId || !state) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <PageSkeleton />
      </div>
    );
  }

  const history = state.conversation_history;
  const hasRoadmap = !!state.roadmap;
  const showChecklist = state.pending_checklist_concepts.length > 0;
  const showQuiz = state.pending_quiz.length > 0 && !quizResults;
  const showQuizReview = quizResults !== null;
  const isGeneratingPhase = state.stage === "path_selection" || state.stage === "roadmap_generation";
  const showComposer = !showChecklist && !showQuiz && !showQuizReview && !isGeneratingPhase;

  // Determine current step for progress indicator
  let currentStep = 0;
  if (state.learner_profile.goal) currentStep = 1;
  if (state.skill_gap_map.assessments.length > 0 || showChecklist || showQuiz) currentStep = 2;
  if (showQuiz || showQuizReview || state.stage === "assessment") currentStep = 3;
  if (isGeneratingPhase || hasRoadmap) currentStep = 4;

  return (
    <div className="flex h-[100dvh] flex-col bg-slate-950 text-slate-100 overflow-hidden relative">
      {/* Background glow effects */}

      
      <header className="relative z-10 glass-panel-light border-b border-slate-800 px-6 py-5">
        <div className="mx-auto max-w-4xl flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-400/20 rounded-xl">
              <MessageCircle className="w-5 h-5 text-slate-300" />
            </div>
            <h1 className="text-xl font-bold font-display text-slate-100">Let&apos;s figure out your path</h1>
          </div>
          {history.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-slate-400/30 bg-slate-400/10 px-4 py-2 text-sm text-slate-200">
              <Sparkles className="w-4 h-4 text-slate-300" />
              <span>Already talked to another AI about your goals?</span>
              <Link to="/import" className="shrink-0 flex items-center gap-1.5 font-semibold text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 px-3 py-1 rounded-lg transition-all">
                <Import className="w-3 h-3" /> Import Context
              </Link>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-xs font-medium text-slate-400 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-800">
              Have existing context?{" "}
              <Link to="/import" className="flex items-center gap-1 text-slate-300 hover:text-slate-300 hover:underline">
                Import <ArrowRight className="w-3 h-3" />
              </Link>
            </p>
          )}
        </div>
      </header>

      {!hasRoadmap && <OnboardingProgress currentStep={currentStep} />}

      <div className="relative z-10 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {history.length === 0 && (
            <ChatBubble
              role="assistant"
              content="Hi! I&apos;m your AI learning architect. What&apos;s your learning goal - and roughly how much time do you have for it?"
            />
          )}
          {history.map((turn, i) => (
            <ChatBubble key={i} role={turn.role} content={turn.content} agent={turn.agent} />
          ))}
          {sending && (
            <div className="animate-fade-in-up">
              <ChatBubble role="assistant" content="" isTyping />
            </div>
          )}

          {showChecklist && (
            <div className="mx-auto max-w-2xl glass-panel p-6 rounded-3xl animate-fade-in-up">
              <div className="flex items-center gap-2 mb-4">
                <Check className="w-5 h-5 text-slate-300" />
                <p className="text-sm font-semibold text-slate-100">
                  Which of these skills do you already know?
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5 mt-4">
                {state.pending_checklist_concepts.map((concept) => {
                  const isChecked = checked.has(concept);
                  return (
                    <button
                      key={concept}
                      onClick={() => toggleConcept(concept)}
                      className={`rounded-xl border px-4 py-2 text-sm font-medium transition-all duration-300 flex items-center gap-2 ${
                        isChecked
                          ? "border-slate-400 bg-slate-400/20 text-slate-100 shadow-[0_0_15px_rgba(148,163,184,0.2)]"
                          : "border-slate-800 bg-slate-800 text-slate-400 hover:bg-white/10"
                      }`}
                    >
                      {isChecked && <Check className="w-4 h-4 text-slate-300" />}
                      {concept}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={handleChecklistConfirm}
                disabled={submittingChecklist}
                className="mt-6 w-full sm:w-auto rounded-xl bg-slate-100 px-8 py-3 text-sm font-bold text-slate-900 transition-all hover:bg-slate-200 hover:scale-[1.02] disabled:opacity-50 shadow-lg shadow-slate-950/50"
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
            <div className="mx-auto max-w-2xl glass-panel p-6 rounded-3xl animate-fade-in-up">
              <QuizForm
                questions={state.pending_quiz}
                onSubmit={handleQuizSubmit}
                submitting={submittingQuiz}
              />
            </div>
          )}

          {showQuizReview && quizResults && (
            <div className="mx-auto max-w-2xl space-y-6 animate-fade-in-up">
              <div className="glass-panel p-6 rounded-3xl">
                <QuizResults results={quizResults} />
              </div>
              <button
                onClick={handleContinueAfterQuiz}
                className="w-full rounded-xl bg-slate-100 px-8 py-3.5 text-base font-bold text-slate-900 transition-all hover:bg-slate-200 hover:scale-[1.02] shadow-lg shadow-slate-950/50 flex items-center justify-center gap-2"
              >
                Continue <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          )}

          {isGeneratingPhase && (
            <div className="mx-auto max-w-2xl glass-panel p-10 rounded-3xl animate-fade-in-up text-center mt-8">
              <Sparkles className="w-12 h-12 text-slate-300 mx-auto mb-6 animate-pulse" />
              <h2 className="text-2xl font-bold font-display text-slate-100 mb-4">
                You're all set!
              </h2>
              <p className="text-slate-400 mb-8 leading-relaxed">
                We have enough context to generate your personalized learning roadmap. 
                This will take 10-30 seconds as the AI curates your curriculum.
              </p>
              
              <button
                onClick={handleGenerateRoadmap}
                disabled={generatingRoadmap}
                className="w-full rounded-xl bg-slate-100 px-8 py-4 text-lg font-bold text-slate-900 transition-all hover:bg-slate-200 hover:scale-[1.02] disabled:opacity-50 shadow-lg shadow-slate-950/50 flex items-center justify-center gap-3"
              >
                {generatingRoadmap ? "Building your personalized learning path..." : "Generate Roadmap"}
                {!generatingRoadmap && <ArrowRight className="w-6 h-6" />}
              </button>
            </div>
          )}

          <div ref={bottomRef} className="h-4" />
        </div>
      </div>

      {error && (
        <div className="relative z-10 mx-auto max-w-4xl px-6 pb-2 w-full">
          <p className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm">{error}</p>
        </div>
      )}

      {showComposer && (
        <div className="relative z-10 glass-panel-light border-t border-slate-800 p-4 md:p-6 backdrop-blur-xl bg-slate-950/80">
          <div className="mx-auto flex max-w-4xl gap-3">
            <textarea
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder="Type your message..."
              className="flex-1 resize-none rounded-2xl bg-slate-900 border border-slate-700 px-5 py-3.5 text-base text-slate-100 outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400 transition-all placeholder:text-slate-500 shadow-inner"
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="rounded-2xl bg-slate-100 px-6 py-3.5 text-sm font-bold text-slate-900 transition-all hover:bg-slate-200 disabled:opacity-50 disabled:hover:bg-slate-100 shadow-lg shadow-slate-950/50 flex items-center justify-center"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

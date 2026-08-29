import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { sendChatMessage, getState, submitChecklist, submitOnboardingQuiz } from "../api";
import { Button, Card, Input } from "../components/nb";
import ChatBubble from "../components/ChatBubble";
import NavBar from "../components/NavBar";
import QuizForm from "../components/QuizForm";
import QuizResults from "../components/QuizResults";
import PageSkeleton from "../components/Skeleton";
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

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [submittingChecklist, setSubmittingChecklist] = useState(false);

  const [submittingQuiz, setSubmittingQuiz] = useState(false);
  const [quizResults, setQuizResults] = useState<QuestionResult[] | null>(null);

  useEffect(() => {
    if (!sessionId) {
      navigate("/login", { replace: true });
      return;
    }
    getState(sessionId).then(({ state }) => setState(state)).catch(() => navigate("/login", { replace: true }));
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
              { role: "user", content: message, timestamp: new Date().toISOString(), agent: null },
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
      <div className="min-h-screen bg-bg text-fg">
        <NavBar />
        <PageSkeleton />
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
    <div className="flex min-h-screen flex-col bg-bg text-fg">
      <NavBar hasRoadmap={hasRoadmap} />
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="border-b border-border bg-surface px-6 py-4 animate-fade-in-up"
      >
        <h1 className="text-base font-semibold tracking-tight font-display">Let's figure out your path</h1>
        {history.length === 0 ? (
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm text-fg-secondary">Already talked to another AI about your goals?</span>
            <Link to="/import">
              <Button variant="secondary" size="sm">Import AI Context</Button>
            </Link>
          </div>
        ) : (
          <p className="mt-1 text-xs text-fg-muted">
            Already talked to another AI?{" "}
            <Link to="/import" className="text-fg font-medium hover:underline">
              Import AI Context
            </Link>
          </p>
        )}
      </motion.header>

      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-6">
        {history.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="animate-fade-in-up"
          >
            <ChatBubble
              role="assistant"
              content="Hi! What's your learning goal - and roughly how much time do you have for it?"
            />
          </motion.div>
        )}
        {history.map((turn, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <ChatBubble role={turn.role} content={turn.content} agent={turn.agent} />
          </motion.div>
        ))}
        {sending && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <ChatBubble role="assistant" content="..." />
          </motion.div>
        )}

        <AnimatePresence>
          {showChecklist && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="animate-fade-in-up"
              style={{ animationDelay: '0.3s' }}
            >
              <Card className="mx-auto max-w-xl">
                <p className="text-xs font-medium text-fg-secondary mb-3">
                  TAP ANYTHING YOU'RE ALREADY CONFIDENT WITH, THEN CONFIRM.
                </p>
                <div className="flex flex-wrap gap-2">
                  {state.pending_checklist_concepts.map((concept) => (
                    <motion.button
                      key={concept}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => toggleConcept(concept)}
                      className={`border rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-300 hover:scale-[1.02] ${
                        checked.has(concept)
                          ? "border-fg bg-fg text-white dark:border-accent dark:bg-accent dark:text-[#0A0A0A]"
                          : "border-border bg-surface text-fg hover:border-border-strong"
                      }`}
                    >
                      {checked.has(concept) ? "✓ " : ""}
                      {concept}
                    </motion.button>
                  ))}
                </div>
                <Button
                  className="mt-4"
                  onClick={handleChecklistConfirm}
                  disabled={submittingChecklist}
                >
                  {submittingChecklist
                    ? "Thinking..."
                    : checked.size === 0
                      ? "None of these"
                      : `Confirm ${checked.size} selected`}
                </Button>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showQuiz && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="animate-fade-in-up"
              style={{ animationDelay: '0.3s' }}
            >
              <Card className="mx-auto max-w-xl">
                <QuizForm
                  questions={state.pending_quiz}
                  onSubmit={handleQuizSubmit}
                  submitting={submittingQuiz}
                />
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showQuizReview && quizResults && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mx-auto max-w-xl space-y-3 animate-fade-in-up"
              style={{ animationDelay: '0.3s' }}
            >
              <QuizResults results={quizResults} />
              <Button
                className="w-full hover:scale-[1.02] transition-transform duration-300"
                onClick={handleContinueAfterQuiz}
              >
                See my roadmap →
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={bottomRef} />
      </div>

      {error && <p className="px-6 pb-2 text-sm text-danger">{error}</p>}

      {showComposer && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="border-t border-border bg-surface p-4 animate-fade-in-up"
          style={{ animationDelay: '0.4s' }}
        >
          <div className="mx-auto flex max-w-3xl gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type your message..."
            />
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                onClick={handleSend}
                disabled={sending || !input.trim()}
              >
                Send
              </Button>
            </motion.div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

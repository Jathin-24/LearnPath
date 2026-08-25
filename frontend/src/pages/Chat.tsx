import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { sendChatMessage, getState } from "../api";
import ChatBubble from "../components/ChatBubble";
import NavBar from "../components/NavBar";
import { routeForStage } from "../routing";
import { getSessionId } from "../session";
import type { ChatTurn } from "../types";

export default function Chat() {
  const navigate = useNavigate();
  const sessionId = getSessionId();

  const [history, setHistory] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) {
      navigate("/login", { replace: true });
      return;
    }
    getState(sessionId).then(({ state }) => setHistory(state.conversation_history));
  }, [sessionId, navigate]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  async function handleSend() {
    if (!sessionId || !input.trim() || sending) return;
    const message = input.trim();
    setInput("");
    setSending(true);
    setError(null);
    setHistory((prev) => [
      ...prev,
      { role: "user", content: message, timestamp: new Date().toISOString() },
    ]);

    try {
      const { state } = await sendChatMessage(sessionId, message);
      setHistory(state.conversation_history);
      if (state.stage === "roadmap_review") {
        navigate(routeForStage(state.stage));
      }
    } catch {
      setError("Message didn't go through - try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      <NavBar />
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
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-6 pb-2 text-sm text-red-400">{error}</p>}

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
    </div>
  );
}

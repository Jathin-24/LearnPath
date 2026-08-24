import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { importContext, sendChatMessage, getState } from "../api";
import ChatBubble from "../components/ChatBubble";
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
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!sessionId) {
      navigate("/", { replace: true });
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

  async function handleImport() {
    if (!sessionId || !importText.trim()) return;
    setImporting(true);
    try {
      await importContext(sessionId, importText.trim());
      setShowImport(false);
      setImportText("");
    } catch {
      setError("Couldn't import that context - try again.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-white">
      <header className="border-b border-slate-800 px-6 py-4">
        <h1 className="text-lg font-semibold">Let's figure out your path</h1>
        <button
          onClick={() => setShowImport((v) => !v)}
          className="mt-1 text-xs text-indigo-400 hover:underline"
        >
          {showImport ? "hide" : "Already talked to another AI about your goals?"}
        </button>
        {showImport && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg bg-slate-900 p-3">
            <p className="text-xs text-slate-400">
              Paste a summary from another AI tool - nothing leaves your control, this
              just gives us a head start.
            </p>
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              rows={3}
              className="rounded-md bg-slate-800 p-2 text-sm text-white outline-none"
              placeholder="Paste the summary here..."
            />
            <button
              onClick={handleImport}
              disabled={importing || !importText.trim()}
              className="self-start rounded-md bg-indigo-500 px-3 py-1 text-sm font-medium disabled:opacity-50"
            >
              {importing ? "Saving..." : "Save"}
            </button>
          </div>
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

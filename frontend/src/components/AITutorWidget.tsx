import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { MessageSquare, X, Send, Sparkles, XCircle } from "lucide-react";
import { sendChatMessage, ApiError } from "../api";
import { useAppState } from "../context/AppStateContext";
import ChatBubble from "./ChatBubble";

export default function AITutorWidget() {
  const { state, updateState, auth, isTutorOpen, setTutorOpen } = useAppState();
  const sessionId = auth?.session_id;
  const location = useLocation();

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages or open state changes
  useEffect(() => {
    if (isTutorOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [state?.conversation_history, isTutorOpen, sending]);

  // If there's no state or roadmap yet, the tutor shouldn't render. 
  // It's meant for post-onboarding.
  if (!state || !state.roadmap) return null;

  const history = state.conversation_history;

  // Determine placeholder based on current route
  let placeholder = "Ask your AI tutor...";
  if (location.pathname.startsWith("/topic/")) {
    const nodeId = location.pathname.split("/").pop();
    const node = state.roadmap.nodes.find((n) => n.node_id === nodeId);
    if (node) {
      placeholder = `Ask about ${node.topic}...`;
    }
  }

  async function handleSend() {
    if (!sessionId || !input.trim() || sending) return;
    const message = input.trim();
    setInput("");
    setSending(true);
    setError(null);
    
    // Optimistically update the UI
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
    } catch (err) {
      if (err instanceof ApiError && err.status === 502) {
        setError("Your AI tutor is temporarily unavailable. Try again.");
      } else if (err instanceof ApiError && err.status === 400) {
        setError(err.detail);
      } else {
        setError("Message didn't go through. Try again.");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {/* Floating Action Button */}
      {!isTutorOpen && (
        <button
          onClick={() => setTutorOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center gap-2 rounded-full border border-emerald-700 bg-emerald-800 px-5 py-4 text-white shadow-[0_18px_45px_rgba(13,89,55,0.28)] transition-all hover:-translate-y-1 hover:bg-emerald-900 active:scale-95 md:bottom-10 md:right-10"
        >
          <Sparkles className="w-5 h-5 text-emerald-100" />
          <span className="text-sm font-bold">Ask AI Tutor</span>
        </button>
      )}

      {/* Tutor Panel / Bottom Sheet */}
      {isTutorOpen && (
        <>
          {/* Mobile Overlay */}
          <div 
            className="fixed inset-0 z-40 bg-emerald-950/25 backdrop-blur-sm md:hidden animate-in fade-in"
            onClick={() => setTutorOpen(false)} 
          />

          <div className="fixed bottom-0 left-0 right-0 z-50 flex h-[85vh] w-full flex-col overflow-hidden rounded-t-[2rem] border border-emerald-950/10 bg-[#fffdf7]/95 shadow-[0_25px_80px_rgba(13,89,55,0.22)] backdrop-blur-xl transition-transform duration-300 ease-out md:bottom-10 md:left-auto md:right-10 md:h-[650px] md:w-[420px] md:rounded-[2rem] animate-in slide-in-from-bottom-full md:slide-in-from-bottom-4 md:slide-in-from-right-4">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-emerald-950/10 bg-emerald-50/80 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-800">
                  <Sparkles className="h-5 w-5 text-emerald-50" />
                </div>
                <div>
                  <h3 className="font-bold text-emerald-950 font-display text-lg">AI Tutor</h3>
                  <p className="text-xs font-medium text-emerald-950/55">Your personal study companion</p>
                </div>
              </div>
              <button 
                onClick={() => setTutorOpen(false)}
                className="rounded-xl p-2 text-emerald-950/55 transition-colors hover:bg-emerald-100 hover:text-emerald-950"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {history.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <div className="rounded-3xl bg-emerald-100 p-6">
                    <MessageSquare className="h-10 w-10 text-emerald-800 opacity-80" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-emerald-950">How can I help?</h4>
                    <p className="mt-2 max-w-[250px] text-sm text-emerald-950/60">
                      I'm aware of your learning goals and current progress. Ask me to explain concepts, give examples, or clarify doubts!
                    </p>
                  </div>
                </div>
              ) : (
                history.map((turn, i) => (
                  <ChatBubble key={i} role={turn.role} content={turn.content} agent={turn.agent} isCompact />
                ))
              )}
              
              {sending && (
                <div className="animate-fade-in-up">
                  <ChatBubble role="assistant" content="" isTyping isCompact />
                </div>
              )}
              
              {error && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm animate-fade-in-up">
                  <XCircle className="h-5 w-5 shrink-0 text-red-500" />
                  <p className="font-medium text-red-200">{error}</p>
                </div>
              )}
              
              <div ref={messagesEndRef} className="h-2" />
            </div>

            {/* Input Area */}
            <div className="border-t border-emerald-950/10 bg-emerald-50/50 p-4 backdrop-blur-md">
              <div className="flex items-end gap-2 rounded-2xl border border-emerald-950/15 bg-white/80 p-2 shadow-inner transition-all focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-200">
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
                  placeholder={placeholder}
                  className="max-h-32 w-full resize-none bg-transparent px-3 py-2 text-sm text-emerald-950 placeholder:text-emerald-950/40 outline-none"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-800 text-white transition-colors hover:bg-emerald-900 disabled:opacity-50 disabled:hover:bg-emerald-800"
                >
                  <Send className="h-4 w-4 ml-0.5" />
                </button>
              </div>
            </div>
            
          </div>
        </>
      )}
    </>
  );
}

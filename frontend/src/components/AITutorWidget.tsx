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
          className="fixed bottom-6 right-6 md:bottom-10 md:right-10 z-50 flex items-center justify-center gap-2 rounded-full bg-slate-100 px-5 py-4 shadow-lg shadow-slate-950/50 transition-all hover:bg-slate-200 hover:scale-105 active:scale-95 group"
        >
          <Sparkles className="w-5 h-5 text-slate-600" />
          <span className="font-bold text-slate-900 text-sm">Ask AI Tutor</span>
        </button>
      )}

      {/* Tutor Panel / Bottom Sheet */}
      {isTutorOpen && (
        <>
          {/* Mobile Overlay */}
          <div 
            className="fixed inset-0 z-40 bg-slate-800 backdrop-blur-sm md:hidden animate-in fade-in" 
            onClick={() => setTutorOpen(false)} 
          />

          <div className="fixed bottom-0 left-0 right-0 z-50 flex h-[85vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-slate-400/30 bg-slate-900 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out md:bottom-10 md:left-auto md:right-10 md:h-[650px] md:w-[420px] md:rounded-3xl md:border md:border-slate-800 md:shadow-slate-950/50 animate-in slide-in-from-bottom-full md:slide-in-from-bottom-4 md:slide-in-from-right-4">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-800 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-400/20">
                  <Sparkles className="h-5 w-5 text-slate-300" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 font-display text-lg">AI Tutor</h3>
                  <p className="text-xs font-medium text-slate-400">Your personal study companion</p>
                </div>
              </div>
              <button 
                onClick={() => setTutorOpen(false)}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {history.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                  <div className="rounded-full bg-slate-400/10 p-6">
                    <MessageSquare className="h-10 w-10 text-slate-300 opacity-80" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-slate-100">How can I help?</h4>
                    <p className="text-sm text-slate-400 mt-2 max-w-[250px]">
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
                <div className="flex items-start gap-2 rounded-xl bg-red-950/40 p-3 border border-red-900/50 animate-fade-in-up text-sm">
                  <XCircle className="h-5 w-5 shrink-0 text-red-500" />
                  <p className="font-medium text-red-200">{error}</p>
                </div>
              )}
              
              <div ref={messagesEndRef} className="h-2" />
            </div>

            {/* Input Area */}
            <div className="border-t border-slate-800 bg-slate-900 p-4 backdrop-blur-md">
              <div className="flex items-end gap-2 rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-inner focus-within:border-slate-400 focus-within:ring-1 focus-within:ring-slate-400 transition-all">
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
                  className="max-h-32 w-full resize-none bg-transparent px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-900 transition-colors hover:bg-slate-200 disabled:opacity-50 disabled:hover:bg-slate-100 mb-0.5"
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

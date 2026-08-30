import type { AgentName } from "../types";

interface Props {
  role: "user" | "assistant";
  content: string;
  agent?: AgentName | null;
  isCompact?: boolean;
  isTyping?: boolean;
}

export default function ChatBubble({ role, content, agent, isCompact, isTyping }: Props) {
  const isUser = role === "user";
  const isTutor = agent === "tutor";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} animate-fade-in-up`}>
      <div className="max-w-[80%]">
        {isTutor && (
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-emerald-400">
            <span className="text-sm">ðŸŽ“</span> Topic Tutor
          </p>
        )}
        <div
          className={`whitespace-pre-wrap ${isCompact ? "px-4 py-2.5" : "px-5 py-3.5"} text-sm leading-relaxed shadow-lg ${
            isUser
              ? "bg-gradient-to-br from-slate-200 to-slate-300 text-slate-900 rounded-2xl rounded-br-sm shadow-slate-950/50"
              : isTutor
                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-50 rounded-2xl rounded-bl-sm shadow-emerald-500/10 backdrop-blur-sm"
                : "border border-slate-800 bg-slate-800 text-slate-100 rounded-2xl rounded-bl-sm backdrop-blur-sm"
          }`}
        >
          {isTyping ? (
            <div className="flex gap-1 items-center h-5 px-1">
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "0ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style={{ animationDelay: "300ms" }} />
            </div>
          ) : (
            content
          )}
        </div>
      </div>
    </div>
  );
}

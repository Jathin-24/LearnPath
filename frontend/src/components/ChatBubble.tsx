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
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-emerald-700">
            <span className="text-sm">✦</span> Topic Tutor
          </p>
        )}
        <div
          className={`whitespace-pre-wrap ${isCompact ? "px-4 py-2.5" : "px-5 py-3.5"} text-sm leading-relaxed shadow-lg ${
            isUser
              ? "bg-emerald-800 text-amber-50 rounded-2xl rounded-br-sm shadow-[0_10px_24px_rgba(13,89,55,0.16)]"
              : isTutor
                ? "border border-emerald-700/20 bg-emerald-100/70 text-emerald-950 rounded-2xl rounded-bl-sm shadow-sm"
                : "border border-emerald-950/10 bg-[#fffdf7]/75 text-emerald-950 rounded-2xl rounded-bl-sm shadow-sm backdrop-blur-sm"
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

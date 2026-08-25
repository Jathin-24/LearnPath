import type { AgentName } from "../types";

interface Props {
  role: "user" | "assistant";
  content: string;
  agent?: AgentName | null;
}

export default function ChatBubble({ role, content, agent }: Props) {
  const isUser = role === "user";
  const isTutor = agent === "tutor";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[75%]">
        {isTutor && (
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-emerald-400">
            <span>🎓</span> Topic Tutor
          </p>
        )}
        <div
          className={`whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-relaxed ${
            isUser
              ? "bg-indigo-500 text-white"
              : isTutor
                ? "border border-emerald-900/60 bg-emerald-950/30 text-slate-100"
                : "bg-slate-800 text-slate-100"
          }`}
        >
          {content}
        </div>
      </div>
    </div>
  );
}

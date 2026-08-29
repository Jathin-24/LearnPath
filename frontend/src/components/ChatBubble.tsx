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
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-purple">
            <span>🎓</span> Topic Tutor
          </p>
        )}
        <div
          className={`whitespace-pre-wrap px-4 py-2.5 text-sm leading-relaxed rounded-2xl ${
            isUser
              ? "bg-fg text-white dark:bg-accent dark:text-[#0A0A0A] rounded-br-md"
              : isTutor
                ? "bg-purple/5 border border-purple/20 text-fg rounded-bl-md"
                : "bg-bg-secondary text-fg rounded-bl-md"
          }`}
        >
          {content}
        </div>
      </div>
    </div>
  );
}

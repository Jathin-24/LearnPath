// Assessment agent turns embed markers like "[ASSESSMENT:CHECKLIST]" at the
// start of assistant content (see backend/agents/assessment.py) - strip them
// for display, they're only used internally to detect conversation phase.
const KNOWN_MARKERS = ["[ASSESSMENT:CHECKLIST]", "[ASSESSMENT:QUIZ]"];

function displayContent(content: string): string {
  for (const marker of KNOWN_MARKERS) {
    if (content.startsWith(marker)) return content.slice(marker.length);
  }
  return content;
}

interface Props {
  role: "user" | "assistant";
  content: string;
}

export default function ChatBubble({ role, content }: Props) {
  const isUser = role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm leading-relaxed ${
          isUser ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-100"
        }`}
      >
        {displayContent(content)}
      </div>
    </div>
  );
}

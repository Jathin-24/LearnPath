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
        {content}
      </div>
    </div>
  );
}

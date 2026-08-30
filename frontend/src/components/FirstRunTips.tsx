import { useState } from "react";
import { CheckCircle2, Lightbulb, ListChecks, NotebookPen, X } from "lucide-react";

const KEY = "lpr_topic_guide_seen";

const STEPS = [
  { icon: ListChecks, text: "Study the current subtopic shown on the left." },
  { icon: CheckCircle2, text: "Pass the quiz to advance to the next subtopic." },
  { icon: NotebookPen, text: "Keep notes and resources on the right while you learn." },
];

export default function FirstRunTips() {
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });

  if (seen) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setSeen(true);
  };

  return (
    <div className="glass-panel animate-fade-in-up relative mb-6 rounded-2xl border-slate-800/60 bg-slate-900/70 p-5">
      <button
        onClick={dismiss}
        aria-label="Dismiss guide"
        className="absolute right-3 top-3 rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
      >
        <X className="h-4 w-4" />
      </button>
      <div className="flex items-center gap-2 text-slate-200">
        <Lightbulb className="h-4 w-4 text-amber-400" />
        <h3 className="text-sm font-semibold">How to work through a topic</h3>
      </div>
      <ul className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
        {STEPS.map((s) => (
          <li key={s.text} className="flex items-start gap-2 text-xs leading-5 text-slate-400 sm:flex-1">
            <s.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" />
            <span>{s.text}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={dismiss}
        className="mt-4 rounded-lg bg-slate-100 px-4 py-1.5 text-xs font-semibold text-slate-900 transition hover:bg-white"
      >
        Got it
      </button>
    </div>
  );
}
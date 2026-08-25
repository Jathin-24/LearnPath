import type { QuestionResult } from "../types";

interface Props {
  results: QuestionResult[];
}

export default function QuizResults({ results }: Props) {
  return (
    <div className="space-y-2">
      {results.map((r, i) => (
        <div
          key={i}
          className={`rounded-lg border p-3 text-sm ${
            r.correct ? "border-green-800 bg-green-950/20" : "border-red-800 bg-red-950/20"
          }`}
        >
          <p className="font-medium text-slate-100">
            {i + 1}. {r.question}
          </p>
          {r.correct ? (
            <p className="mt-1 text-xs text-green-400">Correct - {r.correct_answer}</p>
          ) : (
            <p className="mt-1 text-xs text-red-300">
              You picked: {r.your_answer || "(no answer)"} · Correct: {r.correct_answer}
            </p>
          )}
          {r.explanation && <p className="mt-1 text-xs text-slate-400">{r.explanation}</p>}
        </div>
      ))}
    </div>
  );
}

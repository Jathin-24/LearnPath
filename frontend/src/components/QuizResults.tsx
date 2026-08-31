import type { QuestionResult } from "../types";

interface Props {
  results: QuestionResult[];
}

export default function QuizResults({ results }: Props) {
  return (
    <div className="space-y-3">
      {results.map((r, i) => (
        <div
          key={i}
          className={`rounded-lg border p-3 text-sm ${
            r.correct ? "border-emerald-700/20 bg-emerald-100/70" : "border-red-700/15 bg-red-50"
          }`}
        >
          <p className="font-semibold text-emerald-950">
            {i + 1}. {r.question}
          </p>
          {r.correct ? (
            <p className="mt-2 text-xs text-emerald-800">Correct — {r.correct_answer}</p>
          ) : (
            <p className="mt-2 text-xs text-red-700">
              You picked: {r.your_answer || "(no answer)"} · Correct: {r.correct_answer}
            </p>
          )}
          {r.explanation && <p className="mt-2 text-xs leading-5 text-emerald-950/58">{r.explanation}</p>}
        </div>
      ))}
    </div>
  );
}

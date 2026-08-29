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
          className={`border rounded-lg p-3 text-sm ${
            r.correct ? "border-success/20 bg-success/5" : "border-danger/20 bg-danger/5"
          }`}
        >
          <p className="font-medium text-fg">
            {i + 1}. {r.question}
          </p>
          {r.correct ? (
            <p className="mt-1 text-xs text-success">Correct - {r.correct_answer}</p>
          ) : (
            <p className="mt-1 text-xs text-danger">
              You picked: {r.your_answer || "(no answer)"} · Correct: {r.correct_answer}
            </p>
          )}
          {r.explanation && <p className="mt-1 text-xs text-fg-muted">{r.explanation}</p>}
        </div>
      ))}
    </div>
  );
}

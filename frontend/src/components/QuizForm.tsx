import { useEffect, useState } from "react";
import type { MCQQuestion } from "../types";

interface Props {
  questions: MCQQuestion[];
  onSubmit: (answers: string[]) => void;
  submitting: boolean;
}

export default function QuizForm({ questions, onSubmit, submitting }: Props) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));

  useEffect(() => {
    setAnswers(questions.map(() => ""));
  }, [questions]);

  const allAnswered = answers.every((a) => a !== "");

  function selectOption(qIndex: number, option: string) {
    setAnswers((prev) => prev.map((a, i) => (i === qIndex ? option : a)));
  }

  return (
    <div className="space-y-6">
      {questions.map((q, qIndex) => (
        <div key={qIndex} className="rounded-2xl border border-emerald-950/10 bg-white/55 p-5">
          <p className="mb-4 text-sm font-semibold text-emerald-950">
            {qIndex + 1}. {q.question}
          </p>
          <div className="space-y-2">
            {q.options.map((option) => (
              <label
                key={option}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
                  answers[qIndex] === option
                    ? "border-emerald-700/45 bg-emerald-100 text-emerald-950"
                    : "border-emerald-950/10 bg-amber-50/50 text-emerald-950/75 hover:border-emerald-700/28"
                }`}
              >
                <input
                  type="radio"
                  name={`q-${qIndex}`}
                  checked={answers[qIndex] === option}
                  onChange={() => selectOption(qIndex, option)}
                  className="accent-emerald-700"
                />
                {option}
              </label>
            ))}
          </div>
        </div>
      ))}
      <button
        onClick={() => onSubmit(answers)}
        disabled={!allAnswered || submitting}
        className="rounded-xl bg-emerald-800 px-6 py-3 text-sm font-semibold text-amber-50 transition hover:-translate-y-0.5 hover:bg-emerald-900 disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Submit Quiz"}
      </button>
    </div>
  );
}

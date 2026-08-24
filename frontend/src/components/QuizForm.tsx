import { useState } from "react";
import type { MCQQuestion } from "../types";

interface Props {
  questions: MCQQuestion[];
  onSubmit: (answers: string[]) => void;
  submitting: boolean;
}

export default function QuizForm({ questions, onSubmit, submitting }: Props) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));

  const allAnswered = answers.every((a) => a !== "");

  function selectOption(qIndex: number, option: string) {
    setAnswers((prev) => prev.map((a, i) => (i === qIndex ? option : a)));
  }

  return (
    <div className="space-y-6">
      {questions.map((q, qIndex) => (
        <div key={qIndex} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <p className="mb-3 text-sm font-medium text-slate-100">
            {qIndex + 1}. {q.question}
          </p>
          <div className="space-y-2">
            {q.options.map((option) => (
              <label
                key={option}
                className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
                  answers[qIndex] === option
                    ? "border-indigo-500 bg-indigo-500/10"
                    : "border-slate-800 hover:border-slate-600"
                }`}
              >
                <input
                  type="radio"
                  name={`q-${qIndex}`}
                  checked={answers[qIndex] === option}
                  onChange={() => selectOption(qIndex, option)}
                  className="accent-indigo-500"
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
        className="rounded-full bg-indigo-500 px-6 py-2 text-sm font-semibold transition hover:bg-indigo-400 disabled:opacity-50"
      >
        {submitting ? "Submitting..." : "Submit Quiz"}
      </button>
    </div>
  );
}

import { useState } from "react";
import type { MCQQuestion } from "../types";
import Button from "./nb/Button";

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
        <div key={qIndex} className="border border-border rounded-xl p-5 bg-surface">
          <p className="mb-4 text-sm font-medium text-fg">
            {qIndex + 1}. {q.question}
          </p>
          <div className="space-y-2">
            {q.options.map((option) => (
              <label
                key={option}
                className={`flex cursor-pointer items-center gap-3 border rounded-lg px-4 py-2.5 text-sm transition-all duration-150 ${
                  answers[qIndex] === option
                    ? "border-fg/30 bg-fg/5"
                    : "border-border hover:border-border-strong"
                }`}
              >
                <input
                  type="radio"
                  name={`q-${qIndex}`}
                  checked={answers[qIndex] === option}
                  onChange={() => selectOption(qIndex, option)}
                  className="accent-fg"
                />
                {option}
              </label>
            ))}
          </div>
        </div>
      ))}
      <Button
        onClick={() => onSubmit(answers)}
        disabled={!allAnswered || submitting}
      >
        {submitting ? "Submitting..." : "Submit Quiz"}
      </Button>
    </div>
  );
}

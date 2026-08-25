"""
grading.py

Deterministic MCQ grading - shared by the topic checkpoint quiz
(backend/api/main.py's /topic/{id}/assessment/submit) and the onboarding
skill quiz (backend/agents/assessment.py's grade_pending_quiz). Never an
LLM judgment call on correctness, per docs/final_decisions.md - just an
exact match against MCQQuestion.correct_option_index.
"""

from backend.orchestrator.state_schema import MCQQuestion


def grade_mcq_batch(questions: list[MCQQuestion], answers: list[str]) -> tuple[float, list[dict]]:
    results = []
    correct_count = 0
    for i, question in enumerate(questions):
        answer = answers[i] if i < len(answers) else ""
        is_correct = (
            0 <= question.correct_option_index < len(question.options)
            and answer == question.options[question.correct_option_index]
        )
        correct_count += is_correct
        results.append(
            {
                "question": question.question,
                "your_answer": answer,
                "correct_answer": question.options[question.correct_option_index],
                "correct": is_correct,
                "explanation": question.explanation,
            }
        )
    score = correct_count / len(questions) if questions else 0.0
    return score, results

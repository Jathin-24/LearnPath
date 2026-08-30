import { apiClient } from "./client";
import type { AppState } from "../types";

export const assessmentApi = {
  submitChecklist: (sessionId: string, confirmed_concepts: string[]) => 
    apiClient.post<{state: AppState}>("/assessment/checklist/submit", { session_id: sessionId, confirmed_concepts }),
  submitOnboardingQuiz: (sessionId: string, answers: string[]) => 
    apiClient.post<{state: AppState, results: any}>("/assessment/quiz/submit", { session_id: sessionId, answers }),
};

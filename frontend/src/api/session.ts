import { apiClient } from "./client";
import type { AppState } from "../types";

export const sessionApi = {
  createSession: () => apiClient.post<{session_id: string, state: AppState}>("/session"),
  getState: (sessionId: string) => apiClient.get<{state: AppState}>(`/state/${sessionId}`),
};

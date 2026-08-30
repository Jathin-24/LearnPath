import { apiClient } from "./client";
import type { AppState } from "../types";

export const chatApi = {
  sendChatMessage: (sessionId: string, message: string) => 
    apiClient.post<{state: AppState, assistant_message: string}>("/chat", { session_id: sessionId, message }),
};

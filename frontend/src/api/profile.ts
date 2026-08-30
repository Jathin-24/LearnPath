import { apiClient } from "./client";
import type { AppState, KnowledgeEntry } from "../types";

export const profileApi = {
  importContext: (sessionId: string, text: string) => 
    apiClient.post<{state: AppState}>("/context/import", { session_id: sessionId, imported_text: text }),
  getKnowledge: (sessionId: string) => 
    apiClient.get<{entries: KnowledgeEntry[]}>(`/knowledge/${sessionId}`),
  deleteKnowledge: (sessionId: string, entryId: string) => 
    apiClient.delete<{deleted: string}>(`/knowledge/${entryId}`, { session_id: sessionId }),
  uploadResume: (sessionId: string, file: File) => {
    const formData = new FormData();
    formData.append("session_id", sessionId);
    formData.append("file", file);
    return apiClient.post<{state: AppState}>("/profile/resume", formData);
  },
  getResumeFile: (sessionId: string) => 
    apiClient.get<Blob>(`/profile/resume/file/${sessionId}`),
};

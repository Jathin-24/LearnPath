import { apiClient } from "./client";
import type { AppState } from "../types";

export const topicApi = {
  regenerateTopic: (sessionId: string, nodeId: string, instructions?: string) => 
    apiClient.post<{state: AppState}>(`/topic/${nodeId}/regenerate`, { session_id: sessionId, instructions }),
  explainRoadmapNode: (sessionId: string, nodeId: string) => 
    apiClient.post<{explanation: string}>(`/roadmap/explain/${nodeId}`, { session_id: sessionId }),
  refreshWebResources: (sessionId: string, nodeId: string) => 
    apiClient.post<{state: AppState}>(`/topic/${nodeId}/refresh-web`, { session_id: sessionId }),
  expandProject: (sessionId: string, nodeId: string) => 
    apiClient.post<{detailed_description: string}>(`/topic/${nodeId}/project/expand`, { session_id: sessionId }),
};

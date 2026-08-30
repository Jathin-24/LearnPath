import { apiClient } from "./client";
import type { AppState, Roadmap, PathType } from "../types";

export const roadmapApi = {
  restartGoal: (sessionId: string) => 
    apiClient.post<{state: AppState}>("/goal/restart", { session_id: sessionId }),
  generatePathA: (sessionId: string) => 
    apiClient.post<{roadmap: Roadmap, path_type: PathType}>("/roadmap/generate/path-a", { session_id: sessionId }),
  confirmRoadmap: (sessionId: string) => 
    apiClient.post<{state: AppState}>("/roadmap/confirm", { session_id: sessionId }),
  reorderRoadmapNode: (sessionId: string, nodeId: string, direction: 'up' | 'down') => 
    apiClient.post<{state: AppState}>("/roadmap/reorder", { session_id: sessionId, node_id: nodeId, direction }),
  skipRoadmapNode: (sessionId: string, nodeId: string) => 
    apiClient.post<{state: AppState}>(`/roadmap/skip/${nodeId}`, { session_id: sessionId }),
  addRoadmapNode: (sessionId: string, topic: string, key_concepts: string[] = []) => 
    apiClient.post<{state: AppState}>("/roadmap/node/add", { session_id: sessionId, topic, key_concepts }),
  editRoadmapNode: (sessionId: string, nodeId: string, data: {topic?: string, key_concepts?: string[]}) => 
    apiClient.patch<{state: AppState}>(`/roadmap/node/${nodeId}`, { session_id: sessionId, ...data }),
  modifyRoadmap: (sessionId: string, instructions: string) => 
    apiClient.post<{state: AppState}>("/roadmap/modify", { session_id: sessionId, instructions }),
  regenerateRoadmap: (sessionId: string, instructions?: string) => 
    apiClient.post<{state: AppState}>("/roadmap/regenerate", { session_id: sessionId, instructions }),
};

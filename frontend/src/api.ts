// Typed wrapper around every backend/api/main.py route the frontend uses.
// One function per route - see docs/api_contract.md for the canonical spec.

import type {
  AnalyticsResponse,
  AppState,
  DashboardResponse,
  DueReview,
  KnowledgeEntry,
  MCQQuestion,
  QuestionResult,
} from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body || res.statusText);
  }
  return res.json() as Promise<T>;
}

interface AuthResponse {
  user_id: string;
  username: string;
  session_id: string;
}

export function signup(username: string, password: string): Promise<AuthResponse> {
  return request("/auth/signup", { method: "POST", body: JSON.stringify({ username, password }) });
}

export function login(username: string, password: string): Promise<AuthResponse> {
  return request("/auth/login", { method: "POST", body: JSON.stringify({ username, password }) });
}

export function getState(sessionId: string): Promise<{ state: AppState }> {
  return request(`/state/${sessionId}`);
}

export function sendChatMessage(
  sessionId: string,
  message: string,
): Promise<{ state: AppState; assistant_message: string }> {
  return request("/chat", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, message }),
  });
}

export function importContext(
  sessionId: string,
  importedText: string,
): Promise<{ state: AppState }> {
  return request("/context/import", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, imported_text: importedText }),
  });
}

export function getKnowledge(sessionId: string): Promise<{ entries: KnowledgeEntry[] }> {
  return request(`/knowledge/${sessionId}`);
}

export function deleteKnowledgeEntry(sessionId: string, entryId: string): Promise<{ deleted: string }> {
  return request(`/knowledge/${entryId}`, {
    method: "DELETE",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export function restartGoal(sessionId: string): Promise<{ state: AppState }> {
  return request("/goal/restart", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export function confirmRoadmap(sessionId: string): Promise<{ state: AppState }> {
  return request("/roadmap/confirm", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export function reorderRoadmapNode(
  sessionId: string,
  nodeId: string,
  direction: "up" | "down",
): Promise<{ state: AppState }> {
  return request("/roadmap/reorder", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, node_id: nodeId, direction }),
  });
}

export function skipRoadmapNode(sessionId: string, nodeId: string): Promise<{ state: AppState }> {
  return request(`/roadmap/skip/${nodeId}`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export function addRoadmapNode(
  sessionId: string,
  topic: string,
  keyConcepts: string[] = [],
): Promise<{ state: AppState }> {
  return request("/roadmap/node/add", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, topic, key_concepts: keyConcepts }),
  });
}

export function editRoadmapNode(
  sessionId: string,
  nodeId: string,
  update: { topic?: string; key_concepts?: string[] },
): Promise<{ state: AppState }> {
  return request(`/roadmap/node/${nodeId}`, {
    method: "PATCH",
    body: JSON.stringify({ session_id: sessionId, ...update }),
  });
}

export function deleteRoadmapNode(sessionId: string, nodeId: string): Promise<{ state: AppState }> {
  return request(`/roadmap/node/${nodeId}/delete`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export function refreshWebResources(sessionId: string, nodeId: string): Promise<{ state: AppState }> {
  return request(`/topic/${nodeId}/refresh-web`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export function generateSubtopicQuiz(
  sessionId: string,
  nodeId: string,
  subtopicId: string,
): Promise<{ state: AppState }> {
  return request(`/topic/${nodeId}/subtopic/${subtopicId}/quiz/generate`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export function submitSubtopicQuiz(
  sessionId: string,
  nodeId: string,
  subtopicId: string,
  answers: string[],
): Promise<{ score: number; passed: boolean; results: QuestionResult[]; state: AppState }> {
  return request(`/topic/${nodeId}/subtopic/${subtopicId}/quiz/submit`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, answers }),
  });
}

export function skipSubtopic(
  sessionId: string,
  nodeId: string,
  subtopicId: string,
): Promise<{ state: AppState }> {
  return request(`/topic/${nodeId}/subtopic/${subtopicId}/skip`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export function expandProject(
  sessionId: string,
  nodeId: string,
): Promise<{ detailed_description: string }> {
  return request(`/topic/${nodeId}/project/expand`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export function regenerateTopic(
  sessionId: string,
  nodeId: string,
  instructions?: string,
): Promise<{ state: AppState }> {
  return request(`/topic/${nodeId}/regenerate`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, instructions }),
  });
}

export function regenerateRoadmap(sessionId: string, instructions?: string): Promise<{ state: AppState }> {
  return request("/roadmap/regenerate", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, instructions }),
  });
}

// Pre-confirm only - re-picks topics/courses too, not just content, based
// on free-text instructions (see main.py's /roadmap/modify docstring).
export function modifyRoadmap(sessionId: string, instructions: string): Promise<{ state: AppState }> {
  return request("/roadmap/modify", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, instructions }),
  });
}

export function explainNode(
  sessionId: string,
  nodeId: string,
): Promise<{ explanation: string }> {
  return request(`/roadmap/explain/${nodeId}`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export function submitAssessment(
  sessionId: string,
  nodeId: string,
  answers: string[],
): Promise<{ score: number; passed: boolean; node_status: string; results: QuestionResult[] }> {
  return request(`/topic/${nodeId}/assessment/submit`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, answers }),
  });
}

export function submitChecklist(
  sessionId: string,
  confirmedConcepts: string[],
): Promise<{ state: AppState }> {
  return request("/assessment/checklist/submit", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, confirmed_concepts: confirmedConcepts }),
  });
}

export function submitOnboardingQuiz(
  sessionId: string,
  answers: string[],
): Promise<{ state: AppState; results: QuestionResult[] }> {
  return request("/assessment/quiz/submit", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, answers }),
  });
}

export function getDashboard(sessionId: string): Promise<DashboardResponse> {
  return request(`/dashboard/${sessionId}`);
}

export interface ProfileUpdate {
  name?: string;
  email?: string;
  age?: number;
  gender?: string;
  occupation_status?: string;
  student_percentage?: string;
  professional_role?: string;
  goal?: string;
  timeline?: string;
  interests?: string[];
  stated_known_skills?: string[];
  prior_learning_history?: string[];
  hobbies?: string[];
  certifications?: string[];
  extra_info?: string;
}

export function updateProfile(sessionId: string, update: ProfileUpdate): Promise<{ state: AppState }> {
  return request("/profile", {
    method: "PATCH",
    body: JSON.stringify({ session_id: sessionId, ...update }),
  });
}

export function recordTimeSpent(
  sessionId: string,
  nodeId: string,
  seconds: number,
): Promise<{ time_spent_seconds: number }> {
  return request(`/topic/${nodeId}/time`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, seconds }),
  });
}

export function updateTopicNotes(
  sessionId: string,
  nodeId: string,
  notes: string,
): Promise<{ notes: string }> {
  return request(`/topic/${nodeId}/notes`, {
    method: "PATCH",
    body: JSON.stringify({ session_id: sessionId, notes }),
  });
}

export function getAnalytics(sessionId: string): Promise<AnalyticsResponse> {
  return request(`/analytics/${sessionId}`);
}

export async function uploadResume(sessionId: string, file: File): Promise<{ state: AppState; extraction_warning?: string }> {
  // Not routed through request() - a multipart body needs the browser to set
  // its own Content-Type boundary, not the fixed "application/json" header.
  const formData = new FormData();
  formData.append("session_id", sessionId);
  formData.append("file", file);

  const res = await fetch(`${BASE_URL}/profile/resume`, { method: "POST", body: formData });
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body || res.statusText);
  }
  return res.json() as Promise<{ state: AppState; extraction_warning?: string }>;
}

// Not routed through request() - this is opened directly in a new tab
// (<a href>), not fetched as JSON.
export function resumeFileUrl(sessionId: string): string {
  return `${BASE_URL}/profile/resume/file/${sessionId}`;
}

export function getDueReviews(sessionId: string): Promise<{ due: DueReview[] }> {
  return request(`/review/due/${sessionId}`);
}

export function generateReviewQuestion(
  sessionId: string,
  nodeId: string,
): Promise<{ question_index: number; question: MCQQuestion }> {
  return request(`/review/${nodeId}/generate`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export function submitReview(
  sessionId: string,
  nodeId: string,
  questionIndex: number,
  answer: string,
): Promise<{ correct: boolean; result: QuestionResult; next_review_at: string | null }> {
  return request(`/review/${nodeId}/submit`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, question_index: questionIndex, answer }),
  });
}

// Typed wrapper around every backend/api/main.py route the frontend uses.
// One function per route - see docs/api_contract.md for the canonical spec.

import type { AppState, DashboardResponse } from "./types";

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

export function createSession(): Promise<{ session_id: string; state: AppState }> {
  return request("/session", { method: "POST" });
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

export function confirmRoadmap(sessionId: string): Promise<{ state: AppState }> {
  return request("/roadmap/confirm", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
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
): Promise<{ score: number; passed: boolean; node_status: string }> {
  return request(`/topic/${nodeId}/assessment/submit`, {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, answers }),
  });
}

export function getDashboard(sessionId: string): Promise<DashboardResponse> {
  return request(`/dashboard/${sessionId}`);
}

const AUTH_KEY = "learning_path_auth";

export interface AuthInfo {
  user_id: string | null;
  username: string | null;
  session_id: string;
  access_token?: string;
}

export function getAuth(): AuthInfo | null {
  const raw = localStorage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthInfo;
  } catch {
    return null;
  }
}

export function setAuth(auth: AuthInfo): void {
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_KEY);
}

export function getSessionId(): string | null {
  return getAuth()?.session_id ?? null;
}

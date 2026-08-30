import { apiClient } from "./client";

export interface AuthResponse {
  user_id: string;
  username: string;
  session_id: string;
}

export const authApi = {
  signup: (data: any) => apiClient.post<AuthResponse>("/auth/signup", data),
  login: (data: any) => apiClient.post<AuthResponse>("/auth/login", data),
};

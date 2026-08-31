export class ApiError extends Error {
  public status: number;
  public detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

// `??` (not `||`) so an explicitly-empty VITE_API_BASE_URL means "same origin".
// That is what the single-origin Docker image builds with; unset keeps the
// local-dev default.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

interface RequestOptions extends RequestInit {
  data?: any;
}

export const apiClient = {
  async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { data, headers: customHeaders, ...restOptions } = options;

    const url = `${API_BASE_URL}${endpoint}`;
    const headers = new Headers(customHeaders as HeadersInit);

    // If data is FormData, do not set Content-Type header (browser will set it with boundary)
    if (data && !(data instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }

    const config: RequestInit = {
      ...restOptions,
      headers,
    };

    if (data) {
      config.body = data instanceof FormData ? data : JSON.stringify(data);
    }

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        let detail = "An unexpected error occurred.";
        try {
          const errorData = await response.json();
          detail = errorData.detail || detail;
        } catch {
          // If response is not JSON
          detail = await response.text();
        }
        throw new ApiError(response.status, detail);
      }

      // 204 No Content
      if (response.status === 204) {
        return {} as T;
      }

      // If the response is a file blob (e.g. for resume)
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/pdf")) {
        return (await response.blob()) as unknown as T;
      }

      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(0, "Network error or server is unreachable.");
    }
  },

  get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  },

  post<T>(endpoint: string, data?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "POST", data });
  },

  patch<T>(endpoint: string, data?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "PATCH", data });
  },

  delete<T>(endpoint: string, data?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "DELETE", data });
  }
};

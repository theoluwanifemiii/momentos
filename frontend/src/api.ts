const ENV_API_URL = import.meta.env.VITE_API_URL;
const FALLBACK_API_URL = "/api";
export const API_URL = ENV_API_URL || FALLBACK_API_URL;

export const api = {
  async call(endpoint: string, options: RequestInit = {}) {
    const token = localStorage.getItem("token");
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const err = new Error(payload?.error || "Request failed") as any;
      err.status = response.status;
      err.data = payload;
      throw err;
    }

    return payload;
  },
};

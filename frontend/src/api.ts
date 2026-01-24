const ENV_API_URL = import.meta.env.VITE_API_URL;
const DEFAULT_REMOTE_API_URL = "https://momentos-production.up.railway.app/api";
const DEFAULT_LOCAL_API_URL = "http://localhost:3001/api";
const FALLBACK_API_URL =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? DEFAULT_LOCAL_API_URL
    : DEFAULT_REMOTE_API_URL;
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

let adminPending = 0;
const adminListeners = new Set<(count: number) => void>();
const notifyAdmin = () => {
  adminListeners.forEach((listener) => listener(adminPending));
};

export const adminApi = {
  subscribe(listener: (count: number) => void) {
    adminListeners.add(listener);
    listener(adminPending);
    return () => {
      adminListeners.delete(listener);
    };
  },
  async call(endpoint: string, options: RequestInit = {}) {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    adminPending += 1;
    notifyAdmin();
    try {
      const response = await fetch(`${API_URL}/internal/admin${endpoint}`, {
        ...options,
        headers,
        credentials: "include",
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
    } finally {
      adminPending = Math.max(0, adminPending - 1);
      notifyAdmin();
    }
  },
};

const ENV_API_URL = import.meta.env.VITE_API_URL;
const DEFAULT_REMOTE_API_URL = "https://momentos-production.up.railway.app/api";
const DEFAULT_LOCAL_API_URL = "http://localhost:3001/api";
const FALLBACK_API_URL =
  typeof window !== "undefined" && window.location.hostname === "localhost"
    ? DEFAULT_LOCAL_API_URL
    : DEFAULT_REMOTE_API_URL;
export const API_URL = ENV_API_URL || FALLBACK_API_URL;

const buildFriendlyError = (
  payload: any,
  status?: number,
  fallback = "Something went wrong. Please try again."
) => {
  if (payload?.error && typeof payload.error === "string") return payload.error;
  if (Array.isArray(payload?.error)) {
    const details = payload.error
      .map((detail: any) =>
        detail?.message
          ? `${detail.path?.length ? `${detail.path.join(".")}: ` : ""}${detail.message}`
          : null
      )
      .filter(Boolean)
      .join(", ");
    if (details) return `Validation failed: ${details}`;
  }
  if (payload?.message && typeof payload.message === "string") return payload.message;
  if (Array.isArray(payload?.details) && payload.details.length > 0) {
    const details = payload.details
      .map((detail: any) =>
        detail?.message
          ? `${detail.field ? `${detail.field}: ` : ""}${detail.message}`
          : null
      )
      .filter(Boolean)
      .join(", ");
    if (details) return `Validation failed: ${details}`;
  }

  switch (status) {
    case 400:
      return "Please check your input and try again.";
    case 401:
      return "You're not signed in. Please log in and try again.";
    case 403:
      return "You don't have permission to do that.";
    case 404:
      return "We couldn't find what you requested.";
    case 409:
      return "That already exists. Try a different value.";
    case 429:
      return "Too many requests. Please try again shortly.";
    default:
      if (status && status >= 500) {
        return "We hit a server error. Please try again in a moment.";
      }
      return fallback;
  }
};

export const api = {
  async call(endpoint: string, options: RequestInit = {}) {
    const token = localStorage.getItem("token");
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    let response: Response;
    try {
      response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
      });
    } catch (error) {
      const err = new Error(
        "Network error. Please check your connection and try again."
      ) as any;
      err.status = 0;
      err.data = null;
      throw err;
    }

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const err = new Error(
        buildFriendlyError(payload, response.status)
      ) as any;
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
      let response: Response;
      try {
        response = await fetch(`${API_URL}/internal/admin${endpoint}`, {
          ...options,
          headers,
          credentials: "include",
        });
      } catch (error) {
        const err = new Error(
          "Network error. Please check your connection and try again."
        ) as any;
        err.status = 0;
        err.data = null;
        throw err;
      }

      const text = await response.text();
      const payload = text ? JSON.parse(text) : null;

      if (!response.ok) {
        const err = new Error(
          buildFriendlyError(payload, response.status)
        ) as any;
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

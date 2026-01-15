function normalizeApiBase(value?: string) {
  if (!value) return '/api';
  let base = value.trim();
  base = base.replace(/\/+$/, '');
  if (/^https?:\/[^/]/.test(base)) {
    base = base.replace(/^https?:\/(?!\/)/, (match) => `${match}/`);
  }
  return base;
}

export const API_URL = normalizeApiBase(import.meta.env.VITE_API_URL);

export const api = {
  async call(endpoint: string, options: RequestInit = {}) {
    const token = localStorage.getItem('token');
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
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
      const err = new Error(payload?.error || 'Request failed') as any;
      err.status = response.status;
      err.data = payload;
      throw err;
    }

    return payload;
  },
};

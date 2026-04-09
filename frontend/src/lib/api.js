const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Wake the backend if it's sleeping (Render free tier cold start handling)
// Called once on app mount — fires and forgets
let _backendWakePromise = null;
export function wakeBackend() {
  if (_backendWakePromise) return _backendWakePromise;
  _backendWakePromise = fetch(`${API_BASE}/health`, {
    method: "GET",
    // Long timeout for cold start (Render takes up to 50s)
    signal: AbortSignal.timeout(60000),
  }).catch(() => {
    // Ignore errors — just best effort
    _backendWakePromise = null;
  });
  return _backendWakePromise;
}

export async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options.headers },
    // 2 minute timeout to tolerate cold starts
    signal: AbortSignal.timeout(120000),
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API error: ${res.status}`);
  }
  return res.json();
}

export async function apiUpload(path, formData) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Upload error: ${res.status}`);
  }
  return res.json();
}

// Demo dataset metadata
export const DEMO_META = {
  adult: {
    protected_attributes: ["sex", "race"],
    label_column: "income",
    favorable_label: ">50K",
  },
  german_credit: {
    protected_attributes: ["sex", "age_group"],
    label_column: "credit",
    favorable_label: 1,
  },
  compas: {
    protected_attributes: ["sex", "race"],
    label_column: "two_year_recid",
    favorable_label: 0,
  },
};
const host = window.location.hostname;
const FALLBACK_HOST = `${host}:4000`;

const browserOrigin =
  typeof window !== "undefined" ? window.location.origin : `http://${FALLBACK_HOST}`;
const isViteDevServer =
  typeof window !== "undefined" && window.location.port === "5173";
const viteEnv =
  typeof import.meta !== "undefined"
    ? ((import.meta as { env?: Record<string, string | undefined> }).env ?? {})
    : {};

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

const configuredApiRoot = viteEnv.VITE_API_URL
  ? trimTrailingSlash(String(viteEnv.VITE_API_URL))
  : "";

const configuredApiBase = viteEnv.VITE_API_BASE
  ? trimTrailingSlash(String(viteEnv.VITE_API_BASE))
  : configuredApiRoot
    ? `${configuredApiRoot}/api`
    : "";

const configuredFileBase =
  viteEnv.VITE_FILE_BASE
    ? trimTrailingSlash(String(viteEnv.VITE_FILE_BASE))
    : configuredApiRoot;

export const API_BASE = configuredApiBase
  ? configuredApiBase
  : isViteDevServer
    ? `http://${FALLBACK_HOST}/api`
    : `${browserOrigin}/api`;

export const FILE_BASE = configuredFileBase
  ? configuredFileBase
  : isViteDevServer
    ? `http://${FALLBACK_HOST}`
    : browserOrigin;

function authHeaders() {
  const token = localStorage.getItem("mod_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `GET ${path} failed`);
  }

  return data as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `POST ${path} failed`);
  }

  return data as T;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `PUT ${path} failed`);
  }

  return data as T;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `DELETE ${path} failed`);
  }

  return data as T;
}

export async function uploadPhotos(files: FileList | null): Promise<string[]> {
  if (!files || files.length === 0) return [];

  const formData = new FormData();
  Array.from(files).forEach((file) => formData.append("photos", file));

  const res = await fetch(`${API_BASE}/uploads`, {
    method: "POST",
    headers: {
      ...authHeaders(),
    },
    body: formData,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error((data as { message?: string }).message || "Photo upload failed");
  }

  return ((data as { files?: string[] }).files || []);
}

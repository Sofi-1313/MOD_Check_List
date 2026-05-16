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

function withApiPath(value: string) {
  const trimmed = trimTrailingSlash(value);
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
}

const configuredApiRoot = viteEnv.VITE_API_URL
  ? trimTrailingSlash(String(viteEnv.VITE_API_URL))
  : "";

const configuredApiBase = viteEnv.VITE_API_BASE
  ? trimTrailingSlash(String(viteEnv.VITE_API_BASE))
  : configuredApiRoot
    ? withApiPath(configuredApiRoot)
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

async function readResponseData(res: Response) {
  const text = await res.text().catch(() => "");
  if (!text) return {};

  try {
    return JSON.parse(text) as { message?: string };
  } catch {
    return { message: text.slice(0, 200) };
  }
}

function requestError(method: string, path: string, res: Response, data: { message?: string }) {
  const detail = data.message ? `: ${data.message}` : "";
  return new Error(`${method} ${path} failed (${res.status} ${res.statusText})${detail}`);
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
    },
  });

  const data = await readResponseData(res);

  if (!res.ok) {
    throw requestError("GET", path, res, data);
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

  const data = await readResponseData(res);

  if (!res.ok) {
    throw requestError("POST", path, res, data);
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

  const data = await readResponseData(res);

  if (!res.ok) {
    throw requestError("PUT", path, res, data);
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

  const data = await readResponseData(res);

  if (!res.ok) {
    throw requestError("DELETE", path, res, data);
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

  const data = await readResponseData(res);

  if (!res.ok) {
    throw requestError("POST", "/uploads", res, data);
  }

  return ((data as { files?: string[] }).files || []);
}

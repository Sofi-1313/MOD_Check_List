import { apiGet, apiPost } from "./api";
import { Session } from "../types";

export async function login(username: string, password: string): Promise<Session> {
  const data = await apiPost<Session>("/auth/login", { username, password });
  localStorage.setItem("mod_token", data.token);
  localStorage.setItem("mod_session", JSON.stringify(data));
  return data;
}

export async function register(username: string, password: string, name: string) {
  return apiPost<{ success: boolean; message: string }>("/auth/register", {
    username,
    password,
    name,
  });
}

export async function me() {
  return apiGet<{ user: Session["user"] }>("/auth/me");
}

export async function logout() {
  try {
    await apiPost("/auth/logout", {});
  } finally {
    localStorage.removeItem("mod_token");
    localStorage.removeItem("mod_session");
  }
}

export function getStoredSession(): Session | null {
  const raw = localStorage.getItem("mod_session");
  if (!raw) return null;
  try { return JSON.parse(raw) as Session; } catch { return null; }
}

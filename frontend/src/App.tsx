import React, { useEffect, useState } from "react";
import LoginPage from "./pages/LoginPage";
import { getStoredSession, login as loginRequest, logout as logoutRequest, me } from "./services/authService";
import { Session } from "./types";
import AdminPage from "./pages/AdminPage";
import UserPage from "./pages/UserPage";

export default function App() {
  const [session, setSession] = useState<Session | null>(getStoredSession());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restore = async () => {
      const stored = getStoredSession();
      if (!stored) return setLoading(false);
      try {
        const res = await me();
        setSession({ ...stored, user: res.user });
      } catch {
        localStorage.removeItem("mod_token");
        localStorage.removeItem("mod_session");
        setSession(null);
      } finally {
        setLoading(false);
      }
    };
    restore();
  }, []);

  const handleLogin = async (username: string, password: string) => {
    const data = await loginRequest(username, password);
    setSession(data);
  };

  const handleLogout = async () => {
    await logoutRequest();
    setSession(null);
  };

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;
  if (!session) return <LoginPage onLogin={handleLogin} />;

  return session.user.role === "admin"
    ? <AdminPage user={session.user} onLogout={handleLogout} />
    : <UserPage user={session.user} onLogout={handleLogout} />;
}

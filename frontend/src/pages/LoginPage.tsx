import React, { useState } from "react";
import { styles } from "../styles/appStyles";
import { register as registerUser } from "../services/authService";

type Props = {
  onLogin: (username: string, password: string) => Promise<void>;
};

export default function LoginPage({ onLogin }: Props) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");

    try {
      if (mode === "login") {
        await onLogin(username, password);
        return;
      }

      await registerUser(username, password, fullName);
      setMessage("Your account request was sent. Please wait for admin approval.");
      setUsername("");
      setPassword("");
      setFullName("");
      setMode("login");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : mode === "login"
            ? "Login failed"
            : "Registration failed"
      );
    }
  };

  return (
    <div style={styles.page}>
      <div style={{ ...styles.card, maxWidth: 420 }}>
        <h1 style={styles.title}>Login</h1>

        {error ? <div style={styles.error}>{error}</div> : null}
        {message ? (
          <div style={{ ...styles.section, marginTop: 0, marginBottom: 12, background: "#dbe9d2" }}>
            {message}
          </div>
        ) : null}

        <form onSubmit={submit}>
          {mode === "register" ? (
            <div style={{ marginBottom: 12 }}>
              <label>Full Name</label>
              <input
                style={styles.input}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
          ) : null}

          <div style={{ marginBottom: 12 }}>
            <label>Username</label>
            <input
              style={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label>Password</label>
            <input
              type="password"
              style={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button type="submit" style={styles.button}>
            {mode === "login" ? "Login" : "Send Approval Request"}
          </button>
        </form>

        <div style={{ marginTop: 16 }}>
          <button
            type="button"
            style={styles.secondaryButton}
            onClick={() => {
              setMode((prev) => (prev === "login" ? "register" : "login"));
              setError("");
              setMessage("");
            }}
          >
            {mode === "login" ? "Create New User Request" : "Back To Login"}
          </button>
        </div>
      </div>
    </div>
  );
}

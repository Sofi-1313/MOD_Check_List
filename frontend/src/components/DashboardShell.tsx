import React from "react";
import { styles } from "../styles/appStyles";
import { User } from "../types";

type Props = {
  user: User;
  onLogout: () => Promise<void>;
  children: React.ReactNode;
};

export default function DashboardShell({ user, onLogout, children }: Props) {
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ ...styles.row, justifyContent: "space-between" }}>
          <div>
            <div style={styles.small}>Logged in as {user.name} ({user.role})</div>
          </div>
          <button style={styles.secondaryButton} onClick={onLogout}>Logout</button>
        </div>
        {children}
      </div>
    </div>
  );
}

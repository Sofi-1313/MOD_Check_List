import React from "react";
import { styles } from "../styles/appStyles";
import { User } from "../types";

type Props = {
  user: User;
  onLogout: () => Promise<void>;
  children: React.ReactNode;
};

export default function DashboardShell({ user, onLogout, children }: Props) {
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={{ ...styles.row, justifyContent: "space-between" }}>
          <div>
            <div style={styles.small}>Logged in as {user.name} ({user.role})</div>
          </div>
          <button
            className="logout-button"
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "Logging out..." : "Logout"}
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

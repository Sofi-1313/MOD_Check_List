const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

function createExpiry(days = 7) {
  const expires = new Date();
  expires.setDate(expires.getDate() + days);
  return expires.toISOString();
}

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: "Username and password required" });
  }

  const user = db.prepare(`
    SELECT id, username, name, role, active, approval_status
    FROM users
    WHERE username = ? AND password = ?
  `).get(username, password);

  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  if (!user.active) {
    return res.status(403).json({
      message:
        user.approval_status === "pending"
          ? "Your account is waiting for admin approval"
          : "User is inactive",
    });
  }

  const token = crypto.randomBytes(24).toString("hex");
  const createdAt = new Date().toISOString();
  const expiresAt = createExpiry(7);

  db.prepare(`
    INSERT INTO sessions (user_id, token, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(user.id, token, createdAt, expiresAt);

  res.json({
    token,
    expiresAt,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      active: Boolean(user.active),
      approvalStatus: user.approval_status,
    }
  });
});

router.post("/register", (req, res) => {
  const { username, password, name } = req.body || {};

  if (!username || !password || !name) {
    return res.status(400).json({
      message: "username, password and name are required",
    });
  }

  const cleanUsername = String(username).trim();
  const cleanName = String(name).trim();

  if (!cleanUsername || !cleanName) {
    return res.status(400).json({
      message: "username and name are required",
    });
  }

  const existingUser = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(cleanUsername);

  if (existingUser) {
    return res.status(400).json({
      message: "Username already exists",
    });
  }

  db.prepare(
    `
    INSERT INTO users (username, password, name, role, active, approval_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    cleanUsername,
    password,
    cleanName,
    "user",
    0,
    "pending",
    new Date().toISOString()
  );

  res.json({
    success: true,
    message: "Registration submitted. Please wait for admin approval.",
  });
});

router.get("/me", authRequired, (req, res) => {
  res.json({ user: req.user });
});

router.post("/logout", authRequired, (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  res.json({ success: true });
});

module.exports = router;

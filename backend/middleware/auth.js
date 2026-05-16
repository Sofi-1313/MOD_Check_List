const db = require("../db");

function getToken(req) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) return authHeader.slice(7);
  return null;
}

function authRequired(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ message: "Unauthorized" });

  const session = db.prepare(`
    SELECT s.*, u.id as user_id, u.username, u.name, u.role, u.active, u.approval_status
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);

  if (!session) return res.status(401).json({ message: "Invalid session" });
  if (!session.active) return res.status(403).json({ message: "User is inactive" });

  if (new Date(session.expires_at).getTime() < Date.now()) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    return res.status(401).json({ message: "Session expired" });
  }

  req.user = {
    id: session.user_id,
    username: session.username,
    name: session.name,
    role: session.role,
    active: Boolean(session.active),
    approvalStatus: session.approval_status,
  };
  next();
}

function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
  next();
}

module.exports = { authRequired, adminOnly };

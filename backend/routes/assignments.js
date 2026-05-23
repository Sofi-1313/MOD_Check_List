const express = require("express");
const db = require("../db");
const { authRequired, adminOnly } = require("../middleware/auth");

const router = express.Router();

router.get("/", authRequired, (req, res) => {
  const baseQuery = `
    SELECT
      a.id,
      a.checklist_id,
      a.assigned_to_user_id,
      a.assigned_by_user_id,
      a.assigned_at,
      a.status,
      c.title as checklistTitle,
      c.image_path as checklistImagePath,
      u1.name as assignedToName,
      u2.name as assignedByName
    FROM assignments a
    JOIN checklists c ON a.checklist_id = c.id
    JOIN users u1 ON a.assigned_to_user_id = u1.id
    JOIN users u2 ON a.assigned_by_user_id = u2.id
  `;

  if (req.user.role === "admin") {
    return res.json(db.prepare(baseQuery + " ORDER BY a.id DESC").all());
  }
  res.json(db.prepare(baseQuery + " WHERE a.assigned_to_user_id = ? ORDER BY a.id DESC").all(req.user.id));
});

router.post("/", authRequired, adminOnly, (req, res) => {
  const { checklistId, assignedToUserId } = req.body || {};
  if (!checklistId || !assignedToUserId) {
    return res.status(400).json({ message: "checklistId and assignedToUserId required" });
  }

  const result = db.prepare(`
    INSERT INTO assignments (checklist_id, assigned_to_user_id, assigned_by_user_id, assigned_at, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(checklistId, assignedToUserId, req.user.id, new Date().toISOString(), "assigned");

  res.json({ success: true, assignmentId: result.lastInsertRowid });
});

module.exports = router;

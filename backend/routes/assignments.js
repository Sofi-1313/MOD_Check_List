const express = require("express");
const db = require("../db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

function buildAssignmentPayload(result, checklist, user, assignedAt) {
  return {
    success: true,
    assignment: {
      id: result.lastInsertRowid,
      checklist_id: checklist.id,
      assigned_to_user_id: user.id,
      assigned_by_user_id: user.id,
      assigned_at: assignedAt,
      status: "assigned",
      checklistTitle: checklist.title,
      checklistImagePath: checklist.image_path,
      assignedToName: user.name,
      assignedByName: user.name,
    },
  };
}

function createSelfAssignment(req, res, checklistId) {
  if (!checklistId) {
    return res.status(400).json({ message: "checklistId required" });
  }

  const checklist = db
    .prepare("SELECT id, title, image_path FROM checklists WHERE id = ?")
    .get(checklistId);

  if (!checklist) {
    return res.status(404).json({ message: "Checklist not found" });
  }

  const assignedAt = new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO assignments (checklist_id, assigned_to_user_id, assigned_by_user_id, assigned_at, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(checklistId, req.user.id, req.user.id, assignedAt, "assigned");

  res.json(buildAssignmentPayload(result, checklist, req.user, assignedAt));
}

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
    return res.json(
      db
        .prepare(baseQuery + " WHERE COALESCE(c.is_walkthrough, 0) = 0 ORDER BY a.id DESC")
        .all()
    );
  }
  res.json(
    db
      .prepare(
        baseQuery +
          " WHERE a.assigned_to_user_id = ? AND COALESCE(c.is_walkthrough, 0) = 0 ORDER BY a.id DESC"
      )
      .all(req.user.id)
  );
});

router.post("/self", authRequired, (req, res) => {
  const { checklistId } = req.body || {};
  return createSelfAssignment(req, res, checklistId);
});

router.post("/", authRequired, (req, res) => {
  const { checklistId, assignedToUserId, self } = req.body || {};

  if (self) {
    return createSelfAssignment(req, res, checklistId);
  }

  if (req.user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

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

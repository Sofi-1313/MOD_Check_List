const express = require("express");
const db = require("../db");
const { authRequired, adminOnly } = require("../middleware/auth");

const router = express.Router();

router.get("/", authRequired, (req, res) => {
  const reports = db.prepare(`
    SELECT
      r.id,
      r.assignment_id,
      r.completed_by_user_id,
      r.completed_at,
      r.status,
      a.assignment_type as assignmentType,
      c.title as checklistTitle,
      c.image_path as checklistImagePath,
      u1.name as completedByName,
      u2.name as assignedToName,
      u3.name as assignedByName
    FROM reports r
    JOIN assignments a ON r.assignment_id = a.id
    JOIN checklists c ON a.checklist_id = c.id
    JOIN users u1 ON r.completed_by_user_id = u1.id
    JOIN users u2 ON a.assigned_to_user_id = u2.id
    JOIN users u3 ON a.assigned_by_user_id = u3.id
    ORDER BY r.id DESC
  `).all();

  const reportItemsStmt = db.prepare(`
    SELECT * FROM report_items WHERE report_id = ?
  `);

  const photosStmt = db.prepare(`
    SELECT * FROM report_photos WHERE report_item_id = ?
  `);

  const result = reports.map((report) => {
    const items = reportItemsStmt.all(report.id).map((item) => ({
      ...item,
      photos: photosStmt.all(item.id).map((p) => p.file_path),
    }));

    return {
      ...report,
      items,
    };
  });

  res.json(result);
});

router.post("/", authRequired, (req, res) => {
  const { assignmentId, checklistId, completedByUserId, items = [] } = req.body || {};

  if ((!assignmentId && !checklistId) || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      message: "assignmentId or checklistId and items are required",
    });
  }

  let reportAssignmentId = assignmentId;

  if (!reportAssignmentId) {
    const checklist = db.prepare("SELECT id FROM checklists WHERE id = ?").get(checklistId);

    if (!checklist) {
      return res.status(404).json({ message: "Checklist not found" });
    }

    const assignmentResult = db.prepare(`
      INSERT INTO assignments
        (checklist_id, assigned_to_user_id, assigned_by_user_id, assigned_at, status, assignment_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      checklistId,
      req.user.id,
      req.user.id,
      new Date().toISOString(),
      "completed",
      "self_audit"
    );

    reportAssignmentId = assignmentResult.lastInsertRowid;
  }

  const reportResult = db.prepare(`
    INSERT INTO reports (assignment_id, completed_by_user_id, completed_at, status)
    VALUES (?, ?, ?, ?)
  `).run(
    reportAssignmentId,
    completedByUserId || req.user.id,
    new Date().toISOString(),
    "Completed"
  );

  const reportId = reportResult.lastInsertRowid;

  const insertItem = db.prepare(`
    INSERT INTO report_items (report_id, checklist_item_id, question, answer, answer_type, comment, section_title)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPhoto = db.prepare(`
    INSERT INTO report_photos (report_item_id, file_path)
    VALUES (?, ?)
  `);

  items.forEach((item) => {
    const itemResult = insertItem.run(
      reportId,
      item.itemId,
      item.question,
      item.answer,
      item.answerType || item.answer_type || "FORMAT1",
      item.comment || "",
      item.sectionTitle || ""
    );

    (item.photos || []).forEach((photo) => {
      insertPhoto.run(itemResult.lastInsertRowid, photo);
    });
  });

  db.prepare("UPDATE assignments SET status = ? WHERE id = ?").run("completed", reportAssignmentId);

  res.json({
    success: true,
    reportId,
  });
});

router.delete("/:id", authRequired, adminOnly, (req, res) => {
  const reportId = Number(req.params.id);

  if (!reportId) {
    return res.status(400).json({
      message: "Invalid report id",
    });
  }

  const report = db
    .prepare("SELECT id, assignment_id FROM reports WHERE id = ?")
    .get(reportId);

  if (!report) {
    return res.status(404).json({
      message: "Report not found",
    });
  }

  const reportItems = db
    .prepare("SELECT id FROM report_items WHERE report_id = ?")
    .all(reportId);

  const deletePhotosStmt = db.prepare(
    "DELETE FROM report_photos WHERE report_item_id = ?"
  );

  reportItems.forEach((item) => {
    deletePhotosStmt.run(item.id);
  });

  db.prepare("DELETE FROM report_items WHERE report_id = ?").run(reportId);
  db.prepare("DELETE FROM reports WHERE id = ?").run(reportId);

  db.prepare("UPDATE assignments SET status = ? WHERE id = ?").run(
    "assigned",
    report.assignment_id
  );

  res.json({
    success: true,
  });
});

module.exports = router;

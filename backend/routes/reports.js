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
  const { assignmentId, completedByUserId, items = [] } = req.body || {};

  if (!assignmentId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      message: "assignmentId and items are required",
    });
  }

  const reportResult = db.prepare(`
    INSERT INTO reports (assignment_id, completed_by_user_id, completed_at, status)
    VALUES (?, ?, ?, ?)
  `).run(
    assignmentId,
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

  db.prepare("UPDATE assignments SET status = ? WHERE id = ?").run("completed", assignmentId);

  res.json({
    success: true,
    reportId,
  });
});

router.post("/walkthrough", authRequired, (req, res) => {
  const { title, sections = [] } = req.body || {};

  const cleanTitle = String(title || "").trim();
  const cleanSections = Array.isArray(sections)
    ? sections
        .map((section) => ({
          title: String(section.title || "").trim(),
          items: Array.isArray(section.items) ? section.items : [],
        }))
        .filter((section) => section.title && section.items.length > 0)
    : [];

  if (!cleanTitle || cleanSections.length === 0) {
    return res.status(400).json({
      message: "Title and at least one section are required",
    });
  }

  const createWalkthroughReport = db.transaction(() => {
    const checklistResult = db
      .prepare(
        "INSERT INTO checklists (title, image_path, created_at, is_walkthrough) VALUES (?, ?, ?, ?)"
      )
      .run(cleanTitle, "", new Date().toISOString(), 1);

    const checklistId = checklistResult.lastInsertRowid;

    const assignmentResult = db
      .prepare(
        `INSERT INTO assignments (checklist_id, assigned_to_user_id, assigned_by_user_id, assigned_at, status)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(checklistId, req.user.id, req.user.id, new Date().toISOString(), "completed");

    const assignmentId = assignmentResult.lastInsertRowid;

    const reportResult = db
      .prepare(
        `INSERT INTO reports (assignment_id, completed_by_user_id, completed_at, status)
         VALUES (?, ?, ?, ?)`
      )
      .run(assignmentId, req.user.id, new Date().toISOString(), "Completed");

    const reportId = reportResult.lastInsertRowid;

    const insertSection = db.prepare(`
      INSERT INTO checklist_sections (checklist_id, title, sort_order)
      VALUES (?, ?, ?)
    `);

    const insertChecklistItem = db.prepare(`
      INSERT INTO checklist_items (checklist_id, section_id, question, answer_type, options_json, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertReportItem = db.prepare(`
      INSERT INTO report_items (report_id, checklist_item_id, question, answer, answer_type, comment, section_title)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertPhoto = db.prepare(`
      INSERT INTO report_photos (report_item_id, file_path)
      VALUES (?, ?)
    `);

    cleanSections.forEach((section, sectionIndex) => {
      const sectionResult = insertSection.run(checklistId, section.title, sectionIndex + 1);
      const sectionId = sectionResult.lastInsertRowid;

      section.items
        .map((item) => ({
          question: String(item.question || "").trim(),
          answerType: String(item.answerType || item.answer_type || "FORMAT1"),
          options: Array.isArray(item.options) ? item.options : [],
          answer: String(item.answer || "").trim(),
          comment: String(item.comment || "").trim(),
          photos: Array.isArray(item.photos) ? item.photos : [],
        }))
        .filter((item) => item.question)
        .forEach((item, itemIndex) => {
          const checklistItemResult = insertChecklistItem.run(
            checklistId,
            sectionId,
            item.question,
            item.answerType,
            JSON.stringify(item.options),
            itemIndex + 1
          );

          const reportItemResult = insertReportItem.run(
            reportId,
            checklistItemResult.lastInsertRowid,
            item.question,
            item.answer,
            item.answerType,
            item.comment,
            section.title
          );

          item.photos.forEach((photo) => {
            insertPhoto.run(reportItemResult.lastInsertRowid, photo);
          });
        });
    });

    return { reportId };
  });

  const result = createWalkthroughReport();
  res.json({ success: true, reportId: result.reportId });
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

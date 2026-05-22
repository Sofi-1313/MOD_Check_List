const express = require("express");
const db = require("../db");
const { authRequired, adminOnly } = require("../middleware/auth");

const router = express.Router();

const ANSWER_TYPES = new Set(["FORMAT1", "DATE", "TEXT", "MULTIPLE_CHOICE", "RADIO_BUTTON"]);

function normalizeChecklistItem(item) {
  const question = String(item?.question || "").trim();
  const answerType = ANSWER_TYPES.has(item?.answerType)
    ? item.answerType
    : ANSWER_TYPES.has(item?.answer_type)
      ? item.answer_type
      : "FORMAT1";
  const options = Array.isArray(item?.options)
    ? item.options.map((option) => String(option || "").trim()).filter(Boolean)
    : [];

  return {
    question,
    answerType,
    options: ["MULTIPLE_CHOICE", "RADIO_BUTTON"].includes(answerType) ? options : [],
  };
}

function mapDbItem(item) {
  let options = [];
  try {
    options = item.options_json ? JSON.parse(item.options_json) : [];
  } catch {
    options = [];
  }

  return {
    ...item,
    answerType: item.answer_type || "FORMAT1",
    options,
  };
}

router.get("/", authRequired, (req, res) => {
  const checklists = db
    .prepare("SELECT * FROM checklists WHERE COALESCE(is_walkthrough, 0) = 0 ORDER BY id DESC")
    .all();

  const sectionStmt = db.prepare(`
    SELECT * FROM checklist_sections
    WHERE checklist_id = ?
    ORDER BY sort_order
  `);

  const itemStmt = db.prepare(`
    SELECT * FROM checklist_items
    WHERE checklist_id = ? AND section_id = ?
    ORDER BY sort_order
  `);

  const result = checklists.map((checklist) => {
    const sections = sectionStmt.all(checklist.id).map((section) => ({
      ...section,
      items: itemStmt.all(checklist.id, section.id).map(mapDbItem),
    }));

    return {
      ...checklist,
      sections,
    };
  });

  res.json(result);
});

router.post("/", authRequired, adminOnly, (req, res) => {
  const { title, imagePath = "", sections = [] } = req.body || {};

  if (!title || !Array.isArray(sections) || sections.length === 0) {
    return res.status(400).json({
      message: "Title and sections are required",
    });
  }

  const validSections = sections
    .map((section) => ({
      title: String(section.title || "").trim(),
      items: Array.isArray(section.items) ? section.items : [],
    }))
    .filter((section) => section.title && section.items.length > 0);

  if (validSections.length === 0) {
    return res.status(400).json({
      message: "At least one valid section with questions is required",
    });
  }

  const checklistResult = db
    .prepare("INSERT INTO checklists (title, image_path, created_at) VALUES (?, ?, ?)")
    .run(String(title).trim(), String(imagePath || "").trim(), new Date().toISOString());

  const checklistId = checklistResult.lastInsertRowid;

  const insertSection = db.prepare(`
    INSERT INTO checklist_sections (checklist_id, title, sort_order)
    VALUES (?, ?, ?)
  `);

  const insertItem = db.prepare(`
    INSERT INTO checklist_items (checklist_id, section_id, question, answer_type, options_json, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  validSections.forEach((section, sectionIndex) => {
    const sectionResult = insertSection.run(
      checklistId,
      section.title,
      sectionIndex + 1
    );

    const sectionId = sectionResult.lastInsertRowid;

    section.items
      .map(normalizeChecklistItem)
      .filter((item) => item.question)
      .forEach((item, itemIndex) => {
        insertItem.run(
          checklistId,
          sectionId,
          item.question,
          item.answerType,
          JSON.stringify(item.options),
          itemIndex + 1
        );
      });
  });

  res.json({
    success: true,
    checklistId,
  });
});

router.put("/:id", authRequired, adminOnly, (req, res) => {
  const checklistId = Number(req.params.id);
  const { title, imagePath = "", sections = [] } = req.body || {};

  if (!checklistId || !title || !Array.isArray(sections)) {
    return res.status(400).json({
      message: "Invalid data",
    });
  }

  const checklist = db
    .prepare("SELECT id FROM checklists WHERE id = ?")
    .get(checklistId);

  if (!checklist) {
    return res.status(404).json({
      message: "Checklist not found",
    });
  }

  const validSections = sections
    .map((section) => ({
      title: String(section.title || "").trim(),
      items: Array.isArray(section.items) ? section.items : [],
    }))
    .filter((section) => section.title && section.items.length > 0);

  if (validSections.length === 0) {
    return res.status(400).json({
      message: "At least one valid section is required",
    });
  }

  db.prepare("UPDATE checklists SET title = ?, image_path = ? WHERE id = ?").run(
    String(title).trim(),
    String(imagePath || "").trim(),
    checklistId
  );

  db.prepare("DELETE FROM checklist_items WHERE checklist_id = ?").run(checklistId);
  db.prepare("DELETE FROM checklist_sections WHERE checklist_id = ?").run(checklistId);

  const insertSection = db.prepare(`
    INSERT INTO checklist_sections (checklist_id, title, sort_order)
    VALUES (?, ?, ?)
  `);

  const insertItem = db.prepare(`
    INSERT INTO checklist_items (checklist_id, section_id, question, answer_type, options_json, sort_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  validSections.forEach((section, sectionIndex) => {
    const sectionResult = insertSection.run(
      checklistId,
      section.title,
      sectionIndex + 1
    );

    const sectionId = sectionResult.lastInsertRowid;

    section.items
      .map(normalizeChecklistItem)
      .filter((item) => item.question)
      .forEach((item, itemIndex) => {
        insertItem.run(
          checklistId,
          sectionId,
          item.question,
          item.answerType,
          JSON.stringify(item.options),
          itemIndex + 1
        );
      });
  });

  res.json({
    success: true,
  });
});

router.delete("/:id", authRequired, adminOnly, (req, res) => {
  const checklistId = Number(req.params.id);
  const forceDelete = String(req.query.force || "").toLowerCase() === "true";

  if (!checklistId) {
    return res.status(400).json({
      message: "Invalid checklist id",
    });
  }

  const checklist = db
    .prepare("SELECT id, title FROM checklists WHERE id = ?")
    .get(checklistId);

  if (!checklist) {
    return res.status(404).json({
      message: "Checklist not found",
    });
  }

  const assignmentCount = db
    .prepare("SELECT COUNT(*) as count FROM assignments WHERE checklist_id = ?")
    .get(checklistId).count;

  if (assignmentCount > 0 && !forceDelete) {
    return res.status(400).json({
      message:
        "This template cannot be deleted because assignments or reports are linked to it. Delete related completed reports first.",
    });
  }

  if (forceDelete) {
    const assignmentIds = db
      .prepare("SELECT id FROM assignments WHERE checklist_id = ?")
      .all(checklistId)
      .map((row) => row.id);

    const forceDeleteChecklist = db.transaction(() => {
      if (assignmentIds.length > 0) {
        const reportIds = db
          .prepare(
            `SELECT id FROM reports WHERE assignment_id IN (${assignmentIds
              .map(() => "?")
              .join(",")})`
          )
          .all(...assignmentIds)
          .map((row) => row.id);

        if (reportIds.length > 0) {
          const reportItemIds = db
            .prepare(
              `SELECT id FROM report_items WHERE report_id IN (${reportIds
                .map(() => "?")
                .join(",")})`
            )
            .all(...reportIds)
            .map((row) => row.id);

          if (reportItemIds.length > 0) {
            db.prepare(
              `DELETE FROM report_photos WHERE report_item_id IN (${reportItemIds
                .map(() => "?")
                .join(",")})`
            ).run(...reportItemIds);
          }

          db.prepare(
            `DELETE FROM report_items WHERE report_id IN (${reportIds
              .map(() => "?")
              .join(",")})`
          ).run(...reportIds);

          db.prepare(
            `DELETE FROM reports WHERE id IN (${reportIds.map(() => "?").join(",")})`
          ).run(...reportIds);
        }

        db.prepare(
          `DELETE FROM assignments WHERE id IN (${assignmentIds
            .map(() => "?")
            .join(",")})`
        ).run(...assignmentIds);
      }

      db.prepare("DELETE FROM checklist_items WHERE checklist_id = ?").run(checklistId);
      db.prepare("DELETE FROM checklist_sections WHERE checklist_id = ?").run(checklistId);
      db.prepare("DELETE FROM checklists WHERE id = ?").run(checklistId);
    });

    forceDeleteChecklist();

    return res.json({
      success: true,
      forced: true,
    });
  }

  db.prepare("DELETE FROM checklist_items WHERE checklist_id = ?").run(checklistId);
  db.prepare("DELETE FROM checklist_sections WHERE checklist_id = ?").run(checklistId);
  db.prepare("DELETE FROM checklists WHERE id = ?").run(checklistId);

  res.json({
    success: true,
  });
});

module.exports = router;

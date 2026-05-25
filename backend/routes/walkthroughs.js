const express = require("express");
const db = require("../db");
const { authRequired } = require("../middleware/auth");

const router = express.Router();

function mapWalkthrough(row) {
  const items = db
    .prepare(
      `
      SELECT id, row_type as rowType, section_title as sectionTitle, comment, sort_order as sortOrder
      FROM walkthrough_items
      WHERE walkthrough_report_id = ?
      ORDER BY sort_order ASC, id ASC
    `
    )
    .all(row.id);

  const photosStmt = db.prepare(
    "SELECT file_path FROM walkthrough_photos WHERE walkthrough_item_id = ? ORDER BY id ASC"
  );

  return {
    ...row,
    items: items.map((item) => ({
      ...item,
      photos: photosStmt.all(item.id).map((photo) => photo.file_path),
    })),
  };
}

router.get("/", authRequired, (_, res) => {
  const rows = db
    .prepare(
      `
      SELECT
        wr.id,
        wr.title,
        wr.created_by_user_id as createdByUserId,
        wr.created_at as createdAt,
        wr.status,
        u.name as createdByName
      FROM walkthrough_reports wr
      JOIN users u ON wr.created_by_user_id = u.id
      ORDER BY wr.id DESC
    `
    )
    .all();

  res.json(rows.map(mapWalkthrough));
});

router.post("/", authRequired, (req, res) => {
  const { title, items = [] } = req.body || {};
  const validItems = Array.isArray(items)
    ? items.filter((item) => {
        if (item.rowType === "section") return String(item.sectionTitle || "").trim();
        return item.rowType === "comment" && String(item.comment || "").trim();
      })
    : [];

  if (!String(title || "").trim() || validItems.length === 0) {
    return res.status(400).json({
      message: "title and at least one section or comment are required",
    });
  }

  const insertReport = db.prepare(
    `
    INSERT INTO walkthrough_reports (title, created_by_user_id, created_at, status)
    VALUES (?, ?, ?, ?)
  `
  );
  const insertItem = db.prepare(
    `
    INSERT INTO walkthrough_items
      (walkthrough_report_id, row_type, section_title, comment, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `
  );
  const insertPhoto = db.prepare(
    "INSERT INTO walkthrough_photos (walkthrough_item_id, file_path) VALUES (?, ?)"
  );

  const createWalkthrough = db.transaction(() => {
    const reportResult = insertReport.run(
      String(title).trim(),
      req.user.id,
      new Date().toISOString(),
      "Completed"
    );

    validItems.forEach((item, index) => {
      const itemResult = insertItem.run(
        reportResult.lastInsertRowid,
        item.rowType === "section" ? "section" : "comment",
        item.rowType === "section" ? String(item.sectionTitle || "").trim() : "",
        item.rowType === "comment" ? String(item.comment || "").trim() : "",
        index
      );

      if (item.rowType === "comment") {
        (item.photos || []).forEach((photo) => insertPhoto.run(itemResult.lastInsertRowid, photo));
      }
    });

    return reportResult.lastInsertRowid;
  });

  const reportId = createWalkthrough();

  res.json({
    success: true,
    reportId,
  });
});

module.exports = router;

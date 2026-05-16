const express = require("express");
const db = require("../db");
const { authRequired, adminOnly } = require("../middleware/auth");

const router = express.Router();

router.get("/", authRequired, adminOnly, (req, res) => {
  const users = db
    .prepare(
      `
      SELECT
        id,
        username,
        password,
        name,
        role,
        active,
        approval_status AS approvalStatus,
        created_at
      FROM users
      ORDER BY
        CASE approval_status WHEN 'pending' THEN 0 ELSE 1 END,
        id
    `
    )
    .all();

  res.json(users);
});

router.post("/", authRequired, adminOnly, (req, res) => {
  const { username, password, name, role } = req.body || {};

  if (!username || !password || !name || !role) {
    return res.status(400).json({
      message: "username, password, name and role are required",
    });
  }

  if (role !== "admin" && role !== "user") {
    return res.status(400).json({
      message: "role must be admin or user",
    });
  }

  const existingUser = db
    .prepare("SELECT id FROM users WHERE username = ?")
    .get(username.trim());

  if (existingUser) {
    return res.status(400).json({
      message: "Username already exists",
    });
  }

  const result = db
    .prepare(
      `
      INSERT INTO users (username, password, name, role, active, approval_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
    )
    .run(
      username.trim(),
      password,
      name.trim(),
      role,
      1,
      "approved",
      new Date().toISOString()
    );

  res.json({
    success: true,
    userId: result.lastInsertRowid,
  });
});

router.put("/:id", authRequired, adminOnly, (req, res) => {
  const userId = Number(req.params.id);
  const { username, password, name, role, active, approvalStatus } = req.body || {};

  if (!userId) {
    return res.status(400).json({
      message: "Invalid user id",
    });
  }

  const existingUser = db
    .prepare(
      `
      SELECT id, username, password, name, role, active, approval_status
      FROM users
      WHERE id = ?
    `
    )
    .get(userId);

  if (!existingUser) {
    return res.status(404).json({
      message: "User not found",
    });
  }

  const nextUsername =
    typeof username === "string" ? username.trim() : existingUser.username;
  const nextName = typeof name === "string" ? name.trim() : existingUser.name;
  const nextRole = role || existingUser.role;
  const nextActive =
    typeof active === "boolean" ? (active ? 1 : 0) : Number(existingUser.active);
  const nextApprovalStatus = approvalStatus || existingUser.approval_status;

  if (!nextUsername || !nextName) {
    return res.status(400).json({
      message: "username and name are required",
    });
  }

  if (nextRole !== "admin" && nextRole !== "user") {
    return res.status(400).json({
      message: "role must be admin or user",
    });
  }

  if (
    nextApprovalStatus !== "pending" &&
    nextApprovalStatus !== "approved" &&
    nextApprovalStatus !== "rejected"
  ) {
    return res.status(400).json({
      message: "approvalStatus must be pending, approved or rejected",
    });
  }

  const duplicateUser = db
    .prepare("SELECT id FROM users WHERE username = ? AND id != ?")
    .get(nextUsername, userId);

  if (duplicateUser) {
    return res.status(400).json({
      message: "Username already exists",
    });
  }

  if (typeof password === "string" && password.trim()) {
    db.prepare(
      `
      UPDATE users
      SET username = ?, password = ?, name = ?, role = ?, active = ?, approval_status = ?
      WHERE id = ?
    `
    ).run(
      nextUsername,
      password,
      nextName,
      nextRole,
      nextActive,
      nextApprovalStatus,
      userId
    );
  } else {
    db.prepare(
      `
      UPDATE users
      SET username = ?, name = ?, role = ?, active = ?, approval_status = ?
      WHERE id = ?
    `
    ).run(nextUsername, nextName, nextRole, nextActive, nextApprovalStatus, userId);
  }

  const updatedUser = db
    .prepare(
      `
      SELECT
        id,
        username,
        password,
        name,
        role,
        active,
        approval_status AS approvalStatus,
        created_at
      FROM users
      WHERE id = ?
    `
    )
    .get(userId);

  res.json({
    success: true,
    user: updatedUser,
  });
});

router.delete("/:id", authRequired, adminOnly, (req, res) => {
  const userId = Number(req.params.id);

  if (!userId) {
    return res.status(400).json({
      message: "Invalid user id",
    });
  }

  if (req.user && Number(req.user.id) === userId) {
    return res.status(400).json({
      message: "You cannot delete your own account",
    });
  }

  const user = db
    .prepare("SELECT id, username, name, role FROM users WHERE id = ?")
    .get(userId);

  if (!user) {
    return res.status(404).json({
      message: "User not found",
    });
  }

  const deleteUserWithRelations = db.transaction(() => {
    const assignmentIds = db
      .prepare(
        `
        SELECT id
        FROM assignments
        WHERE assigned_to_user_id = ?
           OR assigned_by_user_id = ?
      `
      )
      .all(userId, userId)
      .map((row) => row.id);

    const reportIdSet = new Set(
      db
        .prepare(
          `
          SELECT id
          FROM reports
          WHERE completed_by_user_id = ?
        `
        )
        .all(userId)
        .map((row) => row.id)
    );

    if (assignmentIds.length > 0) {
      const linkedReportIds = db
        .prepare(
          `
          SELECT id
          FROM reports
          WHERE assignment_id IN (${assignmentIds.map(() => "?").join(",")})
        `
        )
        .all(...assignmentIds)
        .map((row) => row.id);

      linkedReportIds.forEach((reportId) => reportIdSet.add(reportId));
    }

    const reportIds = Array.from(reportIdSet);

    if (reportIds.length > 0) {
      const reportItemIds = db
        .prepare(
          `
          SELECT id
          FROM report_items
          WHERE report_id IN (${reportIds.map(() => "?").join(",")})
        `
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

    if (assignmentIds.length > 0) {
      db.prepare(
        `DELETE FROM draft_reports WHERE assignment_id IN (${assignmentIds
          .map(() => "?")
          .join(",")})`
      ).run(...assignmentIds);

      db.prepare(
        `DELETE FROM assignments WHERE id IN (${assignmentIds.map(() => "?").join(",")})`
      ).run(...assignmentIds);
    }

    db.prepare("DELETE FROM draft_reports WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);

    return {
      deletedAssignments: assignmentIds.length,
      deletedReports: reportIds.length,
    };
  });

  const result = deleteUserWithRelations();

  res.json({
    success: true,
    ...result,
  });
});

module.exports = router;

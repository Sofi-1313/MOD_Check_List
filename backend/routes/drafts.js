const express = require("express");

const db = require("../db");

const { authRequired } = require("../middleware/auth");

 

const router = express.Router();

 

function getAssignmentForUser(assignmentId, userId, role) {

  if (role === "admin") {

    return db

      .prepare("SELECT id, status FROM assignments WHERE id = ?")

      .get(assignmentId);

  }

 

  return db

    .prepare(

      "SELECT id, status FROM assignments WHERE id = ? AND assigned_to_user_id = ?"

    )

    .get(assignmentId, userId);

}

 

router.get("/:assignmentId", authRequired, (req, res) => {

  const assignmentId = Number(req.params.assignmentId);

 

  if (!assignmentId) {

    return res.status(400).json({ message: "Invalid assignment id" });

  }

 

  const assignment = getAssignmentForUser(

    assignmentId,

    req.user.id,

    req.user.role

  );

 

  if (!assignment) {

    return res.status(404).json({ message: "Assignment not found" });

  }

 

  const draft = db

    .prepare(

      `

      SELECT assignment_id, user_id, form_json, updated_at

      FROM draft_reports

      WHERE assignment_id = ? AND user_id = ?

    `

    )

    .get(assignmentId, req.user.id);

 

  if (!draft) {

    return res.json({ draft: null });

  }

 

  let form = {};

 

  try {

    form = JSON.parse(draft.form_json || "{}");

  } catch {

    form = {};

  }

 

  return res.json({

    draft: {

      assignmentId: draft.assignment_id,

      userId: draft.user_id,

      form,

      updatedAt: draft.updated_at,

    },

  });

});

 

router.put("/:assignmentId", authRequired, (req, res) => {

  const assignmentId = Number(req.params.assignmentId);

  const { form = {} } = req.body || {};

 

  if (!assignmentId) {

    return res.status(400).json({ message: "Invalid assignment id" });

  }

 

  if (!form || typeof form !== "object" || Array.isArray(form)) {

    return res.status(400).json({ message: "form must be an object" });

  }

 

  const assignment = getAssignmentForUser(

    assignmentId,

    req.user.id,

    req.user.role

  );

 

  if (!assignment) {

    return res.status(404).json({ message: "Assignment not found" });

  }

 

  if (assignment.status !== "assigned") {

    return res.status(400).json({ message: "Only assigned checklists can be saved" });

  }

 

  const updatedAt = new Date().toISOString();

 

  db.prepare(

    `

    INSERT INTO draft_reports (assignment_id, user_id, form_json, updated_at)

    VALUES (?, ?, ?, ?)

    ON CONFLICT(assignment_id, user_id)

    DO UPDATE SET

      form_json = excluded.form_json,

      updated_at = excluded.updated_at

  `

  ).run(assignmentId, req.user.id, JSON.stringify(form), updatedAt);

 

  return res.json({

    success: true,

    updatedAt,

  });

});

 

router.delete("/:assignmentId", authRequired, (req, res) => {

  const assignmentId = Number(req.params.assignmentId);

 

  if (!assignmentId) {

    return res.status(400).json({ message: "Invalid assignment id" });

  }

 

  db.prepare(

    "DELETE FROM draft_reports WHERE assignment_id = ? AND user_id = ?"

  ).run(assignmentId, req.user.id);

 

  return res.json({ success: true });

});

 

module.exports = router;
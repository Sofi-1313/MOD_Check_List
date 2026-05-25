const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const { dataDir } = require("./storagePaths");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, "mod_checklist.db");
console.log(`Using SQLite database at ${dbPath}`);
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  approval_status TEXT NOT NULL DEFAULT 'approved',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  token TEXT UNIQUE NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS checklists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checklist_id INTEGER NOT NULL,
  assigned_to_user_id INTEGER NOT NULL,
  assigned_by_user_id INTEGER NOT NULL,
  assigned_at TEXT NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (checklist_id) REFERENCES checklists(id),
  FOREIGN KEY (assigned_to_user_id) REFERENCES users(id),
  FOREIGN KEY (assigned_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL,
  completed_by_user_id INTEGER NOT NULL,
  completed_at TEXT NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (assignment_id) REFERENCES assignments(id),
  FOREIGN KEY (completed_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS report_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_item_id INTEGER NOT NULL,
  file_path TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS draft_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  form_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (assignment_id, user_id),
  FOREIGN KEY (assignment_id) REFERENCES assignments(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS walkthrough_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS walkthrough_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  walkthrough_report_id INTEGER NOT NULL,
  row_type TEXT NOT NULL,
  section_title TEXT,
  comment TEXT,
  sort_order INTEGER NOT NULL,
  FOREIGN KEY (walkthrough_report_id) REFERENCES walkthrough_reports(id)
);

CREATE TABLE IF NOT EXISTS walkthrough_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  walkthrough_item_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  FOREIGN KEY (walkthrough_item_id) REFERENCES walkthrough_items(id)
);
`);

/**
 * Base table for checklist sections
 */
db.exec(`
CREATE TABLE IF NOT EXISTS checklist_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checklist_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  FOREIGN KEY (checklist_id) REFERENCES checklists(id)
);
`);

/**
 * checklist_items:
 * Older versions may not have section_id.
 * We create a compatible version if table does not exist,
 * otherwise migrate by adding missing column when possible.
 */
const checklistItemsExists = db
  .prepare(
    `
    SELECT name
    FROM sqlite_master
    WHERE type='table' AND name='checklist_items'
  `
  )
  .get();

if (!checklistItemsExists) {
  db.exec(`
    CREATE TABLE checklist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      checklist_id INTEGER NOT NULL,
      section_id INTEGER,
      question TEXT NOT NULL,
      answer_type TEXT NOT NULL DEFAULT 'FORMAT1',
      options_json TEXT,
      sort_order INTEGER NOT NULL,
      FOREIGN KEY (checklist_id) REFERENCES checklists(id),
      FOREIGN KEY (section_id) REFERENCES checklist_sections(id)
    );
  `);
} else {
  const itemColumns = db.prepare(`PRAGMA table_info(checklist_items)`).all();
  const hasSectionId = itemColumns.some((c) => c.name === "section_id");
  const hasAnswerType = itemColumns.some((c) => c.name === "answer_type");
  const hasOptionsJson = itemColumns.some((c) => c.name === "options_json");

  if (!hasSectionId) {
    db.exec(`ALTER TABLE checklist_items ADD COLUMN section_id INTEGER;`);
  }

  if (!hasAnswerType) {
    db.exec(`ALTER TABLE checklist_items ADD COLUMN answer_type TEXT NOT NULL DEFAULT 'FORMAT1';`);
  }

  if (!hasOptionsJson) {
    db.exec(`ALTER TABLE checklist_items ADD COLUMN options_json TEXT;`);
  }
}

/**
 * report_items:
 * Older versions may not have section_title.
 */
const reportItemsExists = db
  .prepare(
    `
    SELECT name
    FROM sqlite_master
    WHERE type='table' AND name='report_items'
  `
  )
  .get();

if (!reportItemsExists) {
  db.exec(`
    CREATE TABLE report_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      report_id INTEGER NOT NULL,
      checklist_item_id INTEGER NOT NULL,
      question TEXT NOT NULL,
      answer TEXT,
      answer_type TEXT NOT NULL DEFAULT 'FORMAT1',
      comment TEXT,
      section_title TEXT,
      FOREIGN KEY (report_id) REFERENCES reports(id)
    );
  `);
} else {
  const reportColumns = db.prepare(`PRAGMA table_info(report_items)`).all();
  const hasSectionTitle = reportColumns.some((c) => c.name === "section_title");
  const hasAnswerType = reportColumns.some((c) => c.name === "answer_type");

  if (!hasSectionTitle) {
    db.exec(`ALTER TABLE report_items ADD COLUMN section_title TEXT;`);
  }

  if (!hasAnswerType) {
    db.exec(`ALTER TABLE report_items ADD COLUMN answer_type TEXT NOT NULL DEFAULT 'FORMAT1';`);
  }
}

/**
 * Seed users only once
 */
const userCount = db.prepare("SELECT COUNT(*) as count FROM users").get().count;

if (userCount === 0) {
  const insert = db.prepare(
    `
    INSERT INTO users (username, password, name, role, active, approval_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  );
  const now = new Date().toISOString();
  insert.run("admin", "1234", "Bozkurt", "admin", 1, "approved", now);
  insert.run("user1", "1234", "Ahmet", "user", 1, "approved", now);
  insert.run("user2", "1234", "Mehmet", "user", 1, "approved", now);
}

const userColumns = db.prepare(`PRAGMA table_info(users)`).all();
const hasActiveColumn = userColumns.some((column) => column.name === "active");
const hasApprovalStatusColumn = userColumns.some(
  (column) => column.name === "approval_status"
);
const hasCreatedAtColumn = userColumns.some((column) => column.name === "created_at");

if (!hasActiveColumn) {
  db.exec(`ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;`);
}

if (!hasApprovalStatusColumn) {
  db.exec(
    `ALTER TABLE users ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';`
  );
}

if (!hasCreatedAtColumn) {
  db.exec(`ALTER TABLE users ADD COLUMN created_at TEXT;`);
}

const migrationNow = new Date().toISOString();

db.prepare(
  `
  UPDATE users
  SET active = COALESCE(active, 1),
      approval_status = COALESCE(approval_status, 'approved'),
      created_at = COALESCE(created_at, ?)
`
).run(migrationNow);

const checklistColumns = db.prepare(`PRAGMA table_info(checklists)`).all();
const hasChecklistImagePath = checklistColumns.some(
  (column) => column.name === "image_path"
);

if (!hasChecklistImagePath) {
  db.exec(`ALTER TABLE checklists ADD COLUMN image_path TEXT;`);
}

module.exports = db;

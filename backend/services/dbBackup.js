const fs = require("fs");
const path = require("path");
const { dataDir } = require("../storagePaths");

const backupDir = path.join(dataDir, "backups");
const MAX_BACKUPS = 30;

function ensureBackupDir() {
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
}

function safeReason(reason) {
  return String(reason || "backup")
    .replace(/[^a-z0-9_-]+/gi, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "backup";
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function cleanupOldBackups() {
  ensureBackupDir();

  const backups = fs
    .readdirSync(backupDir)
    .filter((file) => file.endsWith(".db"))
    .map((file) => {
      const fullPath = path.join(backupDir, file);
      return {
        file,
        fullPath,
        modified: fs.statSync(fullPath).mtimeMs,
      };
    })
    .sort((a, b) => b.modified - a.modified);

  backups.slice(MAX_BACKUPS).forEach((backup) => {
    fs.unlinkSync(backup.fullPath);
  });
}

function createDbBackup(db, reason = "backup") {
  ensureBackupDir();

  const backupPath = path.join(
    backupDir,
    `mod_checklist_${timestamp()}_${safeReason(reason)}.db`
  );

  try {
    db.pragma("wal_checkpoint(FULL)");
  } catch {
    db.pragma("wal_checkpoint(PASSIVE)");
  }

  fs.copyFileSync(db.name, backupPath);
  cleanupOldBackups();

  return backupPath;
}

module.exports = {
  backupDir,
  createDbBackup,
};

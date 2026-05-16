const fs = require("fs");
const path = require("path");
const db = require("../db");

const DEFAULT_RETENTION_DAYS = 30;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const uploadDir = path.join(__dirname, "..", "uploads");

function getRetentionDays() {
  const configuredDays = Number(process.env.UPLOAD_RETENTION_DAYS);
  return Number.isFinite(configuredDays) && configuredDays > 0
    ? configuredDays
    : DEFAULT_RETENTION_DAYS;
}

function getUploadFileName(filePath) {
  if (!filePath || typeof filePath !== "string") return "";

  const normalized = filePath.replace(/\\/g, "/");
  const marker = "/uploads/";
  const markerIndex = normalized.indexOf(marker);

  if (markerIndex >= 0) {
    return path.basename(normalized.slice(markerIndex + marker.length));
  }

  if (normalized.startsWith("uploads/")) {
    return path.basename(normalized.slice("uploads/".length));
  }

  return "";
}

function getProtectedTemplateImages() {
  const rows = db
    .prepare("SELECT image_path FROM checklists WHERE image_path IS NOT NULL AND image_path != ''")
    .all();

  return new Set(rows.map((row) => getUploadFileName(row.image_path)).filter(Boolean));
}

function removePhotoFromDrafts(fileName) {
  const rows = db.prepare("SELECT id, form_json FROM draft_reports").all();
  const updateDraft = db.prepare("UPDATE draft_reports SET form_json = ?, updated_at = ? WHERE id = ?");
  const uploadPath = `/uploads/${fileName}`;
  let updatedCount = 0;

  rows.forEach((row) => {
    let form;

    try {
      form = JSON.parse(row.form_json || "{}");
    } catch {
      return;
    }

    let changed = false;

    Object.values(form).forEach((item) => {
      if (!item || !Array.isArray(item.photos)) return;

      const nextPhotos = item.photos.filter(
        (photo) => getUploadFileName(photo) !== fileName
      );

      if (nextPhotos.length !== item.photos.length) {
        item.photos = nextPhotos;
        changed = true;
      }
    });

    if (changed) {
      updateDraft.run(JSON.stringify(form), new Date().toISOString(), row.id);
      updatedCount += 1;
    }
  });

  return { uploadPath, updatedCount };
}

function cleanupOldUploads(options = {}) {
  const retentionDays = options.retentionDays || getRetentionDays();

  if (!fs.existsSync(uploadDir)) {
    return {
      removedCount: 0,
      removedBytes: 0,
      retentionDays,
    };
  }

  const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const protectedTemplateImages = getProtectedTemplateImages();
  const deleteReportPhoto = db.prepare(
    "DELETE FROM report_photos WHERE file_path = ? OR file_path = ?"
  );
  const files = fs
    .readdirSync(uploadDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);

  let removedCount = 0;
  let removedBytes = 0;
  let cleanedReportReferences = 0;
  let cleanedDrafts = 0;

  files.forEach((fileName) => {
    if (protectedTemplateImages.has(fileName)) return;

    const filePath = path.join(uploadDir, fileName);
    const resolvedPath = path.resolve(filePath);

    if (!resolvedPath.startsWith(path.resolve(uploadDir) + path.sep)) {
      return;
    }

    const stat = fs.statSync(resolvedPath);
    if (stat.mtimeMs > cutoffTime) return;

    const relativePath = `/uploads/${fileName}`;
    const plainPath = `uploads/${fileName}`;
    const reportResult = deleteReportPhoto.run(relativePath, plainPath);
    const draftResult = removePhotoFromDrafts(fileName);

    fs.unlinkSync(resolvedPath);

    removedCount += 1;
    removedBytes += stat.size;
    cleanedReportReferences += reportResult.changes;
    cleanedDrafts += draftResult.updatedCount;
  });

  return {
    removedCount,
    removedBytes,
    cleanedReportReferences,
    cleanedDrafts,
    retentionDays,
  };
}

function startUploadCleanup() {
  const runCleanup = () => {
    try {
      const result = cleanupOldUploads();

      if (result.removedCount > 0) {
        console.log(
          `Upload cleanup removed ${result.removedCount} files older than ${result.retentionDays} days.`
        );
      }
    } catch (error) {
      console.error("Upload cleanup failed:", error);
    }
  };

  runCleanup();
  return setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}

module.exports = {
  cleanupOldUploads,
  startUploadCleanup,
};

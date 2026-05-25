const path = require("path");
const fs = require("fs");
const os = require("os");

const storageRoot = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : "";

function firstWritablePath(label, candidates) {
  for (const candidate of candidates.filter(Boolean)) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      fs.accessSync(candidate, fs.constants.W_OK);
      return candidate;
    } catch (error) {
      console.warn(
        `${label} directory is not writable: ${candidate}. ${error.message}`
      );
    }
  }

  throw new Error(`No writable ${label} directory found.`);
}

const localDataDir = path.join(__dirname, "data");
const localUploadDir = path.join(__dirname, "uploads");

const dataDir = firstWritablePath("data", [
  process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : "",
  storageRoot,
  localDataDir,
  path.join(os.tmpdir(), "mod-check-list", "data"),
]);

const uploadDir = firstWritablePath("upload", [
  process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : "",
  storageRoot ? path.join(storageRoot, "uploads") : "",
  localUploadDir,
  path.join(os.tmpdir(), "mod-check-list", "uploads"),
]);

module.exports = {
  dataDir,
  uploadDir,
};

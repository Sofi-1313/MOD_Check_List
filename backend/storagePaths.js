const path = require("path");

const storageRoot = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : "";

const dataDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : storageRoot
    ? storageRoot
    : path.join(__dirname, "data");

const uploadDir = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : storageRoot
    ? path.join(storageRoot, "uploads")
    : path.join(__dirname, "uploads");

module.exports = {
  dataDir,
  uploadDir,
};

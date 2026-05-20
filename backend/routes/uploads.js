const express = require("express");
const multer = require("multer");
const fs = require("fs");
const { authRequired } = require("../middleware/auth");
const { uploadDir } = require("../storagePaths");

const router = express.Router();

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`;
    cb(null, safeName);
  },
});

const upload = multer({ storage });

router.post("/", authRequired, upload.array("photos", 10), (req, res) => {
  const files = (req.files || []).map((file) => `/uploads/${file.filename}`);
  res.json({ files });
});

module.exports = router;

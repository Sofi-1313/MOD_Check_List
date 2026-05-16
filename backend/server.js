const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

require("./db");

const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const checklistRoutes = require("./routes/checklists");
const assignmentRoutes = require("./routes/assignments");
const draftRoutes = require("./routes/drafts");
const reportRoutes = require("./routes/reports");
const uploadRoutes = require("./routes/uploads");
const aiActionPlanRoutes = require("./routes/aiActionPlan");
const { startUploadCleanup } = require("./services/uploadCleanup");

const app = express();
const frontendDistPath = path.join(__dirname, "..", "frontend", "dist");
const hasBuiltFrontend = fs.existsSync(path.join(frontendDistPath, "index.html"));
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/", (_, res) => res.json({ ok: true, app: "MOD-Check-List-V1.9.2 backend" }));
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/checklists", checklistRoutes);
app.use("/api/assignments", assignmentRoutes);
app.use("/api/drafts", draftRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/ai", aiActionPlanRoutes);

if (hasBuiltFrontend) {
  app.use(express.static(frontendDistPath));

  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) {
      return next();
    }

    return res.sendFile(path.join(frontendDistPath, "index.html"));
  });
}

startUploadCleanup();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running on http://0.0.0.0:${PORT}`);
});

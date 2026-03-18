// What this does: starts the Express API server and registers all routes
require("dotenv").config({ override: true });
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const authRoutes = require("./routes/auth.routes");
const productRoutes = require("./routes/products.routes");
const stockRoutes = require("./routes/stock.routes");
// What this does: registers all API routes including locations
const locationsRoutes = require("./routes/locations.routes");
const branchesRoutes = require("./routes/branches.routes");
const binsRoutes = require("./routes/bins.routes");
const posRoutes = require("./routes/pos.routes");
// What this does: registers manager reports routes
const reportsRoutes = require("./routes/reports.routes");
// What this does: registers HR module routes
const hrRoutes = require("./routes/hr.routes");
// What this does: registers CEO dashboard endpoints under /api/ceo
const ceoRoutes = require("./routes/ceo.routes");
// What this does: registers Expense endpoints under /api/expenses
const expensesRoutes = require("./routes/expenses.routes");
const salesPrintRoutes = require("./routes/sales.print.routes");
// What this does: registers Manager advanced endpoints under /api/manager
const managerRoutes = require("./routes/manager.routes");
// What this does: registers admin (CEO) user management under /api/admin
const adminUsersRoutes = require("./routes/admin.users.routes");
const authExtraRoutes = require("./routes/auth.extra.routes");
// What this does: registers sales list endpoints under /api/sales
const salesListRoutes = require("./routes/sales.list.routes");
// What this does: registers motorbike promotions endpoints
const motorbikeRoutes = require("./routes/motorbike.routes");
// What this does: registers accounting endpoints (COA, journals, statements)
const accountingRoutes = require("./routes/accounting.routes");
const {
  cleanupOldErrorLogs,
  getErrorLogDirectory,
  writeErrorLog,
} = require("./utils/errorLogger");





const app = express();
cleanupOldErrorLogs();
setInterval(() => cleanupOldErrorLogs(), 12 * 60 * 60 * 1000).unref();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    if (res.statusCode < 400) return;
    if (res.locals?._errorLogged) return;
    writeErrorLog({
      err: new Error(`HTTP ${res.statusCode}`),
      context: "http.response",
      status: res.statusCode,
      req,
      extra: { durationMs: Date.now() - startedAt },
    });
  });
  next();
});


app.use("/api/bins", binsRoutes);
// add this line with the others:
app.use("/api/branches", branchesRoutes);
app.use("/api/locations", locationsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/auth", authExtraRoutes);
app.use("/api/products", productRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/pos", posRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/hr", hrRoutes);
app.use("/api/ceo", ceoRoutes);
app.use("/api/expenses", expensesRoutes);
app.use("/api/sales", salesPrintRoutes);
app.use("/api/sales", salesListRoutes);
app.use("/api/manager", managerRoutes);
app.use("/api/admin", adminUsersRoutes);
app.use("/api/motorbikes", motorbikeRoutes);
app.use("/api/accounting", accountingRoutes);

const frontendDist = path.resolve(__dirname, "../../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    return res.sendFile(path.join(frontendDist, "index.html"));
  });
} else {
  app.get("/", (req, res) => res.send("Altas System API running."));
}

// What this does: catches unhandled Express errors and stores them in daily error logs
app.use((err, req, res, next) => {
  writeErrorLog({
    err,
    context: "express.unhandled",
    status: err?.status || err?.statusCode || 500,
    req,
  });
  console.error("[EXPRESS_UNHANDLED]", err);
  if (res.headersSent) return next(err);
  return res.status(500).json({ message: "Unexpected server error. Please try again." });
});

// What this does: captures unhandled promise rejections at process level into the daily log
process.on("unhandledRejection", (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason || "Unhandled rejection"));
  writeErrorLog({ err, context: "process.unhandledRejection", status: 500 });
  console.error("[UNHANDLED_REJECTION]", reason);
});

// What this does: captures uncaught exceptions at process level into the daily log
process.on("uncaughtException", (err) => {
  writeErrorLog({ err, context: "process.uncaughtException", status: 500 });
  console.error("[UNCAUGHT_EXCEPTION]", err);
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || "0.0.0.0";
app.listen(PORT, HOST, () => {
  const displayHost = HOST === "0.0.0.0" ? "localhost" : HOST;
  console.log(`Server running on http://${displayHost}:${PORT}`);
  console.log(`Daily error logs: ${getErrorLogDirectory()}`);
});


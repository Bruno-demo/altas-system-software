const fs = require("fs");
const path = require("path");

const MAX_READ_LIMIT = 1000;
const DEFAULT_READ_LIMIT = 200;
const DEFAULT_RETENTION_DAYS = 30;

function resolveRetentionDays() {
  const raw = Number(process.env.ERROR_LOG_RETENTION_DAYS || DEFAULT_RETENTION_DAYS);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_RETENTION_DAYS;
  return Math.floor(raw);
}

function resolveRootDir() {
  const custom = process.env.ERROR_LOG_DIR;
  if (custom && String(custom).trim()) {
    const candidate = path.resolve(String(custom).trim());
    try {
      fs.mkdirSync(candidate, { recursive: true });
      fs.accessSync(candidate, fs.constants.W_OK);
      return candidate;
    } catch (err) {
      console.warn(`[ERROR-LOGGER] Falling back from unwritable ERROR_LOG_DIR=${custom}: ${err.message}`);
    }
  }
  return path.resolve(__dirname, "../../logs/errors");
}

function getErrorLogDirectory() {
  return resolveRootDir();
}

function ensureErrorLogDirectory() {
  const dir = getErrorLogDirectory();
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
  } catch (err) {
    // Final safety fallback: use workspace-relative logs path if custom ROOT path is not writable.
    const fallback = path.resolve(__dirname, "../../logs/errors");
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
  return dir;
}

function dateKey(value = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function getLogFilePathByDate(value = new Date()) {
  return path.join(ensureErrorLogDirectory(), `error-${dateKey(value)}.log`);
}

function resolveIp(req) {
  if (!req) return null;
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || null;
}

function buildErrorPayload({ err, context, status, req, extra }) {
  const safeError = err instanceof Error ? err : new Error(String(err || "Unknown error"));
  return {
    timestamp: new Date().toISOString(),
    level: status >= 500 || !status ? "error" : "warn",
    context: context || "app",
    status: status || null,
    method: req?.method || null,
    path: req?.originalUrl || req?.url || null,
    ip: resolveIp(req),
    userId: req?.user?.id || null,
    userRole: req?.user?.role || null,
    name: safeError.name || "Error",
    message: safeError.message || "Unknown error",
    stack: safeError.stack || null,
    extra: extra || null,
  };
}

function appendPayload(payload) {
  const line = `${JSON.stringify(payload)}\n`;
  const filePath = getLogFilePathByDate(payload.timestamp);
  fs.appendFile(filePath, line, (writeErr) => {
    if (writeErr) {
      console.error("[ERROR-LOGGER]", writeErr);
    }
  });
}

function writeErrorLog({ err, context, status, req, extra } = {}) {
  try {
    const payload = buildErrorPayload({ err, context, status, req, extra });
    appendPayload(payload);
    return payload;
  } catch (loggerErr) {
    console.error("[ERROR-LOGGER]", loggerErr);
    return null;
  }
}

function cleanupOldErrorLogs(retentionDays = resolveRetentionDays()) {
  try {
    const dir = ensureErrorLogDirectory();
    const cutoff = Date.now() - Number(retentionDays) * 24 * 60 * 60 * 1000;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (!/^error-\d{4}-\d{2}-\d{2}\.log$/.test(file)) continue;
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(fullPath);
      }
    }
  } catch (loggerErr) {
    console.error("[ERROR-LOGGER]", loggerErr);
  }
}

function clampLimit(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_READ_LIMIT;
  return Math.min(Math.floor(n), MAX_READ_LIMIT);
}

function readErrorLog({ date, limit } = {}) {
  const safeDate = date ? dateKey(date) : dateKey();
  const filePath = getLogFilePathByDate(safeDate);
  const safeLimit = clampLimit(limit);
  if (!fs.existsSync(filePath)) {
    return { date: safeDate, filePath, rows: [] };
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const tail = lines.slice(-safeLimit);
  const rows = tail.map((line) => {
    try {
      return JSON.parse(line);
    } catch (_err) {
      return { timestamp: null, level: "error", context: "logger-parse", message: line };
    }
  });

  return { date: safeDate, filePath, rows };
}

module.exports = {
  cleanupOldErrorLogs,
  getErrorLogDirectory,
  readErrorLog,
  writeErrorLog,
};

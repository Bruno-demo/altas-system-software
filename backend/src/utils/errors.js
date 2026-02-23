const { Prisma } = require("@prisma/client");
const { writeErrorLog } = require("./errorLogger");

const UNIQUE_FIELD_MESSAGES = {
  email: "Email already exists.",
  employeeCode: "Employee code already exists.",
  nationalId: "National ID already exists.",
  tin: "TIN already exists.",
  sku: "SKU already exists.",
  partNumber: "Part number already exists.",
  chassisNumber: "Chassis number already exists.",
  name: "Name already exists.",
  code: "Code already exists.",
  invoiceNo: "Invoice number already exists.",
  sdcId: "This SDC ID already has the same item.",
};

function logError(err, context, metadata = {}) {
  const prefix = context ? `[${context}]` : "[ERROR]";
  console.error(prefix, err);
  writeErrorLog({
    err,
    context: context || "handleError",
    status: metadata.status,
    req: metadata.req,
    extra: metadata.extra,
  });
}

function uniqueMessage(target) {
  if (!target) return "This value already exists.";
  const fields = Array.isArray(target) ? target : [target];
  for (const field of fields) {
    if (UNIQUE_FIELD_MESSAGES[field]) return UNIQUE_FIELD_MESSAGES[field];
  }
  return "This value already exists.";
}

function prismaMessage(err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") {
      return { status: 409, message: uniqueMessage(err.meta?.target) };
    }
    if (err.code === "P2003") {
      return { status: 400, message: "Invalid reference. Please select a valid item." };
    }
    if (err.code === "P2000") {
      return { status: 400, message: "One of the fields is too long." };
    }
    if (err.code === "P2025") {
      return { status: 404, message: "Record not found." };
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return { status: 400, message: "Invalid input. Please check your data." };
  }

  return null;
}

function formatError(err, options = {}) {
  const prisma = prismaMessage(err);
  if (prisma) return prisma;

  const status = options.status || err.status || err.statusCode || 500;
  const safeMessage =
    options.message ||
    (status < 500 ? err.message : "Unexpected server error. Please try again.");

  return { status, message: safeMessage };
}

function handleError(res, err, options = {}) {
  const { status, message } = formatError(err, options);
  if (res?.locals) {
    res.locals._errorLogged = true;
  }
  logError(err, options.context, {
    status,
    req: options.req || res?.req,
    extra: options.extra,
  });

  if (options.asText) {
    return res.status(status).send(message);
  }
  return res.status(status).json({ message });
}

module.exports = { handleError, formatError };

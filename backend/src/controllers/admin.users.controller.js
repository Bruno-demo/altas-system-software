// What this does: admin (CEO) can create/manage users, reset passwords, and disable/enable accounts
const prisma = require("../prisma");
const bcrypt = require("bcrypt");
const { handleError } = require("../utils/errors");

function s(v) {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

function normalizeEmail(email) {
  const e = s(email);
  return e ? e.toLowerCase() : null;
}

function assertRole(role) {
  // What this does: validates role is one of Prisma enum Role
  const allowed = [
    "STORE_KEEPER",
    "CASHIER",
    "SALESPERSON",
    "MANAGER",
    "ACCOUNTANT",
    "HR",
    "CEO",
  ];
  if (!allowed.includes(role)) {
    const err = new Error(`Invalid role. Allowed: ${allowed.join(", ")}`);
    err.status = 400;
    throw err;
  }
}

function makeTempPassword() {
  // What this does: generates a simple temporary password (you can customize)
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ALTAS-${rnd}`;
}

// ✅ POST /api/admin/users
// Body: { fullName, email, role, password? }
exports.createUser = async (req, res) => {
  try {
    const fullName = s(req.body.fullName);
    const email = normalizeEmail(req.body.email);
    const role = s(req.body.role);

    if (!fullName) return res.status(400).json({ message: "fullName is required" });
    if (!email) return res.status(400).json({ message: "email is required" });
    if (!role) return res.status(400).json({ message: "role is required" });

    assertRole(role);

    // What this does: if password not provided, create a temp one and force change
    const providedPassword = s(req.body.password);
    const tempPassword = providedPassword || makeTempPassword();

    const hashed = await bcrypt.hash(tempPassword, 10);

    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          fullName,
          email,
          password: hashed,
          role,
          isActive: true,
          mustChangePassword: !providedPassword, // force change if generated
          passwordChangedAt: providedPassword ? new Date() : null,
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          createdAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "ADMIN_CREATE_USER",
          details: `Created user ${email} role=${role}`,
        },
      });

      return user;
    });

    // What this does: return temp password only once if it was generated
    return res.status(201).json({
      message: "User created",
      user: created,
      tempPassword: providedPassword ? null : tempPassword,
      note: providedPassword
        ? "Password set by admin."
        : "Give tempPassword to user and ask them to change it immediately.",
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// ✅ GET /api/admin/users?q=&role=&isActive=&page=&limit=
exports.listUsers = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const where = {};

    const q = s(req.query.q);
    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }

    if (req.query.role) {
      const role = String(req.query.role).trim().toUpperCase();
      assertRole(role);
      where.role = role;
    }

    if (req.query.isActive != null) {
      const v = String(req.query.isActive).trim().toLowerCase();
      if (v === "true") where.isActive = true;
      if (v === "false") where.isActive = false;
    }

    const [total, rows] = await prisma.$transaction([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
          lastLoginAt: true,
          passwordChangedAt: true,
          createdAt: true,
        },
      }),
    ]);

    return res.json({
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
      rows,
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// ✅ GET /api/admin/users/:id
exports.getUserById = async (req, res) => {
  try {
    const id = String(req.params.id).trim();

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        mustChangePassword: true,
        lastLoginAt: true,
        passwordChangedAt: true,
        createdAt: true,
      },
    });

    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ user });
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};

// ✅ PUT /api/admin/users/:id
// Body: { fullName?, email?, role?, isActive? }
exports.updateUser = async (req, res) => {
  try {
    const id = String(req.params.id).trim();

    const data = {};
    if (req.body.fullName != null) data.fullName = s(req.body.fullName);
    if (req.body.email != null) data.email = normalizeEmail(req.body.email);
    if (req.body.role != null) {
      const role = String(req.body.role).trim().toUpperCase();
      assertRole(role);
      data.role = role;
    }
    if (req.body.isActive != null) data.isActive = Boolean(req.body.isActive);

    // Avoid empty updates
    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "No fields provided to update" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const exists = await tx.user.findUnique({ where: { id } });
      if (!exists) throw Object.assign(new Error("User not found"), { status: 404 });

      const user = await tx.user.update({
        where: { id },
        data,
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          mustChangePassword: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "ADMIN_UPDATE_USER",
          details: `Updated user ${id} fields=${Object.keys(data).join(",")}`,
        },
      });

      return user;
    });

    return res.json({ message: "User updated", user: updated });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// ✅ POST /api/admin/users/:id/disable
exports.disableUser = async (req, res) => {
  try {
    const id = String(req.params.id).trim();

    const user = await prisma.$transaction(async (tx) => {
      const exists = await tx.user.findUnique({ where: { id } });
      if (!exists) throw Object.assign(new Error("User not found"), { status: 404 });

      const u = await tx.user.update({
        where: { id },
        data: { isActive: false },
        select: { id: true, fullName: true, email: true, role: true, isActive: true },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "ADMIN_DISABLE_USER",
          details: `Disabled user ${id} (${u.email})`,
        },
      });

      return u;
    });

    return res.json({ message: "User disabled", user });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// ✅ POST /api/admin/users/:id/enable
exports.enableUser = async (req, res) => {
  try {
    const id = String(req.params.id).trim();

    const user = await prisma.$transaction(async (tx) => {
      const exists = await tx.user.findUnique({ where: { id } });
      if (!exists) throw Object.assign(new Error("User not found"), { status: 404 });

      const u = await tx.user.update({
        where: { id },
        data: { isActive: true },
        select: { id: true, fullName: true, email: true, role: true, isActive: true },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "ADMIN_ENABLE_USER",
          details: `Enabled user ${id} (${u.email})`,
        },
      });

      return u;
    });

    return res.json({ message: "User enabled", user });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// ✅ POST /api/admin/users/:id/reset-password
// Body: { password? } (if missing, generate temp password)
exports.resetUserPassword = async (req, res) => {
  try {
    const id = String(req.params.id).trim();
    const providedPassword = s(req.body.password);
    const newPassword = providedPassword || makeTempPassword();

    const hashed = await bcrypt.hash(newPassword, 10);

    const user = await prisma.$transaction(async (tx) => {
      const exists = await tx.user.findUnique({ where: { id } });
      if (!exists) throw Object.assign(new Error("User not found"), { status: 404 });

      const u = await tx.user.update({
        where: { id },
        data: {
          password: hashed,
          mustChangePassword: true, // force change after reset
          passwordChangedAt: null,
        },
        select: { id: true, fullName: true, email: true, role: true, isActive: true, mustChangePassword: true },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "ADMIN_RESET_PASSWORD",
          details: `Reset password for user ${id} (${u.email})`,
        },
      });

      return u;
    });

    return res.json({
      message: "Password reset",
      user,
      tempPassword: providedPassword ? null : newPassword,
      note: providedPassword ? "Password set by admin." : "Give tempPassword to the user and ask them to change it.",
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};


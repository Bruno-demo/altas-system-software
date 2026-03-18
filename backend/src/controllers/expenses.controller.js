// What this does: handles creating, editing, soft deleting, listing, summarizing, and exporting expenses to Excel
const prisma = require("../prisma");
const { createWorkbook } = require("../utils/safeExcel");
const { handleError } = require("../utils/errors");
const { autoPostExpense, reverseJournalEntry } = require("../utils/accounting");

function s(v) {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

function money(v, fieldName = "amount") {
  const n = Number(v);
  if (Number.isNaN(n) || n <= 0) {
    const err = new Error(`${fieldName} must be a number > 0`);
    err.status = 400;
    throw err;
  }
  return n.toFixed(2);
}

function parseISODateOnly(dateStr, fieldName = "date") {
  const str = s(dateStr);
  if (!str) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const err = new Error(`${fieldName} must be YYYY-MM-DD`);
    err.status = 400;
    throw err;
  }
  const d = new Date(`${str}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    const err = new Error(`Invalid ${fieldName}`);
    err.status = 400;
    throw err;
  }
  return d;
}

function resolveRange(query, { required = false } = {}) {
  // What this does: supports either ?from=YYYY-MM-DD&to=YYYY-MM-DD OR period shortcuts
  const fromRaw = s(query.from);
  const toRaw = s(query.to);

  const endOfDay = (date) => new Date(date.getTime() + 24 * 60 * 60 * 1000 - 1);

  if (fromRaw || toRaw) {
    if (!fromRaw || !toRaw) {
      const err = new Error("Both from and to are required when using custom range");
      err.status = 400;
      throw err;
    }

    const start = parseISODateOnly(fromRaw, "from");
    const toStart = parseISODateOnly(toRaw, "to");
    const end = endOfDay(toStart);

    return { from: fromRaw, to: toRaw, period: null, start, end };
  }

  const periodRaw = s(query.period);
  if (!periodRaw) {
    if (!required) return null;
    const err = new Error("Provide either from/to or period=today|this_week|this_month|this_year|all");
    err.status = 400;
    throw err;
  }

  const now = new Date();
  const p = periodRaw.toLowerCase();

  let startDate;
  let endDate;

  if (p === "today") {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    endDate = endOfDay(startDate);
  } else if (p === "this_week") {
    const day = now.getDay(); // 0 Sun ... 6 Sat
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
    endDate = endOfDay(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 6));
  } else if (p === "this_month") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  } else if (p === "this_year") {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = endOfDay(new Date(now.getFullYear(), 11, 31));
  } else if (p === "all") {
    startDate = new Date(2000, 0, 1);
    endDate = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  } else {
    const err = new Error("period must be today|this_week|this_month|this_year|all");
    err.status = 400;
    throw err;
  }

  const from = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(
    startDate.getDate()
  ).padStart(2, "0")}`;
  const to = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-${String(
    endDate.getDate()
  ).padStart(2, "0")}`;

  const start = parseISODateOnly(from, "from");
  const toStart = parseISODateOnly(to, "to");
  const end = endOfDay(toStart);

  return { from, to, period: p, start, end };
}

function styleHeaderRow(ws) {
  const r = ws.getRow(1);
  r.font = { bold: true };
  r.alignment = { vertical: "middle" };
  r.height = 18;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function round2(v) {
  const n = Number(v || 0);
  return Number.isNaN(n) ? 0 : Number(n.toFixed(2));
}

const allowedCategories = [
  "RENT",
  "UTILITIES",
  "TRANSPORT",
  "SALARY_PAYOUT",
  "STOCK_PURCHASE",
  "MAINTENANCE",
  "TAX",
  "OFFICE",
  "OTHER",
];

const allowedPayments = ["CASH", "MOMO", "CARD", "BANK", "OTHER"];

// ✅ POST /api/expenses
exports.createExpense = async (req, res) => {
  try {
    const amount = money(req.body.amount, "amount");

    const category = s(req.body.category)?.toUpperCase() || "OTHER";
    const paymentMethod = s(req.body.paymentMethod)?.toUpperCase() || "CASH";

    if (!allowedCategories.includes(category)) {
      return res.status(400).json({ message: `category must be one of: ${allowedCategories.join(", ")}` });
    }
    if (!allowedPayments.includes(paymentMethod)) {
      return res.status(400).json({ message: `paymentMethod must be one of: ${allowedPayments.join(", ")}` });
    }

    const date = parseISODateOnly(req.body.date, "date") || new Date();

    const vendor = s(req.body.vendor);
    const description = s(req.body.description);
    const referenceNo = s(req.body.referenceNo);

    const created = await prisma.$transaction(async (tx) => {
      const exp = await tx.expense.create({
        data: {
          date,
          amount,
          category,
          paymentMethod,
          vendor,
          description,
          referenceNo,
          createdById: req.user.id,
          isDeleted: false,
        },
        include: {
          createdBy: { select: { id: true, fullName: true, role: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "CREATE_EXPENSE",
          details: `Expense ${category} amount=${amount} method=${paymentMethod} date=${date.toISOString()}`,
        },
      });

      // What this does: auto-post expense to the accounting journal
      await autoPostExpense(tx, exp);

      return exp;
    });

    return res.status(201).json(created);
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// ✅ PUT /api/expenses/:id
exports.updateExpense = async (req, res) => {
  try {
    const id = String(req.params.id).trim();

    const data = {};

    if (req.body.amount != null) data.amount = money(req.body.amount, "amount");
    if (req.body.category != null) {
      const c = String(req.body.category).trim().toUpperCase();
      if (!allowedCategories.includes(c)) return res.status(400).json({ message: "Invalid category" });
      data.category = c;
    }
    if (req.body.paymentMethod != null) {
      const pm = String(req.body.paymentMethod).trim().toUpperCase();
      if (!allowedPayments.includes(pm)) return res.status(400).json({ message: "Invalid paymentMethod" });
      data.paymentMethod = pm;
    }
    if (req.body.date != null) {
      const d = parseISODateOnly(req.body.date, "date");
      if (!d) return res.status(400).json({ message: "date must be YYYY-MM-DD" });
      data.date = d;
    }

    if (req.body.vendor != null) data.vendor = s(req.body.vendor);
    if (req.body.description != null) data.description = s(req.body.description);
    if (req.body.referenceNo != null) data.referenceNo = s(req.body.referenceNo);

    // ✅ who edited
    data.updatedById = req.user.id;

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.expense.findUnique({ where: { id } });
      if (!existing) throw Object.assign(new Error("Expense not found"), { status: 404 });
      if (existing.isDeleted) throw Object.assign(new Error("Cannot edit a deleted expense"), { status: 409 });

      const u = await tx.expense.update({
        where: { id },
        data,
      });

      // What this does: reverse previous journal entry and re-post updated expense
      const latestEntry = await tx.journalEntry.findFirst({
        where: { source: "EXPENSE", sourceId: id },
        orderBy: { createdAt: "desc" },
        include: { lines: true },
      });

      if (latestEntry) {
        await reverseJournalEntry(tx, latestEntry, {
          memo: `Reversal of expense ${id} (update)`,
          createdById: req.user.id,
          source: "OTHER",
          sourceId: null,
        });
      }

      await autoPostExpense(tx, u);

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "UPDATE_EXPENSE",
          details: `Updated expense id=${id} fields=${Object.keys(data).join(",")}`,
        },
      });

      return u;
    });

    return res.json({ message: "Expense updated", expense: updated });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// ✅ DELETE /api/expenses/:id  (soft delete)
exports.softDeleteExpense = async (req, res) => {
  try {
    const id = String(req.params.id).trim();

    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.expense.findUnique({ where: { id } });
      if (!existing) throw Object.assign(new Error("Expense not found"), { status: 404 });

      if (existing.isDeleted) {
        const err = new Error("Expense already deleted");
        err.status = 409;
        throw err;
      }

      const u = await tx.expense.update({
        where: { id },
        data: {
          isDeleted: true,
          deletedAt: new Date(),
          deletedById: req.user.id,
        },
      });

      // What this does: reverse latest accounting entry for this expense
      const latestEntry = await tx.journalEntry.findFirst({
        where: { source: "EXPENSE", sourceId: id },
        orderBy: { createdAt: "desc" },
        include: { lines: true },
      });

      if (latestEntry) {
        await reverseJournalEntry(tx, latestEntry, {
          memo: `Reversal of expense ${id} (delete)`,
          createdById: req.user.id,
          source: "OTHER",
          sourceId: null,
        });
      }

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "DELETE_EXPENSE",
          details: `Soft deleted expense id=${id}`,
        },
      });

      return u;
    });

    return res.json({ message: "Expense deleted (soft)", expense: updated });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// ✅ GET /api/expenses
exports.listExpenses = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const where = { isDeleted: false };

    const range = resolveRange(req.query);
    if (range) where.date = { gte: range.start, lte: range.end };

    if (req.query.category) where.category = String(req.query.category).trim().toUpperCase();
    if (req.query.paymentMethod) where.paymentMethod = String(req.query.paymentMethod).trim().toUpperCase();

    const q = s(req.query.q);
    if (q) {
      where.OR = [
        { vendor: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { referenceNo: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, rows, totalsAgg] = await prisma.$transaction([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        include: {
          createdBy: { select: { id: true, fullName: true, role: true } },
          updatedBy: { select: { id: true, fullName: true, role: true } },
          deletedBy: { select: { id: true, fullName: true, role: true } },
        },
      }),
      prisma.expense.aggregate({
        where,
        _sum: { amount: true },
      }),
    ]);

    return res.json({
      range: range ? { from: range.from, to: range.to, period: range.period } : null,
      meta: { total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) },
      totals: {
        count: total,
        amount: round2(totalsAgg._sum.amount || 0),
      },
      rows,
    });
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};

// ✅ GET /api/expenses/summary
exports.expensesSummary = async (req, res) => {
  try {
    const range = resolveRange(req.query, { required: true });

    const where = { isDeleted: false, date: { gte: range.start, lte: range.end } };
    if (req.query.category) where.category = String(req.query.category).trim().toUpperCase();
    if (req.query.paymentMethod) where.paymentMethod = String(req.query.paymentMethod).trim().toUpperCase();

    const [byCategory, byPayment, totalAgg] = await prisma.$transaction([
      prisma.expense.groupBy({
        by: ["category"],
        where,
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { _sum: { amount: "desc" } },
      }),
      prisma.expense.groupBy({
        by: ["paymentMethod"],
        where,
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { _sum: { amount: "desc" } },
      }),
      prisma.expense.aggregate({
        where,
        _sum: { amount: true },
        _count: { _all: true },
      }),
    ]);

    const total = round2(totalAgg._sum.amount || 0);

    return res.json({
      range: { from: range.from, to: range.to, period: range.period },
      total: { count: totalAgg._count._all, amount: total },
      byCategory: byCategory.map((x) => ({
        category: x.category,
        count: x._count._all,
        amount: round2(x._sum.amount),
      })),
      byPaymentMethod: byPayment.map((x) => ({
        paymentMethod: x.paymentMethod,
        count: x._count._all,
        amount: round2(x._sum.amount),
      })),
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// ✅ GET /api/expenses/export/excel?from=YYYY-MM-DD&to=YYYY-MM-DD&category=&paymentMethod=
exports.exportExpensesExcel = async (req, res) => {
  try {
    const range = resolveRange(req.query, { required: true });

    const where = { isDeleted: false, date: { gte: range.start, lte: range.end } };

    if (req.query.category) where.category = String(req.query.category).trim().toUpperCase();
    if (req.query.paymentMethod) where.paymentMethod = String(req.query.paymentMethod).trim().toUpperCase();

    const rows = await prisma.expense.findMany({
      where,
      orderBy: { date: "desc" },
      include: {
        createdBy: { select: { fullName: true, role: true } },
        updatedBy: { select: { fullName: true, role: true } },
      },
    });

    const workbook = await createWorkbook();
    workbook.creator = "Altas System";
    workbook.created = new Date();

    const ws = workbook.addWorksheet("Expenses");
    ws.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Category", key: "category", width: 16 },
      { header: "PaymentMethod", key: "paymentMethod", width: 14 },
      { header: "Amount", key: "amount", width: 14 },
      { header: "Vendor", key: "vendor", width: 22 },
      { header: "Description", key: "description", width: 30 },
      { header: "ReferenceNo", key: "referenceNo", width: 18 },
      { header: "CreatedBy", key: "createdBy", width: 18 },
      { header: "UpdatedBy", key: "updatedBy", width: 18 },
      { header: "UpdatedAt", key: "updatedAt", width: 20 },
    ];
    styleHeaderRow(ws);

    let total = 0;

    rows.forEach((x) => {
      total += Number(x.amount || 0);

      const d = new Date(x.date);
      const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
        d.getUTCDate()
      ).padStart(2, "0")}`;

      ws.addRow({
        date: dateStr,
        category: x.category,
        paymentMethod: x.paymentMethod,
        amount: Number(x.amount),
        vendor: x.vendor || "",
        description: x.description || "",
        referenceNo: x.referenceNo || "",
        createdBy: x.createdBy?.fullName || "",
        updatedBy: x.updatedBy?.fullName || "",
        updatedAt: x.updatedAt ? new Date(x.updatedAt).toISOString() : "",
      });
    });

    // Total row
    ws.addRow({});
    const totalRow = ws.addRow({
      date: "",
      category: "TOTAL",
      paymentMethod: "",
      amount: Number(total.toFixed(2)),
    });
    totalRow.font = { bold: true };

    // Format numbers
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell((cell) => {
        if (typeof cell.value === "number") cell.numFmt = "#,##0.00";
      });
    });

    const filename = `ALTAS_Expenses_${range.from}_to_${range.to}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};


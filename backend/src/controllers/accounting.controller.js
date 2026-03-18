// What this does: provides accounting APIs (COA, journals, ledger, trial balance, statements)
const prisma = require("../prisma");
const { handleError } = require("../utils/errors");
const {
  ensureDefaultAccounts,
  createJournalEntry,
  reverseJournalEntry,
  normalizeText,
  round2,
} = require("../utils/accounting");

const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];
const JOURNAL_SOURCES = ["MANUAL", "SALE", "EXPENSE", "PAYROLL", "RETURN", "STOCK", "OTHER"];

function parseISODateOnly(dateStr, fieldName = "date") {
  const str = normalizeText(dateStr);
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
  const fromRaw = normalizeText(query.from);
  const toRaw = normalizeText(query.to);

  if (fromRaw || toRaw) {
    if (!fromRaw || !toRaw) {
      const err = new Error("Both from and to are required when using custom range");
      err.status = 400;
      throw err;
    }

    const start = parseISODateOnly(fromRaw, "from");
    const toStart = parseISODateOnly(toRaw, "to");
    const end = new Date(toStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    return { from: fromRaw, to: toRaw, period: null, start, end };
  }

  const periodRaw = normalizeText(query.period);
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
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (p === "this_week") {
    const day = now.getDay();
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday);
    endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 6);
  } else if (p === "this_month") {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else if (p === "this_year") {
    startDate = new Date(now.getFullYear(), 0, 1);
    endDate = new Date(now.getFullYear(), 11, 31);
  } else if (p === "all") {
    startDate = new Date(2000, 0, 1);
    endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
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
  const end = new Date(toStart.getTime() + 24 * 60 * 60 * 1000 - 1);

  return { from, to, period: p, start, end };
}

exports.seedDefaultAccounts = async (req, res) => {
  try {
    const accounts = await prisma.$transaction(async (tx) => {
      const map = await ensureDefaultAccounts(tx);
      const rows = Object.values(map).sort((a, b) => String(a.code).localeCompare(String(b.code)));

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "SEED_DEFAULT_ACCOUNTS",
          details: `Seeded ${rows.length} default accounts`,
        },
      });

      return rows;
    });

    return res.json({ count: accounts.length, accounts });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.listAccounts = async (req, res) => {
  try {
    const where = {};
    const type = normalizeText(req.query.type)?.toUpperCase();
    const q = normalizeText(req.query.q);

    if (type) {
      if (!ACCOUNT_TYPES.includes(type)) {
        return res.status(400).json({ message: `type must be one of: ${ACCOUNT_TYPES.join(", ")}` });
      }
      where.type = type;
    }

    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
      ];
    }

    const accounts = await prisma.account.findMany({
      where,
      orderBy: [{ type: "asc" }, { code: "asc" }],
    });

    return res.json(accounts);
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};

exports.createAccount = async (req, res) => {
  try {
    const code = normalizeText(req.body.code);
    const name = normalizeText(req.body.name);
    const type = normalizeText(req.body.type)?.toUpperCase();
    const category = normalizeText(req.body.category);
    const isCash = Boolean(req.body.isCash);
    const isActive = req.body.isActive == null ? true : Boolean(req.body.isActive);

    if (!code) return res.status(400).json({ message: "code is required" });
    if (!name) return res.status(400).json({ message: "name is required" });
    if (!type || !ACCOUNT_TYPES.includes(type)) {
      return res.status(400).json({ message: `type must be one of: ${ACCOUNT_TYPES.join(", ")}` });
    }

    const created = await prisma.$transaction(async (tx) => {
      const acc = await tx.account.create({
        data: { code, name, type, category, isCash, isActive },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "CREATE_ACCOUNT",
          details: `Account ${acc.code} - ${acc.name} (${acc.type})`,
        },
      });

      return acc;
    });

    return res.status(201).json(created);
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.updateAccount = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ message: "account id is required" });

    const data = {};

    if (req.body.code != null) data.code = normalizeText(req.body.code);
    if (req.body.name != null) data.name = normalizeText(req.body.name);
    if (req.body.type != null) {
      const type = normalizeText(req.body.type)?.toUpperCase();
      if (!type || !ACCOUNT_TYPES.includes(type)) {
        return res.status(400).json({ message: `type must be one of: ${ACCOUNT_TYPES.join(", ")}` });
      }
      data.type = type;
    }
    if (req.body.category != null) data.category = normalizeText(req.body.category);
    if (req.body.isCash != null) data.isCash = Boolean(req.body.isCash);
    if (req.body.isActive != null) data.isActive = Boolean(req.body.isActive);

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.account.update({ where: { id }, data });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "UPDATE_ACCOUNT",
          details: `Updated account ${u.code} - ${u.name} (${u.type})`,
        },
      });

      return u;
    });

    return res.json(updated);
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.listJournalEntries = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const where = {};
    const range = resolveRange(req.query);
    if (range) where.date = { gte: range.start, lte: range.end };

    const source = normalizeText(req.query.source)?.toUpperCase();
    if (source) {
      if (!JOURNAL_SOURCES.includes(source)) {
        return res.status(400).json({ message: `source must be one of: ${JOURNAL_SOURCES.join(", ")}` });
      }
      where.source = source;
    }

    const q = normalizeText(req.query.q);
    if (q) {
      where.OR = [
        { memo: { contains: q, mode: "insensitive" } },
        { reference: { contains: q, mode: "insensitive" } },
        { sourceId: { contains: q, mode: "insensitive" } },
      ];
    }

    const [total, rows] = await prisma.$transaction([
      prisma.journalEntry.count({ where }),
      prisma.journalEntry.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
        include: {
          createdBy: { select: { id: true, fullName: true, role: true } },
          lines: {
            include: { account: { select: { id: true, code: true, name: true, type: true } } },
          },
        },
      }),
    ]);

    return res.json({
      range: range ? { from: range.from, to: range.to, period: range.period } : null,
      meta: { total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) },
      rows,
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.createJournalEntry = async (req, res) => {
  try {
    const date = req.body.date ? parseISODateOnly(req.body.date, "date") : new Date();
    const memo = normalizeText(req.body.memo);
    const reference = normalizeText(req.body.reference);
    const lines = Array.isArray(req.body.lines) ? req.body.lines : [];

    if (!lines.length) {
      return res.status(400).json({ message: "lines are required" });
    }

    const accountIds = lines.map((line) => line.accountId).filter(Boolean);
    const accounts = await prisma.account.findMany({ where: { id: { in: accountIds } } });
    const accountMap = new Map(accounts.map((acc) => [acc.id, acc]));

    for (const line of lines) {
      if (!line.accountId || !accountMap.has(line.accountId)) {
        return res.status(400).json({ message: "Invalid accountId in lines" });
      }
      if (accountMap.get(line.accountId).isActive === false) {
        return res.status(400).json({ message: "Cannot post to inactive account" });
      }
    }

    const entry = await prisma.$transaction(async (tx) =>
      createJournalEntry(tx, {
        date,
        memo,
        reference,
        source: "MANUAL",
        createdById: req.user.id,
        lines,
      })
    );

    return res.status(201).json(entry);
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.ledgerByAccount = async (req, res) => {
  try {
    const accountId = normalizeText(req.query.accountId);
    if (!accountId) return res.status(400).json({ message: "accountId is required" });

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const range = resolveRange(req.query);
    const where = { accountId };
    if (range) where.entry = { date: { gte: range.start, lte: range.end } };

    const [total, rows, totalsAgg, openingAgg] = await prisma.$transaction([
      prisma.journalLine.count({ where }),
      prisma.journalLine.findMany({
        where,
        orderBy: [{ entry: { date: "asc" } }, { id: "asc" }],
        skip,
        take: limit,
        include: {
          entry: { select: { id: true, date: true, memo: true, reference: true, source: true } },
          account: { select: { id: true, code: true, name: true, type: true } },
        },
      }),
      prisma.journalLine.aggregate({ where, _sum: { debit: true, credit: true } }),
      range
        ? prisma.journalLine.aggregate({
            where: {
              accountId,
              entry: { date: { lt: range.start } },
            },
            _sum: { debit: true, credit: true },
          })
        : prisma.journalLine.aggregate({ where: { accountId }, _sum: { debit: true, credit: true } }),
    ]);

    let running = round2(Number(openingAgg._sum.debit || 0) - Number(openingAgg._sum.credit || 0));

    const mappedRows = rows.map((row) => {
      running = round2(running + Number(row.debit || 0) - Number(row.credit || 0));
      return {
        id: row.id,
        entryId: row.entryId,
        date: row.entry?.date,
        memo: row.entry?.memo,
        reference: row.entry?.reference,
        source: row.entry?.source,
        account: row.account,
        debit: Number(row.debit || 0),
        credit: Number(row.credit || 0),
        runningBalance: running,
      };
    });

    return res.json({
      range: range ? { from: range.from, to: range.to, period: range.period } : null,
      meta: { total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) },
      totals: {
        debit: round2(totalsAgg._sum.debit || 0),
        credit: round2(totalsAgg._sum.credit || 0),
      },
      openingBalance: round2(Number(openingAgg._sum.debit || 0) - Number(openingAgg._sum.credit || 0)),
      rows: mappedRows,
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.trialBalance = async (req, res) => {
  try {
    const range = resolveRange(req.query, { required: true });

    const groups = await prisma.journalLine.groupBy({
      by: ["accountId"],
      where: { entry: { date: { gte: range.start, lte: range.end } } },
      _sum: { debit: true, credit: true },
    });

    const accountIds = groups.map((g) => g.accountId);
    const accounts = await prisma.account.findMany({ where: { id: { in: accountIds } } });
    const accountMap = new Map(accounts.map((acc) => [acc.id, acc]));

    let totalDebit = 0;
    let totalCredit = 0;

    const rows = groups
      .map((g) => {
        const acc = accountMap.get(g.accountId);
        if (!acc) return null;
        const debit = round2(g._sum.debit || 0);
        const credit = round2(g._sum.credit || 0);
        const net = round2(debit - credit);
        const debitBal = net >= 0 ? net : 0;
        const creditBal = net < 0 ? Math.abs(net) : 0;
        totalDebit += debitBal;
        totalCredit += creditBal;
        return {
          accountId: acc.id,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          debit: debitBal,
          credit: creditBal,
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));

    return res.json({
      range: { from: range.from, to: range.to, period: range.period },
      totals: { debit: round2(totalDebit), credit: round2(totalCredit) },
      rows,
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.financialStatements = async (req, res) => {
  try {
    const range = resolveRange(req.query, { required: true });

    const groups = await prisma.journalLine.groupBy({
      by: ["accountId"],
      where: { entry: { date: { gte: range.start, lte: range.end } } },
      _sum: { debit: true, credit: true },
    });

    const accountIds = groups.map((g) => g.accountId);
    const accounts = await prisma.account.findMany({ where: { id: { in: accountIds } } });
    const accountMap = new Map(accounts.map((acc) => [acc.id, acc]));

    let assets = 0;
    let liabilities = 0;
    let equity = 0;
    let revenue = 0;
    let expenses = 0;

    const cashAccounts = accounts.filter((acc) => acc.isCash);
    const cashAccountIds = new Set(cashAccounts.map((acc) => acc.id));
    let cashIn = 0;
    let cashOut = 0;

    groups.forEach((g) => {
      const acc = accountMap.get(g.accountId);
      if (!acc) return;
      const debit = round2(g._sum.debit || 0);
      const credit = round2(g._sum.credit || 0);
      const net = round2(debit - credit);

      if (acc.type === "ASSET") assets = round2(assets + net);
      if (acc.type === "LIABILITY") liabilities = round2(liabilities + (credit - debit));
      if (acc.type === "EQUITY") equity = round2(equity + (credit - debit));
      if (acc.type === "REVENUE") revenue = round2(revenue + (credit - debit));
      if (acc.type === "EXPENSE") expenses = round2(expenses + net);

      if (cashAccountIds.has(acc.id)) {
        cashIn = round2(cashIn + debit);
        cashOut = round2(cashOut + credit);
      }
    });

    const netProfit = round2(revenue - expenses);
    const cashNet = round2(cashIn - cashOut);

    return res.json({
      range: { from: range.from, to: range.to, period: range.period },
      profitAndLoss: {
        revenue,
        expenses,
        netProfit,
      },
      balanceSheet: {
        assets,
        liabilities,
        equity,
        balanceCheck: round2(assets - (liabilities + equity)),
      },
      cashFlow: {
        inflow: cashIn,
        outflow: cashOut,
        net: cashNet,
      },
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.reverseJournalEntry = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ message: "entry id is required" });

    const entry = await prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: true },
    });

    if (!entry) return res.status(404).json({ message: "Journal entry not found" });

    const reversed = await prisma.$transaction(async (tx) => {
      const rev = await reverseJournalEntry(tx, entry, {
        memo: `Manual reversal of ${entry.reference || entry.id}`,
        createdById: req.user.id,
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "REVERSE_JOURNAL_ENTRY",
          details: `Reversed journal entry ${entry.id} (created ${entry.createdAt?.toISOString() || "?"})`,
        },
      });

      return rev;
    });

    return res.json({ message: "Reversal created", entry: reversed });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

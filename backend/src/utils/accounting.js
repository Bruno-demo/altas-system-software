// What this does: shared accounting helpers (default chart, mappings, journal creation)

const DEFAULT_ACCOUNTS = [
  { code: "1000", name: "Cash on Hand", type: "ASSET", category: "CASH", isCash: true },
  { code: "1010", name: "Mobile Money", type: "ASSET", category: "MOMO", isCash: true },
  { code: "1020", name: "Bank", type: "ASSET", category: "BANK", isCash: true },
  { code: "1030", name: "Card Clearing", type: "ASSET", category: "CARD", isCash: true },
  { code: "1100", name: "Accounts Receivable", type: "ASSET", category: "AR" },
  { code: "1200", name: "Inventory", type: "ASSET", category: "INVENTORY" },

  { code: "2000", name: "Accounts Payable", type: "LIABILITY", category: "AP" },
  { code: "2100", name: "Loans Payable", type: "LIABILITY", category: "LOAN" },
  { code: "2200", name: "Taxes Payable", type: "LIABILITY", category: "TAX" },

  { code: "3000", name: "Owner Equity", type: "EQUITY" },
  { code: "3100", name: "Retained Earnings", type: "EQUITY" },

  { code: "4000", name: "Revenue - Motorbike Sales", type: "REVENUE", category: "MOTORBIKE" },
  { code: "4100", name: "Revenue - Spare Parts", type: "REVENUE", category: "SPARE_PARTS" },
  { code: "4200", name: "Revenue - Services", type: "REVENUE", category: "SERVICES" },
  { code: "4300", name: "Revenue - Other", type: "REVENUE", category: "OTHER" },

  { code: "5000", name: "Cost of Goods Sold", type: "EXPENSE", category: "COGS" },
  { code: "5100", name: "Rent Expense", type: "EXPENSE", category: "RENT" },
  { code: "5200", name: "Salaries Expense", type: "EXPENSE", category: "SALARY" },
  { code: "5300", name: "Utilities Expense", type: "EXPENSE", category: "UTILITIES" },
  { code: "5400", name: "Transport Expense", type: "EXPENSE", category: "TRANSPORT" },
  { code: "5500", name: "Maintenance Expense", type: "EXPENSE", category: "MAINTENANCE" },
  { code: "5600", name: "Office Expense", type: "EXPENSE", category: "OFFICE" },
  { code: "5700", name: "Tax Expense", type: "EXPENSE", category: "TAX" },
  { code: "5800", name: "Other Expense", type: "EXPENSE", category: "OTHER" },
  { code: "5900", name: "Stock Purchases", type: "EXPENSE", category: "STOCK_PURCHASE" },
];

function round2(value) {
  const num = Number(value || 0);
  if (Number.isNaN(num)) return 0;
  return Number(num.toFixed(2));
}

function toMoney(value, fieldName = "amount") {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) {
    const err = new Error(`${fieldName} must be a number >= 0`);
    err.status = 400;
    throw err;
  }
  return round2(num);
}

function normalizeText(value) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

async function ensureDefaultAccounts(tx) {
  const codes = DEFAULT_ACCOUNTS.map((row) => row.code);
  await Promise.all(
    DEFAULT_ACCOUNTS.map((row) =>
      tx.account.upsert({
        where: { code: row.code },
        update: {},
        create: {
          code: row.code,
          name: row.name,
          type: row.type,
          category: row.category || null,
          isCash: Boolean(row.isCash),
        },
      })
    )
  );

  const accounts = await tx.account.findMany({ where: { code: { in: codes } } });
  const map = {};
  accounts.forEach((acc) => {
    map[acc.code] = acc;
  });
  return map;
}

function mapPaymentAccountCode(method) {
  const pm = String(method || "").trim().toUpperCase();
  if (pm === "MOMO") return "1010";
  if (pm === "CARD") return "1030";
  if (pm === "BANK") return "1020";
  return "1000"; // CASH + OTHER
}

function mapExpenseAccountCode(category) {
  const cat = String(category || "").trim().toUpperCase();
  switch (cat) {
    case "RENT":
      return "5100";
    case "UTILITIES":
      return "5300";
    case "TRANSPORT":
      return "5400";
    case "SALARY_PAYOUT":
      return "5200";
    case "STOCK_PURCHASE":
      return "1200"; // inventory asset
    case "MAINTENANCE":
      return "5500";
    case "TAX":
      return "5700";
    case "OFFICE":
      return "5600";
    default:
      return "5800";
  }
}

function mapRevenueAccountCode(product) {
  const isMotorbike = Boolean(product?.chassisNumber) || String(product?.category || "").toLowerCase() === "motorbike";
  if (isMotorbike) return "4000";
  const cat = String(product?.category || "").toLowerCase();
  if (cat.includes("service")) return "4200";
  return "4100";
}

async function findExistingEntry(tx, source, sourceId) {
  if (!sourceId) return null;
  return tx.journalEntry.findFirst({
    where: { source, sourceId: String(sourceId) },
    include: { lines: true },
  });
}

async function createJournalEntry(tx, { date, memo, reference, source, sourceId, createdById, lines }) {
  if (!Array.isArray(lines) || lines.length < 2) {
    const err = new Error("Journal entry requires at least two lines.");
    err.status = 400;
    throw err;
  }

  let totalDebit = 0;
  let totalCredit = 0;

  const preparedLines = lines.map((line) => {
    const debit = toMoney(line.debit || 0, "debit");
    const credit = toMoney(line.credit || 0, "credit");

    if (debit > 0 && credit > 0) {
      const err = new Error("A line cannot have both debit and credit.");
      err.status = 400;
      throw err;
    }
    if (debit === 0 && credit === 0) {
      const err = new Error("Each line must have a debit or credit.");
      err.status = 400;
      throw err;
    }

    totalDebit += debit;
    totalCredit += credit;

    return {
      accountId: line.accountId,
      debit: debit.toFixed(2),
      credit: credit.toFixed(2),
      memo: normalizeText(line.memo),
    };
  });

  totalDebit = round2(totalDebit);
  totalCredit = round2(totalCredit);

  if (round2(totalDebit - totalCredit) !== 0) {
    const err = new Error("Debits and credits must balance.");
    err.status = 400;
    throw err;
  }

  const entry = await tx.journalEntry.create({
    data: {
      date: date || new Date(),
      memo: normalizeText(memo),
      reference: normalizeText(reference),
      source: source || "MANUAL",
      sourceId: normalizeText(sourceId),
      createdById: createdById || null,
      lines: {
        create: preparedLines,
      },
    },
    include: {
      lines: {
        include: {
          account: { select: { id: true, code: true, name: true, type: true } },
        },
      },
    },
  });

  return entry;
}

async function autoPostSale(tx, sale, preparedItems) {
  const existing = await findExistingEntry(tx, "SALE", sale?.id);
  if (existing) return existing;

  const accountMap = await ensureDefaultAccounts(tx);
  const paymentCode = mapPaymentAccountCode(sale.paymentMethod);
  const assetAccount = accountMap[paymentCode];

  if (!assetAccount) {
    const err = new Error("Missing payment account for sale posting.");
    err.status = 500;
    throw err;
  }

  const revenueTotals = {};
  let cogsTotal = 0;

  preparedItems.forEach((item) => {
    const revenueCode = mapRevenueAccountCode(item.product);
    const lineTotal = round2(Number(item.lineTotal || 0));
    if (lineTotal > 0) {
      revenueTotals[revenueCode] = round2((revenueTotals[revenueCode] || 0) + lineTotal);
    }
    const cost = round2(Number(item.costPrice || 0) * Number(item.quantity || 0));
    if (cost > 0) cogsTotal = round2(cogsTotal + cost);
  });

  const lines = [];
  const saleTotal = round2(Number(sale.total || 0));
  if (saleTotal <= 0) return null;
  lines.push({ accountId: assetAccount.id, debit: saleTotal });

  Object.entries(revenueTotals).forEach(([code, amount]) => {
    const acc = accountMap[code];
    if (acc && amount > 0) {
      lines.push({ accountId: acc.id, credit: amount });
    }
  });

  const revenueCredit = round2(lines.reduce((sum, line) => sum + Number(line.credit || 0), 0));
  const revenueDiff = round2(saleTotal - revenueCredit);
  if (Math.abs(revenueDiff) >= 0.01) {
    const fallbackRevenue = accountMap["4300"];
    if (fallbackRevenue) {
      if (revenueDiff > 0) {
        lines.push({ accountId: fallbackRevenue.id, credit: revenueDiff });
      } else {
        lines.push({ accountId: fallbackRevenue.id, debit: Math.abs(revenueDiff) });
      }
    }
  }

  if (cogsTotal > 0) {
    const cogsAccount = accountMap["5000"];
    const inventoryAccount = accountMap["1200"];
    if (cogsAccount && inventoryAccount) {
      lines.push({ accountId: cogsAccount.id, debit: cogsTotal });
      lines.push({ accountId: inventoryAccount.id, credit: cogsTotal });
    }
  }

  if (lines.length < 2) return null;

  return createJournalEntry(tx, {
    date: sale.createdAt || new Date(),
    memo: `Auto sale posting ${sale.invoiceNo}`,
    reference: sale.invoiceNo,
    source: "SALE",
    sourceId: sale.id,
    createdById: sale.cashierId,
    lines,
  });
}

async function autoPostExpense(tx, expense) {
  const existing = await findExistingEntry(tx, "EXPENSE", expense?.id);
  if (existing) return existing;

  const accountMap = await ensureDefaultAccounts(tx);
  const expenseCode = mapExpenseAccountCode(expense.category);
  const paymentCode = mapPaymentAccountCode(expense.paymentMethod);
  const debitAccount = accountMap[expenseCode];
  const creditAccount = accountMap[paymentCode];

  if (!debitAccount || !creditAccount) {
    const err = new Error("Missing accounts for expense posting.");
    err.status = 500;
    throw err;
  }

  const amount = round2(Number(expense.amount || 0));
  if (amount <= 0) return null;

  return createJournalEntry(tx, {
    date: expense.date || new Date(),
    memo: `Auto expense posting ${expense.category}`,
    reference: expense.referenceNo || expense.id,
    source: "EXPENSE",
    sourceId: expense.id,
    createdById: expense.createdById,
    lines: [
      { accountId: debitAccount.id, debit: amount },
      { accountId: creditAccount.id, credit: amount },
    ],
  });
}

async function autoPostPayroll(tx, payrollRun, { createdById } = {}) {
  const existing = await findExistingEntry(tx, "PAYROLL", payrollRun?.id);
  if (existing) return existing;

  const accountMap = await ensureDefaultAccounts(tx);
  const expenseAccount = accountMap["5200"];
  const creditAccount = accountMap["1020"] || accountMap["1000"];
  if (!expenseAccount || !creditAccount) {
    const err = new Error("Missing accounts for payroll posting.");
    err.status = 500;
    throw err;
  }

  const amount = round2(Number(payrollRun?.totalNet || 0));
  if (amount <= 0) return null;

  const label = payrollRun ? `${payrollRun.year}-${String(payrollRun.month).padStart(2, "0")}` : "Payroll";
  const reference = payrollRun?.id || `PAYROLL-${label}`;

  return createJournalEntry(tx, {
    date: payrollRun?.createdAt || new Date(),
    memo: `Auto payroll posting ${label}`,
    reference,
    source: "PAYROLL",
    sourceId: payrollRun?.id,
    createdById: createdById || payrollRun?.generatedById || null,
    lines: [
      { accountId: expenseAccount.id, debit: amount },
      { accountId: creditAccount.id, credit: amount },
    ],
  });
}

async function autoPostReturn(tx, { sale, returnRecord, items }) {
  const existing = await findExistingEntry(tx, "RETURN", returnRecord?.id);
  if (existing) return existing;

  if (!sale || !returnRecord || !Array.isArray(items)) return null;

  const accountMap = await ensureDefaultAccounts(tx);
  const paymentCode = mapPaymentAccountCode(sale.paymentMethod);
  const assetAccount = accountMap[paymentCode] || accountMap["1000"];
  if (!assetAccount) {
    const err = new Error("Missing payment account for return posting.");
    err.status = 500;
    throw err;
  }

  const revenueTotals = {};
  let refundTotal = 0;
  let cogsTotal = 0;

  items.forEach((item) => {
    const qty = Number(item.quantity || 0);
    if (!qty) return;
    const unitPrice = Number(item.unitPrice || 0);
    const lineTotal = round2(unitPrice * qty);
    if (lineTotal > 0) {
      refundTotal = round2(refundTotal + lineTotal);
      const revenueCode = mapRevenueAccountCode(item.product);
      revenueTotals[revenueCode] = round2((revenueTotals[revenueCode] || 0) + lineTotal);
    }
    if (!item.isMotorbike) {
      const cost = round2(Number(item.costPrice || 0) * qty);
      if (cost > 0) cogsTotal = round2(cogsTotal + cost);
    }
  });

  if (refundTotal <= 0) return null;

  const lines = [];
  Object.entries(revenueTotals).forEach(([code, amount]) => {
    const acc = accountMap[code];
    if (acc && amount > 0) {
      lines.push({ accountId: acc.id, debit: amount });
    }
  });

  const revenueDebit = round2(lines.reduce((sum, line) => sum + Number(line.debit || 0), 0));
  const diff = round2(refundTotal - revenueDebit);
  if (Math.abs(diff) >= 0.01) {
    const fallbackRevenue = accountMap["4300"];
    if (fallbackRevenue) {
      if (diff > 0) {
        lines.push({ accountId: fallbackRevenue.id, debit: diff });
      } else {
        lines.push({ accountId: fallbackRevenue.id, credit: Math.abs(diff) });
      }
    }
  }

  lines.push({ accountId: assetAccount.id, credit: refundTotal });

  if (cogsTotal > 0) {
    const inventoryAccount = accountMap["1200"];
    const cogsAccount = accountMap["5000"];
    if (inventoryAccount && cogsAccount) {
      lines.push({ accountId: inventoryAccount.id, debit: cogsTotal });
      lines.push({ accountId: cogsAccount.id, credit: cogsTotal });
    }
  }

  if (lines.length < 2) return null;

  return createJournalEntry(tx, {
    date: returnRecord.createdAt || new Date(),
    memo: `Auto return posting ${sale.invoiceNo}`,
    reference: sale.invoiceNo,
    source: "RETURN",
    sourceId: returnRecord.id,
    createdById: returnRecord.createdById || sale.cashierId,
    lines,
  });
}

async function autoPostStockAdjustment(tx, trx, product) {
  const existing = await findExistingEntry(tx, "STOCK", trx?.id);
  if (existing) return existing;

  if (!trx || !product) return null;

  const accountMap = await ensureDefaultAccounts(tx);
  const inventoryAccount = accountMap["1200"];
  if (!inventoryAccount) {
    const err = new Error("Missing inventory account for stock posting.");
    err.status = 500;
    throw err;
  }

  const qty = Number(trx.quantity || 0);
  const unitCost = Number(trx.unitCost || product.costPrice || 0);
  const amount = round2(qty * unitCost);
  if (amount <= 0) return null;

  const lines = [];
  if (trx.type === "IN") {
    const creditAccount = accountMap["2000"] || accountMap["1000"];
    if (!creditAccount) return null;
    lines.push({ accountId: inventoryAccount.id, debit: amount });
    lines.push({ accountId: creditAccount.id, credit: amount });
  } else if (trx.type === "OUT") {
    const cogsAccount = accountMap["5000"];
    if (!cogsAccount) return null;
    lines.push({ accountId: cogsAccount.id, debit: amount });
    lines.push({ accountId: inventoryAccount.id, credit: amount });
  } else if (trx.type === "DAMAGE") {
    const expenseAccount = accountMap["5800"];
    if (!expenseAccount) return null;
    lines.push({ accountId: expenseAccount.id, debit: amount });
    lines.push({ accountId: inventoryAccount.id, credit: amount });
  }

  if (lines.length < 2) return null;

  return createJournalEntry(tx, {
    date: trx.createdAt || new Date(),
    memo: `Auto stock ${trx.type} posting ${product.sku}`,
    reference: trx.id,
    source: "STOCK",
    sourceId: trx.id,
    createdById: trx.createdBy || null,
    lines,
  });
}

async function reverseJournalEntry(tx, entry, { memo, createdById, source, sourceId, reference } = {}) {
  if (!entry?.lines?.length) return null;
  const reversedLines = entry.lines.map((line) => ({
    accountId: line.accountId,
    debit: Number(line.credit || 0),
    credit: Number(line.debit || 0),
    memo: line.memo || null,
  }));

  return createJournalEntry(tx, {
    date: new Date(),
    memo: memo || `Reversal of ${entry.reference || entry.id}`,
    reference: reference || entry.reference || entry.id,
    source: source || entry.source || "OTHER",
    sourceId: sourceId !== undefined ? sourceId : entry.sourceId || null,
    createdById,
    lines: reversedLines,
  });
}

module.exports = {
  DEFAULT_ACCOUNTS,
  ensureDefaultAccounts,
  createJournalEntry,
  autoPostSale,
  autoPostExpense,
  autoPostPayroll,
  autoPostReturn,
  autoPostStockAdjustment,
  reverseJournalEntry,
  mapPaymentAccountCode,
  mapExpenseAccountCode,
  mapRevenueAccountCode,
  normalizeText,
  round2,
  toMoney,
};

// What this does: builds manager reports using Prisma aggregates (sales, profit, cashflow, stock, activity logs)
const { createWorkbook } = require("../utils/safeExcel");
const prisma = require("../prisma");
const { handleError } = require("../utils/errors");

const HEADER_ALIASES = {
  sdcId: ["sdcid", "sdccode", "sdc", "sdcidcount"],
  buyerTin: ["buyertin", "tin"],
  buyerName: ["buyername", "name"],
  saleDate: ["saledate", "sale", "sale date", "date"],
  receiptType: ["receipttype", "receipt"],
  itemName: ["itemname", "item"],
  quantity: ["quantity", "qty"],
  unitPrice: ["unitprice", "unitprice", "price"],
  taxableSupplyPrice: [
    "taxablesupplyprice",
    "taxablesupply",
    "taxableprice",
    "taxable",
  ],
  vat: ["vat", "vatamount"],
  summaryAmount: ["summaryamount", "summary", "summaryvalue"],
};

function s(v) {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function parseNumber(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const cleaned = String(value).replace(/[, ]+/g, "");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isNaN(num) ? null : num;
}

function excelDateToJs(num) {
  if (typeof num !== "number") return null;
  const utcDays = Math.floor(num - 25569);
  const utcValue = utcDays * 86400;
  return new Date(utcValue * 1000);
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return excelDateToJs(value);
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

function readCellText(cell) {
  if (!cell) return null;
  const text = String(cell.text || "").trim();
  if (text && !/e[\+\-]/i.test(text)) return text;
  return s(cell.value);
}

// What this does: builds date range using either (from,to) OR period shortcuts
function resolveRange(query) {
  const { from, to, period } = query;

  // If from & to provided, use them
  if (from && to) {
    const start = new Date(`${from}T00:00:00.000`);
    const end = new Date(`${to}T23:59:59.999`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      const err = new Error("Invalid from/to date. Use YYYY-MM-DD");
      err.status = 400;
      throw err;
    }

    return { start, end, from, to, period: null };
  }

  // If period provided, compute range
  if (!period) {
    const err = new Error("Provide either from & to OR period=today|this_week|this_month|this_year");
    err.status = 400;
    throw err;
  }

  const now = new Date();
  let start, end;
  let labelFrom, labelTo;

  const p = String(period).toLowerCase();

  if (p === "today") {
    labelFrom = now.toISOString().slice(0, 10);
    labelTo = labelFrom;
    start = new Date(`${labelFrom}T00:00:00.000`);
    end = new Date(`${labelTo}T23:59:59.999`);
  } else if (p === "this_week") {
    // Monday as start of week
    const day = now.getDay(); // 0 Sun ... 6 Sat
    const diffToMonday = (day === 0 ? -6 : 1) - day;

    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);

    labelFrom = monday.toISOString().slice(0, 10);
    start = new Date(`${labelFrom}T00:00:00.000`);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    labelTo = sunday.toISOString().slice(0, 10);
    end = new Date(`${labelTo}T23:59:59.999`);
  } else if (p === "this_month") {
    const y = now.getFullYear();
    const m = now.getMonth(); // 0-11

    const first = new Date(y, m, 1);
    const last = new Date(y, m + 1, 0);

    labelFrom = first.toISOString().slice(0, 10);
    labelTo = last.toISOString().slice(0, 10);

    start = new Date(`${labelFrom}T00:00:00.000`);
    end = new Date(`${labelTo}T23:59:59.999`);
  } else if (p === "this_year") {
    const y = now.getFullYear();
    labelFrom = `${y}-01-01`;
    labelTo = `${y}-12-31`;

    start = new Date(`${labelFrom}T00:00:00.000`);
    end = new Date(`${labelTo}T23:59:59.999`);
  } else if (p === "all") {
    const startDate = new Date("2000-01-01T00:00:00.000");
    const today = now.toISOString().slice(0, 10);
    labelFrom = "2000-01-01";
    labelTo = today;
    start = startDate;
    end = new Date(`${labelTo}T23:59:59.999`);
  } else {
    const err = new Error("period must be today|this_week|this_month|this_year");
    err.status = 400;
    throw err;
  }

  return { start, end, from: labelFrom, to: labelTo, period: p };
}

// -------------------------------
// SUMMARY REPORT
// -------------------------------
exports.summary = async (req, res) => {
  try {
    const { start, end, from, to, period } = resolveRange(req.query);

    const [salesCount, salesAgg, returnsCount] = await prisma.$transaction([
      prisma.sale.count({ where: { createdAt: { gte: start, lte: end } } }),
      prisma.sale.aggregate({
        where: { createdAt: { gte: start, lte: end } },
        _sum: { subtotal: true, discountTotal: true, taxTotal: true, total: true },
      }),
      prisma.saleReturn.count({ where: { createdAt: { gte: start, lte: end } } }),
    ]);

    res.json({
      range: { from, to, period },
      sales: {
        invoices: salesCount,
        subtotal: salesAgg._sum.subtotal || 0,
        discountTotal: salesAgg._sum.discountTotal || 0,
        taxTotal: salesAgg._sum.taxTotal || 0,
        total: salesAgg._sum.total || 0,
      },
      returns: { count: returnsCount },
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// -------------------------------
// SALES BY PAYMENT METHOD
// -------------------------------
exports.salesByPayment = async (req, res) => {
  try {
    const { start, end, from, to, period } = resolveRange(req.query);

    const grouped = await prisma.sale.groupBy({
      by: ["paymentMethod"],
      where: { createdAt: { gte: start, lte: end } },
      _sum: { total: true },
      _count: { _all: true },
    });

    res.json({
      range: { from, to, period },
      byPayment: grouped.map((g) => ({
        paymentMethod: g.paymentMethod,
        invoices: g._count._all,
        total: g._sum.total || 0,
      })),
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// -------------------------------
// BEST SELLERS
// -------------------------------
exports.bestSellers = async (req, res) => {
  try {
    const { start, end, from, to, period } = resolveRange(req.query);
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const grouped = await prisma.saleItem.groupBy({
      by: ["productId"],
      where: { createdAt: { gte: start, lte: end } },
      _sum: { quantity: true, lineTotal: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: limit,
    });

    const productIds = grouped.map((g) => g.productId);

    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true, partNumber: true, brand: true, category: true },
    });

    const pmap = new Map(products.map((p) => [p.id, p]));

    res.json({
      range: { from, to, period },
      items: grouped.map((g) => ({
        product: pmap.get(g.productId),
        quantitySold: g._sum.quantity || 0,
        revenue: g._sum.lineTotal || 0,
      })),
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// -------------------------------
// SALES SDC LIST (item-level rows for EBM reporting)
// -------------------------------
exports.salesSdcList = async (req, res) => {
  try {
    const { start, end, from, to, period } = resolveRange(req.query);
    const qTerm = s(req.query.q);
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;

    const dateCondition = {
      OR: [
        { saleDate: { gte: start, lte: end } },
        { saleDate: null, createdAt: { gte: start, lte: end } },
      ],
    };

    const searchCondition = qTerm
      ? {
          OR: [
            { sdcId: { contains: qTerm, mode: "insensitive" } },
            { buyerName: { contains: qTerm, mode: "insensitive" } },
            { buyerTin: { contains: qTerm, mode: "insensitive" } },
            { itemName: { contains: qTerm, mode: "insensitive" } },
            { receiptType: { contains: qTerm, mode: "insensitive" } },
          ],
        }
      : null;

    const where = searchCondition
      ? { AND: [dateCondition, searchCondition] }
      : dateCondition;

    const [total, rows] = await prisma.$transaction([
      prisma.salesSdcRow.count({ where }),
      prisma.salesSdcRow.findMany({
        where,
        orderBy: [{ saleDate: "desc" }, { createdAt: "desc" }],
        skip,
        take: limit,
      }),
    ]);

    return res.json({
      range: { from, to, period },
      meta: { total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) },
      rows,
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.listImportedSalesSdc = async (req, res) => {
  try {
    const { start, end, from, to, period } = resolveRange(req.query);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const skip = (page - 1) * limit;
    const searchTerm = s(req.query.q)?.toLowerCase();

    const dateCondition = {
      OR: [
        { saleDate: { gte: start, lte: end } },
        { saleDate: null, createdAt: { gte: start, lte: end } },
      ],
    };

    const searchCondition = searchTerm
      ? {
          OR: [
            { sdcId: { contains: searchTerm, mode: "insensitive" } },
            { buyerName: { contains: searchTerm, mode: "insensitive" } },
            { buyerTin: { contains: searchTerm, mode: "insensitive" } },
            { itemName: { contains: searchTerm, mode: "insensitive" } },
            { receiptType: { contains: searchTerm, mode: "insensitive" } },
          ],
        }
      : null;

    const where = searchCondition
      ? { AND: [dateCondition, searchCondition] }
      : dateCondition;

    const [total, rows] = await prisma.$transaction([
      prisma.salesSdcRow.count({ where }),
      prisma.salesSdcRow.findMany({
        where,
        orderBy: { saleDate: "desc" },
        skip,
        take: limit,
      }),
    ]);

    return res.json({
      range: { from, to, period },
      meta: { total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) },
      rows,
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// -------------------------------
// IMPORT SALES SDC FROM EXCEL
// -------------------------------
exports.importSalesSdc = async (req, res) => {
  try {
    const { fileBase64 } = req.body;
    if (!fileBase64) {
      return res.status(400).json({ message: "fileBase64 is required" });
    }

    const buffer = Buffer.from(String(fileBase64), "base64");
    const workbook = await createWorkbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return res.status(400).json({ message: "Excel sheet is missing" });
    }

    const headerRow = sheet.getRow(1);
    const columnMap = new Map();
    headerRow.eachCell((cell, colNumber) => {
      const norm = normalizeHeader(cell.text || cell.value);
      if (!norm) return;
      for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        if (aliases.includes(norm)) {
          columnMap.set(colNumber, field);
          break;
        }
      }
    });

    if (!columnMap.size) {
      return res.status(400).json({ message: "Unable to detect headers" });
    }

      const parsed = [];
      for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        if (!row || row.actualCellCount === 0) continue;

      const entry = {};
      let hasValue = false;
      columnMap.forEach((field, colNumber) => {
        const cell = row.getCell(colNumber);
        const value = readCellText(cell);
        if (value != null && String(value).trim()) hasValue = true;
        entry[field] = value;
      });
      if (!hasValue) continue;

      const sdcIdValue = entry.sdcId ? String(entry.sdcId).trim() : null;
      const itemNameValue = entry.itemName ? String(entry.itemName).trim() : null;
      if (!sdcIdValue || !itemNameValue) continue;

      const rowSaleDate = parseDate(entry.saleDate);
      parsed.push({
        sdcId: sdcIdValue,
        buyerTin: entry.buyerTin ? String(entry.buyerTin).trim() : null,
        buyerName: entry.buyerName ? String(entry.buyerName).trim() : null,
        saleDate: rowSaleDate || new Date(),
        receiptType: entry.receiptType ? String(entry.receiptType).trim() : null,
        itemName: itemNameValue,
        quantity: parseNumber(entry.quantity),
        unitPrice: parseNumber(entry.unitPrice),
        taxableSupplyPrice: parseNumber(entry.taxableSupplyPrice),
        vat: parseNumber(entry.vat),
        summaryAmount: parseNumber(entry.summaryAmount),
      });
    }

    if (!parsed.length) {
      return res.status(400).json({ message: "No rows found in the uploaded file" });
    }

    const uniqueKeys = parsed.map((row) => ({
      sdcId: row.sdcId,
      itemName: row.itemName || "",
    }));
    const existingRows = await prisma.salesSdcRow.findMany({
      where: {
        OR: uniqueKeys,
      },
    });
    const existingMap = new Map(
      existingRows.map((row) => [`${row.sdcId}__${row.itemName}`, row])
    );

    let inserted = 0;
    let updated = 0;

    for (const row of parsed) {
      const key = `${row.sdcId}__${row.itemName || ""}`;
      const data = {
        buyerTin: row.buyerTin,
        buyerName: row.buyerName,
        saleDate: row.saleDate,
        receiptType: row.receiptType,
        quantity: row.quantity != null ? row.quantity : undefined,
        unitPrice: row.unitPrice != null ? row.unitPrice : undefined,
        taxableSupplyPrice:
          row.taxableSupplyPrice != null ? row.taxableSupplyPrice : undefined,
        vat: row.vat != null ? row.vat : undefined,
        summaryAmount:
          row.summaryAmount != null ? row.summaryAmount : undefined,
        uploadedById: req.user?.id || null,
      };
      const existing = existingMap.get(key);
      if (existing) {
        await prisma.salesSdcRow.update({
          where: { id: existing.id },
          data,
        });
        updated++;
      } else {
        await prisma.salesSdcRow.create({
          data: {
            sdcId: row.sdcId,
            itemName: row.itemName,
            ...data,
          },
        });
        inserted++;
      }
    }

    return res.json({
      imported: inserted + updated,
      inserted,
      updated,
    });
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};

// -------------------------------
// STOCK MOVEMENT (IN/OUT/DAMAGE)
// -------------------------------
exports.stockMovement = async (req, res) => {
  try {
    const { start, end, from, to, period } = resolveRange(req.query);

    const grouped = await prisma.stockTransaction.groupBy({
      by: ["type"],
      where: { createdAt: { gte: start, lte: end } },
      _sum: { quantity: true },
      _count: { _all: true },
    });

    res.json({
      range: { from, to, period },
      movement: grouped.map((g) => ({
        type: g.type,
        transactions: g._count._all,
        quantity: g._sum.quantity || 0,
      })),
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// What this does: backfills SalesSdcRow from signed sales and returns (one-time migration helper)
exports.backfillSalesSdc = async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const batchSize = Math.min(Math.max(Number(req.query.batch) || 500, 100), 2000);

    let saleInserted = 0;
    let saleSkipped = 0;
    let returnInserted = 0;
    let returnSkipped = 0;

    let cursor = null;
    while (true) {
      const saleItems = await prisma.saleItem.findMany({
        where: { sale: { ebmStatus: "SIGNED" } },
        select: {
          id: true,
          productId: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
          sale: {
            select: {
              ebmInvoiceNo: true,
              invoiceNo: true,
              buyerTin: true,
              buyerName: true,
              createdAt: true,
            },
          },
          product: { select: { name: true } },
        },
        orderBy: { id: "asc" },
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (!saleItems.length) break;
      cursor = saleItems[saleItems.length - 1].id;

      const rows = [];
      for (const it of saleItems) {
        const sdcId = String(it.sale?.ebmInvoiceNo || "").trim();
        if (!sdcId) {
          saleSkipped += 1;
          continue;
        }
        const itemName = it.product?.name || it.productId;
        const lineTotal = Number(it.lineTotal || 0);
        rows.push({
          sdcId,
          buyerTin: it.sale?.buyerTin || null,
          buyerName: it.sale?.buyerName || null,
          saleDate: it.sale?.createdAt || null,
          receiptType: "Sale",
          itemName,
          quantity: Number(it.quantity || 0),
          unitPrice: Number(it.unitPrice || 0),
          taxableSupplyPrice: lineTotal,
          vat: 0,
          summaryAmount: lineTotal,
          uploadedById: userId,
        });
      }

      if (rows.length) {
        const result = await prisma.salesSdcRow.createMany({
          data: rows,
          skipDuplicates: true,
        });
        saleInserted += result.count || 0;
      }
    }

    cursor = null;
    while (true) {
      const returnItems = await prisma.saleReturnItem.findMany({
        where: {
          return: {
            sale: { ebmStatus: { in: ["SIGNED", "CREDITED"] } },
          },
        },
        select: {
          id: true,
          productId: true,
          locationId: true,
          binId: true,
          quantity: true,
          product: { select: { name: true } },
          return: {
            select: {
              createdAt: true,
              sale: {
                select: {
                  id: true,
                  ebmInvoiceNo: true,
                  invoiceNo: true,
                  buyerTin: true,
                  buyerName: true,
                },
              },
            },
          },
        },
        orderBy: { id: "asc" },
        take: batchSize,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      if (!returnItems.length) break;
      cursor = returnItems[returnItems.length - 1].id;

      const saleIds = [
        ...new Set(
          returnItems
            .map((it) => it.return?.sale?.id)
            .filter(Boolean)
        ),
      ];

      const priceRows = saleIds.length
        ? await prisma.saleItem.findMany({
            where: { saleId: { in: saleIds } },
            select: {
              saleId: true,
              productId: true,
              locationId: true,
              binId: true,
              unitPrice: true,
            },
          })
        : [];

      const priceMap = new Map(
        priceRows.map((row) => [
          `${row.saleId}:${row.productId}:${row.locationId}:${row.binId}`,
          Number(row.unitPrice || 0),
        ])
      );

      const rows = [];
      for (const it of returnItems) {
        const sale = it.return?.sale;
        const sdcId = String(sale?.ebmInvoiceNo || "").trim();
        if (!sdcId) {
          returnSkipped += 1;
          continue;
        }
        const qty = -Math.abs(Number(it.quantity || 0));
        const key = sale
          ? `${sale.id}:${it.productId}:${it.locationId}:${it.binId}`
          : "";
        const unitPrice = key && priceMap.has(key) ? priceMap.get(key) : 0;
        const taxable = unitPrice * Math.abs(qty);
        const productName = it.product?.name || "";
        const itemName = productName
          ? `Refund ${sale.invoiceNo} ${productName}`
          : `Return ${sale.invoiceNo}`;

        rows.push({
          sdcId,
          buyerTin: sale?.buyerTin || null,
          buyerName: sale?.buyerName || null,
          saleDate: it.return?.createdAt || null,
          receiptType: "Refund after Sale",
          itemName,
          quantity: qty,
          unitPrice: unitPrice ? -unitPrice : 0,
          taxableSupplyPrice: taxable ? -Math.abs(taxable) : 0,
          vat: 0,
          summaryAmount: taxable ? -Math.abs(taxable) : 0,
          uploadedById: userId,
        });
      }

      if (rows.length) {
        const result = await prisma.salesSdcRow.createMany({
          data: rows,
          skipDuplicates: true,
        });
        returnInserted += result.count || 0;
      }
    }

    return res.json({
      message: "Backfill complete",
      sales: { inserted: saleInserted, skipped: saleSkipped },
      returns: { inserted: returnInserted, skipped: returnSkipped },
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// -------------------------------
// CASHFLOW (inflow from sales, outflow from expenses)
// -------------------------------
exports.cashflow = async (req, res) => {
  try {
    const { start, end, from, to, period } = resolveRange(req.query);

    const [salesByPayment, expenseByPayment, expenseByCategory, stockIns] = await prisma.$transaction([
      prisma.sale.groupBy({
        by: ["paymentMethod"],
        where: { createdAt: { gte: start, lte: end } },
        _sum: { total: true },
        _count: { _all: true },
        orderBy: { _sum: { total: "desc" } },
      }),
      prisma.expense.groupBy({
        by: ["paymentMethod"],
        where: { isDeleted: false, date: { gte: start, lte: end } },
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { _sum: { amount: "desc" } },
      }),
      prisma.expense.groupBy({
        by: ["category"],
        where: { isDeleted: false, date: { gte: start, lte: end } },
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { _sum: { amount: "desc" } },
      }),
      prisma.stockTransaction.findMany({
        where: {
          type: "IN",
          createdAt: { gte: start, lte: end },
          unitCost: { not: null },
        },
        select: { unitCost: true, quantity: true },
      }),
    ]);

    const stockPurchaseOut = stockIns.reduce((sum, t) => {
      const cost = Number(t.unitCost);
      const qty = Number(t.quantity);
      if (Number.isNaN(cost) || Number.isNaN(qty)) return sum;
      return sum + cost * qty;
    }, 0);

    const inflow = salesByPayment.reduce((sum, row) => sum + Number(row._sum.total || 0), 0);
    const expenseOutflow = expenseByPayment.reduce((sum, row) => sum + Number(row._sum.amount || 0), 0);

    const round2 = (value) => Number(Number(value || 0).toFixed(2));

    res.json({
      range: { from, to, period },
      inflow: {
        salesTotal: round2(inflow),
        byPaymentMethod: salesByPayment.map((row) => ({
          paymentMethod: row.paymentMethod,
          count: row._count._all,
          amount: round2(row._sum.total),
        })),
      },
      outflow: {
        expensesTotal: round2(expenseOutflow),
        byPaymentMethod: expenseByPayment.map((row) => ({
          paymentMethod: row.paymentMethod,
          count: row._count._all,
          amount: round2(row._sum.amount),
        })),
        byCategory: expenseByCategory.map((row) => ({
          category: row.category,
          count: row._count._all,
          amount: round2(row._sum.amount),
        })),
        // Backward compatibility for existing UI cards
        stockPurchasesEstimated: round2(stockPurchaseOut),
      },
      net: round2(inflow - expenseOutflow),
      legacyNetStockEstimate: round2(inflow - stockPurchaseOut),
      note:
        "Outflow now uses Expense records (isDeleted=false). stockPurchasesEstimated is kept for backward compatibility.",
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// -------------------------------
// ✅ PROFIT REPORT (Revenue - Estimated COGS)
// -------------------------------
exports.profit = async (req, res) => {
  try {
    const { start, end, from, to, period } = resolveRange(req.query);

    // Revenue: sum of sales totals in period
    const revenueAgg = await prisma.sale.aggregate({
      where: { createdAt: { gte: start, lte: end } },
      _sum: { total: true },
      _count: { _all: true },
    });

    const revenue = Number(revenueAgg._sum.total || 0);

    // Qty sold per product in period
    const soldGrouped = await prisma.saleItem.groupBy({
      by: ["productId"],
      where: { createdAt: { gte: start, lte: end } },
      _sum: { quantity: true, lineTotal: true },
    });

    if (soldGrouped.length === 0) {
      return res.json({
        range: { from, to, period },
        revenue: 0,
        cogsEstimated: 0,
        grossProfit: 0,
        marginPct: null,
        items: [],
        note:
          "No sales found in this period. COGS is estimated using weighted average unitCost from StockTransaction IN.",
      });
    }

    const productIds = soldGrouped.map((g) => g.productId);

    // Weighted average unitCost per product from ALL historical stock-ins
    const ins = await prisma.stockTransaction.findMany({
      where: {
        type: "IN",
        productId: { in: productIds },
        unitCost: { not: null },
      },
      select: { productId: true, unitCost: true, quantity: true },
    });

    const costMap = new Map(); // productId -> { totalCost, totalQty }
    for (const t of ins) {
      const pid = t.productId;
      const qty = Number(t.quantity);
      const cost = Number(t.unitCost);
      if (Number.isNaN(qty) || Number.isNaN(cost) || qty <= 0) continue;

      if (!costMap.has(pid)) costMap.set(pid, { totalCost: 0, totalQty: 0 });
      const x = costMap.get(pid);
      x.totalCost += cost * qty;
      x.totalQty += qty;
    }

    const products = await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true, partNumber: true, brand: true, category: true },
    });
    const pmap = new Map(products.map((p) => [p.id, p]));

    let cogsEstimated = 0;

    const items = soldGrouped
      .map((g) => {
        const qtySold = Number(g._sum.quantity || 0);
        const salesAmount = Number(g._sum.lineTotal || 0);

        const costInfo = costMap.get(g.productId);
        const avgUnitCost =
          costInfo && costInfo.totalQty > 0 ? costInfo.totalCost / costInfo.totalQty : 0;

        const cogs = avgUnitCost * qtySold;
        cogsEstimated += cogs;

        return {
          product: pmap.get(g.productId),
          qtySold,
          salesAmount: Number(salesAmount.toFixed(2)),
          avgUnitCost: Number(avgUnitCost.toFixed(2)),
          cogsEstimated: Number(cogs.toFixed(2)),
          grossProfit: Number((salesAmount - cogs).toFixed(2)),
        };
      })
      .sort((a, b) => b.grossProfit - a.grossProfit);

    const grossProfit = revenue - cogsEstimated;
    const marginPct = revenue > 0 ? Number(((grossProfit / revenue) * 100).toFixed(2)) : null;

    return res.json({
      range: { from, to, period },
      revenue: Number(revenue.toFixed(2)),
      cogsEstimated: Number(cogsEstimated.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      marginPct,
      items,
      note:
        "COGS is estimated using weighted average unitCost from StockTransaction IN for each product. For exact accounting later, add FIFO batches or store cost snapshot per SaleItem.",
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// -------------------------------
// AUDIT LOGS
// -------------------------------
exports.auditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Number(page) - 1) * take;

    const where = {};
    // Optional range filter (supports period too)
    if (req.query.from && req.query.to) {
      const { start, end } = resolveRange(req.query);
      where.createdAt = { gte: start, lte: end };
    } else if (req.query.period) {
      const { start, end } = resolveRange(req.query);
      where.createdAt = { gte: start, lte: end };
    }

    const category = s(req.query.category);
    const userId = s(req.query.userId);
    const action = s(req.query.action);
    const q = s(req.query.q);

    if (category) {
      // Group common actions into a few logical “audit categories".
      if (category === "accounting") {
        // Account-related actions: journal entries + COA changes
        where.OR = [
          { action: { startsWith: "JOURNAL_" } },
          { action: { in: ["CREATE_ACCOUNT", "UPDATE_ACCOUNT", "SEED_DEFAULT_ACCOUNTS"] } },
        ];
      } else if (category === "stock") {
        where.OR = [{ action: { startsWith: "STOCK_" } }];
      } else if (category === "hr") {
        where.OR = [{ action: { startsWith: "HR_" } }];
      } else if (category === "sales") {
        where.OR = [{ action: { contains: "SALE", mode: "insensitive" } }];
      }
    }

    if (userId) {
      where.userId = userId;
    }

    if (action) {
      where.action = { contains: action, mode: "insensitive" };
    }

    if (q) {
      where.OR = (where.OR || []).concat([
        { details: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
      ]);
    }

    const [total, logs] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: { user: { select: { id: true, fullName: true, role: true, email: true } } },
      }),
    ]);

    res.json({
      meta: { total, page: Number(page), limit: take, pages: Math.ceil(total / take) },
      logs,
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// -------------------------------
// STOCK TRANSACTIONS (IN/OUT/DAMAGE)
// -------------------------------
exports.stockTransactions = async (req, res) => {
  try {
    const { type, page = 1, limit = 20 } = req.query;

    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Number(page) - 1) * take;

    const where = {};
    if (type) where.type = type;

    // Optional range filter (supports period too)
    if (req.query.from && req.query.to) {
      const { start, end } = resolveRange(req.query);
      where.createdAt = { gte: start, lte: end };
    } else if (req.query.period) {
      const { start, end } = resolveRange(req.query);
      where.createdAt = { gte: start, lte: end };
    }

    const [total, transactions] = await prisma.$transaction([
      prisma.stockTransaction.count({ where }),
      prisma.stockTransaction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          product: { select: { id: true, name: true, sku: true, partNumber: true } },
          location: { select: { id: true, name: true } },
          user: { select: { id: true, fullName: true, role: true } },
        },
      }),
    ]);

    res.json({
      meta: { total, page: Number(page), limit: take, pages: Math.ceil(total / take) },
      transactions,
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};
// -------------------------------
// EBM SUMMARY (counts + totals by status)
// GET /api/reports/ebm/summary?period=this_week
// -------------------------------
exports.ebmSummary = async (req, res) => {
  try {
    const { start, end, from, to, period } = resolveRange(req.query);

    const grouped = await prisma.sale.groupBy({
      by: ["ebmStatus"],
      where: { createdAt: { gte: start, lte: end } },
      _count: { _all: true },
      _sum: { total: true },
    });

    // What this does: computes totals across all statuses
    const totals = grouped.reduce(
      (acc, g) => {
        acc.invoices += g._count._all;
        acc.amount += Number(g._sum.total || 0);
        return acc;
      },
      { invoices: 0, amount: 0 }
    );

    res.json({
      range: { from, to, period },
      totals: {
        invoices: totals.invoices,
        amount: Number(totals.amount.toFixed(2)),
      },
      byStatus: grouped.map((g) => ({
        ebmStatus: g.ebmStatus,
        invoices: g._count._all,
        amount: Number(Number(g._sum.total || 0).toFixed(2)),
      })),
      tip: "PENDING invoices should be issued/confirmed in EBM 2.1 then saved via /ebm-confirm.",
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// -------------------------------
// EBM PENDING LIST (invoice list)
// GET /api/reports/ebm/pending?period=this_week&page=1&limit=50
// -------------------------------
exports.ebmPending = async (req, res) => {
  try {
    const { start, end, from, to, period } = resolveRange(req.query);

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const where = {
      createdAt: { gte: start, lte: end },
      ebmStatus: "PENDING", // if enum, Prisma accepts string values too
    };

    const [total, rows] = await prisma.$transaction([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          invoiceNo: true,
          createdAt: true,
          total: true,
          paymentMethod: true,

          buyerType: true,
          buyerTin: true,
          buyerName: true,
          buyerPhone: true,

          ebmStatus: true,
          ebmIssuedAt: true,
          ebmReceiptSignature: true,

          cashier: { select: { id: true, fullName: true } },
        },
      }),
    ]);

    res.json({
      range: { from, to, period },
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
      pending: rows,
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};
// -------------------------------
// EBM PENDING BY CASHIER
// GET /api/reports/ebm/pending-by-cashier?period=this_week
// -------------------------------
// -------------------------------
// EBM PENDING BY CASHIER + INVOICE LIST
// GET /api/reports/ebm/pending-by-cashier?period=this_week&invoiceLimit=10
// -------------------------------
exports.pendingByCashier = async (req, res) => {
  try {
    const { start, end, from, to, period } = resolveRange(req.query);
    const invoiceLimit = Math.min(Number(req.query.invoiceLimit) || 10, 50);

    // 1) Group PENDING EBM sales by cashierId (counts + total amount)
    const grouped = await prisma.sale.groupBy({
      by: ["cashierId"],
      where: {
        createdAt: { gte: start, lte: end },
        ebmStatus: "PENDING",
      },
      _count: { _all: true },
      _sum: { total: true },
      orderBy: { _sum: { total: "desc" } },
    });

    const cashierIds = grouped.map((g) => g.cashierId);

    // If none pending, return empty
    if (cashierIds.length === 0) {
      return res.json({
        range: { from, to, period },
        byCashier: [],
        tip: "No pending EBM invoices for the selected period.",
      });
    }

    // 2) Fetch cashier details
    const cashiers = await prisma.user.findMany({
      where: { id: { in: cashierIds } },
      select: { id: true, fullName: true, email: true, role: true },
    });
    const cmap = new Map(cashiers.map((c) => [c.id, c]));

    // 3) Fetch pending invoices list (we fetch all pending in range, then group in JS)
    //    This is simple and safe; if you later have huge volumes, we can optimize.
    const pendingSales = await prisma.sale.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        ebmStatus: "PENDING",
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        cashierId: true,
        invoiceNo: true,
        createdAt: true,
        total: true,
        paymentMethod: true,
        buyerType: true,
        buyerTin: true,
        buyerName: true,
        buyerPhone: true,
      },
    });

    // Group invoices by cashierId
    const invMap = new Map(); // cashierId -> invoiceList[]
    for (const s of pendingSales) {
      if (!invMap.has(s.cashierId)) invMap.set(s.cashierId, []);
      const list = invMap.get(s.cashierId);

      // Keep only up to invoiceLimit
      if (list.length < invoiceLimit) {
        list.push({
          id: s.id,
          invoiceNo: s.invoiceNo,
          createdAt: s.createdAt,
          total: s.total,
          paymentMethod: s.paymentMethod,
          buyerType: s.buyerType,
          buyerTin: s.buyerTin,
          buyerName: s.buyerName,
          buyerPhone: s.buyerPhone,
        });
      }
    }

    // 4) Response
    return res.json({
      range: { from, to, period },
      invoiceLimit,
      byCashier: grouped.map((g) => ({
        cashier: cmap.get(g.cashierId) || { id: g.cashierId },
        invoices: g._count._all,
        amount: Number(Number(g._sum.total || 0).toFixed(2)),
        latestInvoices: invMap.get(g.cashierId) || [],
      })),
      tip: "Each cashier list shows latest pending invoices. Cashier should issue/confirm EBM and save signature via /ebm-confirm.",
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// -------------------------------
// MARK EBM AS FAILED (Manager/CEO)
// POST /api/reports/ebm/:saleId/mark-failed
// Body: { reason: "..." }
// -------------------------------
exports.markEbmFailed = async (req, res) => {
  try {
    const { saleId } = req.params;
    const reason = req.body?.reason ? String(req.body.reason).trim() : "";

    if (!reason) {
      return res.status(400).json({ message: "reason is required" });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        select: { id: true, invoiceNo: true, ebmStatus: true, total: true },
      });

      if (!sale) {
        const err = new Error("Sale not found");
        err.status = 404;
        throw err;
      }

      // Only allow marking failed if pending (keeps workflow clean)
      if (sale.ebmStatus !== "PENDING") {
        const err = new Error(`Cannot mark FAILED because current status is ${sale.ebmStatus}`);
        err.status = 409;
        throw err;
      }

      const u = await tx.sale.update({
        where: { id: saleId },
        data: {
          ebmStatus: "FAILED",
        },
      });

      // Audit log for manager traceability
      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "EBM_MARK_FAILED",
          details: `Marked EBM FAILED for invoice=${sale.invoiceNo} total=${sale.total}. Reason: ${reason}`,
        },
      });

      return u;
    });

    return res.json({
      message: "EBM status updated to FAILED",
      sale: updated,
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};
// -------------------------------
// MARK EBM AS PENDING AGAIN (Manager/CEO)
// POST /api/reports/ebm/:saleId/mark-pending
// Body: { reason?: "..." }
// -------------------------------
exports.markEbmPending = async (req, res) => {
  try {
    const { saleId } = req.params;
    const reason = req.body?.reason ? String(req.body.reason).trim() : "";

    const updated = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        select: { id: true, invoiceNo: true, ebmStatus: true, total: true },
      });

      if (!sale) {
        const err = new Error("Sale not found");
        err.status = 404;
        throw err;
      }

      // What this does: allows reopening only if it was FAILED (clean workflow)
      if (sale.ebmStatus !== "FAILED") {
        const err = new Error(`Cannot mark PENDING because current status is ${sale.ebmStatus}`);
        err.status = 409;
        throw err;
      }

      const u = await tx.sale.update({
        where: { id: saleId },
        data: {
          ebmStatus: "PENDING",
        },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "EBM_MARK_PENDING",
          details: `Marked EBM PENDING for invoice=${sale.invoiceNo} total=${sale.total}. ${reason ? "Reason: " + reason : ""}`,
        },
      });

      return u;
    });

    return res.json({
      message: "EBM status updated to PENDING",
      sale: updated,
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};


// What this does: provides Manager advanced KPIs, audit viewer, Excel export, and stock valuation reports
const prisma = require("../prisma");
const { createWorkbook } = require("../utils/safeExcel");
const { handleError } = require("../utils/errors");

// -----------------------------
// Helpers
// -----------------------------
const KIGALI_OFFSET_MS = 2 * 60 * 60 * 1000;

function toKigaliParts(dateUtc = new Date()) {
  // What this does: converts a UTC date to Kigali "local" date parts by applying UTC+2 offset
  const k = new Date(dateUtc.getTime() + KIGALI_OFFSET_MS);
  return { year: k.getUTCFullYear(), month: k.getUTCMonth(), day: k.getUTCDate(), dow: k.getUTCDay() };
}

function kigaliMidnightUtc(year, month0, day) {
  // What this does: returns a UTC Date representing 00:00 Kigali time for the given Kigali date
  return new Date(Date.UTC(year, month0, day, 0, 0, 0, 0) - KIGALI_OFFSET_MS);
}

function rangeFromQuery(q) {
  // What this does: supports ?period=today|this_week|this_month|this_year OR ?from&to (YYYY-MM-DD)
  if (q.from && q.to) {
    const fromStr = String(q.from).trim();
    const toStr = String(q.to).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
      const err = new Error("from/to must be YYYY-MM-DD");
      err.status = 400;
      throw err;
    }
    const [fy, fm, fd] = fromStr.split("-").map(Number);
    const [ty, tm, td] = toStr.split("-").map(Number);

    const start = kigaliMidnightUtc(fy, fm - 1, fd);
    const end = new Date(kigaliMidnightUtc(ty, tm - 1, td).getTime() + 24 * 60 * 60 * 1000 - 1);
    return { start, end, from: fromStr, to: toStr, period: null };
  }

  const period = String(q.period || "today").trim().toLowerCase();
  const now = new Date();
  const { year, month, day, dow } = toKigaliParts(now);

  let start;
  let end;

  if (period === "today") {
    start = kigaliMidnightUtc(year, month, day);
    end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  } else if (period === "this_week") {
    const mondayDelta = dow === 0 ? 6 : dow - 1;
    start = kigaliMidnightUtc(year, month, day - mondayDelta);
    end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
  } else if (period === "this_month") {
    start = kigaliMidnightUtc(year, month, 1);
    const nextMonthStart = kigaliMidnightUtc(month === 11 ? year + 1 : year, month === 11 ? 0 : month + 1, 1);
    end = new Date(nextMonthStart.getTime() - 1);
  } else if (period === "this_year") {
    start = kigaliMidnightUtc(year, 0, 1);
    end = new Date(kigaliMidnightUtc(year + 1, 0, 1).getTime() - 1);
  } else {
    start = kigaliMidnightUtc(year, month, day);
    end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
  }

  return { start, end, from: null, to: null, period };
}

function n(v) {
  // What this does: converts Prisma Decimal/unknown to safe Number
  const x = Number(v || 0);
  return Number.isNaN(x) ? 0 : x;
}
function round2(v) {
  return Number(n(v).toFixed(2));
}
function fmtDateTime(d) {
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  const hh = String(x.getHours()).padStart(2, "0");
  const mm = String(x.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}
function styleHeaderRow(ws) {
  // What this does: makes sheet header row bold and freezes top row
  const r = ws.getRow(1);
  r.font = { bold: true };
  r.alignment = { vertical: "middle" };
  r.height = 18;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

// -----------------------------
// 1) KPIs Dashboard
// GET /api/manager/kpis?period=... OR from&to
// -----------------------------
exports.kpis = async (req, res) => {
  try {
    const { start, end, from, to, period } = rangeFromQuery(req.query);

    const result = await prisma.$transaction(async (tx) => {
      // Sales revenue + count
      const salesAgg = await tx.sale.aggregate({
        where: { createdAt: { gte: start, lte: end } },
        _sum: { total: true },
        _count: { _all: true },
      });

      // Payment split
      const payments = await tx.sale.groupBy({
        by: ["paymentMethod"],
        where: { createdAt: { gte: start, lte: end } },
        _sum: { total: true },
        _count: { _all: true },
        orderBy: { _sum: { total: "desc" } },
      });

      // EBM status summary
      const ebm = await tx.sale.groupBy({
        by: ["ebmStatus"],
        where: { createdAt: { gte: start, lte: end } },
        _count: { _all: true },
        _sum: { total: true },
        orderBy: { _sum: { total: "desc" } }, // ✅ order by amount instead of _count._all
      });


      // Returns count (value not stored yet)
      const returnsCount = await tx.saleReturn.count({
        where: { createdAt: { gte: start, lte: end } },
      });

      // Expenses outflow in selected period (ignore soft-deleted)
      const expensesAgg = await tx.expense.aggregate({
        where: { isDeleted: false, date: { gte: start, lte: end } },
        _sum: { amount: true },
        _count: { _all: true },
      });

      // Best sellers by quantity
      const best = await tx.saleItem.groupBy({
        by: ["productId"],
        where: { createdAt: { gte: start, lte: end } },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { quantity: "desc" } },
        take: 10,
      });

      const productIds = best.map((b) => b.productId);
      const products = productIds.length
        ? await tx.product.findMany({
          where: { id: { in: productIds } },
          select: { id: true, name: true, sku: true, partNumber: true, brand: true, category: true, costPrice: true },
        })
        : [];
      const pMap = new Map(products.map((p) => [p.id, p]));

      // Profit estimate: revenue - estimated COGS using product.costPrice
      let estimatedCogs = 0;
      for (const row of best) {
        const prod = pMap.get(row.productId);
        const qty = Number(row._sum.quantity || 0);
        const cost = prod ? n(prod.costPrice) : 0;
        estimatedCogs += cost * qty;
      }

      // Low stock alerts (top 20)
      const invGroups = await tx.inventory.groupBy({
        by: ["productId"],
        _sum: { quantity: true },
      });
      const invProductIds = invGroups.map((x) => x.productId);

      const invProducts = invProductIds.length
        ? await tx.product.findMany({
          where: { id: { in: invProductIds }, isActive: true },
          select: { id: true, name: true, sku: true, partNumber: true, minStock: true },
        })
        : [];
      const invPMap = new Map(invProducts.map((p) => [p.id, p]));

      const lowStock = invGroups
        .map((g) => {
          const p = invPMap.get(g.productId);
          if (!p) return null;
          const qty = Number(g._sum.quantity || 0);
          if (p.minStock != null && qty <= p.minStock) return { product: p, totalQty: qty, minStock: p.minStock };
          return null;
        })
        .filter(Boolean)
        .sort((a, b) => a.totalQty - b.totalQty)
        .slice(0, 20);

      return {
        salesCount: salesAgg._count._all,
        revenue: n(salesAgg._sum.total),
        payments,
        ebm,
        returnsCount,
        expensesTotal: n(expensesAgg._sum.amount),
        expensesCount: expensesAgg._count._all,
        best,
        pMap,
        estimatedCogs,
        lowStock,
      };
    });

    return res.json({
      range: { period, from, to, start, end },
      kpis: {
        salesCount: result.salesCount,
        revenue: round2(result.revenue),
        estimatedCogs: round2(result.estimatedCogs),
        profitEstimate: round2(result.revenue - result.estimatedCogs),
        expensesTotal: round2(result.expensesTotal),
        netAfterExpenses: round2(result.revenue - result.expensesTotal),
        expensesCount: result.expensesCount,
        returnsCount: result.returnsCount,
      },
      paymentSplit: result.payments.map((x) => ({
        paymentMethod: x.paymentMethod,
        count: x._count._all,
        amount: round2(x._sum.total),
      })),
      ebmSummary: result.ebm.map((x) => ({
        ebmStatus: x.ebmStatus,
        count: x._count._all,
        amount: round2(x._sum.total),
      })),
      bestSellers: result.best.map((x) => {
        const p = result.pMap.get(x.productId);
        return {
          product: p ? { id: p.id, name: p.name, sku: p.sku, partNumber: p.partNumber, brand: p.brand, category: p.category } : { id: x.productId },
          qty: Number(x._sum.quantity || 0),
          amount: round2(x._sum.lineTotal),
        };
      }),
      lowStock: result.lowStock,
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// -----------------------------
// 2) Sales Export to Excel
// GET /api/manager/sales/export/excel?period=... OR from&to
// -----------------------------
exports.exportSalesExcel = async (req, res) => {
  try {
    const { start, end, from, to, period } = rangeFromQuery(req.query);

    const sales = await prisma.sale.findMany({
      where: { createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: "desc" },
      include: {
        cashier: { select: { fullName: true, email: true } },
        items: {
          include: {
            product: { select: { name: true, sku: true, partNumber: true, brand: true, category: true } },
            location: { select: { name: true } },
            bin: { select: { code: true } },
          },
        },
      },
    });

    const wb = await createWorkbook();
    wb.creator = "Altas System";
    wb.created = new Date();

    // Sheet 1: Sales
    const ws = wb.addWorksheet("Sales");
    ws.columns = [
      { header: "Date", key: "date", width: 18 },
      { header: "InvoiceNo", key: "invoiceNo", width: 16 },
      { header: "Cashier", key: "cashier", width: 18 },
      { header: "PaymentMethod", key: "method", width: 14 },
      { header: "BuyerType", key: "buyerType", width: 12 },
      { header: "BuyerTin", key: "buyerTin", width: 16 },
      { header: "Subtotal", key: "subtotal", width: 12 },
      { header: "Discount", key: "discount", width: 12 },
      { header: "Tax", key: "tax", width: 12 },
      { header: "Total", key: "total", width: 12 },
      { header: "EBMStatus", key: "ebmStatus", width: 14 },
    ];
    styleHeaderRow(ws);

    let totalSum = 0;

    sales.forEach((s) => {
      totalSum += n(s.total);

      ws.addRow({
        date: fmtDateTime(s.createdAt),
        invoiceNo: s.invoiceNo,
        cashier: s.cashier?.fullName || "",
        method: s.paymentMethod,
        buyerType: s.buyerType,
        buyerTin: s.buyerTin || "",
        subtotal: round2(s.subtotal),
        discount: round2(s.discountTotal),
        tax: round2(s.taxTotal),
        total: round2(s.total),
        ebmStatus: s.ebmStatus,
      });
    });

    ws.addRow({});
    const tr = ws.addRow({ invoiceNo: "TOTAL", total: round2(totalSum) });
    tr.font = { bold: true };

    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell((cell) => {
        if (typeof cell.value === "number") cell.numFmt = "#,##0.00";
      });
    });

    // Sheet 2: SaleItems (line details)
    const ws2 = wb.addWorksheet("SaleItems");
    ws2.columns = [
      { header: "InvoiceNo", key: "invoiceNo", width: 16 },
      { header: "Date", key: "date", width: 18 },
      { header: "Product", key: "product", width: 26 },
      { header: "SKU", key: "sku", width: 14 },
      { header: "PartNumber", key: "partNumber", width: 16 },
      { header: "Brand", key: "brand", width: 12 },
      { header: "Category", key: "category", width: 14 },
      { header: "Location", key: "location", width: 14 },
      { header: "Bin", key: "bin", width: 10 },
      { header: "Qty", key: "qty", width: 8 },
      { header: "UnitPrice", key: "unitPrice", width: 12 },
      { header: "Discount", key: "discount", width: 12 },
      { header: "LineTotal", key: "lineTotal", width: 12 },
    ];
    styleHeaderRow(ws2);

    sales.forEach((s) => {
      s.items.forEach((it) => {
        ws2.addRow({
          invoiceNo: s.invoiceNo,
          date: fmtDateTime(s.createdAt),
          product: it.product?.name || "",
          sku: it.product?.sku || "",
          partNumber: it.product?.partNumber || "",
          brand: it.product?.brand || "",
          category: it.product?.category || "",
          location: it.location?.name || "",
          bin: it.bin?.code || "",
          qty: it.quantity,
          unitPrice: round2(it.unitPrice),
          discount: round2(it.discount),
          lineTotal: round2(it.lineTotal),
        });
      });
    });

    ws2.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      row.eachCell((cell) => {
        if (typeof cell.value === "number") cell.numFmt = "#,##0.00";
      });
    });

    const filename = `ALTAS_Sales_${period || (from && to ? `${from}_to_${to}` : "range")}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// -----------------------------
// 3) Audit Viewer
// GET /api/manager/audit?from&to&userId&action&q&page&limit
// -----------------------------
exports.auditViewer = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const where = {};

    // Date range filter (optional)
    if (req.query.from && req.query.to) {
      const { start, end } = rangeFromQuery({ from: req.query.from, to: req.query.to });
      where.createdAt = { gte: start, lte: end };
    }

    if (req.query.userId) where.userId = String(req.query.userId).trim();
    if (req.query.action) where.action = String(req.query.action).trim();

    if (req.query.q) {
      const q = String(req.query.q).trim();
      where.OR = [{ details: { contains: q, mode: "insensitive" } }, { action: { contains: q, mode: "insensitive" } }];
    }

    const [total, rows] = await prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: { user: { select: { id: true, fullName: true, email: true, role: true } } },
      }),
    ]);

    return res.json({
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
      rows,
    });
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};

// -----------------------------
// 4) Stock Valuation
// GET /api/manager/stock/valuation?locationId=...
// -----------------------------
exports.stockValuation = async (req, res) => {
  try {
    const locationId = req.query.locationId ? String(req.query.locationId).trim() : null;

    // Sum inventory quantities per product
    const invGroups = await prisma.inventory.groupBy({
      by: ["productId"],
      where: locationId ? { locationId } : undefined,
      _sum: { quantity: true },
    });

    const productIds = invGroups.map((x) => x.productId);
    const products = productIds.length
      ? await prisma.product.findMany({
        where: { id: { in: productIds }, isActive: true },
        select: { id: true, name: true, sku: true, partNumber: true, brand: true, category: true, costPrice: true, sellPrice: true },
      })
      : [];

    const pMap = new Map(products.map((p) => [p.id, p]));

    let totalQty = 0;
    let totalCostValue = 0;
    let totalSellValue = 0;

    // Group by category summary
    const byCategory = new Map();

    const rows = invGroups
      .map((g) => {
        const p = pMap.get(g.productId);
        if (!p) return null;

        const qty = Number(g._sum.quantity || 0);
        const cost = n(p.costPrice);
        const sell = n(p.sellPrice);

        const costValue = cost * qty;
        const sellValue = sell * qty;

        totalQty += qty;
        totalCostValue += costValue;
        totalSellValue += sellValue;

        const cat = p.category || "UNCATEGORIZED";
        if (!byCategory.has(cat)) byCategory.set(cat, { category: cat, qty: 0, costValue: 0, sellValue: 0 });

        const agg = byCategory.get(cat);
        agg.qty += qty;
        agg.costValue += costValue;
        agg.sellValue += sellValue;

        return {
          product: { id: p.id, name: p.name, sku: p.sku, partNumber: p.partNumber, brand: p.brand, category: p.category },
          qty,
          costPrice: round2(cost),
          sellPrice: round2(sell),
          costValue: round2(costValue),
          sellValue: round2(sellValue),
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.costValue - a.costValue);

    return res.json({
      locationFilter: locationId || null,
      totals: {
        distinctProducts: rows.length,
        totalQty,
        totalCostValue: round2(totalCostValue),
        totalSellValue: round2(totalSellValue),
        potentialGrossProfit: round2(totalSellValue - totalCostValue),
      },
      byCategory: Array.from(byCategory.values())
        .map((x) => ({
          category: x.category,
          qty: x.qty,
          costValue: round2(x.costValue),
          sellValue: round2(x.sellValue),
        }))
        .sort((a, b) => b.costValue - a.costValue),
      rows,
      note: "Valuation is computed from Inventory quantities × Product costPrice/sellPrice.",
    });
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};


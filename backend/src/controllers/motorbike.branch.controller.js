// What this does: provides branch-level summaries/details and keeps min-stock settings synchronized.
const prisma = require("../prisma");
const { handleError } = require("../utils/errors");
const {
  normalizeBranchKey,
  branchNameFromCounterId,
  listBranchCounterRows,
  parseCounterValue,
  toBranchMinStockMap,
  setBranchMinStock,
} = require("../utils/branchMinStock");

function s(v) {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

function toNum(value) {
  if (value && typeof value.toNumber === "function") return value.toNumber();
  const n = Number(value || 0);
  return Number.isNaN(n) ? 0 : n;
}

function normalizeBranchLabel(value) {
  return value || "Unassigned";
}

function branchMapKey(value) {
  return normalizeBranchKey(value) || "__unassigned__";
}

function buildBranchFilter(branch) {
  const name = s(branch);
  if (!name) return { label: "Unassigned", filter: { branchName: null } };
  if (name.toLowerCase() === "unassigned") {
    return { label: "Unassigned", filter: { branchName: null } };
  }
  return {
    label: name,
    filter: { branchName: { equals: name, mode: "insensitive" } },
  };
}

function parseNonNegativeInteger(value, fieldName) {
  const raw = s(value);
  if (raw == null) return null;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    const err = new Error(`${fieldName} must be an integer >= 0`);
    err.status = 400;
    throw err;
  }
  return parsed;
}

exports.listBranches = async (req, res) => {
  try {
    const q = s(req.query.q)?.toLowerCase() || "";
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const [locations, productGroups, promoGroups, counterRows] = await Promise.all([
      prisma.location.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.product.groupBy({
        by: ["branchName"],
        where: { category: "Motorbike", isActive: true },
        _count: { _all: true },
        _sum: { sellPrice: true },
        _min: { minStock: true },
        _max: { minStock: true },
      }),
      prisma.motorbikePromotion.groupBy({
        by: ["branchName"],
        _count: { _all: true },
        _max: { date: true },
      }),
      listBranchCounterRows(prisma),
    ]);

    const minStockMap = toBranchMinStockMap(counterRows);
    const map = new Map();

    locations.forEach((location) => {
      const key = branchMapKey(location.name);
      map.set(key, {
        branchName: location.name,
        locationId: location.id,
        bikesCount: 0,
        bikesValue: 0,
        soldCount: 0,
        lastSoldAt: null,
        minStock: minStockMap.get(key) ?? 0,
      });
    });

    productGroups.forEach((row) => {
      const label = normalizeBranchLabel(row.branchName);
      const key = branchMapKey(row.branchName);
      const existing = map.get(key) || {
        branchName: label,
        locationId: null,
        bikesCount: 0,
        bikesValue: 0,
        soldCount: 0,
        lastSoldAt: null,
        minStock: 0,
      };

      existing.bikesCount = row._count?._all || 0;
      existing.bikesValue = toNum(row._sum?.sellPrice || 0);

      if (minStockMap.has(key)) {
        existing.minStock = minStockMap.get(key) ?? 0;
      } else if (
        row._min?.minStock != null &&
        row._max?.minStock != null &&
        row._min.minStock === row._max.minStock
      ) {
        existing.minStock = Number(row._max.minStock);
      } else if (row._max?.minStock != null) {
        existing.minStock = Number(row._max.minStock);
      }

      map.set(key, existing);
    });

    promoGroups.forEach((row) => {
      const label = normalizeBranchLabel(row.branchName);
      const key = branchMapKey(row.branchName);
      const existing = map.get(key) || {
        branchName: label,
        locationId: null,
        bikesCount: 0,
        bikesValue: 0,
        soldCount: 0,
        lastSoldAt: null,
        minStock: minStockMap.get(key) ?? 0,
      };
      existing.soldCount = row._count?._all || 0;
      existing.lastSoldAt = row._max?.date || null;
      map.set(key, existing);
    });

    // What this does: keeps branches visible even if they currently have no bikes/sales, but have saved settings.
    counterRows.forEach((row) => {
      const rawBranch = branchNameFromCounterId(row.id);
      const label = normalizeBranchLabel(rawBranch);
      const key = branchMapKey(rawBranch);
      if (map.has(key)) return;
      map.set(key, {
        branchName: label,
        locationId: null,
        bikesCount: 0,
        bikesValue: 0,
        soldCount: 0,
        lastSoldAt: null,
        minStock: parseCounterValue(row.value),
      });
    });

    let branches = Array.from(map.values());
    if (q) {
      branches = branches.filter((row) =>
        row.branchName.toLowerCase().includes(q)
      );
    }

    branches.sort((a, b) => {
      if (b.soldCount !== a.soldCount) return b.soldCount - a.soldCount;
      if (b.bikesCount !== a.bikesCount) return b.bikesCount - a.bikesCount;
      return a.branchName.localeCompare(b.branchName);
    });

    const total = branches.length;
    const pages = Math.max(Math.ceil(total / limit), 1);
    const rows = branches.slice(skip, skip + limit);

    return res.json({
      meta: { total, page, limit, pages },
      rows,
    });
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};

exports.getBranchDetail = async (req, res) => {
  try {
    const branchParam = s(req.query.branch);
    if (!branchParam) {
      return res.status(400).json({ message: "branch is required" });
    }

    const bikePage = Math.max(Number(req.query.bikePage) || 1, 1);
    const bikeLimit = Math.min(Number(req.query.bikeLimit) || 20, 100);
    const salePage = Math.max(Number(req.query.salePage) || 1, 1);
    const saleLimit = Math.min(Number(req.query.saleLimit) || 10, 50);
    const q = s(req.query.q);

    const { label, filter } = buildBranchFilter(branchParam);

    const bikeWhere = {
      category: "Motorbike",
      isActive: true,
      ...filter,
    };

    if (q) {
      bikeWhere.OR = [
        { sku: { contains: q, mode: "insensitive" } },
        { chassisNumber: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { color: { contains: q, mode: "insensitive" } },
      ];
    }

    const saleWhere = { ...filter };

    const [result, counterRows, location] = await Promise.all([
      prisma.$transaction([
        prisma.product.count({ where: bikeWhere }),
        prisma.product.findMany({
          where: bikeWhere,
          orderBy: { createdAt: "desc" },
          skip: (bikePage - 1) * bikeLimit,
          take: bikeLimit,
        }),
        prisma.motorbikePromotion.count({ where: saleWhere }),
        prisma.motorbikePromotion.findMany({
          where: saleWhere,
          orderBy: [{ date: "desc" }, { createdAt: "desc" }],
          skip: (salePage - 1) * saleLimit,
          take: saleLimit,
        }),
        prisma.motorbikePromotion.aggregate({
          where: saleWhere,
          _max: { date: true },
        }),
        prisma.product.aggregate({
          where: {
            category: "Motorbike",
            isActive: true,
            ...filter,
          },
          _min: { minStock: true },
          _max: { minStock: true },
        }),
      ]),
      listBranchCounterRows(prisma),
      label === "Unassigned"
        ? Promise.resolve(null)
        : prisma.location.findFirst({
            where: { name: { equals: label, mode: "insensitive" } },
            select: { id: true, name: true },
          }),
    ]);

    const [bikeTotal, bikes, saleTotal, sales, lastSold, minStockAgg] = result;
    const minStockMap = toBranchMinStockMap(counterRows);
    const counterMinStock = minStockMap.get(branchMapKey(label));
    const resolvedMinStock =
      counterMinStock != null
        ? counterMinStock
        : Number(minStockAgg?._max?.minStock ?? 0);

    return res.json({
      branch: {
        name: label,
        locationId: location?.id || null,
        bikesCount: bikeTotal,
        soldCount: saleTotal,
        lastSoldAt: lastSold?._max?.date || null,
        minStock: Number.isNaN(resolvedMinStock) ? 0 : resolvedMinStock,
      },
      bikes: {
        meta: {
          total: bikeTotal,
          page: bikePage,
          limit: bikeLimit,
          pages: Math.max(Math.ceil(bikeTotal / bikeLimit), 1),
        },
        rows: bikes,
      },
      sales: {
        meta: {
          total: saleTotal,
          page: salePage,
          limit: saleLimit,
          pages: Math.max(Math.ceil(saleTotal / saleLimit), 1),
        },
        rows: sales,
      },
    });
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};

exports.updateBranchSettings = async (req, res) => {
  try {
    const branchParam = s(req.body?.branch);
    if (!branchParam) {
      return res.status(400).json({ message: "branch is required" });
    }

    const minStock = parseNonNegativeInteger(req.body?.minStock, "minStock");
    if (minStock == null) {
      return res
        .status(400)
        .json({
          message: "Provide at least one setting to update (minStock).",
        });
    }

    const { label, filter } = buildBranchFilter(branchParam);
    const where = {
      category: "Motorbike",
      isActive: true,
      ...filter,
    };

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.product.updateMany({
        where,
        data: {
          minStock,
        },
      });

      if (label !== "Unassigned") {
        await setBranchMinStock(tx, label, minStock);
      }

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "UPDATE_BRANCH_SETTINGS",
          details: `Branch=${label} | minStock=${minStock} | updatedProducts=${updated.count}`,
        },
      });

      return updated;
    });

    return res.json({
      message: "Branch settings updated.",
      branch: label,
      updatedProducts: result.count,
      applied: { minStock },
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

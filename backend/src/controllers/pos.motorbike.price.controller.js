// What this does: lets sales-side roles view and update default POS motorbike prices from DB (no env edits)
const prisma = require("../prisma");
const { handleError } = require("../utils/errors");
const {
  ensureCashierMotorbikes,
  DEFAULT_CASHIER_MOTORBIKES,
  DEFAULT_CASHIER_MOTORBIKE_SKUS,
  isDefaultCashierMotorbikeSku,
} = require("../utils/defaultMotorbikes");

const DEFAULT_MAP = new Map(
  DEFAULT_CASHIER_MOTORBIKES.map((item, index) => [item.sku, { ...item, index }])
);

function toPriceNumber(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Number(amount.toFixed(2));
}

function formatRow(row) {
  const meta = DEFAULT_MAP.get(row.sku);
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    isActive: row.isActive,
    sellPrice: toPriceNumber(row.sellPrice),
    defaultSellPrice: meta ? toPriceNumber(meta.sellPrice) : null,
  };
}

function sortByDefaultOrder(rows) {
  return [...rows].sort((a, b) => {
    const left = DEFAULT_MAP.get(a.sku)?.index ?? 999;
    const right = DEFAULT_MAP.get(b.sku)?.index ?? 999;
    return left - right;
  });
}

exports.listDefaultMotorbikePrices = async (req, res) => {
  try {
    await ensureCashierMotorbikes(prisma);

    const rows = await prisma.product.findMany({
      where: { sku: { in: DEFAULT_CASHIER_MOTORBIKE_SKUS } },
      select: {
        id: true,
        sku: true,
        name: true,
        brand: true,
        isActive: true,
        sellPrice: true,
      },
    });

    return res.json({ rows: sortByDefaultOrder(rows).map(formatRow) });
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};

exports.updateDefaultMotorbikePrice = async (req, res) => {
  try {
    const sku = String(req.params.sku || "").trim().toUpperCase();
    if (!isDefaultCashierMotorbikeSku(sku)) {
      return res.status(400).json({ message: "Unknown default motorbike SKU." });
    }

    const sellPriceRaw = Number(req.body?.sellPrice);
    if (!Number.isFinite(sellPriceRaw) || sellPriceRaw <= 0) {
      return res.status(400).json({ message: "sellPrice must be a positive number." });
    }

    await ensureCashierMotorbikes(prisma);
    const sellPrice = sellPriceRaw.toFixed(2);

    const row = await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { sku },
        select: { id: true },
      });
      if (!existing) {
        throw Object.assign(new Error("Motorbike not found"), { status: 404 });
      }

      const updated = await tx.product.update({
        where: { sku },
        data: {
          sellPrice,
          isActive: true,
          category: "Motorbike",
          unit: "unit",
          minStock: 0,
          partNumber: null,
          modelCompatibility: null,
          branchName: null,
        },
        select: {
          id: true,
          sku: true,
          name: true,
          brand: true,
          isActive: true,
          sellPrice: true,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "UPDATE_POS_MOTORBIKE_PRICE",
          details: `Updated default POS motorbike price sku=${sku} sellPrice=${sellPrice}`,
        },
      });

      return updated;
    });

    return res.json({
      message: "Motorbike price updated.",
      row: formatRow(row),
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

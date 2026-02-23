// What this does: ensures default cashier motorbikes exist for POS "infinite" sales
const FALLBACK_SELL_PRICE = "1000000.00";

const DEFAULT_CASHIER_MOTORBIKES = [
  {
    sku: "POS-SPIRO-M1",
    name: "SPIRO M1",
    brand: "SPIRO",
    sellPrice: FALLBACK_SELL_PRICE,
  },
  {
    sku: "POS-SPIRO-M2",
    name: "SPIRO M2",
    brand: "SPIRO",
    sellPrice: FALLBACK_SELL_PRICE,
  },
  {
    sku: "POS-SPIRO-M3",
    name: "SPIRO M3",
    brand: "SPIRO",
    sellPrice: FALLBACK_SELL_PRICE,
  },
  {
    sku: "POS-BAJAJ",
    name: "BAJAJ",
    brand: "BAJAJ",
    sellPrice: FALLBACK_SELL_PRICE,
  },
  {
    sku: "POS-DISCOVER",
    name: "DISCOVER",
    brand: "DISCOVER",
    sellPrice: FALLBACK_SELL_PRICE,
  },
];
const DEFAULT_CASHIER_MOTORBIKE_SKUS = DEFAULT_CASHIER_MOTORBIKES.map((item) => item.sku);

function isDefaultCashierMotorbikeSku(sku) {
  return DEFAULT_CASHIER_MOTORBIKE_SKUS.includes(String(sku || "").trim());
}

function buildDefaultProduct(item) {
  return {
    sku: item.sku,
    name: item.name,
    brand: item.brand,
    category: "Motorbike",
    unit: "unit",
    costPrice: "0",
    sellPrice: item.sellPrice,
    minStock: 0,
    isActive: true,
    partNumber: null,
    modelCompatibility: null,
    chassisNumber: null,
    modelYear: null,
    weightKg: null,
    color: null,
    branchName: null,
  };
}

async function ensureCashierMotorbikes(prisma) {
  const skus = DEFAULT_CASHIER_MOTORBIKES.map((item) => item.sku);
  const existingRows = await prisma.product.findMany({
    where: { sku: { in: skus } },
    select: {
      id: true,
      sku: true,
      name: true,
      brand: true,
      category: true,
      unit: true,
      costPrice: true,
      sellPrice: true,
      minStock: true,
      isActive: true,
      partNumber: true,
      modelCompatibility: true,
      chassisNumber: true,
      modelYear: true,
      weightKg: true,
      color: true,
      branchName: true,
    },
  });

  const existingBySku = new Map(existingRows.map((row) => [row.sku, row]));

  let created = 0;
  let updated = 0;

  for (const item of DEFAULT_CASHIER_MOTORBIKES) {
    const existing = existingBySku.get(item.sku);
    if (!existing) {
      await prisma.product.create({ data: buildDefaultProduct(item) });
      created += 1;
      continue;
    }

    const patch = {};

    if (existing.name !== item.name) patch.name = item.name;
    if (existing.brand !== item.brand) patch.brand = item.brand;
    if (existing.category !== "Motorbike") patch.category = "Motorbike";
    if (existing.unit !== "unit") patch.unit = "unit";
    if (existing.minStock !== 0) patch.minStock = 0;
    if (!existing.isActive) patch.isActive = true;

    if (existing.partNumber !== null) patch.partNumber = null;
    if (existing.modelCompatibility !== null) patch.modelCompatibility = null;
    if (existing.chassisNumber !== null) patch.chassisNumber = null;
    if (existing.modelYear !== null) patch.modelYear = null;
    if (existing.weightKg !== null) patch.weightKg = null;
    if (existing.color !== null) patch.color = null;
    if (existing.branchName !== null) patch.branchName = null;

    const sellPriceValue = Number(existing.sellPrice || 0);
    if (!Number.isFinite(sellPriceValue) || sellPriceValue <= 0) {
      patch.sellPrice = item.sellPrice;
    }

    const costPriceValue = Number(existing.costPrice || 0);
    if (!Number.isFinite(costPriceValue) || costPriceValue < 0) {
      patch.costPrice = "0";
    }

    if (Object.keys(patch).length > 0) {
      await prisma.product.update({
        where: { id: existing.id },
        data: patch,
      });
      updated += 1;
    }
  }

  return { created, updated };
}

module.exports = {
  ensureCashierMotorbikes,
  DEFAULT_CASHIER_MOTORBIKES,
  DEFAULT_CASHIER_MOTORBIKE_SKUS,
  isDefaultCashierMotorbikeSku,
  FALLBACK_SELL_PRICE,
};

// What this does: fast product search for cashier with availability + best bin suggestions
const prisma = require("../prisma");
const { ensureCashierMotorbikes } = require("../utils/defaultMotorbikes");
const { handleError } = require("../utils/errors");

function s(v) {
  if (v == null) return "";
  return String(v).trim();
}

exports.searchProducts = async (req, res) => {
  try {
    const q = s(req.query.q);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    const locationId = req.query.locationId ? String(req.query.locationId).trim() : null;

    if (!q) return res.status(400).json({ message: "q is required" });

    if (req.user?.role === "CASHIER") {
      await ensureCashierMotorbikes(prisma);
    }

    // What this does: search by name/sku/partNumber/brand/category/modelCompatibility
    const where = {
      isActive: true,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { partNumber: { contains: q, mode: "insensitive" } },
        { brand: { contains: q, mode: "insensitive" } },
        { category: { contains: q, mode: "insensitive" } },
        { modelCompatibility: { contains: q, mode: "insensitive" } },
      ],
    };

    if (req.user?.role === "CASHIER") {
      where.AND = [
        {
          OR: [
            { category: { not: "Motorbike" } },
            { branchName: null },
          ],
        },
      ];
    }

    const [total, products] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          sku: true,
          partNumber: true,
          brand: true,
          category: true,
          modelCompatibility: true,
          sellPrice: true,
          minStock: true,
          chassisNumber: true,
          modelYear: true,
          branchName: true,
        },
      }),
    ]);

    const productIds = products.map((p) => p.id);
    if (productIds.length === 0) {
      return res.json({
        q,
        locationId: locationId || null,
        meta: { total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) },
        rows: [],
      });
    }

    // What this does: fetch inventory per bin for these products
    const inventoryRows = await prisma.inventory.findMany({
      where: {
        productId: { in: productIds },
        ...(locationId ? { locationId } : {}),
      },
      include: {
        location: { select: { id: true, name: true } },
        bin: { select: { id: true, code: true, description: true } },
      },
    });

    // Build maps: productId -> { totalQty, bins[] sorted }
    const invMap = new Map();
    for (const inv of inventoryRows) {
      if (!invMap.has(inv.productId)) invMap.set(inv.productId, { totalQty: 0, bins: [] });

      const entry = invMap.get(inv.productId);
      entry.totalQty += inv.quantity;

      if (inv.bin) {
        entry.bins.push({
          location: inv.location,
          bin: inv.bin,
          qty: inv.quantity,
        });
      }
    }

    // What this does: compute top bin suggestions (highest qty first)
    const rows = products.map((p) => {
      const isMotorbike = p.category === "Motorbike" || Boolean(p.chassisNumber);
      const info = invMap.get(p.id) || { totalQty: 0, bins: [] };
      info.bins.sort((a, b) => b.qty - a.qty);

      const topBins = info.bins.slice(0, 3);
      const recommended =
        !isMotorbike && topBins.length
          ? { locationId: topBins[0].location.id, binId: topBins[0].bin.id, binCode: topBins[0].bin.code }
          : null;

      return {
        product: p,
        availability: {
          totalQty: isMotorbike ? null : info.totalQty,
          status: isMotorbike ? "AVAILABLE" : info.totalQty > 0 ? "AVAILABLE" : "OUT_OF_STOCK",
        },
        recommended, // frontend auto-selects this
        topBins: isMotorbike ? [] : topBins,
        allBins: isMotorbike ? [] : info.bins,
      };
    });
    return res.json({
      q,
      locationId: locationId || null,
      meta: { total, page, limit, pages: Math.max(Math.ceil(total / limit), 1) },
      rows,
    });
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};



// What this does: cashier search by name/partNumber/brand and returns availability + shelf/bin location
const prisma = require("../prisma");
const { ensureCashierMotorbikes } = require("../utils/defaultMotorbikes");
const { handleError } = require("../utils/errors");

exports.searchProducts = async (req, res) => {
  try {
    const { q, locationId, preferLocationId } = req.query;
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    if (!q || String(q).trim().length < 2) {
      return res.status(400).json({ message: "q (min 2 chars) is required" });
    }

    if (req.user?.role === "CASHIER") {
      await ensureCashierMotorbikes(prisma);
    }

    const where = {
      isActive: true,
      ...(req.user.role === "SALESPERSON"
        ? {
            category: "Motorbike",
            AND: [{ branchName: { not: null } }, { branchName: { not: "" } }],
          }
        : {}),
      ...(req.user.role === "CASHIER"
        ? {
            AND: [
              {
                OR: [
                  { category: { not: "Motorbike" } },
                  { branchName: null },
                ],
              },
            ],
          }
        : {}),
      OR: [
        { name: { contains: String(q), mode: "insensitive" } },
        { sku: { contains: String(q), mode: "insensitive" } },
        { partNumber: { contains: String(q), mode: "insensitive" } },
        { chassisNumber: { contains: String(q), mode: "insensitive" } },
        { brand: { contains: String(q), mode: "insensitive" } },
        { category: { contains: String(q), mode: "insensitive" } },
        { modelCompatibility: { contains: String(q), mode: "insensitive" } },
      ],
    };

    const [total, products] = await prisma.$transaction([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          sku: true,
          partNumber: true,
          name: true,
          unit: true,
          brand: true,
          category: true,
          modelCompatibility: true,
          minStock: true,
          branchName: true,
        },
      }),
    ]);

    const productIds = products.map((p) => p.id);

    const inventoryRows = await prisma.inventory.findMany({
      where: {
        productId: { in: productIds },
        ...(locationId ? { locationId } : {}),
      },
      include: {
        location: { select: { id: true, name: true } },
        bin: { select: { id: true, code: true } },
      },
    });

    const invMap = new Map();
    for (const row of inventoryRows) {
      if (!invMap.has(row.productId)) invMap.set(row.productId, []);
      invMap.get(row.productId).push(row);
    }

    const preferredLocation = preferLocationId ? String(preferLocationId) : null;

    const result = products.map((p) => {
      const isMotorbike = p.category === "Motorbike";
      const rows = invMap.get(p.id) || [];
      const totalQty = rows.reduce((sum, r) => sum + r.quantity, 0);

      // Only show bins with stock > 0
      const pickFrom = isMotorbike
        ? []
        : rows
            .filter((r) => r.quantity > 0)
            .map((r) => ({
              locationId: r.location.id,
              locationName: r.location.name,
              binId: r.bin ? r.bin.id : null,
              binCode: r.bin ? r.bin.code : null,
              quantity: r.quantity,
            }))
            // Sort: preferred location first (if provided), then highest quantity
            .sort((a, b) => {
              const aPref = preferredLocation && a.locationId === preferredLocation ? 1 : 0;
              const bPref = preferredLocation && b.locationId === preferredLocation ? 1 : 0;

              if (aPref !== bPref) return bPref - aPref; // preferred first
              return b.quantity - a.quantity; // then highest qty
            });

      // Top bin suggestion = first item after sorting
      const topBinSuggestion = pickFrom.length > 0 ? pickFrom[0] : null;

      return {
        product: p,
        available: isMotorbike ? true : totalQty > 0,
        totalQuantity: isMotorbike ? null : totalQty,
        topBinSuggestion,
        pickFrom,
      };
    });

    res.json({
      q: String(q),
      count: result.length,
      meta: {
        total,
        page,
        limit,
        pages: Math.max(Math.ceil(total / limit), 1),
      },
      preferLocationId: preferredLocation,
      items: result,
    });
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};

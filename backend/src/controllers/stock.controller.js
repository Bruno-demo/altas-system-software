// What this does: applies stock IN/OUT/DAMAGE transactions and updates Inventory safely
const prisma = require("../prisma");
const { handleError } = require("../utils/errors");
const { autoPostStockAdjustment } = require("../utils/accounting");

// -------------------------------
// Helper: get or create inventory row
// -------------------------------
async function getOrCreateInventory(productId, locationId) {
  const existing = await prisma.inventory.findUnique({
    where: { productId_locationId: { productId, locationId } },
  });

  if (existing) return existing;

  return prisma.inventory.create({
    data: { productId, locationId, quantity: 0 },
  });
}

// -------------------------------
// STOCK IN
// // Body: { productId, locationId, binId?, quantity, unitCost? }
// -------------------------------
exports.stockIn = async (req, res) => {
  const { productId, locationId, binId, quantity, unitCost } = req.body;

  if (!productId || !locationId || !quantity) {
    return res.status(400).json({ message: "productId, locationId, quantity are required" });
  }

  const qty = Number(quantity);
  if (Number.isNaN(qty) || qty <= 0) {
    return res.status(400).json({ message: "quantity must be a positive number" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new Error("Product not found");

      const location = await tx.location.findUnique({ where: { id: locationId } });
      if (!location) throw new Error("Location not found");

      // If binId provided, validate it belongs to that location
      let bin = null;
      if (binId) {
        bin = await tx.storageBin.findUnique({ where: { id: binId } });
        if (!bin) throw new Error("Bin not found");
        if (bin.locationId !== locationId) throw new Error("Bin does not belong to this location");
      }

      // Inventory is unique by productId + locationId + binId
      const inventory = await tx.inventory.upsert({
        where: {
          productId_locationId_binId: {
            productId,
            locationId,
            binId: binId || null,
          },
        },
        update: { quantity: { increment: qty } },
        create: { productId, locationId, binId: binId || null, quantity: qty },
      });

      const trx = await tx.stockTransaction.create({
        data: {
          type: "IN",
          productId,
          locationId,
          quantity: qty,
          unitCost: unitCost != null ? String(unitCost) : null,
          createdBy: req.user.id,
          reason: bin ? `BIN:${bin.code}` : null, // quick trace of bin in transaction
        },
      });

      await autoPostStockAdjustment(tx, trx, product);

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "STOCK_IN",
          details: `Stock IN ${qty} of ${product.sku} to ${location.name}${bin ? " bin " + bin.code : ""}`,
        },
      });

      return { inventory, trx };
    });

    return res.status(201).json(result);
  } catch (err) {
    return handleError(res, err, { status: 400 });
  }
};


// -------------------------------
// STOCK OUT
// Body: { productId, locationId, quantity, reason? }
// -------------------------------
// What this does: deducts stock from a specific bin (required) to keep shelf counts accurate
// Body: { productId, locationId, binId (required), quantity, reason? }
exports.stockOut = async (req, res) => {
  const { productId, locationId, binId, quantity, reason } = req.body;

  if (!productId || !locationId || !binId || !quantity) {
    return res.status(400).json({
      message: "productId, locationId, binId, quantity are required",
    });
  }

  const qty = Number(quantity);
  if (Number.isNaN(qty) || qty <= 0) {
    return res.status(400).json({ message: "quantity must be a positive number" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new Error("Product not found");

      const location = await tx.location.findUnique({ where: { id: locationId } });
      if (!location) throw new Error("Location not found");

      const bin = await tx.storageBin.findUnique({ where: { id: binId } });
      if (!bin) throw new Error("Bin not found");
      if (bin.locationId !== locationId) throw new Error("Bin does not belong to this location");

      // Inventory key includes binId
      const inv = await tx.inventory.findUnique({
        where: {
          productId_locationId_binId: {
            productId,
            locationId,
            binId,
          },
        },
      });

      if (!inv || inv.quantity < qty) {
        throw new Error("Not enough stock in this bin to stock out");
      }

      const inventory = await tx.inventory.update({
        where: {
          productId_locationId_binId: {
            productId,
            locationId,
            binId,
          },
        },
        data: { quantity: { decrement: qty } },
      });

      const trx = await tx.stockTransaction.create({
        data: {
          type: "OUT",
          productId,
          locationId,
          quantity: qty,
          reason: `${reason ? String(reason) + " | " : ""}BIN:${bin.code}`,
          createdBy: req.user.id,
        },
      });

      await autoPostStockAdjustment(tx, trx, product);

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "STOCK_OUT",
          details: `Stock OUT ${qty} of ${product.sku} from ${location.name} bin ${bin.code}`,
        },
      });

      return { inventory, trx };
    });

    return res.status(201).json(result);
  } catch (err) {
    return handleError(res, err, { status: 400 });
  }
};


// -------------------------------
// DAMAGE
// Body: { productId, locationId, quantity, reason (required) }
// -------------------------------
// What this does: marks damaged stock from a specific bin (required)
// Body: { productId, locationId, binId (required), quantity, reason (required) }
exports.stockDamage = async (req, res) => {
  const { productId, locationId, binId, quantity, reason } = req.body;

  if (!productId || !locationId || !binId || !quantity || !reason) {
    return res.status(400).json({
      message: "productId, locationId, binId, quantity, reason are required",
    });
  }

  const qty = Number(quantity);
  if (Number.isNaN(qty) || qty <= 0) {
    return res.status(400).json({ message: "quantity must be a positive number" });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new Error("Product not found");

      const location = await tx.location.findUnique({ where: { id: locationId } });
      if (!location) throw new Error("Location not found");

      const bin = await tx.storageBin.findUnique({ where: { id: binId } });
      if (!bin) throw new Error("Bin not found");
      if (bin.locationId !== locationId) throw new Error("Bin does not belong to this location");

      const inv = await tx.inventory.findUnique({
        where: {
          productId_locationId_binId: {
            productId,
            locationId,
            binId,
          },
        },
      });

      if (!inv || inv.quantity < qty) {
        throw new Error("Not enough stock in this bin to mark as damaged");
      }

      const inventory = await tx.inventory.update({
        where: {
          productId_locationId_binId: {
            productId,
            locationId,
            binId,
          },
        },
        data: { quantity: { decrement: qty } },
      });

      const trx = await tx.stockTransaction.create({
        data: {
          type: "DAMAGE",
          productId,
          locationId,
          quantity: qty,
          reason: `BIN:${bin.code} | ${String(reason)}`,
          createdBy: req.user.id,
        },
      });

      await autoPostStockAdjustment(tx, trx, product);

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "STOCK_DAMAGE",
          details: `Damage ${qty} of ${product.sku} at ${location.name} bin ${bin.code} (Reason: ${reason})`,
        },
      });

      return { inventory, trx };
    });

    return res.status(201).json(result);
  } catch (err) {
    return handleError(res, err, { status: 400 });
  }
};


// -------------------------------
// GET INVENTORY (with product + location info)
// -------------------------------
// What this does: returns inventory with product + location + bin (shelf code)
exports.getInventory = async (req, res) => {
  try {
    const { locationId, binId, q } = req.query;

    const where = {};
    if (locationId) where.locationId = locationId;
    if (binId) where.binId = binId;

    // Optional search by product fields
    if (q) {
      where.product = {
        isActive: true,
        OR: [
          { name: { contains: String(q), mode: "insensitive" } },
          { sku: { contains: String(q), mode: "insensitive" } },
          { partNumber: { contains: String(q), mode: "insensitive" } },
          { brand: { contains: String(q), mode: "insensitive" } },
        ],
      };
    }

    const inventory = await prisma.inventory.findMany({
      where,
      include: {
        product: {
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
          },
        },
        location: { select: { id: true, name: true } },
        bin: { select: { id: true, code: true, description: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    res.json(inventory);
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};

// What this does: returns stock movement history (IN/OUT/DAMAGE) with filters
exports.getTransactions = async (req, res) => {
  try {
    const { type, productId, locationId, from, to, page = 1, limit = 20 } = req.query;

    // Basic pagination
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Number(page) - 1) * take;

    const where = {};

    if (type) where.type = type; // IN | OUT | DAMAGE
    if (productId) where.productId = productId;
    if (locationId) where.locationId = locationId;

    // Date filtering (ISO strings)
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [total, transactions] = await prisma.$transaction([
      prisma.stockTransaction.count({ where }),
      prisma.stockTransaction.findMany({
        where,
        include: {
          product: { select: { id: true, sku: true, name: true, unit: true } },
          location: { select: { id: true, name: true } },
          user: { select: { id: true, fullName: true, role: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
    ]);

    res.json({
      meta: {
        total,
        page: Number(page),
        limit: take,
        pages: Math.ceil(total / take),
      },
      transactions,
    });
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};

// What this does: returns products that are low-stock (quantity <= minStock)
exports.getLowStock = async (req, res) => {
  try {
    const { locationId, aggregate } = req.query;

    // Option A: per location (default) → best for stock keeper
    if (!aggregate || aggregate === "false") {
      const where = {};
      if (locationId) where.locationId = locationId;

      const lowStock = await prisma.inventory.findMany({
        where,
        include: {
          product: { select: { id: true, sku: true, name: true, unit: true, minStock: true } },
          location: { select: { id: true, name: true } },
        },
      });

      // Filter after include (because minStock is in product)
      const filtered = lowStock.filter((row) => row.quantity <= row.product.minStock);

      return res.json({
        mode: "PER_LOCATION",
        count: filtered.length,
        items: filtered,
      });
    }

    // Option B: aggregated across all locations (aggregate=true) → best for manager/CEO
    // Prisma groupBy sums quantities by productId
    const grouped = await prisma.inventory.groupBy({
      by: ["productId"],
      _sum: { quantity: true },
    });

    // Get product details for those grouped rows
    const productIds = grouped.map((g) => g.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
      select: { id: true, sku: true, name: true, unit: true, minStock: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    const items = grouped
      .map((g) => {
        const product = productMap.get(g.productId);
        return product
          ? {
              product,
              totalQuantity: g._sum.quantity || 0,
            }
          : null;
      })
      .filter(Boolean)
      .filter((x) => x.totalQuantity <= x.product.minStock);

    return res.json({
      mode: "AGGREGATED",
      count: items.length,
      items,
    });
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};


// What this does: handles Location CRUD operations within branches
const prisma = require("../prisma");
const { handleError } = require("../utils/errors");

exports.listLocations = async (req, res) => {
  try {
    const branchId = req.query?.branchId;
    const q = req.query?.q;

    const where = {};
    if (branchId) where.branchId = branchId;
    if (q) {
      where.name = { contains: q, mode: "insensitive" };
    }

    const locations = await prisma.location.findMany({
      where,
      include: {
        branch: true,
        bins: {
          orderBy: { code: "asc" },
        },
        _count: {
          select: { bins: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return res.json(locations);
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.createLocation = async (req, res) => {
  try {
    const name = req.body?.name?.trim();
    const branchId = req.body?.branchId;

    if (!name) return res.status(400).json({ message: "name is required" });
    if (!branchId) return res.status(400).json({ message: "branchId is required" });

    // Verify branch exists
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) return res.status(404).json({ message: "Branch not found" });

    // Check for duplicate location name within the same branch
    const existing = await prisma.location.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        branchId,
      },
    });
    if (existing) {
      return res.status(409).json({ message: "Location name already exists in this branch." });
    }

    const location = await prisma.location.create({
      data: {
        name,
        branchId,
      },
      include: {
        branch: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "CREATE_LOCATION",
        details: `Created location ${location.name} in branch ${branch.name}`,
      },
    });

    return res.status(201).json(location);
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.getLocationById = async (req, res) => {
  try {
    const location = await prisma.location.findUnique({
      where: { id: req.params.id },
      include: {
        branch: true,
        bins: {
          orderBy: { code: "asc" },
        },
      },
    });

    if (!location) return res.status(404).json({ message: "Location not found" });

    return res.json(location);
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.updateLocation = async (req, res) => {
  try {
    const name = req.body?.name?.trim();
    const branchId = req.body?.branchId;

    if (!name) return res.status(400).json({ message: "name is required" });
    if (!branchId) return res.status(400).json({ message: "branchId is required" });

    // Verify branch exists
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
    });
    if (!branch) return res.status(404).json({ message: "Branch not found" });

    // Check for duplicate location name within the same branch
    const existing = await prisma.location.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        branchId,
        id: { not: req.params.id },
      },
    });
    if (existing) {
      return res.status(409).json({ message: "Location name already exists in this branch." });
    }

    const location = await prisma.location.update({
      where: { id: req.params.id },
      data: {
        name,
        branchId,
      },
      include: {
        branch: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "UPDATE_LOCATION",
        details: `Updated location ${location.name} in branch ${branch.name}`,
      },
    });

    return res.json(location);
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.deleteLocation = async (req, res) => {
  try {
    const location = await prisma.location.findUnique({
      where: { id: req.params.id },
      include: {
        branch: true,
        bins: true,
        inventory: true,
      },
    });

    if (!location) return res.status(404).json({ message: "Location not found" });

    if (location.bins.length > 0) {
      return res.status(409).json({
        message: "Cannot delete location with existing bins. Delete bins first.",
      });
    }

    if (location.inventory.length > 0) {
      return res.status(409).json({
        message: "Cannot delete location with existing inventory. Move inventory first.",
      });
    }

    await prisma.location.delete({
      where: { id: req.params.id },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "DELETE_LOCATION",
        details: `Deleted location ${location.name} from branch ${location.branch.name}`,
      },
    });

    return res.status(204).send();
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};
    });

    return res.status(201).json({
      ...created.location,
      minStock,
      syncedProducts: created.syncedProducts,
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 400 });
  }
};

// What this does: updates location name/min-stock and synchronizes branch labels and settings.
exports.updateLocation = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ message: "Location id is required." });

    const existing = await prisma.location.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Location not found." });

    const requestedName = req.body?.name;
    const hasName = requestedName != null;
    const hasMinStock = req.body?.minStock != null && String(req.body.minStock).trim() !== "";

    const nextName = hasName
      ? normalizeBranchName(requestedName)
      : existing.name;

    if (hasName && !nextName) {
      return res.status(400).json({ message: "name cannot be empty" });
    }

    const parsedMinStock = hasMinStock ? parseMinStock(req.body.minStock, { required: true }) : null;

    if (!hasName && !hasMinStock) {
      return res.status(400).json({ message: "Provide at least one field to update." });
    }

    const duplicate = await prisma.location.findFirst({
      where: {
        id: { not: id },
        name: { equals: nextName, mode: "insensitive" },
      },
      select: { id: true },
    });

    if (duplicate) {
      return res.status(409).json({ message: "Location name already exists." });
    }

    const oldBranchKey = normalizeBranchKey(existing.name);
    const newBranchKey = normalizeBranchKey(nextName);
    const branchLabelChanged = oldBranchKey !== newBranchKey;

    const result = await prisma.$transaction(async (tx) => {
      const oldCounter = await findBranchCounterByName(tx, existing.name);

      const location = hasName
        ? await tx.location.update({
            where: { id },
            data: { name: nextName },
          })
        : existing;

      let renamedProducts = 0;
      let renamedPromotions = 0;

      if (branchLabelChanged) {
        const productRename = await tx.product.updateMany({
          where: { branchName: { equals: existing.name, mode: "insensitive" } },
          data: { branchName: nextName },
        });
        renamedProducts = productRename.count;

        const promoRename = await tx.motorbikePromotion.updateMany({
          where: { branchName: { equals: existing.name, mode: "insensitive" } },
          data: { branchName: nextName },
        });
        renamedPromotions = promoRename.count;
      }

      const resolvedMinStock = hasMinStock
        ? parsedMinStock
        : oldCounter
          ? parseCounterValue(oldCounter.value)
          : 0;

      await setBranchMinStock(tx, nextName, resolvedMinStock);
      if (branchLabelChanged) {
        await removeBranchMinStock(tx, existing.name);
      }

      let minStockUpdatedProducts = 0;
      if (hasMinStock) {
        const productSync = await tx.product.updateMany({
          where: {
            category: "Motorbike",
            branchName: { equals: nextName, mode: "insensitive" },
          },
          data: { minStock: resolvedMinStock },
        });
        minStockUpdatedProducts = productSync.count;
      }

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "UPDATE_LOCATION",
          details: `Updated location id=${id} old=${existing.name} new=${nextName} minStock=${resolvedMinStock} renamedProducts=${renamedProducts} renamedPromotions=${renamedPromotions} minStockUpdatedProducts=${minStockUpdatedProducts}`,
        },
      });

      return {
        location,
        minStock: resolvedMinStock,
        renamedProducts,
        renamedPromotions,
        minStockUpdatedProducts,
      };
    });

    return res.json({
      message: "Location updated.",
      ...result,
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 400 });
  }
};

// What this does: deletes an unused location and unassigns branch labels from motorbike records.
exports.deleteLocation = async (req, res) => {
  try {
    const id = String(req.params.id || "").trim();
    if (!id) return res.status(400).json({ message: "Location id is required." });

    const existing = await prisma.location.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Location not found." });

    const [
      inventoryCount,
      binsCount,
      transactionsCount,
      saleItemsCount,
      returnItemsCount,
    ] = await prisma.$transaction([
      prisma.inventory.count({ where: { locationId: id } }),
      prisma.storageBin.count({ where: { locationId: id } }),
      prisma.stockTransaction.count({ where: { locationId: id } }),
      prisma.saleItem.count({ where: { locationId: id } }),
      prisma.saleReturnItem.count({ where: { locationId: id } }),
    ]);

    const dependentRows =
      inventoryCount +
      binsCount +
      transactionsCount +
      saleItemsCount +
      returnItemsCount;

    if (dependentRows > 0) {
      return res.status(409).json({
        message:
          "Cannot delete this location because it is already used by stock or sales records.",
        references: {
          inventory: inventoryCount,
          bins: binsCount,
          transactions: transactionsCount,
          saleItems: saleItemsCount,
          returnItems: returnItemsCount,
        },
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const productUnassign = await tx.product.updateMany({
        where: { branchName: { equals: existing.name, mode: "insensitive" } },
        data: { branchName: null },
      });

      const promoUnassign = await tx.motorbikePromotion.updateMany({
        where: { branchName: { equals: existing.name, mode: "insensitive" } },
        data: { branchName: null },
      });

      const counterRemoved = await removeBranchMinStock(tx, existing.name);

      await tx.location.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "DELETE_LOCATION",
          details: `Deleted location ${existing.name} | unassignedProducts=${productUnassign.count} | unassignedPromotions=${promoUnassign.count} | removedCounter=${counterRemoved}`,
        },
      });

      return {
        unassignedProducts: productUnassign.count,
        unassignedPromotions: promoUnassign.count,
        removedCounter: counterRemoved,
      };
    });

    return res.json({
      message: "Location deleted.",
      location: existing.name,
      ...result,
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 400 });
  }
};


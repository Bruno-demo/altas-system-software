// What this does: handles Storage Bin CRUD operations within locations
const prisma = require("../prisma");
const { handleError } = require("../utils/errors");

exports.listBins = async (req, res) => {
  try {
    const locationId = req.query?.locationId;
    const q = req.query?.q;

    const where = {};
    if (locationId) where.locationId = locationId;
    if (q) {
      where.OR = [
        { code: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
      ];
    }

    const bins = await prisma.storageBin.findMany({
      where,
      include: {
        location: {
          include: {
            branch: true,
          },
        },
      },
      orderBy: { code: "asc" },
    });

    return res.json(bins);
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.createBin = async (req, res) => {
  try {
    const code = req.body?.code?.trim();
    const description = req.body?.description?.trim();
    const locationId = req.body?.locationId;

    if (!code) return res.status(400).json({ message: "code is required" });
    if (!locationId) return res.status(400).json({ message: "locationId is required" });

    // Verify location exists
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      include: { branch: true },
    });
    if (!location) return res.status(404).json({ message: "Location not found" });

    // Check for duplicate bin code
    const existing = await prisma.storageBin.findFirst({
      where: {
        code: { equals: code, mode: "insensitive" },
      },
    });
    if (existing) {
      return res.status(409).json({ message: "Bin code already exists." });
    }

    const bin = await prisma.storageBin.create({
      data: {
        code,
        description,
        locationId,
      },
      include: {
        location: {
          include: {
            branch: true,
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "CREATE_BIN",
        details: `Created bin ${bin.code} in location ${location.name} (${location.branch.name})`,
      },
    });

    return res.status(201).json(bin);
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.getBinById = async (req, res) => {
  try {
    const bin = await prisma.storageBin.findUnique({
      where: { id: req.params.id },
      include: {
        location: {
          include: {
            branch: true,
          },
        },
      },
    });

    if (!bin) return res.status(404).json({ message: "Bin not found" });

    return res.json(bin);
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.updateBin = async (req, res) => {
  try {
    const code = req.body?.code?.trim();
    const description = req.body?.description?.trim();
    const locationId = req.body?.locationId;

    if (!code) return res.status(400).json({ message: "code is required" });
    if (!locationId) return res.status(400).json({ message: "locationId is required" });

    // Verify location exists
    const location = await prisma.location.findUnique({
      where: { id: locationId },
      include: { branch: true },
    });
    if (!location) return res.status(404).json({ message: "Location not found" });

    // Check for duplicate bin code
    const existing = await prisma.storageBin.findFirst({
      where: {
        code: { equals: code, mode: "insensitive" },
        id: { not: req.params.id },
      },
    });
    if (existing) {
      return res.status(409).json({ message: "Bin code already exists." });
    }

    const bin = await prisma.storageBin.update({
      where: { id: req.params.id },
      data: {
        code,
        description,
        locationId,
      },
      include: {
        location: {
          include: {
            branch: true,
          },
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "UPDATE_BIN",
        details: `Updated bin ${bin.code} in location ${location.name} (${location.branch.name})`,
      },
    });

    return res.json(bin);
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.deleteBin = async (req, res) => {
  try {
    const bin = await prisma.storageBin.findUnique({
      where: { id: req.params.id },
      include: {
        location: {
          include: {
            branch: true,
          },
        },
        inventory: true,
      },
    });

    if (!bin) return res.status(404).json({ message: "Bin not found" });

    if (bin.inventory.length > 0) {
      return res.status(409).json({
        message: "Cannot delete bin with existing inventory. Move inventory first.",
      });
    }

    await prisma.storageBin.delete({
      where: { id: req.params.id },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "DELETE_BIN",
        details: `Deleted bin ${bin.code} from location ${bin.location.name} (${bin.location.branch.name})`,
      },
    });

    return res.status(204).send();
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

    res.json(bins);
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};


// What this does: handles Branch CRUD operations
const prisma = require("../prisma");
const { handleError } = require("../utils/errors");

exports.listBranches = async (req, res) => {
  try {
    const q = req.query?.q;
    const where = q
      ? {
          name: { contains: q, mode: "insensitive" },
        }
      : undefined;

    const branches = await prisma.branch.findMany({
      where,
      include: {
        locations: {
          include: {
            bins: {
              orderBy: { code: "asc" },
            },
            _count: {
              select: { bins: true },
            },
          },
        },
        _count: {
          select: { locations: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return res.json(branches);
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.createBranch = async (req, res) => {
  try {
    const name = req.body?.name?.trim();
    if (!name) return res.status(400).json({ message: "name is required" });

    const existing = await prisma.branch.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    });
    if (existing) {
      return res.status(409).json({ message: "Branch name already exists." });
    }

    const branch = await prisma.branch.create({
      data: { name },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "CREATE_BRANCH",
        details: `Created branch ${branch.name}`,
      },
    });

    return res.status(201).json(branch);
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.getBranchById = async (req, res) => {
  try {
    const branch = await prisma.branch.findUnique({
      where: { id: req.params.id },
      include: {
        locations: {
          include: {
            bins: {
              orderBy: { code: "asc" },
            },
            _count: {
              select: { bins: true },
            },
          },
        },
      },
    });

    if (!branch) return res.status(404).json({ message: "Branch not found" });

    return res.json(branch);
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.updateBranch = async (req, res) => {
  try {
    const name = req.body?.name?.trim();
    if (!name) return res.status(400).json({ message: "name is required" });

    const existing = await prisma.branch.findFirst({
      where: {
        name: { equals: name, mode: "insensitive" },
        id: { not: req.params.id },
      },
    });
    if (existing) {
      return res.status(409).json({ message: "Branch name already exists." });
    }

    const branch = await prisma.branch.update({
      where: { id: req.params.id },
      data: { name },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "UPDATE_BRANCH",
        details: `Updated branch ${branch.name}`,
      },
    });

    return res.json(branch);
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

exports.deleteBranch = async (req, res) => {
  try {
    const branch = await prisma.branch.findUnique({
      where: { id: req.params.id },
      include: {
        locations: {
          include: {
            bins: true,
            inventory: true,
          },
        },
      },
    });

    if (!branch) return res.status(404).json({ message: "Branch not found" });

    if (branch.locations.length > 0) {
      return res.status(409).json({
        message: "Cannot delete branch with existing locations. Delete locations first.",
      });
    }

    await prisma.branch.delete({
      where: { id: req.params.id },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "DELETE_BRANCH",
        details: `Deleted branch ${branch.name}`,
      },
    });

    return res.status(204).send();
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};
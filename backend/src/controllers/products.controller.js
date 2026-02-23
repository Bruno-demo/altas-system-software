// What this does: creates products and lists/searches products for spare parts (brand, category, compatibility)
const { Prisma } = require("@prisma/client");
const prisma = require("../prisma");
const { handleError } = require("../utils/errors");
const {
  findBranchCounterByName,
  parseCounterValue,
} = require("../utils/branchMinStock");

// What this does: allowed categories for your moto spare parts shop
const ALLOWED_CATEGORIES = ["Brake", "Chain", "Engine", "Electrical", "Motorbike"];
const BRANCH_SALE_PREFIX = "Motorbike Branch Sale | Branch:";

exports.createProduct = async (req, res) => {
  try {
    const {
      sku,
      partNumber,
      name,
      unit,
      costPrice,
      sellPrice,
      minStock,
      brand,
      category,
      modelCompatibility,
      chassisNumber,
      modelYear,
      weightKg,
      color,
      branchName,
    } = req.body;

    if (!name || costPrice == null || sellPrice == null) {
      return res.status(400).json({
        message: "name, costPrice, sellPrice are required",
      });
    }

    const isSalesperson = req.user.role === "SALESPERSON";
    let categoryValue = category ? String(category).trim() : null;
    if (isSalesperson) {
      if (categoryValue && categoryValue !== "Motorbike") {
        return res.status(403).json({ message: "Salesperson can only create Motorbike items." });
      }
      categoryValue = "Motorbike";
    } else if (categoryValue && !ALLOWED_CATEGORIES.includes(categoryValue)) {
      // What this does: enforces category list (prevents messy data)
      return res.status(400).json({
        message: `category must be one of: ${ALLOWED_CATEGORIES.join(", ")}`,
      });
    }

    const isMotorbike = categoryValue === "Motorbike";
    const chassisNumberValue = chassisNumber ? String(chassisNumber).trim() : null;
    let finalSku = sku ? String(sku).trim() : null;
    const branchValue = branchName ? String(branchName).trim() : null;

    if (isMotorbike) {
      if (!chassisNumberValue) {
        return res.status(400).json({ message: "chassisNumber is required for Motorbike" });
      }
      finalSku = chassisNumberValue;
      if (isSalesperson && !branchValue) {
        return res
          .status(400)
          .json({ message: "branchName is required for Motorbike created by Salesperson" });
      }
    } else if (!finalSku) {
      return res.status(400).json({ message: "sku is required" });
    }

    // What this does: ensures partNumber is always present for new products (default = sku)
    const finalPartNumber = isMotorbike
      ? null
      : partNumber
        ? String(partNumber).trim()
        : finalSku;

    const unitValue = isMotorbike ? "unit" : unit ? String(unit).trim() : "pcs";
    const modelCompatibilityValue = isMotorbike
      ? null
      : modelCompatibility
        ? String(modelCompatibility).trim()
        : null;

    let modelYearValue = null;
    if (modelYear != null && String(modelYear).trim() !== "") {
      modelYearValue = Number(modelYear);
      if (!Number.isInteger(modelYearValue) || modelYearValue < 1950 || modelYearValue > 2100) {
        return res.status(400).json({ message: "modelYear must be a valid year" });
      }
    }

    let weightValue = null;
    if (weightKg != null && String(weightKg).trim() !== "") {
      weightValue = Number(weightKg);
      if (Number.isNaN(weightValue) || weightValue < 0) {
        return res.status(400).json({ message: "weightKg must be a valid number" });
      }
    }

    let minStockValue = 0;
    if (minStock != null && String(minStock).trim() !== "") {
      const parsed = Number(minStock);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return res.status(400).json({ message: "minStock must be an integer >= 0" });
      }
      minStockValue = parsed;
    } else if (isMotorbike && branchValue) {
      const branchCounter = await findBranchCounterByName(prisma, branchValue);
      if (branchCounter) {
        minStockValue = parseCounterValue(branchCounter.value);
      }
    }

    const product = await prisma.product.create({
      data: {
        sku: finalSku,
        partNumber: finalPartNumber,
        name: String(name).trim(),
        unit: unitValue,
        costPrice: String(costPrice),
        sellPrice: String(sellPrice),
        minStock: minStockValue,
        brand: brand ? String(brand).trim() : null,
        category: categoryValue,
        modelCompatibility: modelCompatibilityValue,
        chassisNumber: chassisNumberValue,
        modelYear: modelYearValue,
        weightKg: weightValue != null ? String(weightValue) : null,
        color: color ? String(color).trim() : null,
        branchName: branchValue,
      },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "CREATE_PRODUCT",
        details: `Created product ${product.sku} (${product.name}) partNumber=${product.partNumber}`,
      },
    });

    return res.status(201).json(product);
  } catch (err) {
    if (err.code === "P2002") {
      const fields = err.meta?.target?.join(", ") || "unique field";
      return res.status(409).json({ message: `Duplicate value for: ${fields}` });
    }
    return handleError(res, err, { status: 500 });
  }
};

exports.listProducts = async (req, res) => {
  try {
    const { q, category, brand, branchName } = req.query;

    const where = {
      isActive: true,
    };

    // What this does: filter by category/brand if provided
    const isSalesperson = req.user.role === "SALESPERSON";
    if (isSalesperson) {
      where.category = "Motorbike";
      where.AND = [{ branchName: { not: null } }, { branchName: { not: "" } }];
    } else if (category) {
      where.category = String(category).trim();
    }
    if (brand) where.brand = { contains: String(brand).trim(), mode: "insensitive" };
    if (branchName) {
      const branchValue = String(branchName).trim();
      if (branchValue.toLowerCase() === "unassigned") {
        where.branchName = null;
      } else {
        where.branchName = { equals: branchValue, mode: "insensitive" };
      }
    }

    // What this does: search by sku, partNumber, name, brand, category, modelCompatibility
    if (q) {
      where.OR = [
        { sku: { contains: String(q), mode: "insensitive" } },
        { partNumber: { contains: String(q), mode: "insensitive" } },
        { chassisNumber: { contains: String(q), mode: "insensitive" } },
        { name: { contains: String(q), mode: "insensitive" } },
        { brand: { contains: String(q), mode: "insensitive" } },
        { category: { contains: String(q), mode: "insensitive" } },
        { modelCompatibility: { contains: String(q), mode: "insensitive" } },
        { color: { contains: String(q), mode: "insensitive" } },
        { branchName: { contains: String(q), mode: "insensitive" } },
      ];
    }

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    const motorbikeRows = products.filter((row) => row.category === "Motorbike");
    if (!motorbikeRows.length) {
      return res.json(products);
    }

    const chassisCandidates = Array.from(
      new Set(
        motorbikeRows
          .map((row) => String(row.chassisNumber || row.sku || "").trim())
          .filter(Boolean)
      )
    );

    let soldChassisSet = new Set();
    if (chassisCandidates.length) {
      const soldRows = await prisma.$queryRaw(
        Prisma.sql`
          SELECT DISTINCT TRIM(SPLIT_PART(SPLIT_PART("receiptType", '| Chassis: ', 2), '|', 1)) AS "chassis"
          FROM "SalesSdcRow"
          WHERE "receiptType" ILIKE ${`${BRANCH_SALE_PREFIX}%`}
            AND TRIM(SPLIT_PART(SPLIT_PART("receiptType", '| Chassis: ', 2), '|', 1)) IN (
              ${Prisma.join(chassisCandidates.map((value) => Prisma.sql`${value}`))}
            )
        `
      );

      soldChassisSet = new Set(
        (soldRows || [])
          .map((row) => String(row?.chassis || "").trim().toLowerCase())
          .filter((value) => value && value !== "n/a")
      );
    }

    const withSoldState = products.map((row) => {
      if (row.category !== "Motorbike") return row;
      const key = String(row.chassisNumber || row.sku || "").trim().toLowerCase();
      return {
        ...row,
        isSold: key ? soldChassisSet.has(key) : false,
      };
    });

    return res.json(withSoldState);
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const id = String(req.params.id).trim();
    const isSalesperson = req.user.role === "SALESPERSON";

    const existing = await prisma.product.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Product not found" });

    if (isSalesperson && existing.category !== "Motorbike") {
      return res.status(403).json({ message: "Salesperson can only manage Motorbike items." });
    }

    const data = {};
    const requestedCategory = req.body.category ? String(req.body.category).trim() : null;
    const isMotorbike =
      existing.category === "Motorbike" || requestedCategory === "Motorbike" || isSalesperson;

    if (req.body.sku != null && !isMotorbike) data.sku = String(req.body.sku).trim();
    if (req.body.partNumber != null) {
      data.partNumber = isMotorbike
        ? null
        : req.body.partNumber
          ? String(req.body.partNumber).trim()
          : null;
    }
    if (req.body.name != null) data.name = String(req.body.name).trim();
    if (req.body.unit != null) data.unit = isMotorbike ? "unit" : String(req.body.unit).trim();
    if (req.body.costPrice != null) data.costPrice = String(req.body.costPrice);
    if (req.body.sellPrice != null) data.sellPrice = String(req.body.sellPrice);
    if (req.body.minStock != null) {
      const parsed = Number(req.body.minStock);
      if (!Number.isInteger(parsed) || parsed < 0) {
        return res.status(400).json({ message: "minStock must be an integer >= 0" });
      }
      data.minStock = parsed;
    }
    if (req.body.brand != null) data.brand = req.body.brand ? String(req.body.brand).trim() : null;
    if (req.body.modelCompatibility != null) {
      data.modelCompatibility = isMotorbike
        ? null
        : req.body.modelCompatibility
          ? String(req.body.modelCompatibility).trim()
          : null;
    }
    if (req.body.isActive != null) data.isActive = Boolean(req.body.isActive);

    if (req.body.chassisNumber != null) {
      const chassisNumberValue = req.body.chassisNumber ? String(req.body.chassisNumber).trim() : null;
      if (isMotorbike && !chassisNumberValue) {
        return res.status(400).json({ message: "chassisNumber is required for Motorbike" });
      }
      data.chassisNumber = chassisNumberValue;
      if (isMotorbike) data.sku = chassisNumberValue;
    } else if (isMotorbike && req.body.sku != null) {
      const skuValue = String(req.body.sku).trim();
      data.sku = skuValue;
      data.chassisNumber = skuValue;
    }

    if (req.body.modelYear != null) {
      const yearValue = String(req.body.modelYear).trim();
      if (!yearValue) {
        data.modelYear = null;
      } else {
        const parsed = Number(yearValue);
        if (!Number.isInteger(parsed) || parsed < 1950 || parsed > 2100) {
          return res.status(400).json({ message: "modelYear must be a valid year" });
        }
        data.modelYear = parsed;
      }
    }

    if (req.body.weightKg != null) {
      const weightValue = String(req.body.weightKg).trim();
      if (!weightValue) {
        data.weightKg = null;
      } else {
        const parsed = Number(weightValue);
        if (Number.isNaN(parsed) || parsed < 0) {
          return res.status(400).json({ message: "weightKg must be a valid number" });
        }
        data.weightKg = String(parsed);
      }
    }

    if (req.body.color != null) data.color = req.body.color ? String(req.body.color).trim() : null;
    if (req.body.branchName != null) {
      data.branchName = req.body.branchName ? String(req.body.branchName).trim() : null;
    }

    if (isSalesperson && isMotorbike) {
      const nextBranch = data.branchName ?? existing.branchName;
      if (!nextBranch) {
        return res
          .status(400)
          .json({ message: "branchName is required for Motorbike created by Salesperson" });
      }
      if (req.body.minStock == null) {
        const branchCounter = await findBranchCounterByName(prisma, nextBranch);
        if (branchCounter) {
          data.minStock = parseCounterValue(branchCounter.value);
        }
      }
    }

    if (req.body.category != null) {
      const categoryValue = requestedCategory || null;
      if (isSalesperson) {
        if (categoryValue && categoryValue !== "Motorbike") {
          return res.status(403).json({ message: "Salesperson can only manage Motorbike items." });
        }
        data.category = "Motorbike";
      } else if (categoryValue && !ALLOWED_CATEGORIES.includes(categoryValue)) {
        return res.status(400).json({
          message: `category must be one of: ${ALLOWED_CATEGORIES.join(", ")}`,
        });
      } else {
        data.category = categoryValue;
      }
    } else if (isSalesperson) {
      data.category = "Motorbike";
    }
    if (isMotorbike) {
      data.unit = "unit";
      data.partNumber = null;
      data.modelCompatibility = null;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ message: "No fields provided to update" });
    }

    const updated = await prisma.product.update({
      where: { id },
      data,
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user.id,
        action: "UPDATE_PRODUCT",
        details: `Updated product ${updated.sku} (${updated.name})`,
      },
    });

    return res.json(updated);
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};


// What this does: creates an invoice sale and deducts stock from the exact bin(s)
const prisma = require("../prisma");
const { handleError } = require("../utils/errors");
const { autoPostSale } = require("../utils/accounting");

// What this does: finds the latest numeric invoice suffix for a given prefix.
async function getLastInvoiceNumberForPrefix(tx, prefix) {
  const last = await tx.sale.findFirst({
    where: {
      invoiceNo: { startsWith: prefix },
    },
    orderBy: { invoiceNo: "desc" },
    select: { invoiceNo: true },
  });

  if (!last?.invoiceNo) return 0;

  const raw = String(last.invoiceNo).slice(prefix.length).trim();
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

// What this does: generates invoice number like ALT-2026-000001 using an atomic yearly counter.
async function generateInvoiceNo(tx) {
  const year = new Date().getFullYear();
  const prefix = `ALT-${year}-`;
  const counterId = `invoiceNo:${year}`;

  // Sync counter with existing data so legacy records do not cause collisions.
  const lastNumber = await getLastInvoiceNumberForPrefix(tx, prefix);
  const counter = await tx.counter.upsert({
    where: { id: counterId },
    create: { id: counterId, value: lastNumber },
    update: {},
    select: { value: true },
  });

  if (counter.value < lastNumber) {
    await tx.counter.update({
      where: { id: counterId },
      data: { value: lastNumber },
    });
  }

  const nextCounter = await tx.counter.update({
    where: { id: counterId },
    data: { value: { increment: 1 } },
    select: { value: true },
  });

  return `${prefix}${String(nextCounter.value).padStart(6, "0")}`;
}

// -------------------------------
// CREATE SALE
// Body:
// {
//   "paymentMethod": "CASH",
//   "note": "optional",
//   "items": [
//     { "productId": "...", "locationId": "...", "binId": "...", "quantity": 2, "unitPrice": 6000, "discount": 0 }
//   ]
// }
// -------------------------------
exports.createSale = async (req, res) => {
  try {
    const {
      paymentMethod,
      note,
      items,
      buyerType,
      buyerTin,
      buyerName,
      buyerPhone,
    } = req.body;

    if (!paymentMethod) {
      return res.status(400).json({ message: "paymentMethod is required" });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items must be a non-empty array" });
    }

    const buyerTypeValue = buyerType ? String(buyerType).trim().toUpperCase() : null;
    const buyerTinValue = buyerTin ? String(buyerTin).trim() : null;
    const buyerNameValue = buyerName ? String(buyerName).trim() : null;
    const buyerPhoneValue = buyerPhone ? String(buyerPhone).trim() : null;

    if (buyerTypeValue && !["INDIVIDUAL", "COMPANY"].includes(buyerTypeValue)) {
      return res.status(400).json({ message: "buyerType must be INDIVIDUAL or COMPANY" });
    }
    if (buyerTypeValue === "COMPANY" && !buyerTinValue) {
      return res.status(400).json({ message: "buyerTin is required for COMPANY" });
    }

    // Validate items quick
    for (const it of items) {
      if (!it.productId || it.quantity == null || it.unitPrice == null) {
        return res.status(400).json({
          message: "Each item requires productId, quantity, unitPrice",
        });
      }
      const qty = Number(it.quantity);
      if (Number.isNaN(qty) || qty <= 0) return res.status(400).json({ message: "quantity must be > 0" });
      const price = Number(it.unitPrice);
      if (Number.isNaN(price) || price < 0) return res.status(400).json({ message: "unitPrice must be >= 0" });
    }

    const saleResult = await prisma.$transaction(async (tx) => {
      // 1) generate invoice number
      const invoiceNo = await generateInvoiceNo(tx);

      // 2) Validate inventory availability per bin and compute totals
      let subtotal = 0;
      let discountTotal = 0;

      // We'll store prepared items
      const preparedItems = [];
      let motorbikeLocationId = null;

      const resolveMotorbikeLocationId = async () => {
        if (motorbikeLocationId) return motorbikeLocationId;
        const existing = await tx.location.findUnique({
          where: { name: "MOTORBIKE-SALES" },
        });
        if (existing) {
          motorbikeLocationId = existing.id;
          return motorbikeLocationId;
        }
        const created = await tx.location.create({
          data: { name: "MOTORBIKE-SALES" },
        });
        motorbikeLocationId = created.id;
        return motorbikeLocationId;
      };

      for (const it of items) {
        const qty = Number(it.quantity);
        let unitPrice = Number(it.unitPrice);
        const discount = it.discount != null ? Number(it.discount) : 0;

        // Validate product exists
        const product = await tx.product.findUnique({ where: { id: it.productId } });
        if (!product) throw new Error("Product not found");

        const isMotorbike = product.category === "Motorbike" || Boolean(product.chassisNumber);
        const locationId = isMotorbike
          ? await resolveMotorbikeLocationId()
          : it.locationId;

        // What this does: if frontend sends 0 for motorbikes, fallback to product sellPrice.
        if (isMotorbike && (Number.isNaN(unitPrice) || unitPrice <= 0)) {
          const productSellPrice = Number(product.sellPrice || 0);
          if (Number.isFinite(productSellPrice) && productSellPrice > 0) {
            unitPrice = productSellPrice;
          }
        }

        if (!locationId) {
          throw new Error("locationId is required for non-motorbike products");
        }

        let bin = null;
        if (it.binId) {
          bin = await tx.storageBin.findUnique({ where: { id: it.binId } });
          if (!bin) throw new Error("Bin not found");
          if (bin.locationId !== locationId) throw new Error("Bin does not belong to this location");
        } else if (!isMotorbike) {
          throw new Error("Bin is required for non-motorbike products");
        }

        const binCode = bin ? bin.code : "MOTORBIKE";

        if (!isMotorbike) {
          const inv = await tx.inventory.findUnique({
            where: {
              productId_locationId_binId: {
                productId: it.productId,
                locationId,
                binId: it.binId,
              },
            },
          });

          if (!inv) {
            throw new Error(`No inventory record for ${product.name} in bin ${bin.code}. Available=0`);
          }
          if (inv.quantity < qty) {
            throw new Error(
              `Not enough stock for ${product.name} in bin ${bin.code}. Requested=${qty}, Available=${inv.quantity}`
            );
          }
        }

        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          throw new Error("unitPrice must be >= 0");
        }

        if (isMotorbike && unitPrice <= 0) {
          throw new Error("Unit price must be greater than 0 for motorbike items.");
        }

        const lineGross = unitPrice * qty;
        const lineNet = Math.max(lineGross - discount, 0);

        subtotal += lineGross;
        discountTotal += discount;

        preparedItems.push({
          productId: it.productId,
          locationId,
          binId: bin ? bin.id : null,
          quantity: qty,
          unitPrice: String(unitPrice),
          discount: String(discount),
          lineTotal: String(lineNet),
          productName: product.name,
          binCode,
          product,
          costPrice: Number(product.costPrice || 0),
        });
      }

      const taxTotal = 0; // for now; later we can add VAT rules
      const total = Math.max(subtotal - discountTotal + taxTotal, 0);

      // What this does: ensures cashier has an OPEN shift and links the sale to that shift
      const openShift = await tx.cashierShift.findFirst({
        where: { cashierId: req.user.id, status: "OPEN" },
        orderBy: { openedAt: "desc" },
      });

      if (!openShift) {
        throw new Error("No OPEN shift. Please open shift before making sales.");
      }
      // 3) Create Sale + items
      const sale = await tx.sale.create({
        data: {
          shiftId: openShift.id,
          invoiceNo,
          subtotal: String(subtotal),
          discountTotal: String(discountTotal),
          taxTotal: String(taxTotal),
          total: String(total),
          paymentMethod,
          note: note ? String(note) : null,
          buyerType: buyerTypeValue || undefined,
          buyerTin: buyerTinValue || null,
          buyerName: buyerNameValue || null,
          buyerPhone: buyerPhoneValue || null,
          cashierId: req.user.id,
          items: {
            create: preparedItems.map((p) => ({
              productId: p.productId,
              locationId: p.locationId,
              binId: p.binId,
              quantity: p.quantity,
              unitPrice: p.unitPrice,
              discount: p.discount,
              lineTotal: p.lineTotal,
            })),
          },
        },
        include: {
          items: true,
        },
      });


      // 4) Deduct inventory per item (bin required)
      for (const p of preparedItems) {
        if (!p.binId) continue;

        await tx.inventory.update({
          where: {
            productId_locationId_binId: {
              productId: p.productId,
              locationId: p.locationId,
              binId: p.binId,
            },
          },
          data: {
            quantity: { decrement: p.quantity },
          },
        });

        // Optional: log stock transaction OUT for audit/history
        await tx.stockTransaction.create({
          data: {
            type: "OUT",
            productId: p.productId,
            locationId: p.locationId,
            quantity: p.quantity,
            reason: `SALE:${invoiceNo} | BIN:${p.binCode}`,
            createdBy: req.user.id,
          },
        });
      }

      // 4.2) Sync motorbike sales to branch tracking
      for (const p of preparedItems) {
        if (!p.product.chassisNumber && p.product.category !== "Motorbike") continue;

        const branchName = p.product.branchName;
        if (!branchName) continue; // Skip if no branch assigned

        const chassisText = p.product.chassisNumber || "N/A";
        const modelText = p.product.name || "Motorbike";
        const itemName = chassisText !== "N/A" ? `${modelText} [${chassisText}]` : modelText;

        const receiptType = `POS Sale | Invoice: ${invoiceNo} | Chassis: ${chassisText} | Type: Sale`;

        await tx.salesSdcRow.create({
          data: {
            sdcId: invoiceNo, // Use invoice number as SDC ID for POS sales
            buyerTin: buyerTinValue || null,
            buyerName: buyerNameValue || null,
            saleDate: new Date(),
            receiptType,
            itemName,
            quantity: Number(p.quantity),
            unitPrice: Number(p.unitPrice),
            taxableSupplyPrice: Number(p.unitPrice) * Number(p.quantity),
            vat: 0, // POS sales don't have VAT calculation yet
            summaryAmount: Number(p.lineTotal),
            uploadedById: req.user.id,
          },
        });
      }

      // 4.5) Auto-post to accounting journal (cash/revenue + COGS)
      await autoPostSale(tx, sale, preparedItems);

      // 5) Audit log
      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "CREATE_SALE",
          details: `Created sale ${invoiceNo} total=${total} method=${paymentMethod}`,
        },
      });

      return sale;
    });

    return res.status(201).json(saleResult);
  } catch (err) {
    return handleError(res, err, { status: 400 });
  }
};


// -------------------------------
// LIST SALES
// Query: ?from=2026-01-01&to=2026-01-31&page=1&limit=20
// Cashier sees only their sales; Manager/CEO sees all.
// -------------------------------
exports.listSales = async (req, res) => {
  try {
    const { from, to, page = 1, limit = 20 } = req.query;

    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Number(page) - 1) * take;

    const where = {};

    // Role-based filter
    if (req.user.role === "CASHIER") {
      where.cashierId = req.user.id;
    }

    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [total, sales] = await prisma.$transaction([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
        include: {
          cashier: { select: { id: true, fullName: true, role: true } },
          items: {
            include: {
              product: { select: { id: true, name: true, sku: true, partNumber: true } },
              bin: { select: { id: true, code: true } },
              location: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    return res.json({
      meta: { total, page: Number(page), limit: take, pages: Math.ceil(total / take) },
      sales,
    });
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};

// -------------------------------
// GET SALE BY ID
// Cashier can view their own sale only.
// -------------------------------
exports.getSaleById = async (req, res) => {
  try {
    const sale = await prisma.sale.findUnique({
      where: { id: req.params.id },
      include: {
        cashier: { select: { id: true, fullName: true, role: true } },
        items: {
          include: {
            product: { select: { id: true, name: true, sku: true, partNumber: true } },
            bin: { select: { id: true, code: true } },
            location: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!sale) return res.status(404).json({ message: "Sale not found" });

    if (req.user.role === "CASHIER" && sale.cashierId !== req.user.id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.json(sale);
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};



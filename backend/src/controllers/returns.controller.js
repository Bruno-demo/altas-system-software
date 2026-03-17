// What this does: creates a return, restocks inventory to the specified bin(s), and logs stock IN
const prisma = require("../prisma");
const { handleError } = require("../utils/errors");
const { autoPostReturn } = require("../utils/accounting");

exports.createReturn = async (req, res) => {
  try {
    const saleId = req.params.id;
    const { reason, items } = req.body;

    if (!reason) return res.status(400).json({ message: "reason is required" });
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items must be a non-empty array" });
    }

    // items: [{ productId, locationId, binId, quantity }]
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: saleId },
        include: {
          items: {
            select: {
              id: true,
              productId: true,
              locationId: true,
              binId: true,
              quantity: true,
              unitPrice: true,
              product: { select: { name: true, category: true, chassisNumber: true, costPrice: true } },
            },
          },
        },
      });
      if (!sale) throw new Error("Sale not found");

      if (req.user.role === "CASHIER" && sale.cashierId !== req.user.id) {
        throw new Error("Forbidden");
      }

      const isMotorbikeProduct = (product) =>
        product?.category === "Motorbike" || Boolean(product?.chassisNumber);

      const ensureMotorbikeBin = async (locationId) => {
        const code = "MOTORBIKE-RETURN";
        const existing = await tx.storageBin.findUnique({ where: { code } });
        if (existing) {
          if (existing.locationId !== locationId) {
            throw new Error("Motorbike return bin belongs to a different location.");
          }
          return existing.id;
        }
        const created = await tx.storageBin.create({
          data: {
            code,
            locationId,
            description: "Motorbike returns",
          },
        });
        return created.id;
      };

      const saleItemMap = new Map();
      const saleItemNoBinMap = new Map();
      const saleItemById = new Map();
      const soldQtyMap = new Map();

      for (const it of sale.items) {
        const key = `${it.productId}:${it.locationId}:${it.binId || ""}`;
        if (!saleItemMap.has(key)) {
          saleItemMap.set(key, it);
        }
        saleItemById.set(it.id, it);
        soldQtyMap.set(key, (soldQtyMap.get(key) || 0) + Number(it.quantity || 0));
        if (!it.binId) {
          saleItemNoBinMap.set(`${it.productId}:${it.locationId}`, it);
        }
      }

      const preparedItems = [];
      const returnQtyMap = new Map();

      for (const it of items) {
        const saleItemId = it.saleItemId ? String(it.saleItemId).trim() : "";
        const inputProductId = it.productId ? String(it.productId).trim() : "";
        const inputLocationId = it.locationId ? String(it.locationId).trim() : "";
        const inputBinId = it.binId ? String(it.binId).trim() : "";
        const quantity = Number(it.quantity);

        if (!quantity) {
          throw new Error("Each return item requires quantity.");
        }
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error("Return quantity must be > 0.");
        }

        let saleItem = saleItemId ? saleItemById.get(saleItemId) : null;
        if (saleItemId && !saleItem) {
          throw new Error("Return item does not match the original sale.");
        }

        const productId = saleItem ? saleItem.productId : inputProductId;
        const locationId = saleItem ? saleItem.locationId : inputLocationId;
        const binId = saleItem ? saleItem.binId || "" : inputBinId;

        if (!productId || !locationId) {
          throw new Error("Each return item requires productId and locationId.");
        }

        if (!saleItem) {
          const exactKey = `${productId}:${locationId}:${binId}`;
          const fallbackKey = `${productId}:${locationId}:`;
          saleItem = saleItemMap.get(exactKey) || saleItemMap.get(fallbackKey) || saleItemNoBinMap.get(`${productId}:${locationId}`);
        }
        if (!saleItem) {
          throw new Error("Return item does not match the original sale.");
        }

        const saleKey = `${saleItem.productId}:${saleItem.locationId}:${saleItem.binId || ""}`;
        const isMotorbike = isMotorbikeProduct(saleItem.product);
        let finalBinId = binId;
        if (!finalBinId) {
          if (isMotorbike) {
            finalBinId = await ensureMotorbikeBin(locationId);
          } else {
            throw new Error("binId is required for non-motorbike returns.");
          }
        }

        const qtyKey = saleItemId ? `saleItem:${saleItem.id}` : saleKey;
        const soldQty = saleItemId
          ? Number(saleItem.quantity || 0)
          : soldQtyMap.get(saleKey) ?? Number(saleItem.quantity || 0);
        const returnedQty = (returnQtyMap.get(qtyKey) || 0) + quantity;
        if (returnedQty > soldQty) {
          throw new Error(
            `Return quantity exceeds sold quantity for ${saleItem.product?.name || "item"}.`
          );
        }
        returnQtyMap.set(qtyKey, returnedQty);

        preparedItems.push({
          productId,
          locationId,
          binId: finalBinId,
          quantity,
          isMotorbike,
          unitPrice: Number(saleItem.unitPrice || 0),
          costPrice: Number(saleItem.product?.costPrice || 0),
          product: saleItem.product || null,
        });
      }

      const motorbikeKey = (it) => `${it.productId}:${it.locationId}:${it.binId}`;
      const motorbikeReturnKeys = new Set(
        preparedItems.filter((it) => it.isMotorbike).map((it) => motorbikeKey(it))
      );

      // Create return record
      const ret = await tx.saleReturn.create({
        data: {
          saleId,
          reason: String(reason),
          createdById: req.user.id,
          items: {
            create: preparedItems.map((it) => ({
              product: { connect: { id: it.productId } },
              location: { connect: { id: it.locationId } },
              bin: { connect: { id: it.binId } },
              quantity: it.quantity,
            })),
          },
        },
        include: { items: true },
      });

      // Restock inventory per bin
      for (const it of ret.items) {
        if (motorbikeReturnKeys.has(motorbikeKey(it))) {
          continue;
        }

        await tx.inventory.upsert({
          where: {
            productId_locationId_binId: {
              productId: it.productId,
              locationId: it.locationId,
              binId: it.binId,
            },
          },
          update: { quantity: { increment: it.quantity } },
          create: {
            productId: it.productId,
            locationId: it.locationId,
            binId: it.binId,
            quantity: it.quantity,
          },
        });

        await tx.stockTransaction.create({
          data: {
            type: "IN",
            productId: it.productId,
            locationId: it.locationId,
            quantity: it.quantity,
            createdBy: req.user.id,
            reason: `RETURN:${sale.invoiceNo}`,
          },
        });
      }

      // Mark sale status (optional)
      await tx.sale.update({
        where: { id: saleId },
        data: { ebmStatus: "CREDITED" }, // EBM credit note will be needed
      });

      if (ret.items.length) {
        const itemMap = new Map();
        const itemMapNoBin = new Map();
        sale.items.forEach((it) => {
          const key = `${it.productId}:${it.locationId}:${it.binId || ""}`;
          if (!itemMap.has(key)) {
            itemMap.set(key, it);
          }
          if (!it.binId) {
            itemMapNoBin.set(`${it.productId}:${it.locationId}`, it);
          }
        });

        const sdcRows = ret.items.map((it) => {
          const key = `${it.productId}:${it.locationId}:${it.binId || ""}`;
          const fallbackItem = itemMapNoBin.get(`${it.productId}:${it.locationId}`);
          const matchedItem = itemMap.get(key) || fallbackItem;
          const unitPrice = matchedItem ? Number(matchedItem.unitPrice || 0) : 0;
          const quantity = -Math.abs(Number(it.quantity));
          const taxable = unitPrice * Math.abs(quantity);
          const itemName = matchedItem?.product?.name
            ? `Refund ${sale.invoiceNo} ${matchedItem.product.name}`
            : `Return ${sale.invoiceNo}`;
          return {
            sdcId: sale.ebmInvoiceNo || sale.invoiceNo,
            buyerTin: sale.buyerTin,
            buyerName: sale.buyerName,
            saleDate: ret.createdAt,
            receiptType: "Refund after Sale",
            itemName,
            quantity,
            unitPrice: unitPrice ? -unitPrice : 0,
            taxableSupplyPrice: -Math.abs(taxable),
            vat: 0,
            summaryAmount: -Math.abs(taxable),
            uploadedById: req.user.id,
          };
        });

        await tx.salesSdcRow.createMany({ data: sdcRows });
      }

      await autoPostReturn(tx, {
        sale,
        returnRecord: ret,
        items: preparedItems,
      });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "CREATE_RETURN",
          details: `Return for ${sale.invoiceNo} reason="${reason}"`,
        },
      });

      return ret;
    });

    res.status(201).json(result);
  } catch (err) {
    return handleError(res, err, { status: 400 });
  }
};


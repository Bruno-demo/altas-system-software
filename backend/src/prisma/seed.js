// What this does: wipes existing data and seeds a large demo dataset for full-system testing.
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const { DEFAULT_ACCOUNTS } = require("../utils/accounting");

const prisma = new PrismaClient();

const PASSWORD = process.env.SEED_DEFAULT_PASSWORD;
const TARGET = {
  USERS: 60,
  EMPLOYEES: 50,
  SPARE_PRODUCTS: 80,
  MOTORBIKES: 60,
  SALES: 50,
  RETURNS: 50,
  SHIFTS: 50,
  ATTENDANCE_DAYS: 45,
  ADVANCES: 120,
  PAYROLL_RUNS: 50,
  EXPENSES: 80,
  PROMOTIONS: 60,
  SDC_ROWS: 70,
  STOCK_TRANSACTIONS: 180,
  AUDIT_LOGS: 150,
  LOCATIONS: 6,
  BINS_PER_LOCATION: 20,
};

function pad(value, size) {
  return String(value).padStart(size, "0");
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function utcDate(year, month, day, hour = 8, minute = 0) {
  return new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
}

function daysAgoUtc(daysAgo, hour = 8, minute = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, minute, 0));
}

function monthFromOffset(startYear, startMonth, offset) {
  const monthZero = startMonth - 1 + offset;
  return {
    year: startYear + Math.floor(monthZero / 12),
    month: (monthZero % 12) + 1,
  };
}

function workingDaysMonSat(year, month) {
  const endDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= endDay; day += 1) {
    const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (wd !== 0) count += 1;
  }
  return count;
}

function chunkArray(rows, size) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

async function createManyInChunks(model, rows, size = 500) {
  if (!rows.length) return;
  for (const chunk of chunkArray(rows, size)) {
    await model.createMany({ data: chunk });
  }
}

function sumBy(items, selector) {
  return items.reduce((acc, item) => acc + Number(selector(item) || 0), 0);
}

async function wipeDatabase() {
  // What this does: clears data in FK-safe order so seed is always clean and deterministic.
  await prisma.journalLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.account.deleteMany();
  await prisma.saleReturnItem.deleteMany();
  await prisma.saleReturn.deleteMany();
  await prisma.saleItem.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.cashierShift.deleteMany();
  await prisma.payrollItem.deleteMany();
  await prisma.payrollRun.deleteMany();
  await prisma.salaryAdvance.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.salesSdcRow.deleteMany();
  await prisma.motorbikePromotion.deleteMany();
  await prisma.stockTransaction.deleteMany();
  await prisma.inventory.deleteMany();
  await prisma.storageBin.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.counter.deleteMany();
  await prisma.product.deleteMany();
  await prisma.location.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "true") {
    throw new Error("Seeding is blocked in production. Set ALLOW_PROD_SEED=true only for controlled runs.");
  }
  if (!PASSWORD) {
    throw new Error("SEED_DEFAULT_PASSWORD is required to run seed.");
  }

  await wipeDatabase();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);
  const roles = [
    "STORE_KEEPER",
    "CASHIER",
    "SALESPERSON",
    "MANAGER",
    "ACCOUNTANT",
    "HR",
    "CEO",
  ];

  // ===== Users =====
  const defaultUsers = [
    { fullName: "Default CEO", email: "ceo@altas.local", role: "CEO" },
    { fullName: "Default Manager", email: "manager@altas.local", role: "MANAGER" },
    { fullName: "Default HR", email: "hr@altas.local", role: "HR" },
    { fullName: "Default Cashier", email: "cashier@altas.local", role: "CASHIER" },
    { fullName: "Default Store Keeper", email: "store@altas.local", role: "STORE_KEEPER" },
    { fullName: "Default Salesperson", email: "sales@altas.local", role: "SALESPERSON" },
  ];

  const extraUserCount = Math.max(TARGET.USERS - defaultUsers.length, 0);
  const extraUsers = Array.from({ length: extraUserCount }, (_, i) => {
    const idx = i + 1;
    const role = roles[i % roles.length];
    return {
      fullName: `${role.replace("_", " ")} User ${pad(idx, 2)}`,
      email: `${role.toLowerCase()}${pad(idx, 2)}@altas.local`,
      role,
    };
  });

  const usersToCreate = [...defaultUsers, ...extraUsers].map((u, i) => ({
    fullName: u.fullName,
    email: u.email.toLowerCase(),
    role: u.role,
    password: passwordHash,
    isActive: true,
    mustChangePassword: false,
    createdAt: daysAgoUtc(500 - i, 9),
  }));

  await createManyInChunks(prisma.user, usersToCreate, 200);

  // ===== Chart of Accounts =====
  await createManyInChunks(
    prisma.account,
    DEFAULT_ACCOUNTS.map((acc) => ({
      code: acc.code,
      name: acc.name,
      type: acc.type,
      category: acc.category || null,
      isCash: Boolean(acc.isCash),
      isActive: true,
      createdAt: daysAgoUtc(700, 7),
    })),
    200
  );

  const allUsers = await prisma.user.findMany({ orderBy: { email: "asc" } });
  const usersByRole = roles.reduce((acc, role) => ({ ...acc, [role]: [] }), {});
  for (const user of allUsers) {
    usersByRole[user.role].push(user);
  }

  const userByEmail = new Map(allUsers.map((u) => [u.email.toLowerCase(), u]));
  const managerUser = userByEmail.get("manager@altas.local") || usersByRole.MANAGER[0];
  const hrUser = userByEmail.get("hr@altas.local") || usersByRole.HR[0];
  const cashierUsers = usersByRole.CASHIER;
  const storeKeepers = usersByRole.STORE_KEEPER;

  // ===== Locations + Bins =====
  const locationNames = ["Muhima", "Kacyiru", "Kimironko", "Nyabugogo", "Remera", "Gisozi"].slice(
    0,
    TARGET.LOCATIONS
  );
  await createManyInChunks(
    prisma.location,
    locationNames.map((name, i) => ({
      name,
      createdAt: daysAgoUtc(700 - i, 8),
    }))
  );

  const locations = await prisma.location.findMany();
  const locationByName = new Map(locations.map((l) => [l.name, l]));

  const binPrefixes = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const binRows = [];
  for (let li = 0; li < locationNames.length; li += 1) {
    const location = locationByName.get(locationNames[li]);
    const prefix = binPrefixes[li % binPrefixes.length];
    for (let bi = 1; bi <= TARGET.BINS_PER_LOCATION; bi += 1) {
      const aisle = Math.floor((bi - 1) / 5) + 1;
      const slot = ((bi - 1) % 5) + 1;
      binRows.push({
        code: `${prefix}${aisle}-${pad(slot, 2)}`,
        description: `${location.name} bin ${bi}`,
        locationId: location.id,
        createdAt: daysAgoUtc(650 - li * 10 - bi, 9),
      });
    }
  }
  await createManyInChunks(prisma.storageBin, binRows, 300);

  const bins = await prisma.storageBin.findMany({ orderBy: { code: "asc" } });
  const binsByLocation = new Map();
  for (const bin of bins) {
    if (!binsByLocation.has(bin.locationId)) binsByLocation.set(bin.locationId, []);
    binsByLocation.get(bin.locationId).push(bin);
  }

  // ===== Products =====
  const categories = ["Engine", "Brake", "Electrical", "Suspension", "Body", "Drive", "Consumables"];
  const brands = ["NGK", "Bosch", "SKF", "Genuine", "TRW", "DID", "Philips", "Osram", "Total"];
  const compatibilities = [
    "Universal",
    "TVS HLX 125",
    "Bajaj Boxer BM150",
    "SPIRO M1",
    "SPIRO M2",
    "SPIRO M3",
    "Discover 125",
  ];
  const units = ["pcs", "set", "bottle", "litre"];

  const spareProductRows = Array.from({ length: TARGET.SPARE_PRODUCTS }, (_, i) => {
    const idx = i + 1;
    const costPrice = 1200 + idx * 320;
    return {
      sku: `SP-${pad(idx, 4)}`,
      partNumber: `PN-${pad(idx, 4)}`,
      name: `${brands[i % brands.length]} ${categories[i % categories.length]} Part ${idx}`,
      unit: units[i % units.length],
      costPrice,
      sellPrice: round2(costPrice * 1.45),
      minStock: 5 + (i % 20),
      brand: brands[i % brands.length],
      category: categories[i % categories.length],
      modelCompatibility: compatibilities[i % compatibilities.length],
      isActive: true,
      createdAt: daysAgoUtc(500 - i, 10),
    };
  });

  const bikeModels = [
    { manufacturer: "SPIRO", model: "M1" },
    { manufacturer: "SPIRO", model: "M2" },
    { manufacturer: "SPIRO", model: "M3" },
    { manufacturer: "BAJAJ", model: "Boxer BM150" },
    { manufacturer: "DISCOVER", model: "Discover 125" },
    { manufacturer: "TVS", model: "HLX 125" },
  ];
  const bikeColors = ["Blue", "Red", "Black", "White", "Silver", "Green"];

  const motorbikeRows = Array.from({ length: TARGET.MOTORBIKES }, (_, i) => {
    const idx = i + 1;
    const model = bikeModels[i % bikeModels.length];
    const costPrice = 1_050_000 + idx * 22_500;
    return {
      sku: `MB-${pad(idx, 4)}`,
      partNumber: null,
      name: `${model.model} Electric Motorcycle`,
      unit: "unit",
      costPrice,
      sellPrice: round2(costPrice + 260_000 + (i % 5) * 15_000),
      minStock: 0,
      brand: model.manufacturer,
      category: "Motorbike",
      modelCompatibility: null,
      chassisNumber: `CHS-${pad(2026, 4)}-${pad(idx, 5)}`,
      modelYear: 2023 + (i % 4),
      weightKg: round2(82 + (i % 24)),
      color: bikeColors[i % bikeColors.length],
      branchName: locationNames[i % locationNames.length],
      isActive: true,
      createdAt: daysAgoUtc(420 - i, 10),
    };
  });

  await createManyInChunks(prisma.product, [...spareProductRows, ...motorbikeRows], 300);

  const allProducts = await prisma.product.findMany({ orderBy: { sku: "asc" } });
  const spareProducts = allProducts.filter((p) => p.sku.startsWith("SP-"));
  const motorbikeProducts = allProducts.filter((p) => p.sku.startsWith("MB-"));

  // ===== Inventory =====
  const inventoryRows = [];
  for (let i = 0; i < spareProducts.length; i += 1) {
    const product = spareProducts[i];
    const location = locationByName.get(locationNames[i % locationNames.length]);
    const locationBins = binsByLocation.get(location.id);
    const firstBin = locationBins[i % locationBins.length];
    const secondBin = locationBins[(i + 7) % locationBins.length];

    inventoryRows.push({
      productId: product.id,
      locationId: location.id,
      binId: firstBin.id,
      quantity: 140 + ((i * 17) % 200),
      updatedAt: daysAgoUtc(35 - (i % 30), 11),
    });
    inventoryRows.push({
      productId: product.id,
      locationId: location.id,
      binId: secondBin.id,
      quantity: 55 + ((i * 11) % 120),
      updatedAt: daysAgoUtc(34 - (i % 30), 11),
    });
  }

  for (let i = 0; i < motorbikeProducts.length; i += 1) {
    const product = motorbikeProducts[i];
    const location = locationByName.get(product.branchName) || locationByName.get(locationNames[0]);
    inventoryRows.push({
      productId: product.id,
      locationId: location.id,
      binId: null,
      quantity: 100_000 + i,
      updatedAt: daysAgoUtc(15 - (i % 15), 12),
    });
  }

  await createManyInChunks(prisma.inventory, inventoryRows, 500);

  const inventoryWithBins = await prisma.inventory.findMany({
    where: { binId: { not: null } },
    select: { productId: true, locationId: true, binId: true },
  });
  const firstInventoryByProduct = new Map();
  for (const inv of inventoryWithBins) {
    if (!firstInventoryByProduct.has(inv.productId)) {
      firstInventoryByProduct.set(inv.productId, inv);
    }
  }

  // ===== Stock Transactions =====
  const productCostById = new Map(allProducts.map((p) => [p.id, Number(p.costPrice)]));
  const stockTransactionRows = [];
  for (let i = 0; i < TARGET.STOCK_TRANSACTIONS; i += 1) {
    const product = spareProducts[i % spareProducts.length];
    const inv = firstInventoryByProduct.get(product.id);
    const type = i % 10 === 0 ? "DAMAGE" : i % 4 === 0 ? "OUT" : "IN";
    stockTransactionRows.push({
      type,
      productId: product.id,
      locationId: inv.locationId,
      quantity: type === "IN" ? 5 + (i % 25) : 1 + (i % 4),
      unitCost: type === "IN" ? round2(productCostById.get(product.id) * (1 + ((i % 5) - 2) * 0.01)) : null,
      reason:
        type === "DAMAGE"
          ? `Damage report ${i + 1}`
          : type === "OUT"
            ? `Manual stock out ${i + 1}`
            : `Stock in batch ${i + 1}`,
      createdBy: storeKeepers[i % storeKeepers.length].id,
      createdAt: daysAgoUtc(220 - (i % 200), 15),
    });
  }
  await createManyInChunks(prisma.stockTransaction, stockTransactionRows, 400);

  // ===== Employees =====
  const positions = [
    "Compliance Officer",
    "Accountant",
    "Store Assistant",
    "HR Officer",
    "Sales Agent",
    "Cashier",
    "Operations Officer",
    "Inventory Controller",
    "Branch Coordinator",
    "Customer Care",
  ];
  const banks = ["BK", "Equity", "I&M", "KCB", "Access", "BPR"];

  const employeeRows = Array.from({ length: TARGET.EMPLOYEES }, (_, i) => {
    const idx = i + 1;
    return {
      employeeCode: `EMP-${pad(idx, 3)}`,
      fullName: `Employee ${pad(idx, 3)}`,
      nationalId: `1199${pad(idx, 12)}`,
      tin: idx % 2 === 0 ? `10${pad(idx, 7)}` : null,
      phone: `07${pad(8_800_000 + idx, 8)}`,
      position: positions[i % positions.length],
      employmentType: idx % 8 === 0 ? "TRAINEE" : "STAFF",
      hireDate: daysAgoUtc(900 - i * 5, 9),
      baseSalary: 180_000 + (i % 12) * 20_000,
      bankName: banks[i % banks.length],
      bankAccount: `10${pad(idx, 8)}${pad((idx * 17) % 100, 2)}`,
      isActive: true,
      createdAt: daysAgoUtc(850 - i * 3, 10),
    };
  });

  await createManyInChunks(prisma.employee, employeeRows, 300);
  const employees = await prisma.employee.findMany({ orderBy: { employeeCode: "asc" } });

  // ===== Attendance =====
  const attendanceRows = [];
  for (let ei = 0; ei < employees.length; ei += 1) {
    const employee = employees[ei];
    for (let dayOffset = TARGET.ATTENDANCE_DAYS; dayOffset >= 1; dayOffset -= 1) {
      const date = daysAgoUtc(dayOffset, 8, 0);
      const roll = (ei * 37 + dayOffset * 13) % 100;
      const status = roll < 80 ? "PRESENT" : roll < 92 ? "ABSENT" : "LEAVE";

      let checkInTime = null;
      let isLate = false;
      let lateMinutes = 0;
      if (status === "PRESENT") {
        const minuteOffset = (ei * 5 + dayOffset * 3) % 75;
        const totalMinutes = 8 * 60 + minuteOffset;
        const hour = Math.floor(totalMinutes / 60);
        const minute = totalMinutes % 60;
        checkInTime = new Date(
          Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate(),
            hour,
            minute,
            0
          )
        );
        lateMinutes = Math.max(totalMinutes - (8 * 60 + 15), 0);
        isLate = lateMinutes > 0;
      }

      attendanceRows.push({
        employeeId: employee.id,
        date,
        status,
        note: status === "ABSENT" ? "Absent (seeded)" : status === "LEAVE" ? "On leave (seeded)" : null,
        createdById: hrUser.id,
        checkInTime,
        isLate,
        lateMinutes,
        createdAt: date,
      });
    }
  }
  await createManyInChunks(prisma.attendance, attendanceRows, 500);

  // ===== Advances =====
  const advanceRows = [];
  const approvedAdvanceByEmployeeMonth = new Map();
  const advanceReasons = [
    "School fees",
    "Medical support",
    "Transport emergency",
    "Family support",
    "Rent support",
  ];

  const monthKey = (employeeId, year, month) => `${employeeId}:${year}:${month}`;

  for (let i = 0; i < TARGET.ADVANCES; i += 1) {
    const employee = employees[i % employees.length];
    const date = daysAgoUtc((i * 2) % 240 + 1, 12);
    const amount = 20_000 + (i % 12) * 10_000;
    const status = i % 10 === 0 ? "CANCELLED" : "APPROVED";

    advanceRows.push({
      employeeId: employee.id,
      amount,
      date,
      reason: `${advanceReasons[i % advanceReasons.length]} #${i + 1}`,
      status,
      createdById: hrUser.id,
    });

    if (status === "APPROVED") {
      const key = monthKey(employee.id, date.getUTCFullYear(), date.getUTCMonth() + 1);
      approvedAdvanceByEmployeeMonth.set(
        key,
        round2((approvedAdvanceByEmployeeMonth.get(key) || 0) + amount)
      );
    }
  }
  await createManyInChunks(prisma.salaryAdvance, advanceRows, 400);

  // ===== Payroll Runs + Items =====
  for (let runIdx = 0; runIdx < TARGET.PAYROLL_RUNS; runIdx += 1) {
    const { year, month } = monthFromOffset(2022, 1, runIdx);
    const workingDays = workingDaysMonSat(year, month);
    const run = await prisma.payrollRun.create({
      data: {
        year,
        month,
        status: runIdx < TARGET.PAYROLL_RUNS - 2 ? "FINAL" : "DRAFT",
        generatedById: hrUser.id,
        totalNet: 0,
        createdAt: utcDate(year, month, 1, 9, 0),
      },
    });

    const itemRows = [];
    let totalNet = 0;
    for (let ei = 0; ei < employees.length; ei += 1) {
      const employee = employees[ei];
      const baseSalary = Number(employee.baseSalary);
      const daysPresent = Math.max(0, workingDays - ((runIdx + ei) % 7));
      const grossPay = round2((baseSalary * daysPresent) / workingDays);
      const lateCount = (runIdx * 2 + ei) % 9;
      const lateDeduction = round2(Math.floor(lateCount / 3) * (baseSalary / workingDays));
      const advanceDeduction = round2(
        approvedAdvanceByEmployeeMonth.get(monthKey(employee.id, year, month)) || 0
      );
      const otherDeductions = ei % 20 === 0 ? 2_500 : 0;
      const netPay = round2(Math.max(grossPay - lateDeduction - advanceDeduction - otherDeductions, 0));
      totalNet += netPay;

      itemRows.push({
        payrollRunId: run.id,
        employeeId: employee.id,
        baseSalary,
        daysPresent,
        workingDays,
        grossPay,
        lateCount,
        lateDeduction,
        advanceDeduction,
        otherDeductions,
        netPay,
      });
    }

    await createManyInChunks(prisma.payrollItem, itemRows, 300);
    await prisma.payrollRun.update({
      where: { id: run.id },
      data: { totalNet: round2(totalNet) },
    });
  }

  // ===== Expenses =====
  const expenseCategories = [
    "RENT",
    "UTILITIES",
    "TRANSPORT",
    "SALARY_PAYOUT",
    "STOCK_PURCHASE",
    "MAINTENANCE",
    "TAX",
    "OFFICE",
    "OTHER",
  ];
  const paymentMethods = ["CASH", "MOMO", "CARD", "BANK", "OTHER"];
  const expenseCreators = [managerUser, hrUser, storeKeepers[0]].filter(Boolean);

  const expenseRows = [];
  for (let i = 0; i < TARGET.EXPENSES; i += 1) {
    const date = daysAgoUtc((i * 2) % 365 + 1, 13);
    const isDeleted = i % 13 === 0;
    expenseRows.push({
      date,
      amount: 30_000 + (i % 20) * 12_500,
      category: expenseCategories[i % expenseCategories.length],
      paymentMethod: paymentMethods[i % paymentMethods.length],
      vendor: `Vendor ${pad(i + 1, 3)}`,
      description: `Seeded expense ${i + 1}`,
      referenceNo: `EXP-${pad(i + 1, 4)}`,
      createdById: expenseCreators[i % expenseCreators.length].id,
      createdAt: date,
      isDeleted,
      deletedAt: isDeleted ? new Date(date.getTime() + 24 * 60 * 60 * 1000) : null,
      deletedById: isDeleted ? managerUser.id : null,
      updatedAt: new Date(date.getTime() + 2 * 60 * 60 * 1000),
      updatedById: managerUser.id,
    });
  }
  await createManyInChunks(prisma.expense, expenseRows, 300);

  // ===== Cashier Shifts =====
  const shifts = [];
  for (let i = 0; i < TARGET.SHIFTS; i += 1) {
    const isOpen = i === TARGET.SHIFTS - 1;
    const openedAt = daysAgoUtc(90 - i * 3, 7);
    const shift = await prisma.cashierShift.create({
      data: {
        cashierId: cashierUsers[i % cashierUsers.length].id,
        status: isOpen ? "OPEN" : "CLOSED",
        openedAt,
        closedAt: isOpen ? null : new Date(openedAt.getTime() + 10 * 60 * 60 * 1000),
        note: `Seeded shift ${i + 1}`,
      },
    });
    shifts.push(shift);
  }

  // ===== Sales + Sale Items =====
  const spareSalePool = spareProducts.filter((p) => firstInventoryByProduct.has(p.id));
  const saleSnapshots = [];

  for (let i = 0; i < TARGET.SALES; i += 1) {
    const idx = i + 1;
    const shift = shifts[i % shifts.length];
    const cashierId = shift.cashierId;
    const createdAt = daysAgoUtc(80 - i, 10);
    const paymentMethod = paymentMethods[i % paymentMethods.length];
    const buyerType = idx % 4 === 0 ? "COMPANY" : "INDIVIDUAL";

    const spareA = spareSalePool[i % spareSalePool.length];
    let spareB = spareSalePool[(i * 3) % spareSalePool.length];
    if (spareB.id === spareA.id) {
      spareB = spareSalePool[(i * 3 + 1) % spareSalePool.length];
    }

    const invA = firstInventoryByProduct.get(spareA.id);
    const invB = firstInventoryByProduct.get(spareB.id);

    const items = [];
    const qtyA = 2 + (i % 3);
    const unitPriceA = Number(spareA.sellPrice);
    const discountA = i % 8 === 0 ? 500 : 0;
    items.push({
      productId: spareA.id,
      locationId: invA.locationId,
      binId: invA.binId,
      quantity: qtyA,
      unitPrice: unitPriceA,
      discount: discountA,
      lineTotal: round2(qtyA * unitPriceA - discountA),
    });

    const qtyB = 2 + (i % 2);
    const unitPriceB = Number(spareB.sellPrice);
    const discountB = i % 11 === 0 ? 400 : 0;
    items.push({
      productId: spareB.id,
      locationId: invB.locationId,
      binId: invB.binId,
      quantity: qtyB,
      unitPrice: unitPriceB,
      discount: discountB,
      lineTotal: round2(qtyB * unitPriceB - discountB),
    });

    if (idx % 3 === 0) {
      const bike = motorbikeProducts[i % motorbikeProducts.length];
      const bikeLocation = locationByName.get(bike.branchName) || locationByName.get(locationNames[0]);
      const bikeDiscount = idx % 9 === 0 ? 30_000 : 0;
      items.push({
        productId: bike.id,
        locationId: bikeLocation.id,
        binId: null,
        quantity: 1,
        unitPrice: Number(bike.sellPrice),
        discount: bikeDiscount,
        lineTotal: round2(Number(bike.sellPrice) - bikeDiscount),
      });
    }

    const subtotal = round2(sumBy(items, (x) => Number(x.unitPrice) * Number(x.quantity)));
    const discountTotal = round2(sumBy(items, (x) => x.discount));
    const total = round2(Math.max(subtotal - discountTotal, 0));

    const ebmStatus = idx <= 30 ? "SIGNED" : idx <= 44 ? "PENDING" : "FAILED";
    const sdcId = ebmStatus === "SIGNED" ? `SDC010161026/${idx}` : null;

    const sale = await prisma.sale.create({
      data: {
        invoiceNo: `ALT-2026-${pad(idx, 6)}`,
        subtotal,
        discountTotal,
        taxTotal: 0,
        total,
        paymentMethod,
        note: `Seeded sale #${idx}`,
        createdAt,
        buyerType,
        buyerTin: buyerType === "COMPANY" ? `10${pad(2_000_000 + idx, 7)}` : null,
        buyerName: `Buyer ${pad(idx, 3)}`,
        buyerPhone: `07${pad(8_100_000 + idx, 8)}`,
        cashierId,
        shiftId: shift.id,
        ebmStatus,
        ebmInvoiceNo: sdcId,
        ebmReceiptSignature: sdcId,
        ebmQrPayload: sdcId
          ? JSON.stringify({ sdcId, invoiceNo: `ALT-2026-${pad(idx, 6)}`, total, buyerType })
          : null,
        ebmIssuedAt: sdcId ? new Date(createdAt.getTime() + 2 * 60 * 1000) : null,
        items: { create: items },
      },
      include: { items: true },
    });

    saleSnapshots.push({
      id: sale.id,
      shiftId: sale.shiftId,
      paymentMethod,
      total: Number(sale.total),
      items: sale.items,
    });
  }

  // What this does: computes realistic shift expected totals from seeded sales.
  const shiftAgg = new Map();
  for (const sale of saleSnapshots) {
    if (!sale.shiftId) continue;
    if (!shiftAgg.has(sale.shiftId)) {
      shiftAgg.set(sale.shiftId, {
        salesCount: 0,
        expectedCash: 0,
        expectedMomo: 0,
        expectedCard: 0,
        expectedBank: 0,
        expectedOther: 0,
        expectedTotal: 0,
      });
    }
    const agg = shiftAgg.get(sale.shiftId);
    agg.salesCount += 1;
    agg.expectedTotal = round2(agg.expectedTotal + sale.total);
    if (sale.paymentMethod === "CASH") agg.expectedCash = round2(agg.expectedCash + sale.total);
    if (sale.paymentMethod === "MOMO") agg.expectedMomo = round2(agg.expectedMomo + sale.total);
    if (sale.paymentMethod === "CARD") agg.expectedCard = round2(agg.expectedCard + sale.total);
    if (sale.paymentMethod === "BANK") agg.expectedBank = round2(agg.expectedBank + sale.total);
    if (sale.paymentMethod === "OTHER") agg.expectedOther = round2(agg.expectedOther + sale.total);
  }

  for (const shift of shifts) {
    const agg = shiftAgg.get(shift.id) || {
      salesCount: 0,
      expectedCash: 0,
      expectedMomo: 0,
      expectedCard: 0,
      expectedBank: 0,
      expectedOther: 0,
      expectedTotal: 0,
    };

    const isClosed = shift.status === "CLOSED";
    await prisma.cashierShift.update({
      where: { id: shift.id },
      data: {
        salesCount: agg.salesCount,
        expectedCash: agg.expectedCash,
        expectedMomo: agg.expectedMomo,
        expectedCard: agg.expectedCard,
        expectedBank: agg.expectedBank,
        expectedOther: agg.expectedOther,
        expectedTotal: agg.expectedTotal,
        countedCash: isClosed ? agg.expectedCash : 0,
        countedMomo: isClosed ? agg.expectedMomo : 0,
        countedCard: isClosed ? agg.expectedCard : 0,
        countedBank: isClosed ? agg.expectedBank : 0,
        countedOther: isClosed ? agg.expectedOther : 0,
        countedTotal: isClosed ? agg.expectedTotal : 0,
        diffCash: 0,
        diffMomo: 0,
        diffCard: 0,
        diffBank: 0,
        diffOther: 0,
        diffTotal: 0,
      },
    });
  }

  // ===== Returns =====
  const returnableItems = saleSnapshots
    .flatMap((sale) =>
      sale.items
        .filter((item) => item.binId && item.quantity >= 2)
        .map((item) => ({
          saleId: sale.id,
          productId: item.productId,
          locationId: item.locationId,
          binId: item.binId,
          quantity: item.quantity,
        }))
    )
    .slice(0, TARGET.RETURNS);

  for (let i = 0; i < returnableItems.length; i += 1) {
    const item = returnableItems[i];
    const credited = i % 6 === 0;
    const signature = credited ? `RET-SDC-${pad(i + 1, 5)}` : null;
    await prisma.saleReturn.create({
      data: {
        saleId: item.saleId,
        reason: `Seeded return reason ${i + 1}`,
        createdById: cashierUsers[i % cashierUsers.length].id,
        createdAt: daysAgoUtc(40 - (i % 30), 14),
        ebmStatus: credited ? "CREDITED" : "PENDING",
        ebmSignature: signature,
        ebmQrPayload: signature ? JSON.stringify({ returnSdcId: signature }) : null,
        items: {
          create: [
            {
              productId: item.productId,
              locationId: item.locationId,
              binId: item.binId,
              quantity: 1,
            },
          ],
        },
      },
    });
  }

  // ===== Promotions =====
  const promotionRows = Array.from({ length: TARGET.PROMOTIONS }, (_, i) => {
    const idx = i + 1;
    const bike = motorbikeProducts[i % motorbikeProducts.length];
    return {
      countingNumber: String(idx),
      date: daysAgoUtc(120 - i, 16),
      customerName: `Promotion Customer ${pad(idx, 3)}`,
      chassisNumber: bike.chassisNumber,
      plateNumber: `RA${pad(1000 + idx, 4)}A`,
      model: bike.name,
      phoneNumber: `78${pad(2_100_000 + idx, 7)}`,
      delivered: idx % 4 !== 0,
      stubPaid: idx % 5 !== 0,
      branchName: bike.branchName,
      createdAt: daysAgoUtc(120 - i, 16),
      updatedAt: daysAgoUtc(Math.max(1, 110 - i), 17),
    };
  });
  await createManyInChunks(prisma.motorbikePromotion, promotionRows, 200);

  // ===== SDC Rows =====
  const sdcRows = Array.from({ length: TARGET.SDC_ROWS }, (_, i) => {
    const idx = i + 1;
    const product = allProducts[i % allProducts.length];
    const qty = idx % 9 === 0 ? -1 : 1 + (idx % 4);
    const unitPrice = Number(product.sellPrice);
    const taxable = round2(qty * unitPrice);
    return {
      sdcId: `SDC-ALT-${pad(idx, 6)}`,
      buyerTin: idx % 3 === 0 ? `10${pad(3_000_000 + idx, 7)}` : null,
      buyerName: `SDC Buyer ${pad(idx, 3)}`,
      saleDate: daysAgoUtc(140 - idx, 15),
      receiptType: qty < 0 ? "Refund after Sale" : "Normal Sale",
      itemName: `${product.name} (${product.sku})`,
      quantity: qty,
      unitPrice,
      taxableSupplyPrice: taxable,
      vat: 0,
      summaryAmount: taxable,
      uploadedById: managerUser.id,
      createdAt: daysAgoUtc(140 - idx, 15),
      updatedAt: daysAgoUtc(130 - idx, 15),
    };
  });
  await createManyInChunks(prisma.salesSdcRow, sdcRows, 250);

  // ===== Audit Logs =====
  const actions = [
    "CREATE_PRODUCT",
    "UPDATE_PRODUCT",
    "STOCK_IN",
    "STOCK_OUT",
    "CREATE_SALE",
    "CONFIRM_EBM",
    "CREATE_ATTENDANCE",
    "GENERATE_PAYROLL",
    "CREATE_ADVANCE",
    "CREATE_EXPENSE",
  ];
  const auditRows = Array.from({ length: TARGET.AUDIT_LOGS }, (_, i) => {
    const idx = i + 1;
    return {
      userId: allUsers[i % allUsers.length].id,
      action: actions[i % actions.length],
      details: `Seeded audit log #${idx}`,
      createdAt: daysAgoUtc(160 - (i % 150), 18),
    };
  });
  await createManyInChunks(prisma.auditLog, auditRows, 400);

  // ===== Counters =====
  await createManyInChunks(prisma.counter, [
    { id: "invoiceNo", value: TARGET.SALES },
    { id: "invoiceNo:2026", value: TARGET.SALES },
    { id: "promotionNo", value: TARGET.PROMOTIONS },
    { id: "salesSdcNo", value: TARGET.SDC_ROWS },
    { id: "payrollRunNo", value: TARGET.PAYROLL_RUNS },
    { id: "employeeNo", value: TARGET.EMPLOYEES },
  ]);

  // ===== Summary =====
  const summary = {
    users: await prisma.user.count(),
    locations: await prisma.location.count(),
    bins: await prisma.storageBin.count(),
    products: await prisma.product.count(),
    inventory: await prisma.inventory.count(),
    stockTransactions: await prisma.stockTransaction.count(),
    employees: await prisma.employee.count(),
    attendance: await prisma.attendance.count(),
    advances: await prisma.salaryAdvance.count(),
    payrollRuns: await prisma.payrollRun.count(),
    payrollItems: await prisma.payrollItem.count(),
    expenses: await prisma.expense.count(),
    shifts: await prisma.cashierShift.count(),
    sales: await prisma.sale.count(),
    saleItems: await prisma.saleItem.count(),
    returns: await prisma.saleReturn.count(),
    returnItems: await prisma.saleReturnItem.count(),
    promotions: await prisma.motorbikePromotion.count(),
    sdcRows: await prisma.salesSdcRow.count(),
    auditLogs: await prisma.auditLog.count(),
  };

  console.log("Seed complete with large dataset:");
  Object.entries(summary).forEach(([key, value]) => console.log(`- ${key}: ${value}`));
  console.log("\nSeed finished. Credentials are intentionally not printed in production-safe mode.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

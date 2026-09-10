const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "JournalLine",
      "JournalEntry",
      "Account",
      "SaleReturnItem",
      "SaleReturn",
      "SaleItem",
      "Sale",
      "CashierShift",
      "PayrollItem",
      "PayrollRun",
      "SalaryAdvance",
      "Attendance",
      "Employee",
      "Expense",
      "SalesSdcRow",
      "MotorbikePromotion",
      "StockTransaction",
      "Inventory",
      "StorageBin",
      "AuditLog",
      "Counter",
      "Product",
      "Location",
      "User"
    RESTART IDENTITY CASCADE;
  `);
  console.log('truncated');
  await prisma.$disconnect();
})();

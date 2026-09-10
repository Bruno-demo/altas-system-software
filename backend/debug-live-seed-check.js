const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const users = await prisma.user.findMany({
    where: { role: 'CASHIER' },
    select: { id: true, email: true, role: true },
  });
  const cashiers = users.map((u) => ({ id: u.id, email: u.email }));

  const returnRows = await prisma.saleReturn.findMany({
    select: { id: true, createdById: true, saleId: true },
    orderBy: { createdAt: 'asc' },
  });

  const missing = [];
  for (const row of returnRows) {
    const user = await prisma.user.findUnique({ where: { id: row.createdById } });
    if (!user) missing.push({ returnId: row.id, createdById: row.createdById, saleId: row.saleId });
  }

  console.log(JSON.stringify({ cashierCount: cashiers.length, cashiers: cashiers.slice(0, 5), returnCount: returnRows.length, missing }, null, 2));
  await prisma.$disconnect();
})();

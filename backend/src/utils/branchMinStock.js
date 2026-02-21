// What this does: stores per-branch default min-stock values in Counter (no schema migration needed).
const BRANCH_MIN_STOCK_PREFIX = "BRANCH_MIN_STOCK::";

function normalizeBranchName(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function normalizeBranchKey(value) {
  const name = normalizeBranchName(value);
  return name ? name.toLowerCase() : null;
}

function counterIdForBranch(branchName) {
  const name = normalizeBranchName(branchName);
  if (!name) return null;
  return `${BRANCH_MIN_STOCK_PREFIX}${name}`;
}

function branchNameFromCounterId(counterId) {
  if (!counterId || !String(counterId).startsWith(BRANCH_MIN_STOCK_PREFIX)) {
    return null;
  }
  return String(counterId).slice(BRANCH_MIN_STOCK_PREFIX.length) || null;
}

function parseCounterValue(value) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return 0;
  return Math.max(Math.floor(n), 0);
}

async function listBranchCounterRows(db) {
  return db.counter.findMany({
    where: { id: { startsWith: BRANCH_MIN_STOCK_PREFIX } },
    select: { id: true, value: true },
  });
}

async function findBranchCounterByName(db, branchName) {
  const branchKey = normalizeBranchKey(branchName);
  if (!branchKey) return null;
  const rows = await listBranchCounterRows(db);
  return (
    rows.find(
      (row) => normalizeBranchKey(branchNameFromCounterId(row.id)) === branchKey
    ) || null
  );
}

function toBranchMinStockMap(rows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const branchName = branchNameFromCounterId(row.id);
    const key = normalizeBranchKey(branchName);
    if (!key) return;
    map.set(key, parseCounterValue(row.value));
  });
  return map;
}

async function getBranchMinStockMap(db) {
  const rows = await listBranchCounterRows(db);
  return toBranchMinStockMap(rows);
}

async function setBranchMinStock(db, branchName, minStock) {
  const name = normalizeBranchName(branchName);
  if (!name) return null;

  const value = parseCounterValue(minStock);
  const targetId = counterIdForBranch(name);
  const existing = await findBranchCounterByName(db, name);

  await db.counter.upsert({
    where: { id: targetId },
    update: { value },
    create: { id: targetId, value },
  });

  if (existing && existing.id !== targetId) {
    await db.counter.deleteMany({ where: { id: existing.id } });
  }

  return { id: targetId, value };
}

async function removeBranchMinStock(db, branchName) {
  const existing = await findBranchCounterByName(db, branchName);
  if (!existing) return 0;
  const removed = await db.counter.deleteMany({ where: { id: existing.id } });
  return removed.count || 0;
}

module.exports = {
  BRANCH_MIN_STOCK_PREFIX,
  normalizeBranchName,
  normalizeBranchKey,
  counterIdForBranch,
  branchNameFromCounterId,
  parseCounterValue,
  listBranchCounterRows,
  findBranchCounterByName,
  toBranchMinStockMap,
  getBranchMinStockMap,
  setBranchMinStock,
  removeBranchMinStock,
};

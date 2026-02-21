#!/usr/bin/env node
/* eslint-disable no-console */
const path = require("path");
const net = require("net");
const fs = require("fs");
const { spawn } = require("child_process");
const prisma = require("../src/prisma");
const { createWorkbook } = require("../src/utils/safeExcel");

const SMOKE_HOST = process.env.SMOKE_HOST || "127.0.0.1";
const SMOKE_PORT = Number(process.env.SMOKE_PORT || 5099);
const BASE = process.env.SMOKE_BASE_URL || `http://${SMOKE_HOST}:${SMOKE_PORT}`;
const DEFAULT_PASSWORD = "Altas@2026";

const state = {
  users: {},
  tokens: {},
  ids: {
    productIds: [],
    motorbikeProductIds: [],
    saleIds: [],
    returnIds: [],
    expenseIds: [],
    employeeIds: [],
    advanceIds: [],
    payrollRunIds: [],
    promotionIds: [],
    locationIds: [],
    binIds: [],
    sdcIds: [],
  },
  refs: {},
  shiftWasOpenedBySmoke: false,
  shiftId: null,
  warnings: [],
};

const checks = [];
const failures = [];

function todayYmd() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function ensure(cond, msg) {
  if (!cond) throw new Error(msg);
}

function addWarning(message) {
  state.warnings.push(message);
  console.warn(`[WARN] ${message}`);
}

function addCheck(name, details = "") {
  checks.push({ name, details });
  const suffix = details ? ` | ${details}` : "";
  console.log(`[PASS] ${name}${suffix}`);
}

function addFailure(name, err) {
  const message = err instanceof Error ? err.message : String(err);
  failures.push({ name, message });
  console.error(`[FAIL] ${name} | ${message}`);
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(pathname, options = {}) {
  const {
    method = "GET",
    token,
    body,
    expect = [200],
    raw = false,
    headers = {},
  } = options;

  const expected = Array.isArray(expect) ? expect : [expect];
  const reqHeaders = { ...headers };
  if (token) reqHeaders.Authorization = `Bearer ${token}`;
  if (body !== undefined) reqHeaders["Content-Type"] = "application/json";

  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get("content-type") || "";
  let data;
  if (raw) {
    data = Buffer.from(await res.arrayBuffer());
  } else if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!expected.includes(res.status)) {
    const summary =
      data && typeof data === "object"
        ? JSON.stringify(data)
        : String(data).slice(0, 300);
    throw new Error(`${method} ${pathname} returned ${res.status}. Response: ${summary}`);
  }

  return { status: res.status, data, headers: res.headers };
}

async function runStep(name, fn) {
  const started = Date.now();
  try {
    await fn();
    const ms = Date.now() - started;
    addCheck(name, `${ms}ms`);
  } catch (err) {
    addFailure(name, err);
  }
}

function startServer(runtimeDir) {
  const serverEntry = path.resolve(__dirname, "../src/server.js");
  const child = spawn(process.execPath, [serverEntry], {
    cwd: runtimeDir,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  return child;
}

async function waitForServer(child, timeoutMs = 30000) {
  const started = Date.now();
  let stdoutBuffer = "";
  let stderrBuffer = "";
  let ready = false;

  const onStdout = (chunk) => {
    const text = chunk.toString();
    stdoutBuffer += text;
    if (text.includes("Server running on")) ready = true;
    process.stdout.write(`[api] ${text}`);
  };
  const onStderr = (chunk) => {
    const text = chunk.toString();
    stderrBuffer += text;
    process.stderr.write(`[api:err] ${text}`);
  };

  child.stdout.on("data", onStdout);
  child.stderr.on("data", onStderr);

  while (!ready && Date.now() - started < timeoutMs) {
    if (child.exitCode != null) {
      throw new Error(
        `Server exited early with code ${child.exitCode}. stdout=${stdoutBuffer.slice(-500)} stderr=${stderrBuffer.slice(-500)}`
      );
    }
    await wait(200);
  }

  if (!ready) {
    throw new Error(`Server did not become ready within ${timeoutMs}ms`);
  }
}

async function login(email, password = DEFAULT_PASSWORD) {
  const res = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
    expect: [200],
  });
  return res.data;
}

async function loadBaseRefs() {
  const ceoToken = state.tokens.CEO;
  const locRes = await request("/api/locations", { token: ceoToken });
  ensure(Array.isArray(locRes.data) && locRes.data.length > 0, "No locations found");
  const location = locRes.data[0];

  const binsRes = await request(`/api/bins?locationId=${encodeURIComponent(location.id)}`, {
    token: ceoToken,
  });
  ensure(Array.isArray(binsRes.data) && binsRes.data.length > 0, "No bins found in base location");
  const bin = binsRes.data[0];

  state.refs.baseLocation = location;
  state.refs.baseBin = bin;
}

async function createSalesSdcImportBase64(sdcId, dateStr) {
  const workbook = await createWorkbook();
  const ws = workbook.addWorksheet("Sales");
  ws.addRow([
    "SDC ID",
    "Buyer TIN",
    "Buyer Name",
    "Sale date",
    "Receipt type",
    "Item name",
    "Quantity",
    "Unit price",
    "Taxable Supply Price",
    "VAT",
    "Summary Amount",
  ]);
  ws.addRow([
    sdcId,
    "123456789",
    "Smoke Buyer",
    dateStr,
    "Sale",
    "Smoke Imported Item",
    1,
    1000,
    1000,
    0,
    1000,
  ]);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString("base64");
}

async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.once("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        reject(
          new Error(
            `Port ${port} is already in use. Stop any running app on ${BASE} before starting this smoke test.`
          )
        );
        return;
      }
      reject(err);
    });
    tester.once("listening", () => {
      tester.close((closeErr) => {
        if (closeErr) reject(closeErr);
        else resolve();
      });
    });
    tester.listen(port, "0.0.0.0");
  });
}

function prepareRuntimeEnvDir() {
  const backendDir = path.resolve(__dirname, "..");
  const runtimeDir = path.join(backendDir, ".smoke-runtime");
  const sourceEnv = path.join(backendDir, ".env");
  const targetEnv = path.join(runtimeDir, ".env");

  let envText = fs.existsSync(sourceEnv) ? fs.readFileSync(sourceEnv, "utf8") : "";
  envText = envText
    .split(/\r?\n/)
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith("PORT=") && !t.startsWith("HOST=");
    })
    .join("\n");
  envText += `\nPORT=${SMOKE_PORT}\nHOST=${SMOKE_HOST}\n`;

  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(targetEnv, envText, "utf8");
  return runtimeDir;
}

async function cleanup() {
  const {
    productIds,
    motorbikeProductIds,
    saleIds,
    returnIds,
    expenseIds,
    employeeIds,
    advanceIds,
    payrollRunIds,
    promotionIds,
    locationIds,
    binIds,
    sdcIds,
  } = state.ids;

  const allProductIds = [...new Set([...productIds, ...motorbikeProductIds])];

  try {
    if (returnIds.length) {
      await prisma.saleReturnItem.deleteMany({ where: { returnId: { in: returnIds } } });
      await prisma.saleReturn.deleteMany({ where: { id: { in: returnIds } } });
    }

    if (saleIds.length) {
      await prisma.saleItem.deleteMany({ where: { saleId: { in: saleIds } } });
      await prisma.sale.deleteMany({ where: { id: { in: saleIds } } });
    }

    if (sdcIds.length) {
      await prisma.salesSdcRow.deleteMany({ where: { sdcId: { in: sdcIds } } });
    }

    if (payrollRunIds.length) {
      await prisma.payrollItem.deleteMany({ where: { payrollRunId: { in: payrollRunIds } } });
      await prisma.payrollRun.deleteMany({ where: { id: { in: payrollRunIds } } });
    }

    if (advanceIds.length) {
      await prisma.salaryAdvance.deleteMany({ where: { id: { in: advanceIds } } });
    }

    if (employeeIds.length) {
      await prisma.attendance.deleteMany({ where: { employeeId: { in: employeeIds } } });
      await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
    }

    if (expenseIds.length) {
      await prisma.expense.deleteMany({ where: { id: { in: expenseIds } } });
    }

    if (promotionIds.length) {
      await prisma.motorbikePromotion.deleteMany({ where: { id: { in: promotionIds } } });
    }

    if (allProductIds.length) {
      await prisma.inventory.deleteMany({ where: { productId: { in: allProductIds } } });
      await prisma.stockTransaction.deleteMany({ where: { productId: { in: allProductIds } } });
      await prisma.product.deleteMany({ where: { id: { in: allProductIds } } });
    }

    if (binIds.length) {
      await prisma.storageBin.deleteMany({ where: { id: { in: binIds } } });
    }

    if (locationIds.length) {
      await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
    }
  } catch (err) {
    addWarning(`Cleanup could not remove all temporary smoke data: ${err.message}`);
  }
}

async function main() {
  const stamp = Date.now();
  const today = todayYmd();
  let server = null;
  let runtimeDir = null;

  try {
    runtimeDir = prepareRuntimeEnvDir();
    await assertPortFree(SMOKE_PORT);
    server = startServer(runtimeDir);
    await waitForServer(server);

    await runStep("Auth: login (case-insensitive CEO email)", async () => {
      const out = await login("CEO@ALTAS.LOCAL");
      ensure(out?.token, "CEO token missing");
      ensure(out?.user?.role === "CEO", "CEO role mismatch");
      state.tokens.CEO = out.token;
      state.users.CEO = out.user;
    });

    await runStep("Auth: login all default roles", async () => {
      const roles = {
        MANAGER: "manager@altas.local",
        HR: "hr@altas.local",
        CASHIER: "cashier@altas.local",
        STORE_KEEPER: "store@altas.local",
        SALESPERSON: "sales@altas.local",
      };

      for (const [role, email] of Object.entries(roles)) {
        const out = await login(email);
        ensure(out?.token, `${role} token missing`);
        ensure(out?.user?.role === role, `${role} role mismatch`);
        state.tokens[role] = out.token;
        state.users[role] = out.user;
      }
    });

    await runStep("Setup: load baseline location/bin", async () => {
      await loadBaseRefs();
      ensure(state.refs.baseLocation?.id, "Base location not resolved");
      ensure(state.refs.baseBin?.id, "Base bin not resolved");
    });

    await runStep("Security: role gates return forbidden for disallowed modules", async () => {
      await request("/api/admin/users", { token: state.tokens.CASHIER, expect: [403] });
      await request("/api/expenses", { token: state.tokens.SALESPERSON, expect: [403] });
    });

    await runStep("Stock: create spare product and perform IN/OUT/DAMAGE", async () => {
      const sku = `SMOKE-SP-${stamp}`;
      const product = await request("/api/products", {
        method: "POST",
        token: state.tokens.STORE_KEEPER,
        expect: [201],
        body: {
          sku,
          partNumber: sku,
          name: `Smoke Spare ${stamp}`,
          unit: "pcs",
          costPrice: 1000,
          sellPrice: 1500,
          minStock: 2,
          brand: "SmokeBrand",
          category: "Engine",
          modelCompatibility: "Universal",
        },
      });

      const productId = product.data.id;
      state.ids.productIds.push(productId);
      state.refs.spareProduct = product.data;

      await request("/api/stock/in", {
        method: "POST",
        token: state.tokens.STORE_KEEPER,
        expect: [201],
        body: {
          productId,
          locationId: state.refs.baseLocation.id,
          binId: state.refs.baseBin.id,
          quantity: 10,
          unitCost: 1000,
        },
      });

      await request("/api/stock/out", {
        method: "POST",
        token: state.tokens.STORE_KEEPER,
        expect: [201],
        body: {
          productId,
          locationId: state.refs.baseLocation.id,
          binId: state.refs.baseBin.id,
          quantity: 2,
          reason: "Smoke stock out",
        },
      });

      await request("/api/stock/damage", {
        method: "POST",
        token: state.tokens.STORE_KEEPER,
        expect: [201],
        body: {
          productId,
          locationId: state.refs.baseLocation.id,
          binId: state.refs.baseBin.id,
          quantity: 1,
          reason: "Smoke damage",
        },
      });

      const inv = await request(
        `/api/stock/inventory?locationId=${encodeURIComponent(state.refs.baseLocation.id)}&q=${encodeURIComponent(sku)}`,
        { token: state.tokens.STORE_KEEPER }
      );

      const row = inv.data.find((x) => x.productId === productId && x.binId === state.refs.baseBin.id);
      ensure(row, "Inventory row not found for smoke product");
      ensure(Number(row.quantity) === 7, `Expected quantity 7 after IN/OUT/DAMAGE, got ${row.quantity}`);

      await request("/api/stock/transactions?page=1&limit=5", { token: state.tokens.STORE_KEEPER });
      await request("/api/stock/low-stock", { token: state.tokens.STORE_KEEPER });
    });

    await runStep("POS: open shift if needed", async () => {
      const open = await request("/api/pos/shift/open", {
        token: state.tokens.CASHIER,
      });

      if (!open.data?.shift) {
        const created = await request("/api/pos/shift/open", {
          method: "POST",
          token: state.tokens.CASHIER,
          expect: [201],
          body: { note: "Smoke test shift" },
        });
        state.shiftWasOpenedBySmoke = true;
        state.shiftId = created.data.shift.id;
      } else {
        state.shiftId = open.data.shift.id;
      }

      ensure(state.shiftId, "Shift id missing");
    });

    await runStep("POS: create sale + invoice endpoints + EBM confirm + return sync", async () => {
      const sale1 = await request("/api/pos/sales", {
        method: "POST",
        token: state.tokens.CASHIER,
        expect: [201],
        body: {
          paymentMethod: "CASH",
          buyerType: "INDIVIDUAL",
          buyerName: "Smoke Customer 1",
          buyerTin: null,
          note: "Smoke sale 1",
          items: [
            {
              productId: state.refs.spareProduct.id,
              locationId: state.refs.baseLocation.id,
              binId: state.refs.baseBin.id,
              quantity: 2,
              unitPrice: 1500,
              discount: 0,
            },
          ],
        },
      });

      state.ids.saleIds.push(sale1.data.id);
      state.refs.sale1 = sale1.data;

      await request(`/api/pos/sales/${sale1.data.id}/invoice.json`, {
        token: state.tokens.CASHIER,
      });
      await request(`/api/pos/sales/${sale1.data.id}/invoice.pdf?format=80mm`, {
        token: state.tokens.CASHIER,
        raw: true,
      });
      await request(`/api/sales/${sale1.data.id}/receipt-html`, {
        token: state.tokens.CASHIER,
      });
      await request(`/api/sales/${sale1.data.id}/print`, {
        token: state.tokens.CASHIER,
      });
      await request(`/api/pos/sales/${sale1.data.id}/ebm-input`, {
        token: state.tokens.CASHIER,
      });

      const sdc1 = `SMOKE-SDC-${stamp}-1`;
      state.ids.sdcIds.push(sdc1);
      await request(`/api/pos/sales/${sale1.data.id}/ebm-confirm`, {
        method: "POST",
        token: state.tokens.CASHIER,
        body: {
          ebmInvoiceNo: sdc1,
          ebmReceiptSignature: `SIG-${stamp}-1`,
          ebmQrPayload: `SMOKE-QR-${stamp}-1`,
        },
      });

      const firstItem = sale1.data.items?.[0];
      ensure(firstItem?.id, "Sale item id missing for return test");

      const ret = await request(`/api/pos/sales/${sale1.data.id}/return`, {
        method: "POST",
        token: state.tokens.CASHIER,
        expect: [201],
        body: {
          reason: "Smoke return",
          items: [{ saleItemId: firstItem.id, quantity: 1 }],
        },
      });
      state.ids.returnIds.push(ret.data.id);

      const inv = await request(
        `/api/stock/inventory?locationId=${encodeURIComponent(state.refs.baseLocation.id)}&q=${encodeURIComponent(
          state.refs.spareProduct.sku
        )}`,
        { token: state.tokens.STORE_KEEPER }
      );
      const row = inv.data.find(
        (x) => x.productId === state.refs.spareProduct.id && x.binId === state.refs.baseBin.id
      );
      ensure(row, "Inventory row missing after return");
      ensure(Number(row.quantity) === 6, `Expected quantity 6 after sale+return, got ${row.quantity}`);

      const sale2 = await request("/api/pos/sales", {
        method: "POST",
        token: state.tokens.CASHIER,
        expect: [201],
        body: {
          paymentMethod: "MOMO",
          buyerType: "INDIVIDUAL",
          buyerName: "Smoke Customer 2",
          note: "Smoke sale 2 pending EBM",
          items: [
            {
              productId: state.refs.spareProduct.id,
              locationId: state.refs.baseLocation.id,
              binId: state.refs.baseBin.id,
              quantity: 1,
              unitPrice: 1500,
              discount: 0,
            },
          ],
        },
      });

      state.ids.saleIds.push(sale2.data.id);
      state.refs.sale2 = sale2.data;
    });

    await runStep("Reports: pending EBM workflow + SDC visibility sync", async () => {
      const pending = await request("/api/reports/ebm/pending?period=today&limit=200", {
        token: state.tokens.MANAGER,
      });
      const pendingIds = new Set((pending.data.pending || []).map((x) => x.id));
      ensure(pendingIds.has(state.refs.sale2.id), "Pending EBM list does not include second sale");

      await request(`/api/reports/ebm/${state.refs.sale2.id}/mark-failed`, {
        method: "POST",
        token: state.tokens.MANAGER,
        body: { reason: "Smoke fail toggle" },
      });
      await request(`/api/reports/ebm/${state.refs.sale2.id}/mark-pending`, {
        method: "POST",
        token: state.tokens.MANAGER,
        body: { reason: "Smoke reopen" },
      });

      const beforeConfirm = await request(
        `/api/reports/sales-sdc?period=today&q=${encodeURIComponent(state.refs.sale2.invoiceNo)}`,
        {
          token: state.tokens.MANAGER,
        }
      );
      ensure((beforeConfirm.data.rows || []).length === 0, "Pending sale unexpectedly present in SDC list");

      const sdc2 = `SMOKE-SDC-${stamp}-2`;
      state.ids.sdcIds.push(sdc2);
      await request(`/api/pos/sales/${state.refs.sale2.id}/ebm-confirm`, {
        method: "POST",
        token: state.tokens.CASHIER,
        body: {
          ebmInvoiceNo: sdc2,
          ebmReceiptSignature: `SIG-${stamp}-2`,
          ebmQrPayload: `SMOKE-QR-${stamp}-2`,
        },
      });

      const afterConfirm = await request(`/api/reports/sales-sdc?period=today&q=${encodeURIComponent(sdc2)}`, {
        token: state.tokens.MANAGER,
      });
      ensure((afterConfirm.data.rows || []).length > 0, "Confirmed EBM row not found in SDC list");
    });

    await runStep("POS: list/detail/report endpoints", async () => {
      await request(`/api/pos/sales?page=1&limit=10`, { token: state.tokens.CASHIER });
      await request(`/api/pos/sales/${state.refs.sale1.id}`, { token: state.tokens.CASHIER });
      await request(`/api/sales?period=today&q=${encodeURIComponent(state.refs.sale1.invoiceNo)}`, {
        token: state.tokens.CASHIER,
      });
      await request(`/api/sales/${state.refs.sale1.id}`, { token: state.tokens.CASHIER });
      await request(`/api/pos/reports/daily?date=${today}`, { token: state.tokens.CASHIER });
    });

    await runStep("Manager/CEO/Admin reports endpoints", async () => {
      const managerToken = state.tokens.MANAGER;
      const ceoToken = state.tokens.CEO;

      await request("/api/manager/kpis?period=today", { token: managerToken });
      await request("/api/manager/sales/export/excel?period=today", {
        token: managerToken,
        raw: true,
      });
      await request("/api/manager/audit?page=1&limit=20", { token: managerToken });
      await request("/api/manager/stock/valuation", { token: managerToken });

      await request("/api/reports/summary?period=today", { token: managerToken });
      await request("/api/reports/sales-by-payment?period=today", { token: managerToken });
      await request("/api/reports/best-sellers?period=today", { token: managerToken });
      await request("/api/reports/stock-movement?period=today", { token: managerToken });
      await request("/api/reports/cashflow?period=today", { token: managerToken });
      await request("/api/reports/profit?period=today", { token: managerToken });
      await request("/api/reports/audit?page=1&limit=20", { token: managerToken });
      await request("/api/reports/stock-transactions?page=1&limit=20", { token: managerToken });
      await request("/api/reports/export/excel?period=today", { token: managerToken, raw: true });
      await request("/api/reports/ebm/summary?period=today", { token: managerToken });
      await request("/api/reports/ebm/pending-by-cashier?period=today", { token: managerToken });
      await request("/api/reports/sales-sdc/imported?period=today", { token: managerToken });

      await request("/api/ceo/overview?period=today", { token: ceoToken });
      await request("/api/ceo/cashflow?period=today", { token: ceoToken });
      await request("/api/ceo/alerts", { token: ceoToken });
      await request(`/api/ceo/stock-lifecycle?productId=${encodeURIComponent(state.refs.spareProduct.id)}`, {
        token: ceoToken,
      });

      await request("/api/admin/users?page=1&limit=10", { token: ceoToken });
      await request(`/api/admin/users/${state.users.MANAGER.id}`, { token: ceoToken });
      await request(`/api/admin/system/error-logs?date=${today}&limit=5`, { token: ceoToken });
    });

    await runStep("Expenses module: create/update/list/summary/export/delete", async () => {
      const created = await request("/api/expenses", {
        method: "POST",
        token: state.tokens.MANAGER,
        expect: [201],
        body: {
          date: today,
          amount: 5000,
          category: "OFFICE",
          paymentMethod: "CASH",
          vendor: "Smoke Vendor",
          description: "Smoke expense",
          referenceNo: `SMK-EXP-${stamp}`,
        },
      });
      state.ids.expenseIds.push(created.data.id);

      await request(`/api/expenses/${created.data.id}`, {
        method: "PUT",
        token: state.tokens.MANAGER,
        body: { description: "Smoke expense updated" },
      });

      await request("/api/expenses?period=today", { token: state.tokens.MANAGER });
      await request("/api/expenses/summary?period=today", { token: state.tokens.MANAGER });
      await request("/api/expenses/export/excel?period=today", { token: state.tokens.MANAGER, raw: true });

      await request(`/api/expenses/${created.data.id}`, {
        method: "DELETE",
        token: state.tokens.MANAGER,
      });
    });

    await runStep("HR module: employee/attendance/advance/payroll flow", async () => {
      const empCode = `SMK-EMP-${stamp}`;
      const createdEmp = await request("/api/hr/employees", {
        method: "POST",
        token: state.tokens.HR,
        expect: [201],
        body: {
          employeeCode: empCode,
          fullName: `Smoke Employee ${stamp}`,
          phone: "0780000000",
          position: "Smoke Tester",
          baseSalary: 300000,
          employmentType: "STAFF",
          hireDate: today,
          tin: "999999999",
        },
      });
      state.ids.employeeIds.push(createdEmp.data.id);
      state.refs.smokeEmployee = createdEmp.data;

      await request(`/api/hr/employees/${createdEmp.data.id}`, {
        method: "PUT",
        token: state.tokens.HR,
        body: { phone: "0781111111" },
      });
      await request("/api/hr/employees?page=1&limit=20&q=Smoke", { token: state.tokens.HR });
      await request(`/api/hr/employees/${createdEmp.data.id}`, { token: state.tokens.HR });

      await request("/api/hr/attendance/mark", {
        method: "POST",
        token: state.tokens.HR,
        expect: [201],
        body: {
          date: today,
          fillAbsent: false,
          records: [
            {
              employeeId: createdEmp.data.id,
              status: "PRESENT",
              isLate: true,
              lateMinutes: 10,
            },
          ],
        },
      });

      await request(`/api/hr/attendance?date=${today}`, { token: state.tokens.HR });
      await request(`/api/hr/attendance/range?from=${today}&to=${today}`, { token: state.tokens.HR });
      await request(`/api/hr/attendance/summary?from=${today}&to=${today}`, { token: state.tokens.HR });

      const adv = await request("/api/hr/advances", {
        method: "POST",
        token: state.tokens.HR,
        expect: [201],
        body: {
          employeeId: createdEmp.data.id,
          amount: 20000,
          date: today,
          reason: "Smoke advance",
        },
      });
      state.ids.advanceIds.push(adv.data.id);

      await request(`/api/hr/advances?employeeId=${createdEmp.data.id}`, { token: state.tokens.HR });
      await request(`/api/hr/advances/summary?from=${today}&to=${today}`, { token: state.tokens.HR });

      const payroll = await request("/api/hr/payroll/generate?year=2099&month=1", {
        method: "POST",
        token: state.tokens.HR,
        expect: [201],
        body: { employeeIds: [createdEmp.data.id] },
      });
      const runId = payroll.data.payrollRun?.id;
      ensure(runId, "Payroll run id missing");
      state.ids.payrollRunIds.push(runId);

      await request(`/api/hr/payroll?q=${encodeURIComponent(runId)}`, { token: state.tokens.HR });
      await request(`/api/hr/payroll/${runId}`, { token: state.tokens.HR });
      await request(`/api/hr/payroll/${runId}/export/bank-excel`, { token: state.tokens.HR, raw: true });
      await request(`/api/hr/payroll/${runId}/finalize`, {
        method: "POST",
        token: state.tokens.HR,
      });

      await request(`/api/hr/advances/${adv.data.id}/cancel`, {
        method: "POST",
        token: state.tokens.HR,
        body: { reason: "Smoke cancel advance" },
      });
    });

    await runStep("Motorbike + branch sync: create/rename/sync/delete flow", async () => {
      const branchName = `SMOKE-BRANCH-${stamp}`;
      const renamedBranch = `${branchName}-RENAMED`;
      const chassis = `SMOKE-CHASSIS-${stamp}`;

      const loc = await request("/api/locations", {
        method: "POST",
        token: state.tokens.SALESPERSON,
        expect: [201],
        body: { name: branchName, minStock: 4 },
      });
      state.ids.locationIds.push(loc.data.id);

      const bike = await request("/api/products", {
        method: "POST",
        token: state.tokens.SALESPERSON,
        expect: [201],
        body: {
          name: `Smoke Bike ${stamp}`,
          category: "Motorbike",
          costPrice: 900000,
          sellPrice: 1200000,
          chassisNumber: chassis,
          brand: "SPIRO",
          modelYear: 2026,
          weightKg: 120,
          color: "Black",
          branchName,
        },
      });
      state.ids.motorbikeProductIds.push(bike.data.id);
      ensure(Number(bike.data.minStock) === 4, `Expected motorbike minStock=4, got ${bike.data.minStock}`);

      const promo = await request("/api/motorbikes/promotions", {
        method: "POST",
        token: state.tokens.SALESPERSON,
        expect: [201],
        body: {
          date: today,
          customerName: "Smoke Bike Buyer",
          chassisNumber: chassis,
          plateNumber: "RAA123A",
          model: "M3",
          phoneNumber: "0782222222",
          delivered: true,
          stubPaid: true,
          branchName,
        },
      });
      state.ids.promotionIds.push(promo.data.id);

      await request(`/api/motorbikes/branches?q=${encodeURIComponent(branchName)}`, {
        token: state.tokens.SALESPERSON,
      });
      await request(`/api/motorbikes/branches/detail?branch=${encodeURIComponent(branchName)}`, {
        token: state.tokens.SALESPERSON,
      });

      await request("/api/motorbikes/branches/settings", {
        method: "PUT",
        token: state.tokens.SALESPERSON,
        body: { branch: branchName, minStock: 6 },
      });

      const bikesAfterMin = await request(`/api/products?q=${encodeURIComponent(chassis)}`, {
        token: state.tokens.SALESPERSON,
      });
      const bikeRow = bikesAfterMin.data.find((x) => x.id === bike.data.id);
      ensure(bikeRow, "Motorbike not found after minStock update");
      ensure(Number(bikeRow.minStock) === 6, `Expected minStock=6 after sync, got ${bikeRow.minStock}`);

      await request(`/api/locations/${loc.data.id}`, {
        method: "PUT",
        token: state.tokens.SALESPERSON,
        body: { name: renamedBranch },
      });

      const bikeAfterRename = await request(`/api/products?q=${encodeURIComponent(chassis)}`, {
        token: state.tokens.SALESPERSON,
      });
      const bikeRenamed = bikeAfterRename.data.find((x) => x.id === bike.data.id);
      ensure(bikeRenamed?.branchName === renamedBranch, "Motorbike branchName did not sync after location rename");

      const promoAfterRename = await request(`/api/motorbikes/promotions?q=${encodeURIComponent(chassis)}`, {
        token: state.tokens.SALESPERSON,
      });
      const promoRow = (promoAfterRename.data.rows || []).find((x) => x.id === promo.data.id);
      ensure(promoRow?.branchName === renamedBranch, "Promotion branchName did not sync after location rename");

      await request(`/api/locations/${loc.data.id}`, {
        method: "DELETE",
        token: state.tokens.SALESPERSON,
      });

      const bikeAfterDelete = await request(`/api/products?q=${encodeURIComponent(chassis)}`, {
        token: state.tokens.SALESPERSON,
      });
      const bikeDeletedBranch = bikeAfterDelete.data.find((x) => x.id === bike.data.id);
      ensure(bikeDeletedBranch?.branchName == null, "Motorbike branchName not cleared after location delete");

      const promoAfterDelete = await request(`/api/motorbikes/promotions?q=${encodeURIComponent(chassis)}`, {
        token: state.tokens.SALESPERSON,
      });
      const promoDeletedBranch = (promoAfterDelete.data.rows || []).find((x) => x.id === promo.data.id);
      ensure(promoDeletedBranch?.branchName == null, "Promotion branchName not cleared after location delete");
    });

    await runStep("Location safety: delete blocked when stock dependencies exist", async () => {
      const locName = `SMOKE-USED-${stamp}`;
      const loc = await request("/api/locations", {
        method: "POST",
        token: state.tokens.STORE_KEEPER,
        expect: [201],
        body: { name: locName, minStock: 1 },
      });
      state.ids.locationIds.push(loc.data.id);

      const binCode = `SMK-${String(stamp).slice(-6)}`;
      const bin = await request("/api/bins", {
        method: "POST",
        token: state.tokens.STORE_KEEPER,
        expect: [201],
        body: {
          code: binCode,
          description: "Smoke used location bin",
          locationId: loc.data.id,
        },
      });
      state.ids.binIds.push(bin.data.id);

      await request("/api/stock/in", {
        method: "POST",
        token: state.tokens.STORE_KEEPER,
        expect: [201],
        body: {
          productId: state.refs.spareProduct.id,
          locationId: loc.data.id,
          binId: bin.data.id,
          quantity: 1,
          unitCost: 1000,
        },
      });

      await request(`/api/locations/${loc.data.id}`, {
        method: "DELETE",
        token: state.tokens.STORE_KEEPER,
        expect: [409],
      });
    });

    await runStep("Sales SDC import: excel upload + list visibility", async () => {
      const importSdcId = `SMOKE-IMP-${stamp}`;
      state.ids.sdcIds.push(importSdcId);
      const fileBase64 = await createSalesSdcImportBase64(importSdcId, today);

      await request("/api/reports/sales-sdc/import", {
        method: "POST",
        token: state.tokens.SALESPERSON,
        body: { fileBase64 },
      });

      const listed = await request(`/api/reports/sales-sdc/imported?period=all&q=${encodeURIComponent(importSdcId)}`, {
        token: state.tokens.SALESPERSON,
      });
      ensure((listed.data.rows || []).some((x) => x.sdcId === importSdcId), "Imported SDC row not listed");
    });

    await runStep("Salesperson access: sales list endpoints", async () => {
      await request("/api/sales?period=today&page=1&limit=10", { token: state.tokens.SALESPERSON });
      await request(`/api/sales/${state.refs.sale1.id}`, { token: state.tokens.SALESPERSON });
      await request("/api/pos/sales?page=1&limit=10", { token: state.tokens.SALESPERSON });
    });

    if (state.shiftWasOpenedBySmoke && state.shiftId) {
      await runStep("POS: close smoke-opened shift and export shift report", async () => {
        const total1 = Number(state.refs.sale1.total || 0);
        const total2 = Number(state.refs.sale2.total || 0);
        await request("/api/pos/shift/close", {
          method: "POST",
          token: state.tokens.CASHIER,
          body: {
            counted: {
              CASH: total1,
              MOMO: total2,
              CARD: 0,
              BANK: 0,
              OTHER: 0,
            },
            note: "Smoke close",
          },
        });
        await request(`/api/pos/shift/${state.shiftId}/export/excel`, {
          token: state.tokens.CASHIER,
          raw: true,
        });
      });
    } else {
      addWarning("Skipped shift close/export because cashier already had an open shift before smoke test.");
    }
  } finally {
    await cleanup();
    await prisma.$disconnect();
    if (server && server.exitCode == null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(resolve, 2000);
        server.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    if (runtimeDir && fs.existsSync(runtimeDir)) {
      try {
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      } catch (err) {
        addWarning(`Could not remove smoke runtime directory: ${err.message}`);
      }
    }
  }

  console.log("\n================ Smoke Test Summary ================");
  console.log(`Checks passed: ${checks.length}`);
  console.log(`Checks failed: ${failures.length}`);
  if (state.warnings.length) {
    console.log(`Warnings: ${state.warnings.length}`);
    state.warnings.forEach((w) => console.log(` - ${w}`));
  }

  if (failures.length) {
    failures.forEach((f) => console.log(` - ${f.name}: ${f.message}`));
    process.exitCode = 1;
    return;
  }

  console.log("Overall: GO (all scripted smoke checks passed).");
}

main().catch((err) => {
  console.error("Fatal smoke script error:", err);
  process.exitCode = 1;
});

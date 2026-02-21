#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");
const prisma = require("../src/prisma");

const HOST = "127.0.0.1";
const PORT = 5103;
const BASE = `http://${HOST}:${PORT}`;
const CEO_EMAIL = "ceo@altas.local";
const CEO_PASSWORD = "Altas@2026";
const TEST_CASHIER_PASSWORD = "ShiftTest@2026";

function ensure(cond, msg) {
  if (!cond) throw new Error(msg);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(pathname, options = {}) {
  const {
    method = "GET",
    token,
    body,
    expect = [200],
    raw = false,
  } = options;

  const expected = Array.isArray(expect) ? expect : [expect];
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`${BASE}${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const contentType = res.headers.get("content-type") || "";
  let data;
  if (raw) data = Buffer.from(await res.arrayBuffer());
  else if (contentType.includes("application/json")) data = await res.json();
  else data = await res.text();

  if (!expected.includes(res.status)) {
    const preview =
      data && typeof data === "object"
        ? JSON.stringify(data)
        : String(data).slice(0, 300);
    throw new Error(`${method} ${pathname} -> ${res.status} ${preview}`);
  }

  return { status: res.status, data, headers: res.headers };
}

function prepareRuntimeEnvDir() {
  const backendDir = path.resolve(__dirname, "..");
  const runtimeDir = path.join(backendDir, ".shift-check-runtime");
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
  envText += `\nPORT=${PORT}\nHOST=${HOST}\n`;

  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(targetEnv, envText, "utf8");
  return runtimeDir;
}

async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.once("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        reject(new Error(`Port ${port} is busy. Stop conflicting service first.`));
        return;
      }
      reject(err);
    });
    tester.once("listening", () => {
      tester.close((closeErr) => (closeErr ? reject(closeErr) : resolve()));
    });
    tester.listen(port, "0.0.0.0");
  });
}

function startServer(runtimeDir) {
  const serverEntry = path.resolve(__dirname, "../src/server.js");
  return spawn(process.execPath, [serverEntry], {
    cwd: runtimeDir,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function waitForServer(child, timeoutMs = 30000) {
  const started = Date.now();
  let ready = false;

  child.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    process.stdout.write(`[api] ${text}`);
    if (text.includes("Server running on")) ready = true;
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(`[api:err] ${chunk.toString()}`);
  });

  while (!ready && Date.now() - started < timeoutMs) {
    if (child.exitCode != null) {
      throw new Error(`Server exited with code ${child.exitCode}`);
    }
    await sleep(200);
  }
  if (!ready) throw new Error("Server did not start in time");
}

async function login(email, password) {
  const res = await request("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  return res.data;
}

async function main() {
  const stamp = Date.now();
  const tag = `SHIFT-CHECK-${stamp}`;
  let runtimeDir = null;
  let server = null;

  let ceoToken;
  let cashierToken;
  let tempCashierId = null;
  let productId = null;
  let shiftId = null;
  let saleId = null;
  let saleTotal = 0;

  try {
    runtimeDir = prepareRuntimeEnvDir();
    await assertPortFree(PORT);
    server = startServer(runtimeDir);
    await waitForServer(server);

    const ceo = await login(CEO_EMAIL, CEO_PASSWORD);
    ceoToken = ceo.token;
    ensure(ceoToken, "CEO login failed");

    const tempEmail = `shiftcheck.${stamp}@altas.local`;
    const createdUser = await request("/api/admin/users", {
      method: "POST",
      token: ceoToken,
      expect: [201],
      body: {
        fullName: `Shift Check Cashier ${stamp}`,
        email: tempEmail,
        role: "CASHIER",
        password: TEST_CASHIER_PASSWORD,
      },
    });
    tempCashierId = createdUser.data.user.id;

    const cashier = await login(tempEmail, TEST_CASHIER_PASSWORD);
    cashierToken = cashier.token;
    ensure(cashierToken, "Temporary cashier login failed");

    const locRes = await request("/api/locations", { token: ceoToken });
    ensure(Array.isArray(locRes.data) && locRes.data.length > 0, "No locations found");
    const location = locRes.data[0];

    const binsRes = await request(`/api/bins?locationId=${encodeURIComponent(location.id)}`, {
      token: ceoToken,
    });
    ensure(Array.isArray(binsRes.data) && binsRes.data.length > 0, "No bins found");
    const bin = binsRes.data[0];

    const sku = `SHIFT-SP-${stamp}`;
    const product = await request("/api/products", {
      method: "POST",
      token: ceoToken,
      expect: [201],
      body: {
        sku,
        partNumber: sku,
        name: `Shift Check Product ${stamp}`,
        unit: "pcs",
        costPrice: 1000,
        sellPrice: 2000,
        minStock: 1,
        brand: "ShiftBrand",
        category: "Engine",
        modelCompatibility: "Universal",
      },
    });
    productId = product.data.id;

    await request("/api/stock/in", {
      method: "POST",
      token: ceoToken,
      expect: [201],
      body: {
        productId,
        locationId: location.id,
        binId: bin.id,
        quantity: 5,
        unitCost: 1000,
      },
    });

    const opened = await request("/api/pos/shift/open", {
      method: "POST",
      token: cashierToken,
      expect: [201],
      body: { note: tag },
    });
    shiftId = opened.data.shift.id;
    ensure(shiftId, "Shift was not opened");

    const sale = await request("/api/pos/sales", {
      method: "POST",
      token: cashierToken,
      expect: [201],
      body: {
        paymentMethod: "CASH",
        note: tag,
        buyerType: "INDIVIDUAL",
        buyerName: "Shift Check Customer",
        items: [
          {
            productId,
            locationId: location.id,
            binId: bin.id,
            quantity: 1,
            unitPrice: 2000,
            discount: 0,
          },
        ],
      },
    });
    saleId = sale.data.id;
    saleTotal = Number(sale.data.total || 0);
    ensure(saleId, "Sale was not created");

    const closed = await request("/api/pos/shift/close", {
      method: "POST",
      token: cashierToken,
      body: {
        counted: { CASH: saleTotal, MOMO: 0, CARD: 0, BANK: 0, OTHER: 0 },
        note: tag,
      },
    });
    ensure(closed.data?.shift?.status === "CLOSED", "Shift status is not CLOSED");
    ensure(Number(closed.data.shift.diffTotal || 0) === 0, "Shift reconciliation diffTotal is not zero");

    const exported = await request(`/api/pos/shift/${shiftId}/export/excel`, {
      token: cashierToken,
      raw: true,
    });
    const contentType = exported.headers.get("content-type") || "";
    ensure(
      contentType.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
      `Unexpected export content-type: ${contentType}`
    );
    ensure(exported.data.length > 1000, "Exported shift file is unexpectedly small");

    console.log("\n[PASS] Focused shift close/export check passed.");
    console.log(` - Shift ID: ${shiftId}`);
    console.log(` - Sale ID: ${saleId}`);
    console.log(` - Export size: ${exported.data.length} bytes`);
  } finally {
    try {
      if (saleId) {
        await prisma.saleItem.deleteMany({ where: { saleId } });
        await prisma.sale.deleteMany({ where: { id: saleId } });
      }
      if (shiftId) {
        await prisma.cashierShift.deleteMany({ where: { id: shiftId } });
      }
      if (productId) {
        await prisma.inventory.deleteMany({ where: { productId } });
        await prisma.stockTransaction.deleteMany({ where: { productId } });
        await prisma.product.deleteMany({ where: { id: productId } });
      }
    } catch (err) {
      console.warn(`[WARN] Cleanup issue: ${err.message}`);
    }

    if (tempCashierId && ceoToken) {
      try {
        await request(`/api/admin/users/${tempCashierId}/disable`, {
          method: "POST",
          token: ceoToken,
        });
      } catch (err) {
        console.warn(`[WARN] Could not disable temp cashier: ${err.message}`);
      }
    }

    await prisma.$disconnect();

    if (server && server.exitCode == null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 2000);
        server.once("exit", () => {
          clearTimeout(t);
          resolve();
        });
      });
    }

    if (runtimeDir && fs.existsSync(runtimeDir)) {
      try {
        fs.rmSync(runtimeDir, { recursive: true, force: true });
      } catch (err) {
        console.warn(`[WARN] Could not remove runtime dir: ${err.message}`);
      }
    }
  }
}

main().catch((err) => {
  console.error(`\n[FAIL] Focused shift close/export check failed: ${err.message}`);
  process.exitCode = 1;
});


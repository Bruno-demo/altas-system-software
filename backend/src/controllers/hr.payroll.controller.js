// FILE: src/controllers/hr.payroll.controller.js
// What this does: generates monthly payroll using attendance + approved advances + lateness rule (3 late = 1 day deduction) and exports bank Excel sheet
const { createWorkbook } = require("../utils/safeExcel");
const prisma = require("../prisma");
const { handleError } = require("../utils/errors");
const { autoPostPayroll } = require("../utils/accounting");

// What this does: validates year/month query params
function parseYearMonth(q) {
  const year = Number(q.year);
  const month = Number(q.month);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    const err = new Error("year must be a valid integer (e.g., 2026)");
    err.status = 400;
    throw err;
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    const err = new Error("month must be 1-12");
    err.status = 400;
    throw err;
  }

  return { year, month };
}

// What this does: returns month start (00:00Z) and end (23:59:59.999Z)
function getMonthRange(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { start, end };
}

// What this does: counts working days Mon-Sat (exclude Sundays)
function countWorkingDaysMonSat(year, month) {
  const { start, end } = getMonthRange(year, month);
  let count = 0;
  const d = new Date(start);

  while (d <= end) {
    const day = d.getUTCDay(); // 0 Sunday ... 6 Saturday
    if (day !== 0) count += 1;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}

// What this does: safe number conversion
function toNum(v) {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

function s(v) {
  if (v == null) return "";
  return String(v).trim();
}

// What this does: converts to Decimal-friendly string with 2 decimals
function moneyStr(n) {
  return toNum(n).toFixed(2);
}

// What this does: normalizes array of ids (trim, unique, drop empties)
function normalizeIdArray(value) {
  if (!Array.isArray(value)) return [];
  const ids = value
    .map((v) => String(v || "").trim())
    .filter((v) => v.length);
  return Array.from(new Set(ids));
}

// What this does: styles header row on Excel sheet
function styleHeaderRow(ws) {
  const r = ws.getRow(1);
  r.font = { bold: true };
  r.alignment = { vertical: "middle" };
  r.height = 18;
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

// ✅ POST /api/hr/payroll/generate?year=2026&month=1
exports.generatePayroll = async (req, res) => {
  try {
    const { year, month } = parseYearMonth(req.query);
    const { start, end } = getMonthRange(year, month);
    const targetEmployeeIds = normalizeIdArray(req.body?.employeeIds);
    const restrictEmployees = targetEmployeeIds.length > 0;

    const workingDays = countWorkingDaysMonSat(year, month);
    if (workingDays <= 0) {
      return res.status(400).json({ message: "workingDays computed as 0; check date logic" });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1) Find or create payroll run (year+month unique)
      const existing = await tx.payrollRun.findUnique({
        where: { year_month: { year, month } },
        include: { items: true },
      });

      if (existing && existing.status === "FINAL") {
        const err = new Error("Payroll is FINAL and cannot be regenerated");
        err.status = 409;
        throw err;
      }

      const run =
        existing ||
        (await tx.payrollRun.create({
          data: {
            year,
            month,
            status: "DRAFT",
            generatedById: req.user.id,
          },
        }));

      // 2) If exists (DRAFT), delete old items for clean regenerate
      if (existing) {
        if (restrictEmployees) {
          await tx.payrollItem.deleteMany({
            where: { payrollRunId: run.id, employeeId: { in: targetEmployeeIds } },
          });
        } else {
          await tx.payrollItem.deleteMany({ where: { payrollRunId: run.id } });
        }
      }

      // 3) Load active employees
      let employees = [];
      if (restrictEmployees) {
        const selected = await tx.employee.findMany({
          where: { id: { in: targetEmployeeIds } },
          select: {
            id: true,
            fullName: true,
            phone: true,
            position: true,
            baseSalary: true,
            bankName: true,
            bankAccount: true,
            isActive: true,
          },
          orderBy: { fullName: "asc" },
        });

        const selectedMap = new Map(selected.map((emp) => [emp.id, emp]));
        const missing = targetEmployeeIds.filter((id) => !selectedMap.has(id));
        if (missing.length) {
          const err = new Error("Employee not found");
          err.status = 404;
          throw err;
        }

        const inactive = selected.filter((emp) => !emp.isActive);
        if (inactive.length) {
          const err = new Error("Employee is not active");
          err.status = 400;
          throw err;
        }

        employees = selected.filter((emp) => emp.isActive);
      } else {
        employees = await tx.employee.findMany({
          where: { isActive: true },
          select: {
            id: true,
            fullName: true,
            phone: true,
            position: true,
            baseSalary: true,
            bankName: true,
            bankAccount: true,
          },
          orderBy: { fullName: "asc" },
        });
      }

      // 4) Attendance counts (PRESENT) for month per employee
      const attendanceWhere = {
        date: { gte: start, lte: end },
        ...(restrictEmployees ? { employeeId: { in: targetEmployeeIds } } : {}),
      };
      const presentGrouped = await tx.attendance.groupBy({
        by: ["employeeId"],
        where: { ...attendanceWhere, status: "PRESENT" },
        _count: { _all: true },
      });
      const presentMap = new Map(presentGrouped.map((g) => [g.employeeId, g._count._all]));

      // ✅ 5) Lateness counts (PRESENT + isLate=true) per employee
      const lateGrouped = await tx.attendance.groupBy({
        by: ["employeeId"],
        where: { ...attendanceWhere, status: "PRESENT", isLate: true },
        _count: { _all: true },
      });
      const lateMap = new Map(lateGrouped.map((g) => [g.employeeId, g._count._all]));

      // 6) Advances sum (APPROVED) for month per employee
      const advancesWhere = {
        date: { gte: start, lte: end },
        status: "APPROVED",
        ...(restrictEmployees ? { employeeId: { in: targetEmployeeIds } } : {}),
      };
      const advancesGrouped = await tx.salaryAdvance.groupBy({
        by: ["employeeId"],
        where: advancesWhere,
        _sum: { amount: true },
      });
      const advMap = new Map(advancesGrouped.map((g) => [g.employeeId, toNum(g._sum.amount)]));

      // 7) Create payroll items

      for (const emp of employees) {
        const baseSalary = toNum(emp.baseSalary);
        const daysPresent = presentMap.get(emp.id) || 0;

        // Prorate salary by attendance
        const grossPay = (baseSalary * daysPresent) / workingDays;

        const advanceDeduction = advMap.get(emp.id) || 0;
        const otherDeductions = 0;

        // ✅ Rule: 3 lates => 1 day deduction
        const lateCount = lateMap.get(emp.id) || 0;
        const deductionDays = Math.floor(lateCount / 3);
        const dailyRate = baseSalary / workingDays;
        const lateDeduction = deductionDays * dailyRate;

        const netPay = Math.max(grossPay - advanceDeduction - lateDeduction - otherDeductions, 0);

        await tx.payrollItem.create({
          data: {
            payrollRunId: run.id,
            employeeId: emp.id,
            baseSalary: moneyStr(baseSalary),
            daysPresent,
            workingDays,
            grossPay: moneyStr(grossPay),

            lateCount,
            lateDeduction: moneyStr(lateDeduction),

            advanceDeduction: moneyStr(advanceDeduction),
            otherDeductions: moneyStr(otherDeductions),
            netPay: moneyStr(netPay),
          },
        });
      }

      // 8) Update run total (across all items in the run)
      const [netAgg, itemCount] = await prisma.$transaction([
        tx.payrollItem.aggregate({
          where: { payrollRunId: run.id },
          _sum: { netPay: true },
        }),
        tx.payrollItem.count({ where: { payrollRunId: run.id } }),
      ]);
      const totalNet = toNum(netAgg._sum.netPay);
      const updatedRun = await tx.payrollRun.update({
        where: { id: run.id },
        data: {
          totalNet: moneyStr(totalNet),
          generatedById: req.user.id,
          status: "DRAFT",
        },
      });

      // 9) Audit log
      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "HR_PAYROLL_GENERATE",
          details: `Generated payroll DRAFT for ${year}-${String(month).padStart(2, "0")} employees=${
            employees.length
          }${restrictEmployees ? " (selected)" : ""} workingDays=${workingDays} totalNet=${moneyStr(totalNet)}`,
        },
      });

      return { run: updatedRun, employeesCount: itemCount, processedCount: employees.length, workingDays };
    });

    return res.status(201).json({
      message: "Payroll generated (DRAFT)",
      year: result.run.year,
      month: result.run.month,
      workingDays: result.workingDays,
      employeesCount: result.employeesCount,
      payrollRun: result.run,
      next: {
        view: `/api/hr/payroll/${result.run.id}`,
        exportBankExcel: `/api/hr/payroll/${result.run.id}/export/bank-excel`,
        finalize: `/api/hr/payroll/${result.run.id}/finalize`,
      },
    });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// ✅ GET /api/hr/payroll
exports.listPayrollRuns = async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const where = {};
    const q = s(req.query.q);
    if (q) {
      const or = [{ id: { contains: q, mode: "insensitive" } }];
      const match = /^(\d{4})[-/](\d{1,2})$/.exec(q);
      if (match) {
        const year = Number(match[1]);
        const month = Number(match[2]);
        if (!Number.isNaN(year) && !Number.isNaN(month)) {
          or.push({ year, month });
        }
      }
      const n = Number(q);
      if (Number.isInteger(n)) {
        or.push({ year: n });
        if (n >= 1 && n <= 12) or.push({ month: n });
      }
      where.OR = or;
    }

    if (req.query.status) {
      where.status = String(req.query.status).trim().toUpperCase();
    }

    const [total, runs] = await prisma.$transaction([
      prisma.payrollRun.count({ where }),
      prisma.payrollRun.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          generatedBy: { select: { id: true, fullName: true, role: true } },
          _count: { select: { items: true } },
        },
      }),
    ]);

    return res.json({
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
      runs,
    });
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};

// ✅ GET /api/hr/payroll/:runId
exports.getPayrollRun = async (req, res) => {
  try {
    const runId = String(req.params.runId).trim();

    const run = await prisma.payrollRun.findUnique({
      where: { id: runId },
      include: {
        generatedBy: { select: { id: true, fullName: true, role: true } },
        items: {
          orderBy: { employee: { fullName: "asc" } },
          include: {
            employee: {
              select: {
                id: true,
                fullName: true,
                phone: true,
                position: true,
                bankName: true,
                bankAccount: true,
              },
            },
          },
        },
      },
    });

    if (!run) return res.status(404).json({ message: "PayrollRun not found" });
    return res.json(run);
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};

// ✅ POST /api/hr/payroll/:runId/finalize
exports.finalizePayroll = async (req, res) => {
  try {
    const runId = String(req.params.runId).trim();

    const updated = await prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.findUnique({ where: { id: runId } });
      if (!run) throw Object.assign(new Error("PayrollRun not found"), { status: 404 });

      if (run.status === "FINAL") {
        const err = new Error("Payroll already FINAL");
        err.status = 409;
        throw err;
      }

      const u = await tx.payrollRun.update({
        where: { id: runId },
        data: { status: "FINAL" },
      });

      await autoPostPayroll(tx, u, { createdById: req.user.id });

      await tx.auditLog.create({
        data: {
          userId: req.user.id,
          action: "HR_PAYROLL_FINALIZE",
          details: `Finalized payroll ${u.year}-${String(u.month).padStart(2, "0")} runId=${u.id}`,
        },
      });

      return u;
    });

    return res.json({ message: "Payroll finalized", payrollRun: updated });
  } catch (err) {
    return handleError(res, err, { status: err.status || 500 });
  }
};

// ✅ GET /api/hr/payroll/:runId/export/bank-excel
exports.exportPayrollBankExcel = async (req, res) => {
  try {
    const runId = String(req.params.runId).trim();

    const run = await prisma.payrollRun.findUnique({
      where: { id: runId },
      include: {
        items: {
          orderBy: { employee: { fullName: "asc" } },
          include: {
            employee: {
              select: {
                fullName: true,
                phone: true,
                position: true,
                bankName: true,
                bankAccount: true,
              },
            },
          },
        },
      },
    });

    if (!run) return res.status(404).json({ message: "PayrollRun not found" });

    const workbook = await createWorkbook();
    workbook.creator = "Altas System";
    workbook.created = new Date();

    // Sheet 1: BankSheet
    const ws = workbook.addWorksheet("BankSheet");
    ws.columns = [
      { header: "EmployeeName", key: "name", width: 26 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Position", key: "position", width: 18 },
      { header: "BankName", key: "bankName", width: 16 },
      { header: "BankAccount", key: "bankAccount", width: 22 },
      { header: "NetPay", key: "netPay", width: 14 },
    ];
    styleHeaderRow(ws);

    run.items.forEach((it) => {
      ws.addRow({
        name: it.employee.fullName,
        phone: it.employee.phone || "",
        position: it.employee.position || "",
        bankName: it.employee.bankName || "",
        bankAccount: it.employee.bankAccount || "",
        netPay: toNum(it.netPay),
      });
    });

    // Sheet 2: Summary
    const wsSum = workbook.addWorksheet("Summary");
    wsSum.columns = [
      { header: "Year", key: "year", width: 10 },
      { header: "Month", key: "month", width: 10 },
      { header: "Status", key: "status", width: 12 },
      { header: "Employees", key: "employees", width: 12 },
      { header: "TotalNet", key: "totalNet", width: 16 },
    ];
    styleHeaderRow(wsSum);

    wsSum.addRow({
      year: run.year,
      month: run.month,
      status: run.status,
      employees: run.items.length,
      totalNet: toNum(run.totalNet),
    });

    // Number formatting
    [ws, wsSum].forEach((sheet) => {
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        row.eachCell((cell) => {
          if (typeof cell.value === "number") cell.numFmt = "#,##0.00";
        });
      });
    });

    const filename = `ALTAS_Payroll_Bank_${run.year}-${String(run.month).padStart(2, "0")}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    return handleError(res, err, { status: 500 });
  }
};


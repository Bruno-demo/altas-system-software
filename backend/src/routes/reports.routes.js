// What this does: provides Manager/CEO reporting endpoints (sales, profit, cashflow, stock, activity logs)
const router = require("express").Router();

const auth = require("../middleware/auth");
const allowRoles = require("../middleware/roles");
const { exportExcel } = require("../controllers/reports.export.controller");


const {
  summary,
  salesByPayment,
  bestSellers,
  salesSdcList,
  listImportedSalesSdc,
  importSalesSdc,
  backfillSalesSdc,
  stockMovement,
  cashflow,
  profit,
  auditLogs,
  stockTransactions,
  ebmSummary,
  ebmPending,
  pendingByCashier,
  markEbmFailed,
  markEbmPending,
} = require("../controllers/reports.manager.controller");

// Manager + Accountant + CEO
router.get("/summary", auth, allowRoles("MANAGER", "ACCOUNTANT", "CEO"), summary);
router.get("/sales-by-payment", auth, allowRoles("MANAGER", "ACCOUNTANT", "CEO"), salesByPayment);
router.get("/best-sellers", auth, allowRoles("MANAGER", "ACCOUNTANT", "CEO"), bestSellers);
router.get("/sales-sdc", auth, allowRoles("SALESPERSON", "ACCOUNTANT", "MANAGER", "CEO"), salesSdcList);
router.get(
  "/sales-sdc/imported",
  auth,
  allowRoles("CASHIER", "SALESPERSON", "ACCOUNTANT", "MANAGER", "CEO"),
  listImportedSalesSdc
);
router.post("/sales-sdc/import", auth, allowRoles("CASHIER", "SALESPERSON", "MANAGER", "CEO"), importSalesSdc);
router.post("/sales-sdc/backfill", auth, allowRoles("MANAGER", "CEO"), backfillSalesSdc);
router.get("/stock-movement", auth, allowRoles("MANAGER", "ACCOUNTANT", "CEO"), stockMovement);
router.get("/cashflow", auth, allowRoles("MANAGER", "ACCOUNTANT", "CEO"), cashflow);

// ✅ NEW: Profit report (Revenue - COGS)
router.get("/profit", auth, allowRoles("MANAGER", "ACCOUNTANT", "CEO"), profit);

// Activity access
router.get("/audit", auth, allowRoles("MANAGER", "ACCOUNTANT", "CEO"), auditLogs);
router.get("/stock-transactions", auth, allowRoles("MANAGER", "ACCOUNTANT", "CEO"), stockTransactions);
// What this does: exports manager reports to Excel (xlsx)
router.get("/export/excel", auth, allowRoles("MANAGER", "ACCOUNTANT", "CEO"), exportExcel);
// What this does: EBM dashboard endpoints (Manager/CEO)
router.get("/ebm/summary", auth, allowRoles("MANAGER", "ACCOUNTANT", "CEO"), ebmSummary);
router.get("/ebm/pending", auth, allowRoles("MANAGER", "ACCOUNTANT", "CEO"), ebmPending);
router.get(
  "/ebm/pending-by-cashier",
  auth,
  allowRoles("MANAGER", "ACCOUNTANT", "CEO"),
  pendingByCashier
);
router.post("/ebm/:saleId/mark-failed", auth, allowRoles("MANAGER", "CEO"), markEbmFailed);
router.post("/ebm/:saleId/mark-pending", auth, allowRoles("MANAGER", "CEO"), markEbmPending);

module.exports = router;

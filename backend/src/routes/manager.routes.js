// What this does: Manager advanced dashboard/report routes (KPIs, audit viewer, exports, stock valuation)
const router = require("express").Router();

const auth = require("../middleware/auth");
const allowRoles = require("../middleware/roles");

const {
  kpis,
  exportSalesExcel,
  auditViewer,
  stockValuation,
} = require("../controllers/manager.advanced.controller");

// Manager & CEO can view these
router.get("/kpis", auth, allowRoles("MANAGER", "ACCOUNTANT", "CEO"), kpis);
router.get("/sales/export/excel", auth, allowRoles("MANAGER", "ACCOUNTANT", "CEO"), exportSalesExcel);
router.get("/audit", auth, allowRoles("MANAGER", "ACCOUNTANT", "CEO"), auditViewer);
router.get("/stock/valuation", auth, allowRoles("MANAGER", "ACCOUNTANT", "CEO"), stockValuation);

module.exports = router;

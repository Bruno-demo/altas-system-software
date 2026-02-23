// What this does: defines POS routes for cashier (create sale, list sales, get invoice)
const router = require("express").Router();

const auth = require("../middleware/auth");
const allowRoles = require("../middleware/roles");
const { getInvoiceJson, getInvoicePdf } = require("../controllers/invoice.controller");

const { createSale, listSales, getSaleById } = require("../controllers/pos.controller");
const { createReturn } = require("../controllers/returns.controller");
const { dailyReport } = require("../controllers/reports.controller");
// What this does: adds endpoints for EBM confirmation + EBM input view
const { getEbmInput, confirmEbm } = require("../controllers/ebm.controller");
const { searchProducts } = require("../controllers/pos.search.controller");
const { openShift, getMyOpenShift, closeShift } = require("../controllers/pos.shift.controller");
const { exportShiftExcel } = require("../controllers/pos.shift.export.controller");
const {
  listDefaultMotorbikePrices,
  updateDefaultMotorbikePrice,
} = require("../controllers/pos.motorbike.price.controller");



// ✅ Export shift report Excel (Cashier + Manager + CEO)
router.get("/shift/:shiftId/export/excel", auth, allowRoles("CASHIER", "MANAGER", "CEO"), exportShiftExcel);
// Cashier / Manager / CEO can create sales
router.post("/sales", auth, allowRoles("CASHIER", "MANAGER", "CEO"), createSale);

// Manager / CEO can view all sales, Cashier and Salesperson can view accessible ones
router.get("/sales", auth, allowRoles("SALESPERSON", "CASHIER", "MANAGER", "CEO"), listSales);

// Cashier can view a specific sale (their own); Manager/CEO can view all
router.get("/sales/:id", auth, allowRoles("SALESPERSON", "CASHIER", "MANAGER", "CEO"), getSaleById);
// ✅ Product search (Cashier + Manager + CEO)
router.get("/products/search", auth, allowRoles("CASHIER", "MANAGER", "CEO"), searchProducts);
router.get(
  "/motorbike-prices",
  auth,
  allowRoles("SALESPERSON", "CASHIER", "MANAGER", "CEO"),
  listDefaultMotorbikePrices
);
router.put(
  "/motorbike-prices/:sku",
  auth,
  allowRoles("SALESPERSON", "CASHIER", "MANAGER", "CEO"),
  updateDefaultMotorbikePrice
);

router.post("/shift/open", auth, allowRoles("CASHIER"), openShift);
router.get("/shift/open", auth, allowRoles("CASHIER"), getMyOpenShift);
router.post("/shift/close", auth, allowRoles("CASHIER"), closeShift);
router.get("/sales/:id/invoice.json", auth, allowRoles("CASHIER", "MANAGER", "CEO"), getInvoiceJson);
router.get("/sales/:id/invoice.pdf", auth, allowRoles("CASHIER", "MANAGER", "CEO"), getInvoicePdf);
router.post("/sales/:id/return", auth, allowRoles("CASHIER", "MANAGER", "CEO"), createReturn);
router.get("/sales/:id/ebm-input", auth, allowRoles("CASHIER", "MANAGER", "CEO"), getEbmInput);
router.post("/sales/:id/ebm-confirm", auth, allowRoles("CASHIER", "MANAGER", "CEO"), confirmEbm);
router.get("/reports/daily", auth, allowRoles("CASHIER", "MANAGER", "CEO"), dailyReport);



module.exports = router;

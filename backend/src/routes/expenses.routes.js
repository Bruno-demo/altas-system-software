// What this does: defines expense endpoints (create/list/summary/export/edit/soft-delete)
const router = require("express").Router();

const auth = require("../middleware/auth");
const allowRoles = require("../middleware/roles");

const {
  createExpense,
  listExpenses,
  expensesSummary,
  exportExpensesExcel,
  updateExpense,
  softDeleteExpense,
} = require("../controllers/expenses.controller");

// Write: CEO + MANAGER + ACCOUNTANT (HR read-only)
router.post("/", auth, allowRoles("CEO", "MANAGER", "ACCOUNTANT"), createExpense);

// Read: CEO + MANAGER + HR + ACCOUNTANT
router.get("/", auth, allowRoles("CEO", "MANAGER", "HR", "ACCOUNTANT"), listExpenses);
router.get(
  "/summary",
  auth,
  allowRoles("CEO", "MANAGER", "HR", "ACCOUNTANT"),
  expensesSummary
);

// ✅ Export
router.get(
  "/export/excel",
  auth,
  allowRoles("CEO", "MANAGER", "HR", "ACCOUNTANT"),
  exportExpensesExcel
);

// ✅ Edit
router.put("/:id", auth, allowRoles("CEO", "MANAGER", "ACCOUNTANT"), updateExpense);

// ✅ Soft delete
router.delete("/:id", auth, allowRoles("CEO", "MANAGER", "ACCOUNTANT"), softDeleteExpense);

module.exports = router;

// What this does: wires accounting endpoints (COA, journals, ledger, statements)
const express = require("express");
const auth = require("../middleware/auth");
const allowRoles = require("../middleware/roles");
const controller = require("../controllers/accounting.controller");

const router = express.Router();

router.use(auth);

const financeRoles = ["ACCOUNTANT", "MANAGER", "CEO"];

router.get("/accounts", allowRoles(...financeRoles), controller.listAccounts);
router.post("/accounts", allowRoles(...financeRoles), controller.createAccount);
router.put("/accounts/:id", allowRoles(...financeRoles), controller.updateAccount);
router.post("/accounts/seed-defaults", allowRoles(...financeRoles), controller.seedDefaultAccounts);

router.get("/journals", allowRoles(...financeRoles), controller.listJournalEntries);
router.post("/journals", allowRoles(...financeRoles), controller.createJournalEntry);
router.post("/journals/:id/reverse", allowRoles(...financeRoles), controller.reverseJournalEntry);

router.get("/ledger", allowRoles(...financeRoles), controller.ledgerByAccount);
router.get("/trial-balance", allowRoles(...financeRoles), controller.trialBalance);
router.get("/statements", allowRoles(...financeRoles), controller.financialStatements);

module.exports = router;

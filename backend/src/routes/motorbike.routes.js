// What this does: routes for motorbike promotions (import + CRUD)
const router = require("express").Router();

const auth = require("../middleware/auth");
const allowRoles = require("../middleware/roles");
const {
  listBranches,
  getBranchDetail,
  createBranchSale,
  updateBranchSettings,
} = require("../controllers/motorbike.branch.controller");
const {
  listPromotions,
  createPromotion,
  updatePromotion,
  deletePromotion,
  importPromotions,
  exportPromotions,
} = require("../controllers/motorbike.promotion.controller");

router.get(
  "/branches",
  auth,
  allowRoles("SALESPERSON", "MANAGER", "CEO"),
  listBranches
);
router.get(
  "/branches/detail",
  auth,
  allowRoles("SALESPERSON", "MANAGER", "CEO"),
  getBranchDetail
);
router.post(
  "/branches/sales",
  auth,
  allowRoles("SALESPERSON", "MANAGER", "CEO"),
  createBranchSale
);
router.put(
  "/branches/settings",
  auth,
  allowRoles("SALESPERSON", "MANAGER", "CEO"),
  updateBranchSettings
);

router.get(
  "/promotions",
  auth,
  allowRoles("SALESPERSON", "MANAGER", "CEO"),
  listPromotions
);
router.post(
  "/promotions",
  auth,
  allowRoles("SALESPERSON", "MANAGER", "CEO"),
  createPromotion
);
router.put(
  "/promotions/:id",
  auth,
  allowRoles("SALESPERSON", "MANAGER", "CEO"),
  updatePromotion
);
router.delete(
  "/promotions/:id",
  auth,
  allowRoles("SALESPERSON", "MANAGER", "CEO"),
  deletePromotion
);
router.post(
  "/promotions/import",
  auth,
  allowRoles("SALESPERSON", "MANAGER", "CEO"),
  importPromotions
);
router.get(
  "/promotions/export",
  auth,
  allowRoles("SALESPERSON", "MANAGER", "CEO"),
  exportPromotions
);

module.exports = router;

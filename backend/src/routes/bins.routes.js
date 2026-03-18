// What this does: defines shelf/bin routes (CRUD operations)
const router = require("express").Router();

const auth = require("../middleware/auth");
const allowRoles = require("../middleware/roles");
const {
  listBins,
  createBin,
  getBinById,
  updateBin,
  deleteBin,
} = require("../controllers/bins.controller");

// Any logged-in user can list and view bins
router.get("/", auth, listBins);
router.get("/:id", auth, getBinById);

// Store Keeper / Manager / CEO can manage bins
router.post("/", auth, allowRoles("STORE_KEEPER", "MANAGER", "CEO"), createBin);
router.put("/:id", auth, allowRoles("STORE_KEEPER", "MANAGER", "CEO"), updateBin);
router.delete("/:id", auth, allowRoles("STORE_KEEPER", "MANAGER", "CEO"), deleteBin);

module.exports = router;


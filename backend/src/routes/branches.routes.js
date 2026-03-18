// What this does: exposes branch CRUD endpoints
const router = require("express").Router();

const auth = require("../middleware/auth");
const allowRoles = require("../middleware/roles");
const {
  listBranches,
  createBranch,
  getBranchById,
  updateBranch,
  deleteBranch,
} = require("../controllers/branches.controller");

// Any logged-in user can fetch branches
router.get("/", auth, listBranches);
router.get("/:id", auth, getBranchById);

// Manager / CEO can manage branches
router.post(
  "/",
  auth,
  allowRoles("MANAGER", "CEO"),
  createBranch
);
router.put(
  "/:id",
  auth,
  allowRoles("MANAGER", "CEO"),
  updateBranch
);
router.delete(
  "/:id",
  auth,
  allowRoles("MANAGER", "CEO"),
  deleteBranch
);

module.exports = router;
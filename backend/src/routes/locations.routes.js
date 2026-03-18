// What this does: exposes location CRUD endpoints
const router = require("express").Router();

const auth = require("../middleware/auth");
const allowRoles = require("../middleware/roles");
const {
  listLocations,
  createLocation,
  getLocationById,
  updateLocation,
  deleteLocation,
} = require("../controllers/locations.controller");

// Any logged-in user can fetch locations (cashier will need this later)
router.get("/", auth, listLocations);
router.get("/:id", auth, getLocationById);

// Store Keeper / Salesperson / Manager / CEO can manage locations
router.post(
  "/",
  auth,
  allowRoles("STORE_KEEPER", "SALESPERSON", "MANAGER", "CEO"),
  createLocation
);
router.put(
  "/:id",
  auth,
  allowRoles("STORE_KEEPER", "SALESPERSON", "MANAGER", "CEO"),
  updateLocation
);
router.delete(
  "/:id",
  auth,
  allowRoles("STORE_KEEPER", "SALESPERSON", "MANAGER", "CEO"),
  deleteLocation
);

module.exports = router;

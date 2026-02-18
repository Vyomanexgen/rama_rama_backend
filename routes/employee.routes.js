const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
  getEmployees,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  getMyAssignment,
  resolvePortalByEmail,
} = require("../controllers/employeeController");

// ROUTES

router.get("/", getEmployees);

router.post("/", addEmployee);

router.put("/:id", updateEmployee);

router.delete("/:id", deleteEmployee);

// Current employee assignment (requires auth)
router.get("/me/assignment", authMiddleware, getMyAssignment);
router.post("/resolve-role", resolvePortalByEmail);
router.get("/resolve-role", resolvePortalByEmail);

module.exports = router;

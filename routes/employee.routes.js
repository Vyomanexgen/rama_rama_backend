const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
  getEmployees,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  getMyAssignment
} = require("../controllers/employeeController");

// ROUTES

router.get("/", getEmployees);

router.post("/", addEmployee);

router.put("/:id", updateEmployee);

router.delete("/:id", deleteEmployee);

// Current employee assignment (requires auth)
router.get("/me/assignment", authMiddleware, getMyAssignment);

module.exports = router;

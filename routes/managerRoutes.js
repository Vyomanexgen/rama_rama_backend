const express = require("express");
const router = express.Router();

// ✅ AUTH + ROLE MIDDLEWARE (CORRECT IMPORTS)
const verifyFirebaseToken = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/role.middleware");

// ✅ CONTROLLER
const {
  dashboard,
  verifyAttendance,
  attendanceList,
  employees,
  fingerprintList,
  fingerprintRegister,
  fingerprintReregister,
  location,
  manualLocationCheckIn,
  reportsWeekly,
  reportsMonthly,
  reportsExport,
  getSettings,
  updateSettings,
  updateEmployee,
} = require("../controllers/managerController");

// 🔐 PROTECT ALL MANAGER ROUTES
router.use(verifyFirebaseToken, allowRoles("manager"));

// ============================
// ROUTES
// ============================
router.get("/dashboard", dashboard);

router.post("/attendance/verify", verifyAttendance);
router.get("/attendance", attendanceList);

router.get("/employees", employees);
router.put("/employees/:employeeId", updateEmployee);

router.get("/fingerprint", fingerprintList);
router.post("/fingerprint/register", fingerprintRegister);
router.post("/fingerprint/reregister", fingerprintReregister);

router.get("/location", location);
router.post("/location/checkin", manualLocationCheckIn);

router.get("/reports/weekly", reportsWeekly);
router.get("/reports/monthly", reportsMonthly);
router.get("/reports/export", reportsExport);

router.get("/settings", getSettings);
router.put("/settings", updateSettings);

module.exports = router;

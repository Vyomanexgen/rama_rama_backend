const express = require("express");
const router = express.Router();

const verifyFirebaseToken = require("../middleware/authMiddleware");
const allowRoles = require("../middleware/role.middleware");

const superadmin = require("../controllers/superadminController");
const notification = require("../controllers/notificationController");

// Protect all routes: superadmin only (role hierarchy is handled elsewhere)
router.use(verifyFirebaseToken, allowRoles("superadmin"));

// Dashboard
router.get("/dashboard", superadmin.getDashboard);
// Aliases for older/different frontends
router.get("/stats", superadmin.getDashboard);
router.get("/dashboard-stats", superadmin.getDashboard);

// Reports
router.get("/reports", superadmin.getReports);

// Notifications (system notifications)
router.get("/notifications", notification.listNotifications);
router.post("/notifications", notification.createNotification);

// Superadmins (optional management)
router.get("/superadmins", superadmin.listSuperadmins);
router.post("/superadmins", superadmin.createSuperadmin);

// Admins
router.get("/admins", superadmin.listAdmins);
router.post("/admins", superadmin.createAdmin);

// Managers
router.get("/managers", superadmin.listManagers);
router.post("/managers", superadmin.createManager);

// Generic user ops (admins/managers/superadmins by uid)
router.put("/users/:uid", superadmin.updateUser);
router.delete("/users/:uid", superadmin.deleteUser);

// Employees (also expose /guards alias for older frontends)
router.get("/employees", superadmin.listEmployees);
router.post("/employees", superadmin.createEmployee);
router.put("/employees/:id", superadmin.updateEmployee);
router.delete("/employees/:id", superadmin.deleteEmployee);

router.get("/guards", superadmin.listEmployees);
router.post("/guards", superadmin.createEmployee);
router.put("/guards/:id", superadmin.updateEmployee);
router.delete("/guards/:id", superadmin.deleteEmployee);

// Company / website config
router.get("/company", superadmin.getCompanyDetails);
router.put("/company", superadmin.updateCompanyDetails);
router.get("/company-details", superadmin.getCompanyDetails);
router.put("/company-details", superadmin.updateCompanyDetails);

router.get("/website-content", superadmin.getWebsiteContent);
router.put("/website-content", superadmin.updateWebsiteContent);
router.get("/website", superadmin.getWebsiteContent);
router.put("/website", superadmin.updateWebsiteContent);

// Announcements
router.get("/announcements", superadmin.listAnnouncements);
router.post("/announcements", superadmin.createAnnouncement);
router.put("/announcements/:id", superadmin.updateAnnouncement);
router.delete("/announcements/:id", superadmin.deleteAnnouncement);

// Activity logs
router.get("/activity-logs", superadmin.listActivityLogs);

module.exports = router;

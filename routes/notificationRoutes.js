const express = require("express");
const router = express.Router();

const verifyFirebaseToken = require("../middleware/authMiddleware");
const notification = require("../controllers/notificationController");

// Any logged-in user can fetch their notifications and mark read.
router.get("/me", verifyFirebaseToken, notification.getMyNotifications);
router.post("/:id/read", verifyFirebaseToken, notification.markRead);

module.exports = router;


const express = require("express");
const reportController = require("../controllers/reportController");
const getReports = reportController.getReports || reportController;
const verifyToken = require("../middleware/authMiddleware");

const router = express.Router();

if (typeof getReports !== "function") {
  throw new Error("reportController.getReports is not a function");
}

router.get("/", verifyToken, getReports);

module.exports = router;

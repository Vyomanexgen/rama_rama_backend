require("dotenv").config();
const express = require("express");
const cors = require("cors");

// ROUTES
const authRoutes = require("./routes/auth.routes");
const attendanceRoutes = require("./routes/attendance.routes");
const employeeRoutes = require("./routes/employee.routes");
const managerRoutes = require("./routes/managerRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const testimonialRoutes = require("./routes/testimonialRoutes");
const activityRoutes = require("./routes/activityRoutes");
const reportRoutes = require("./routes/reportRoutes");

// 👉 BIOMETRIC ROUTE (ADD THIS)
const biometricRoutes = require("./routes/biometric.routes");

const app = express();

/* ======================
   MIDDLEWARE
====================== */

app.use(cors());
app.use(express.json());

/* ======================
   TEST ROUTE
====================== */

app.get("/ping", (req, res) => {
  res.send("pong");
});

/* ======================
   API ROUTES
====================== */
console.log("Loading biometric routes...");
app.use("/api/biometric", biometricRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/managers", managerRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/testimonials", testimonialRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/reports", reportRoutes);

/* ======================
   ROOT
====================== */

app.get("/", (req, res) => {
  res.send("✅ Rama & Rama Backend Running");
});

/* ======================
   START SERVER
====================== */

const PORT = process.env.PORT || 5050;

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});

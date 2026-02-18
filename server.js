require("dotenv").config();
const express = require("express");
const cors = require("cors");

// ROUTES
const authRoutes = require("./routes/auth.routes");
const employeeRoutes = require("./routes/employee.routes");
const managerRoutes = require("./routes/managerRoutes");
const serviceRoutes = require("./routes/serviceRoutes");
const testimonialRoutes = require("./routes/testimonialRoutes");
const activityRoutes = require("./routes/activityRoutes");
const reportRoutes = require("./routes/reportRoutes");
const biometricRoutes = require("./routes/biometric.routes");
const superadminRoutes = require("./routes/superadminRoutes");
const notificationRoutes = require("./routes/notificationRoutes");

const app = express();

// Silence non-error logs when QUIET_LOGS=true
if (process.env.QUIET_LOGS === "true") {
  console.log = () => {};
  console.warn = () => {};
}
if (process.env.QUIET_ERRORS === "true") {
  console.error = () => {};
}

/* ======================
   MIDDLEWARE
====================== */
app.use(
  cors({
    origin: true, // allow all origins in dev
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

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
app.use("/api/biometric", biometricRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/superadmin", superadminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/employee", employeeRoutes);
app.use("/api/employee/manager", managerRoutes);
app.use("/api/employees", employeeRoutes);
app.use("/api/manager", managerRoutes);
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

app.get("/api", (req, res) => {
  res.json({ ok: true, service: "rr-backend", path: "/api" });
});

/* ======================
   START SERVER
====================== */
const PORT = process.env.PORT || 5050;
const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running at http://${HOST}:${PORT}`);
});

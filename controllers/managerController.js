const fs = require("fs");
const path = require("path");
const { db } = require("../firebaseAdmin");
const { getDistanceInMeters } = require("../utils/geo");
const { getTodayIso, isValidIsoDate, getDateRange, getDayBounds } = require("../utils/date");
const { buildSimplePdf } = require("../utils/pdf");
const {
  normalizeStatus,
  getAssignedEmployees,
  getAttendanceByDateForEmployees,
  getAttendanceByDateRangeForEmployees,
  getLocationLogsForEmployees,
  buildAttendanceMap,
  buildLocationMap,
  getLocationStatus,
  summarizeAttendance,
  computeWeeklyTrend,
  computeEmployeePerformance,
} = require("../services/managerService");

const STORE_FILE = path.join(__dirname, "../biometric-store.json");
const DEFAULT_RADIUS_METERS = 100;

const toIso = (value) => {
  if (!value) return null;
  if (value.toDate) return value.toDate().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const updateBiometricStore = (uid) => {
  if (!uid) return;
  if (!fs.existsSync(STORE_FILE)) return;
  const store = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  if (store[uid]) {
    delete store[uid];
    fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2));
  }
};

const validateDateQuery = (value) => {
  if (!value) return { ok: true, value: getTodayIso() };
  if (!isValidIsoDate(value)) {
    return { ok: false, message: "Invalid date format. Use YYYY-MM-DD" };
  }
  return { ok: true, value };
};

// ============================
// Dashboard
// ============================
const dashboard = async (req, res) => {
  try {
    const date = getTodayIso();
    const employees = await getAssignedEmployees(db, req.user);
    const employeeIds = employees.map((e) => e.id);

    const attendance = await getAttendanceByDateForEmployees(db, date, employeeIds, {
      managerVerified: true,
    });

    const counts = summarizeAttendance(attendance);

    const locationLogs = await getLocationLogsForEmployees(db, date, employeeIds, getDayBounds);
    const locationMap = buildLocationMap(locationLogs);

    let withinRange = 0;
    let outOfRange = 0;
    let notTracked = 0;

    for (const employee of employees) {
      const locationLog = locationMap.get(employee.id);
      const status = getLocationStatus(
        employee,
        locationLog,
        getDistanceInMeters,
        DEFAULT_RADIUS_METERS
      );

      if (status.status === "not-tracked") notTracked += 1;
      else if (status.withinRange) withinRange += 1;
      else outOfRange += 1;
    }

    res.json({
      date,
      totals: {
        employees: employees.length,
        presentToday: counts.present,
        lateToday: counts.late,
        absentToday: counts.absent,
        halfDayToday: counts["half-day"],
      },
      locationSummary: {
        withinRange,
        outOfRange,
        notTracked,
      },
    });
  } catch (error) {
    console.error("MANAGER DASHBOARD ERROR:", error);
    res.status(500).json({ message: "Failed to load dashboard" });
  }
};

// ============================
// Attendance List
// ============================
const attendanceList = async (req, res) => {
  try {
    const validation = validateDateQuery(req.query.date);
    if (!validation.ok) return res.status(400).json({ message: validation.message });
    const date = validation.value;

    const employees = await getAssignedEmployees(db, req.user);
    const employeeIds = employees.map((e) => e.id);

    const attendanceDocs = await getAttendanceByDateForEmployees(db, date, employeeIds);
    const attendanceMap = buildAttendanceMap(attendanceDocs);

    const locationLogs = await getLocationLogsForEmployees(db, date, employeeIds, getDayBounds);
    const locationMap = buildLocationMap(locationLogs);

    const list = employees.map((employee) => {
      const attendance = attendanceMap.get(employee.id);
      const locationLog = locationMap.get(employee.id);
      const locationStatus = getLocationStatus(
        employee,
        locationLog,
        getDistanceInMeters,
        DEFAULT_RADIUS_METERS
      );

      const startFingerprint = !!attendance?.startFingerprintAt || !!attendance?.startFingerprintVerified;
      const endFingerprint = !!attendance?.endFingerprintAt || !!attendance?.endFingerprintVerified;

      return {
        id: employee.id,
        name: employee.name || employee.fullName || employee.email,
        email: employee.email,
        department: employee.department || employee.dept || "-",
        assignedLocation: locationStatus.assignedLocation,
        fingerprintStatus: {
          start: startFingerprint,
          end: endFingerprint,
        },
        locationStatus,
        attendanceStatus: attendance?.status || null,
        managerVerified: !!attendance?.managerVerified,
        attendanceTime: toIso(
          attendance?.time || attendance?.createdAt || attendance?.updatedAt
        ),
        lastLoginAt: toIso(
          employee.lastLoginAt || employee.lastSeen || employee.lastLogin || employee.loginAt
        ),
      };
    });

    res.json({ date, employees: list });
  } catch (error) {
    console.error("MANAGER ATTENDANCE ERROR:", error);
    res.status(500).json({ message: "Failed to load attendance list" });
  }
};

// ============================
// Employees (Read-only)
// ============================
const employees = async (req, res) => {
  try {
    const employees = await getAssignedEmployees(db, req.user);
    const employeeIds = employees.map((e) => e.id);

    const { start, end } = getDateRange(30);

    const attendance = await getAttendanceByDateRangeForEmployees(
      db,
      start,
      end,
      employeeIds,
      { managerVerified: true }
    );

    const summaryMap = new Map();
    for (const record of attendance) {
      const status = normalizeStatus(record.status);
      if (!summaryMap.has(record.employeeId)) {
        summaryMap.set(record.employeeId, { present: 0, late: 0, absent: 0, "half-day": 0, total: 0 });
      }
      const summary = summaryMap.get(record.employeeId);
      if (status && summary[status] != null) summary[status] += 1;
      summary.total += 1;
    }

    const q = (req.query.q || "").toLowerCase().trim();

    const list = employees
      .filter((employee) => {
        if (!q) return true;
        const haystack = [
          employee.name,
          employee.fullName,
          employee.email,
          employee.department,
          employee.dept,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      .map((employee) => {
        const fingerprint = employee.fingerprint || {};
        const summary = summaryMap.get(employee.id) || { present: 0, late: 0, absent: 0, "half-day": 0, total: 0 };
        const attendancePercent = summary.total
          ? Math.round(((summary.present + summary.late + summary["half-day"]) / summary.total) * 100)
          : 0;

        return {
          id: employee.id,
          name: employee.name || employee.fullName || employee.email,
          email: employee.email,
          department: employee.department || employee.dept || "-",
          assignedLocation: employee.assignedLocation || employee.location || null,
          workSchedule: employee.workSchedule || null,
          fingerprintStatus: {
            startRegistered: !!fingerprint.startRegistered,
            endRegistered: !!fingerprint.endRegistered,
          },
          attendanceSummary: {
            rangeDays: 30,
            present: summary.present,
            late: summary.late,
            absent: summary.absent,
            halfDay: summary["half-day"],
            attendancePercent,
          },
        };
      });

    res.json({ employees: list });
  } catch (error) {
    console.error("MANAGER EMPLOYEES ERROR:", error);
    res.status(500).json({ message: "Failed to load employees" });
  }
};

// ============================
// Fingerprint List
// ============================
const fingerprintList = async (req, res) => {
  try {
    const employees = await getAssignedEmployees(db, req.user);

    const list = employees.map((employee) => {
      const fingerprint = employee.fingerprint || {};
      const startRegistered = !!fingerprint.startRegistered;
      const endRegistered = !!fingerprint.endRegistered;
      const statusLabel = startRegistered && endRegistered
        ? "Registered"
        : startRegistered || endRegistered
          ? "Partially Registered"
          : "Not Registered";

      return {
        id: employee.id,
        name: employee.name || employee.fullName || employee.email,
        email: employee.email,
        department: employee.department || employee.dept || "-",
        fingerprintStatus: {
          startRegistered,
          endRegistered,
          status: statusLabel,
        },
      };
    });

    res.json({ employees: list });
  } catch (error) {
    console.error("MANAGER FINGERPRINT LIST ERROR:", error);
    res.status(500).json({ message: "Failed to load fingerprint list" });
  }
};

// ============================
// Fingerprint Actions
// ============================
const fingerprintRegister = async (req, res) => {
  try {
    const { employeeId, phase } = req.body;

    if (!employeeId) {
      return res.status(400).json({ message: "employeeId required" });
    }

    const employeeDoc = await db.collection("employees").doc(employeeId).get();
    if (!employeeDoc.exists) return res.status(404).json({ message: "Employee not found" });

    const employee = employeeDoc.data();
    const assignedToManager =
      employee.managerId === req.user.uid ||
      (req.user.email && employee.managerEmail === req.user.email);

    if (!assignedToManager) {
      return res.status(403).json({ message: "Employee not assigned to manager" });
    }

    const updates = {
      fingerprint: employee.fingerprint || {},
    };

    updates.fingerprint.registrationRequested = true;
    updates.fingerprint.requestedBy = req.user.email || req.user.uid;
    updates.fingerprint.requestedAt = new Date();
    updates.fingerprint.requestedPhase = phase || "start";

    await db.collection("employees").doc(employeeId).update(updates);

    res.json({ success: true });
  } catch (error) {
    console.error("MANAGER FINGERPRINT REGISTER ERROR:", error);
    res.status(500).json({ message: "Failed to request fingerprint registration" });
  }
};

const fingerprintReregister = async (req, res) => {
  try {
    const { employeeId, phase } = req.body;

    if (!employeeId) {
      return res.status(400).json({ message: "employeeId required" });
    }

    const employeeDoc = await db.collection("employees").doc(employeeId).get();
    if (!employeeDoc.exists) return res.status(404).json({ message: "Employee not found" });

    const employee = employeeDoc.data();
    const assignedToManager =
      employee.managerId === req.user.uid ||
      (req.user.email && employee.managerEmail === req.user.email);

    if (!assignedToManager) {
      return res.status(403).json({ message: "Employee not assigned to manager" });
    }

    const updates = {
      fingerprint: employee.fingerprint || {},
    };

    updates.fingerprint.startRegistered = false;
    updates.fingerprint.endRegistered = false;
    updates.fingerprint.registrationRequested = true;
    updates.fingerprint.requestedBy = req.user.email || req.user.uid;
    updates.fingerprint.requestedAt = new Date();
    updates.fingerprint.requestedPhase = phase || "start";

    updateBiometricStore(employee.firebaseUid || employee.uid);

    await db.collection("employees").doc(employeeId).update(updates);

    res.json({ success: true });
  } catch (error) {
    console.error("MANAGER FINGERPRINT REREGISTER ERROR:", error);
    res.status(500).json({ message: "Failed to request fingerprint re-registration" });
  }
};

// ============================
// Location Tracking
// ============================
const location = async (req, res) => {
  try {
    const validation = validateDateQuery(req.query.date);
    if (!validation.ok) return res.status(400).json({ message: validation.message });
    const date = validation.value;

    const employees = await getAssignedEmployees(db, req.user);
    const employeeIds = employees.map((e) => e.id);

    const locationLogs = await getLocationLogsForEmployees(db, date, employeeIds, getDayBounds);
    const locationMap = buildLocationMap(locationLogs);

    const list = employees.map((employee) => {
      const locationLog = locationMap.get(employee.id);
      const status = getLocationStatus(
        employee,
        locationLog,
        getDistanceInMeters,
        DEFAULT_RADIUS_METERS
      );

      return {
        id: employee.id,
        name: employee.name || employee.fullName || employee.email,
        email: employee.email,
        assignedLocation: status.assignedLocation,
        employeeLocation: status.employeeLocation,
        distanceMeters: status.distanceMeters,
        status: status.withinRange ? "Within Range" : status.status === "not-tracked" ? "Not Tracked" : "Out of Range",
        withinRange: status.withinRange,
        mapUrl:
          status.employeeLocation && status.assignedLocation.lat != null
            ? `https://www.google.com/maps/dir/?api=1&origin=${status.assignedLocation.lat},${status.assignedLocation.lng}&destination=${status.employeeLocation.lat},${status.employeeLocation.lng}`
            : null,
      };
    });

    res.json({ date, employees: list });
  } catch (error) {
    console.error("MANAGER LOCATION ERROR:", error);
    res.status(500).json({ message: "Failed to load location data" });
  }
};

// ============================
// Manual Location Check-In (Manager Only)
// ============================
const manualLocationCheckIn = async (req, res) => {
  try {
    const { employeeId } = req.body || {};
    if (!employeeId) {
      return res.status(400).json({ message: "employeeId required" });
    }

    const employeeDoc = await db.collection("employees").doc(employeeId).get();
    if (!employeeDoc.exists) return res.status(404).json({ message: "Employee not found" });

    const employee = employeeDoc.data();
    const assignedToManager =
      employee.managerId === req.user.uid ||
      (req.user.email && employee.managerEmail === req.user.email);

    if (!assignedToManager) {
      return res.status(403).json({ message: "Employee not assigned to manager" });
    }

    const assigned = employee.assignedLocation || employee.location || {};
    const lat = assigned.lat ?? assigned.latitude;
    const lng = assigned.lng ?? assigned.longitude;

    if (lat == null || lng == null) {
      return res.status(400).json({ message: "Assigned location not set" });
    }

    await db.collection("locationLogs").add({
      employeeId,
      uid: employee.firebaseUid || employee.uid || null,
      lat: Number(lat),
      lng: Number(lng),
      loggedAt: new Date(),
      source: "manager",
      verifiedBy: req.user.uid,
      verifiedAt: new Date(),
    });

    res.json({ success: true, employeeId });
  } catch (error) {
    console.error("MANAGER MANUAL LOCATION CHECKIN ERROR:", error);
    res.status(500).json({ message: "Failed to mark employee as tracked" });
  }
};

// ============================
// Attendance Verification (Manager Only)
// ============================
const verifyAttendance = async (req, res) => {
  try {
    const { employeeId, status, date } = req.body;

    if (!employeeId || !status) {
      return res.status(400).json({ message: "employeeId and status required" });
    }

    const normalizedStatus = String(status).trim().toLowerCase();
    const statusMap = {
      present: "Present",
      late: "Late",
      absent: "Absent",
      "half day": "Half Day",
      "half-day": "Half Day",
      halfday: "Half Day",
    };

    const finalStatus = statusMap[normalizedStatus];
    if (!finalStatus) {
      return res.status(400).json({ message: "Invalid status" });
    }

    if (date && !isValidIsoDate(date)) {
      return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD" });
    }

    const targetDate = date || getTodayIso();

    const employeeDoc = await db.collection("employees").doc(employeeId).get();
    if (!employeeDoc.exists) return res.status(404).json({ message: "Employee not found" });

    const employee = employeeDoc.data();
    const assignedToManager =
      employee.managerId === req.user.uid ||
      (req.user.email && employee.managerEmail === req.user.email);

    if (!assignedToManager) {
      return res.status(403).json({ message: "Employee not assigned to manager" });
    }

    const attendanceSnap = await db
      .collection("attendance")
      .where("employeeId", "==", employeeId)
      .where("date", "==", targetDate)
      .limit(1)
      .get();

    const attendance = attendanceSnap.empty
      ? null
      : { id: attendanceSnap.docs[0].id, ...attendanceSnap.docs[0].data() };

    const hasAttendance = !!attendance;
    const startFingerprint = !!attendance?.startFingerprintAt || !!attendance?.startFingerprintVerified;
    const endFingerprint = !!attendance?.endFingerprintAt || !!attendance?.endFingerprintVerified;
    const hasFingerprints = startFingerprint && endFingerprint;

    const assigned = employee.assignedLocation || employee.location || {};
    const lat = assigned.lat ?? assigned.latitude;
    const lng = assigned.lng ?? assigned.longitude;
    const radius = Number(assigned.radiusMeters ?? assigned.radius ?? DEFAULT_RADIUS_METERS);

    let distanceMeters = null;
    let withinRange = false;

    if (lat != null && lng != null) {
      const bounds = getDayBounds(targetDate);
      const locationSnap = await db
        .collection("locationLogs")
        .where("employeeId", "==", employeeId)
        .where("timestamp", ">=", bounds.start)
        .where("timestamp", "<=", bounds.end)
        .orderBy("timestamp", "desc")
        .limit(1)
        .get();

      if (!locationSnap.empty) {
        const latest = locationSnap.docs[0].data();
        if (latest?.lat != null && latest?.lng != null) {
          distanceMeters = Math.round(
            getDistanceInMeters(latest.lat, latest.lng, lat, lng)
          );
          withinRange = distanceMeters <= radius;
        }
      }
    }

    const hasLocationEvidence = withinRange || distanceMeters == null;

    const updates = {
      status: finalStatus,
      managerVerified: true,
      verifiedBy: req.user.email || req.user.uid,
      managerId: req.user.uid,
      locationVerified: withinRange,
      managerOverride: !hasAttendance || !hasFingerprints || !hasLocationEvidence,
      updatedAt: new Date(),
    };

    if (distanceMeters != null) updates.distanceMeters = distanceMeters;

    if (attendance) {
      await db.collection("attendance").doc(attendance.id).update(updates);
    } else {
      await db.collection("attendance").add({
        employeeId,
        date: targetDate,
        createdAt: new Date(),
        ...updates,
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("MANAGER VERIFY ERROR:", error);
    res.status(500).json({ message: "Manager verification failed" });
  }
};

// ============================
// Reports - Weekly
// ============================
const reportsWeekly = async (req, res) => {
  try {
    const employees = await getAssignedEmployees(db, req.user);
    const employeeIds = employees.map((e) => e.id);
    const { start, end } = getDateRange(7);

    const attendance = await getAttendanceByDateRangeForEmployees(
      db,
      start,
      end,
      employeeIds,
      { managerVerified: true }
    );

    const weeklyTrend = computeWeeklyTrend(attendance, 7);
    const distribution = summarizeAttendance(attendance);

    res.json({
      range: { start, end },
      weeklyTrend,
      distribution,
    });
  } catch (error) {
    console.error("MANAGER REPORTS WEEKLY ERROR:", error);
    res.status(500).json({ message: "Failed to load weekly report" });
  }
};

// ============================
// Reports - Monthly
// ============================
const reportsMonthly = async (req, res) => {
  try {
    const employees = await getAssignedEmployees(db, req.user);
    const employeeIds = employees.map((e) => e.id);
    const { start, end } = getDateRange(30);

    const attendance = await getAttendanceByDateRangeForEmployees(
      db,
      start,
      end,
      employeeIds,
      { managerVerified: true }
    );

    const distribution = summarizeAttendance(attendance);
    const employeePerformance = computeEmployeePerformance(employees, attendance);
    const topPerformers = [...employeePerformance]
      .sort((a, b) => b.attendancePercent - a.attendancePercent)
      .slice(0, 5);

    const lowAttendance = [...employeePerformance]
      .sort((a, b) => a.attendancePercent - b.attendancePercent)
      .slice(0, 5);

    res.json({
      range: { start, end },
      monthlySummary: {
        totalRecords: attendance.length,
        present: distribution.present,
        late: distribution.late,
        absent: distribution.absent,
        halfDay: distribution["half-day"],
      },
      distribution,
      topPerformers,
      lowAttendance,
    });
  } catch (error) {
    console.error("MANAGER REPORTS MONTHLY ERROR:", error);
    res.status(500).json({ message: "Failed to load monthly report" });
  }
};

// ============================
// Reports - Export
// ============================
const reportsExport = async (req, res) => {
  try {
    const format = (req.query.format || "csv").toLowerCase();
    const start = req.query.start;
    const end = req.query.end;

    if ((start && !isValidIsoDate(start)) || (end && !isValidIsoDate(end))) {
      return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD" });
    }

    const range = start && end ? { start, end } : getDateRange(30);

    const employees = await getAssignedEmployees(db, req.user);
    const employeeIds = employees.map((e) => e.id);
    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    const attendance = await getAttendanceByDateRangeForEmployees(
      db,
      range.start,
      range.end,
      employeeIds,
      { managerVerified: true }
    );

    if (format === "pdf") {
      const title = "Rama & Rama - Manager Attendance Report";
      const lines = [
        title,
        `Range: ${range.start} to ${range.end}`,
        "Date | Employee | Status | Verified By",
        ...attendance.map((record) => {
          const employee = employeeMap.get(record.employeeId);
          const name = employee?.name || employee?.fullName || employee?.email || "-";
          return `${record.date} | ${name} | ${record.status || "-"} | ${record.verifiedBy || "-"}`;
        }),
      ];

      const pdfBuffer = buildSimplePdf(lines);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=manager-report-${range.start}-to-${range.end}.pdf`
      );
      res.send(pdfBuffer);
      return;
    }

    if (format !== "csv") {
      return res.status(400).json({ message: "Unsupported export format" });
    }

    const headers = ["date", "employeeName", "employeeEmail", "status", "verifiedBy"];
    const rows = attendance.map((record) => {
      const employee = employeeMap.get(record.employeeId);
      return [
        record.date,
        employee?.name || employee?.fullName || "-",
        employee?.email || "-",
        record.status || "-",
        record.verifiedBy || "-",
      ];
    });

    const csvLines = [headers.join(",")]
      .concat(rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")))
      .join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=manager-report-${range.start}-to-${range.end}.csv`
    );
    res.send(csvLines);
  } catch (error) {
    console.error("MANAGER REPORTS EXPORT ERROR:", error);
    res.status(500).json({ message: "Failed to export report" });
  }
};

// ============================
// Settings (Limited)
// ============================
const getSettings = async (req, res) => {
  try {
    const userDoc = await db.collection("users").doc(req.user.uid).get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const managerSettings = userData.managerSettings || {};
    const profile = managerSettings.profile || {};

    res.json({
      profile: {
        name: profile.name || userData.name || userData.fullName || req.user.email,
        email: profile.email || req.user.email,
        role: profile.role || userData.role || req.user.role || "Manager",
        phone: profile.phone || userData.phone || "",
        department: profile.department || userData.department || "",
        managerId: profile.managerId || userData.managerId || req.user.uid,
      },
      settings: managerSettings,
    });
  } catch (error) {
    console.error("MANAGER SETTINGS GET ERROR:", error);
    res.status(500).json({ message: "Failed to load settings" });
  }
};

const updateSettings = async (req, res) => {
  try {
    const { settings } = req.body;

    await db
      .collection("users")
      .doc(req.user.uid)
      .set(
        {
          managerSettings: {
            ...(settings || {}),
            updatedAt: new Date(),
          },
        },
        { merge: true }
      );

    res.json({ message: "Manager settings saved" });
  } catch (error) {
    console.error("MANAGER SETTINGS UPDATE ERROR:", error);
    res.status(500).json({ message: "Failed to save settings" });
  }
};

// ============================
// Employee Assignment Updates
// ============================
const updateEmployee = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { assignedLocation, workSchedule } = req.body || {};

    if (!employeeId) {
      return res.status(400).json({ message: "employeeId required" });
    }

    const employeeDoc = await db.collection("employees").doc(employeeId).get();
    if (!employeeDoc.exists) return res.status(404).json({ message: "Employee not found" });

    const employee = employeeDoc.data();
    const assignedToManager =
      employee.managerId === req.user.uid ||
      (req.user.email && employee.managerEmail === req.user.email);

    if (!assignedToManager) {
      return res.status(403).json({ message: "Employee not assigned to manager" });
    }

    const updates = {};

    if (assignedLocation && typeof assignedLocation === "object") {
      const lat = assignedLocation.lat ?? assignedLocation.latitude;
      const lng = assignedLocation.lng ?? assignedLocation.longitude;
      if (lat != null && lng != null) {
        const name =
          assignedLocation.name ||
          assignedLocation.label ||
          assignedLocation.address ||
          "Assigned Location";

        updates.assignedLocation = {
          name,
          label: assignedLocation.label || name,
          address: assignedLocation.address || name,
          lat: Number(lat),
          lng: Number(lng),
          radiusMeters: Number(
            assignedLocation.radiusMeters ?? assignedLocation.radius ?? DEFAULT_RADIUS_METERS
          ),
        };
      }
    }

    if (workSchedule && typeof workSchedule === "object") {
      updates.workSchedule = {
        startTime: workSchedule.startTime || null,
        endTime: workSchedule.endTime || null,
      };
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No updates provided" });
    }

    updates.updatedAt = new Date();

    await db.collection("employees").doc(employeeId).update(updates);

    res.json({ success: true, employeeId });
  } catch (error) {
    console.error("MANAGER EMPLOYEE UPDATE ERROR:", error);
    res.status(500).json({ message: "Failed to update employee" });
  }
};

module.exports = {
  dashboard,
  attendanceList,
  employees,
  fingerprintList,
  fingerprintRegister,
  fingerprintReregister,
  location,
  verifyAttendance,
  reportsWeekly,
  reportsMonthly,
  reportsExport,
  getSettings,
  updateSettings,
  updateEmployee,
  manualLocationCheckIn,
};

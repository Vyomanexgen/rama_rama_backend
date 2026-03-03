const { db } = require("../firebaseAdmin");
const { getDistanceInMeters } = require("../utils/geo");
const { getTodayIso } = require("../utils/date");

const parseTimeToMinutes = (value) => {
  if (!value || typeof value !== "string") return null;
  const parts = value.split(":").map((v) => parseInt(v, 10));
  if (parts.length < 2) return null;
  const [h, m] = parts;
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
};

const computeAssignedSeconds = (workSchedule) => {
  const start = parseTimeToMinutes(workSchedule?.startTime);
  const end = parseTimeToMinutes(workSchedule?.endTime);
  if (start == null || end == null) return null;
  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  return diff * 60;
};

const computeStatus = (workedSeconds, assignedSeconds) => {
  if (assignedSeconds == null) return "Present";
  if (workedSeconds >= assignedSeconds) return "Present";
  const halfMinusHour = Math.max(0, assignedSeconds / 2 - 3600);
  if (workedSeconds >= halfMinusHour) return "Half Day";
  return "Absent";
};

const findEmployeeForUser = async (user) => {
  if (!user) return null;
  const matches = new Map();

  const byUid = await db
    .collection("employees")
    .where("firebaseUid", "==", user.uid)
    .get();
  byUid.docs.forEach((doc) => matches.set(doc.id, { id: doc.id, ...doc.data() }));

  const byLegacyUid = await db
    .collection("employees")
    .where("uid", "==", user.uid)
    .get();
  byLegacyUid.docs.forEach((doc) => matches.set(doc.id, { id: doc.id, ...doc.data() }));

  if (user.email) {
    const byEmail = await db
      .collection("employees")
      .where("email", "==", user.email)
      .get();
    byEmail.docs.forEach((doc) => matches.set(doc.id, { id: doc.id, ...doc.data() }));
  }

  return Array.from(matches.values())[0] || null;
};

// ==========================
// GET ALL EMPLOYEES
// ==========================

exports.getEmployees = async (req, res) => {
  try {
    const snapshot = await db.collection("employees").get();

    const employees = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(employees);
  } catch (error) {
    console.error("GET EMPLOYEES ERROR:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==========================
// ADD EMPLOYEE
// ==========================

exports.addEmployee = async (req, res) => {
  try {
    const data = req.body;

    // Prevent duplicate employees by normalized email when provided.
    const email = String(data?.email || "").trim().toLowerCase();
    if (email) {
      const existing = await db
        .collection("employees")
        .where("email", "==", email)
        .limit(1)
        .get();
      if (!existing.empty) {
        return res.status(409).json({
          message: "Employee email already exists",
          email,
          employeeId: existing.docs[0].id,
        });
      }
      data.email = email;
    }

    const ref = await db.collection("employees").add(data);

    res.status(201).json({
      message: "Employee added successfully",
      id: ref.id,
    });
  } catch (error) {
    console.error("ADD EMPLOYEE ERROR:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==========================
// UPDATE EMPLOYEE
// ==========================

exports.updateEmployee = async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;

    await db.collection("employees").doc(id).update(data);

    res.json({ message: "Employee updated successfully" });
  } catch (error) {
    console.error("UPDATE EMPLOYEE ERROR:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==========================
// DELETE EMPLOYEE
// ==========================

exports.deleteEmployee = async (req, res) => {
  try {
    const id = req.params.id;

    await db.collection("employees").doc(id).delete();

    res.json({ message: "Employee deleted successfully" });
  } catch (error) {
    console.error("DELETE EMPLOYEE ERROR:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==========================
// GET CURRENT EMPLOYEE ASSIGNMENT
// ==========================

exports.getMyAssignment = async (req, res) => {
  try {
    const employee = await findEmployeeForUser(req.user);

    if (!employee) {
      return res.status(200).json({
        employeeId: null,
        name: req.user?.email || "Employee",
        email: req.user?.email || null,
        assignedLocation: null,
        workSchedule: null,
        mapsUrl: null,
        configured: false,
        message: "Employee profile not found",
      });
    }

    const assignedLocation = employee.assignedLocation || employee.location || null;
    const workSchedule = employee.workSchedule || null;

    let mapsUrl = null;
    if (assignedLocation) {
      const lat = assignedLocation.lat ?? assignedLocation.latitude;
      const lng = assignedLocation.lng ?? assignedLocation.longitude;
      const address = assignedLocation.address || assignedLocation.label || assignedLocation.name;

      if (lat != null && lng != null) {
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      } else if (address) {
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
      }
    }

    res.status(200).json({
      employeeId: employee.id,
      name: employee.name || employee.fullName || employee.email,
      email: employee.email,
      assignedLocation,
      workSchedule,
      mapsUrl,
      configured: true,
    });
  } catch (error) {
    console.error("GET MY ASSIGNMENT ERROR:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==========================
// UPDATE PROFILE PHOTO
// ==========================

exports.updateProfilePhoto = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const dataUrl = String(req.body?.dataUrl || "").trim();
    if (!dataUrl.startsWith("data:image/")) {
      return res.status(400).json({ message: "Invalid image data" });
    }

    if (dataUrl.length > 2_500_000) {
      return res.status(400).json({ message: "Image too large" });
    }

    const now = new Date();
    await db.collection("users").doc(user.uid).set(
      {
        profilePhoto: dataUrl,
        updatedAt: now,
      },
      { merge: true }
    );

    const employee = await findEmployeeForUser(user);
    if (employee?.id) {
      await db.collection("employees").doc(employee.id).set(
        {
          profilePhoto: dataUrl,
          updatedAt: now,
        },
        { merge: true }
      );
    }

    return res.status(200).json({ success: true, profilePhoto: dataUrl });
  } catch (error) {
    console.error("UPDATE PROFILE PHOTO ERROR:", error);
    return res.status(500).json({ message: "Failed to update profile photo" });
  }
};

// ==========================
// PUNCH IN / OUT (EMPLOYEE)
// ==========================

exports.punchIn = async (req, res) => {
  try {
    const employee = await findEmployeeForUser(req.user);
    if (!employee) return res.status(404).json({ message: "Employee profile not found" });

    const location = req.body?.location || {};
    const lat = Number(location.lat ?? location.latitude);
    const lng = Number(location.lng ?? location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: "Valid location coordinates required" });
    }

    const assigned = employee.assignedLocation || employee.location || {};
    const assignedLat = assigned.lat ?? assigned.latitude;
    const assignedLng = assigned.lng ?? assigned.longitude;
    const radius = Number(assigned.radiusMeters ?? assigned.radius ?? 100);
    if (assignedLat == null || assignedLng == null) {
      return res.status(400).json({ message: "Assigned location not set. Contact your manager." });
    }

    const distance = Math.round(
      getDistanceInMeters(lat, lng, Number(assignedLat), Number(assignedLng))
    );
    if (distance > radius) {
      return res.status(400).json({ message: "You are away from assigned location" });
    }

    const date = getTodayIso();
    const docId = `${employee.id}_${date}`;
    const ref = db.collection("attendance").doc(docId);
    const snap = await ref.get();
    const existing = snap.exists ? snap.data() : null;

    if (existing?.punchInAt && !existing?.punchOutAt) {
      return res.status(409).json({ message: "Already punched in" });
    }
    if (existing?.punchOutAt) {
      return res.status(409).json({ message: "Already punched out" });
    }

    const now = new Date();
    const payload = {
      uid: req.user.uid,
      employeeId: employee.id,
      date,
      punchInAt: now,
      punchInLocation: { lat, lng, accuracy: location.accuracy ?? null },
      location: { lat, lng, accuracy: location.accuracy ?? null },
      distanceFromOffice: distance,
      status: existing?.status || "In Progress",
      updatedAt: now,
    };

    if (!snap.exists) {
      payload.createdAt = now;
    }

    await ref.set(payload, { merge: true });

    await db.collection("locationLogs").add({
      employeeId: employee.id,
      uid: req.user.uid,
      lat,
      lng,
      timestamp: now,
      source: "punch-in",
    });

    res.json({ success: true, attendance: payload });
  } catch (error) {
    console.error("PUNCH IN ERROR:", error);
    res.status(500).json({ message: "Punch in failed" });
  }
};

exports.punchOut = async (req, res) => {
  try {
    const employee = await findEmployeeForUser(req.user);
    if (!employee) return res.status(404).json({ message: "Employee profile not found" });

    const location = req.body?.location || {};
    const lat = Number(location.lat ?? location.latitude);
    const lng = Number(location.lng ?? location.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: "Valid location coordinates required" });
    }

    const assigned = employee.assignedLocation || employee.location || {};
    const assignedLat = assigned.lat ?? assigned.latitude;
    const assignedLng = assigned.lng ?? assigned.longitude;
    const radius = Number(assigned.radiusMeters ?? assigned.radius ?? 100);
    if (assignedLat == null || assignedLng == null) {
      return res.status(400).json({ message: "Assigned location not set. Contact your manager." });
    }

    const distance = Math.round(
      getDistanceInMeters(lat, lng, Number(assignedLat), Number(assignedLng))
    );
    if (distance > radius) {
      return res.status(400).json({ message: "You are away from assigned location" });
    }

    const date = getTodayIso();
    const docId = `${employee.id}_${date}`;
    const ref = db.collection("attendance").doc(docId);
    const snap = await ref.get();
    const existing = snap.exists ? snap.data() : null;

    if (!existing?.punchInAt) {
      return res.status(400).json({ message: "Punch in first" });
    }
    if (existing?.punchOutAt) {
      return res.status(409).json({ message: "Already punched out" });
    }

    const punchInTime = existing.punchInAt.toDate ? existing.punchInAt.toDate() : new Date(existing.punchInAt);
    const now = new Date();
    const workedSeconds = Math.max(0, Math.round((now.getTime() - punchInTime.getTime()) / 1000));
    const assignedSeconds = computeAssignedSeconds(employee.workSchedule);
    const status = computeStatus(workedSeconds, assignedSeconds);

    const payload = {
      uid: req.user.uid,
      employeeId: employee.id,
      date,
      punchOutAt: now,
      punchOutLocation: { lat, lng, accuracy: location.accuracy ?? null },
      location: { lat, lng, accuracy: location.accuracy ?? null },
      distanceFromOffice: distance,
      workedSeconds,
      assignedSeconds: assignedSeconds ?? null,
      status,
      updatedAt: now,
    };

    await ref.set(payload, { merge: true });

    await db.collection("locationLogs").add({
      employeeId: employee.id,
      uid: req.user.uid,
      lat,
      lng,
      timestamp: now,
      source: "punch-out",
    });

    res.json({ success: true, attendance: { ...existing, ...payload } });
  } catch (error) {
    console.error("PUNCH OUT ERROR:", error);
    res.status(500).json({ message: "Punch out failed" });
  }
};

const normalizeRole = (role) => {
  if (!role || typeof role !== "string") return null;
  const normalized = role.toLowerCase().trim();
  if (normalized === "superadmin") return "superadmin";
  if (normalized === "manager") return "manager";
  if (normalized === "admin") return "admin";
  if (normalized === "employee") return "employee";
  return null;
};

const roleToPortal = (role) => {
  if (role === "superadmin") return "/employee/superadmin";
  if (role === "admin") return "/employee/admin";
  if (role === "manager") return "/employee/manager";
  return "/employee";
};

const isSuperadminEmail = (email) => {
  const configured = String(process.env.SUPERADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return configured.includes(email);
};

const isAdminEmail = (email) => {
  const configured = String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  return configured.includes(email);
};

// ==========================
// RESOLVE ROLE FROM EMAIL
// ==========================
exports.resolvePortalByEmail = async (req, res) => {
  try {
    const email = String(req.body?.email || req.query?.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json({ message: "email is required" });
    }

    let role = isSuperadminEmail(email)
      ? "superadmin"
      : isAdminEmail(email)
        ? "admin"
        : null;

    const userByEmail = role
      ? { empty: true }
      : await db
          .collection("users")
          .where("email", "==", email)
          .limit(1)
          .get();

    if (!userByEmail.empty) {
      role = normalizeRole(userByEmail.docs[0].data()?.role);
    }

    if (!role) {
      const managerEmployeeQuery = await db
        .collection("employees")
        .where("managerEmail", "==", email)
        .limit(1)
        .get();
      if (!managerEmployeeQuery.empty) role = "manager";
    }

    if (!role) {
      const employeeQuery = await db
        .collection("employees")
        .where("email", "==", email)
        .limit(1)
        .get();
      if (!employeeQuery.empty) role = "employee";
    }

    if (!role) {
      return res.status(200).json({
        email,
        role: null,
        portal: null,
        message: "Email not mapped to a role",
      });
    }

    return res.status(200).json({
      email,
      role,
      portal: roleToPortal(role),
    });
  } catch (error) {
    console.error("RESOLVE PORTAL BY EMAIL ERROR:", error);
    return res.status(500).json({ error: error.message });
  }
};

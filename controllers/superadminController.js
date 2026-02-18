const { auth, db } = require("../firebaseAdmin");
const { getDateRange } = require("../utils/date");
const { normalizeStatus, computeEmployeePerformance } = require("../services/managerService");

const nowIso = () => new Date().toISOString();

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();
const normalizeRole = (role) => {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "superadmin") return "superadmin";
  if (normalized === "admin") return "admin";
  if (normalized === "manager") return "manager";
  if (normalized === "employee") return "employee";
  return null;
};

const emailExistsInUsers = async (email, excludeUid = null) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const snap = await db.collection("users").where("email", "==", normalized).get();
  const ids = snap.docs.map((d) => d.id).filter((id) => id !== excludeUid);
  return ids.length ? ids : false;
};

const emailExistsInEmployees = async (email, excludeEmployeeDocId = null) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const snap = await db.collection("employees").where("email", "==", normalized).get();
  const ids = snap.docs.map((d) => d.id).filter((id) => id !== excludeEmployeeDocId);
  return ids.length ? ids : false;
};

const requireString = (value, field) => {
  const v = String(value || "").trim();
  if (!v) {
    const err = new Error(`${field} is required`);
    err.status = 400;
    throw err;
  }
  return v;
};

const safeError = (error) => {
  const status = Number(error?.status) || 500;
  const message = error?.message || "Internal server error";
  return { status, message };
};

const toMillis = (value) => {
  if (!value) return 0;
  if (typeof value?.toDate === "function") return value.toDate().getTime();
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
};

const pushLog = (arr, item) => {
  if (!item) return;
  arr.push({
    id: item.id || null,
    createdAt: item.createdAt || nowIso(),
    scope: item.scope || "system",
    action: item.action || "system.event",
    meta: item.meta || {},
  });
};

const appendActivityAudit = async (action, meta = {}, req = null) => {
  try {
    await db.collection("activityLogs").add({
      scope: "superadmin",
      action,
      meta,
      createdAt: nowIso(),
      actorUid: req?.user?.uid || null,
      actorEmail: req?.user?.email || null,
    });
  } catch (_) {
    // Do not fail primary action if audit logging fails.
  }
};

const setUserRole = async (uid, role, extraClaims = {}) => {
  // Keep claims small and consistent.
  const claims = { role, ...extraClaims };
  await auth.setCustomUserClaims(uid, claims);
  await db
    .collection("users")
    .doc(uid)
    .set(
      {
        uid,
        role,
        ...extraClaims,
        updatedAt: nowIso(),
      },
      { merge: true }
    );
};

// ==========================
// Dashboard
// ==========================
exports.getDashboard = async (req, res) => {
  try {
    const [superadminsSnap, adminsSnap, managersSnap, employeesSnap, citiesSnap, zonesSnap] =
      await Promise.all([
        db.collection("users").where("role", "==", "superadmin").get(),
        db.collection("users").where("role", "==", "admin").get(),
        db.collection("users").where("role", "==", "manager").get(),
        db.collection("employees").get(),
        // Optional collections (some UIs display these stats).
        db.collection("cities").get().catch(() => ({ size: 0 })),
        db.collection("zones").get().catch(() => ({ size: 0 })),
      ]);

    return res.json({
      counts: {
        superadmins: superadminsSnap.size,
        admins: adminsSnap.size,
        managers: managersSnap.size,
        employees: employeesSnap.size,
        cities: citiesSnap.size || 0,
        zones: zonesSnap.size || 0,
      },
      generatedAt: nowIso(),
    });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

// ==========================
// Reports
// ==========================
exports.getReports = async (req, res) => {
  try {
    const rawDays = Number(req.query?.days ?? 30);
    const days = Number.isFinite(rawDays) ? Math.min(365, Math.max(1, Math.floor(rawDays))) : 30;
    const { start, end } = getDateRange(days);

    const [employeesSnap, attendanceSnap, managersSnap] = await Promise.all([
      db.collection("employees").get(),
      db.collection("attendance").get(),
      db.collection("users").where("role", "==", "manager").get().catch(() => ({ docs: [] })),
    ]);

    const employees = employeesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

    const attendanceDocs = [];
    const attendanceCounts = { present: 0, late: 0, absent: 0, "half-day": 0 };

    attendanceSnap.forEach((doc) => {
      const data = doc.data() || {};
      const date = data.date;
      if (!date || typeof date !== "string") return;
      if (date < start || date > end) return;

      const status = normalizeStatus(data.status);
      if (status && attendanceCounts[status] != null) attendanceCounts[status] += 1;

      attendanceDocs.push({
        employeeId: data.employeeId || data.empId || data.employee || data.uid || null,
        status,
        date,
      });
    });

    const totalStatus = Object.values(attendanceCounts).reduce((a, b) => a + b, 0);
    const attended = attendanceCounts.present + attendanceCounts.late + attendanceCounts["half-day"];
    const attendancePercent = totalStatus ? Math.round((attended / totalStatus) * 100) : 0;

    // Top performers (by attendance % in range)
    const perf = computeEmployeePerformance(employees, attendanceDocs)
      .sort((a, b) => (b.attendancePercent || 0) - (a.attendancePercent || 0))
      .slice(0, 10);

    // Manager-wise employee counts
    const managers = managersSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    const byManager = managers
      .map((m) => {
        const mid = m.id;
        const memail = normalizeEmail(m.email);
        let count = 0;
        for (const e of employees) {
          if (e.managerId && String(e.managerId) === String(mid)) count += 1;
          else if (memail && normalizeEmail(e.managerEmail) === memail) count += 1;
        }
        return {
          managerId: mid,
          name: m.name || m.fullName || null,
          email: m.email || null,
          employeesCount: count,
        };
      })
      .sort((a, b) => b.employeesCount - a.employeesCount);

    // Department-wise employee counts
    const deptMap = new Map();
    for (const e of employees) {
      const dept = String(e.department || e.dept || "Unassigned").trim() || "Unassigned";
      deptMap.set(dept, (deptMap.get(dept) || 0) + 1);
    }
    const byDepartment = Array.from(deptMap.entries())
      .map(([department, employeesCount]) => ({ department, employeesCount }))
      .sort((a, b) => b.employeesCount - a.employeesCount);

    return res.json({
      range: { start, end, days },
      totals: {
        employees: employees.length,
        attendanceRecords: attendanceDocs.length,
      },
      attendanceCounts,
      attendancePercent,
      topEmployees: perf,
      managerSummary: byManager,
      departmentSummary: byDepartment,
    });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

// ==========================
// Users (Superadmin/Admin/Manager)
// ==========================
const listUsersByRole = (role) => async (req, res) => {
  try {
    const snap = await db.collection("users").where("role", "==", role).get();
    const users = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json({ role, users });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

const createUserWithRole = (role) => async (req, res) => {
  try {
    const email = normalizeEmail(requireString(req.body?.email, "email"));
    const password = requireString(req.body?.password, "password");
    const name = String(req.body?.name || req.body?.displayName || "").trim() || role;
    const status = String(req.body?.status || "active").trim() || "active";
    const phone = String(req.body?.phone || "").trim();
    const city = String(req.body?.city || "").trim();
    const zone = String(req.body?.zone || "").trim();

    // Prevent duplicate Firestore user docs by email (common source of duplicates).
    const existingUserDocs = await emailExistsInUsers(email);
    if (existingUserDocs) {
      return res.status(409).json({
        message: "Duplicate email already exists in users",
        email,
        userDocIds: existingUserDocs,
      });
    }

    let user;
    try {
      user = await auth.getUserByEmail(email);
      // If they already exist, just ensure role/doc is correct.
      user = await auth.updateUser(user.uid, { displayName: name, disabled: false });
    } catch (err) {
      if (err && err.code === "auth/user-not-found") {
        user = await auth.createUser({
          email,
          password,
          displayName: name,
          emailVerified: true,
          disabled: false,
        });
      } else {
        throw err;
      }
    }

    await db
      .collection("users")
      .doc(user.uid)
      .set(
        {
          uid: user.uid,
          email,
          name,
          role,
          status,
          ...(phone ? { phone } : {}),
          ...(city ? { city } : {}),
          ...(zone ? { zone } : {}),
          createdAt: nowIso(),
          updatedAt: nowIso(),
        },
        { merge: true }
      );

    await setUserRole(user.uid, role, role === "superadmin" ? { superadmin: true } : {});

    return res.status(201).json({
      message: `${role} created/updated`,
      uid: user.uid,
      email,
      role,
    });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

const updateUser = async (req, res) => {
  try {
    const uid = requireString(req.params?.uid, "uid");
    const name = String(req.body?.name || req.body?.displayName || "").trim();
    const email = normalizeEmail(req.body?.email || "");
    const disabled = req.body?.disabled;
    const status = String(req.body?.status || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const city = String(req.body?.city || "").trim();
    const zone = String(req.body?.zone || "").trim();
    const role = normalizeRole(req.body?.role);
    const managerId = String(req.body?.managerId || "").trim();
    const employeeDocId = String(req.body?.employeeDocId || "").trim();
    const managerEmail = normalizeEmail(req.body?.managerEmail || "");

    const updates = {};
    if (name) updates.displayName = name;
    if (typeof disabled === "boolean") updates.disabled = disabled;

    // Optional: interpret status -> disabled
    if (status) {
      const s = status.toLowerCase();
      if (s === "blocked" || s === "disabled" || s === "inactive") updates.disabled = true;
      if (s === "active" || s === "enabled") updates.disabled = false;
    }

    let authUpdated = false;
    if (Object.keys(updates).length) {
      try {
        await auth.updateUser(uid, updates);
        authUpdated = true;
      } catch (err) {
        // Some legacy data uses Firestore doc IDs that aren't Firebase Auth UIDs.
        // In that case, still update the Firestore profile and treat Auth update as skipped.
        if (err && err.code === "auth/user-not-found") {
          authUpdated = false;
        } else {
          throw err;
        }
      }
    }

    await db
      .collection("users")
      .doc(uid)
      .set(
        {
          ...(name ? { name } : {}),
          ...(email ? { email } : {}),
          ...(status ? { status } : {}),
          ...(phone ? { phone } : {}),
          ...(city ? { city } : {}),
          ...(zone ? { zone } : {}),
          updatedAt: nowIso(),
        },
        { merge: true }
      );

    const wantsEmployeeUpdate =
      role === "employee" ||
      Object.prototype.hasOwnProperty.call(req.body || {}, "managerId") ||
      Object.prototype.hasOwnProperty.call(req.body || {}, "managerEmail") ||
      Object.prototype.hasOwnProperty.call(req.body || {}, "phone");

    if (wantsEmployeeUpdate) {
      let effectiveEmail = email || null;
      if (!effectiveEmail) {
        try {
          const user = await auth.getUser(uid);
          if (user?.email) effectiveEmail = normalizeEmail(user.email);
        } catch (_) {
          // Ignore if auth lookup fails.
        }
      }
      if (!effectiveEmail) {
        const userDoc = await db.collection("users").doc(uid).get();
        if (userDoc.exists) {
          const data = userDoc.data() || {};
          if (data.email) effectiveEmail = normalizeEmail(data.email);
        }
      }

      const employeePatch = {
        ...(name ? { name } : {}),
        ...(effectiveEmail ? { email: effectiveEmail } : {}),
      };

      if (Object.prototype.hasOwnProperty.call(req.body || {}, "phone")) {
        employeePatch.phone = phone || "";
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "managerId")) {
        employeePatch.managerId = managerId || "";
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, "managerEmail")) {
        employeePatch.managerEmail = managerEmail || "";
      }

      if (Object.keys(employeePatch).length) {
        const refs = new Map();
        const collect = (snap) => {
          snap.docs.forEach((doc) => refs.set(doc.id, doc.ref));
        };

        const byFirebaseUid = await db
          .collection("employees")
          .where("firebaseUid", "==", uid)
          .get();
        collect(byFirebaseUid);

        const byLegacyUid = await db.collection("employees").where("uid", "==", uid).get();
        collect(byLegacyUid);

        if (employeeDocId) {
          const direct = await db.collection("employees").doc(employeeDocId).get();
          if (direct.exists) refs.set(direct.id, direct.ref);
        }

        if (effectiveEmail) {
          const byEmail = await db
            .collection("employees")
            .where("email", "==", effectiveEmail)
            .get();
          collect(byEmail);
        }

        if (refs.size) {
          await Promise.all(
            Array.from(refs.values()).map((ref) =>
              ref.set({ ...employeePatch, updatedAt: nowIso() }, { merge: true })
            )
          );
        }
      }
    }

    return res.json({ message: "User updated", uid, authUpdated });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const uid = requireString(req.params?.uid, "uid");
    let userEmail = null;
    let authDeleted = false;
    try {
      const user = await auth.getUser(uid);
      if (user?.email) userEmail = normalizeEmail(user.email);
      await auth.deleteUser(uid);
      authDeleted = true;
    } catch (err) {
      if (err && err.code === "auth/user-not-found") {
        authDeleted = false;
      } else {
        throw err;
      }
    }

    const userDoc = await db.collection("users").doc(uid).get();
    if (!userEmail && userDoc.exists) {
      const data = userDoc.data() || {};
      if (data.email) userEmail = normalizeEmail(data.email);
    }

    await db.collection("users").doc(uid).delete();

    // Clean up any employee records tied to this user.
    const employeeRefs = new Map();
    const collect = (snap) => {
      snap.docs.forEach((doc) => employeeRefs.set(doc.id, doc.ref));
    };

    // Direct employee doc id match (UI sometimes sends employee doc id).
    const directEmployeeDoc = await db.collection("employees").doc(uid).get();
    if (directEmployeeDoc.exists) employeeRefs.set(directEmployeeDoc.id, directEmployeeDoc.ref);

    const byFirebaseUid = await db
      .collection("employees")
      .where("firebaseUid", "==", uid)
      .get();
    collect(byFirebaseUid);

    const byLegacyUid = await db.collection("employees").where("uid", "==", uid).get();
    collect(byLegacyUid);

    if (userEmail) {
      const byEmail = await db.collection("employees").where("email", "==", userEmail).get();
      collect(byEmail);
    }

    if (employeeRefs.size) {
      await Promise.all(Array.from(employeeRefs.values()).map((ref) => ref.delete()));
    }

    return res.json({
      message: "User deleted",
      uid,
      authDeleted,
      deletedEmployees: employeeRefs.size,
    });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

exports.listSuperadmins = listUsersByRole("superadmin");
exports.listAdmins = listUsersByRole("admin");
exports.listManagers = listUsersByRole("manager");

exports.createSuperadmin = createUserWithRole("superadmin");
exports.createAdmin = createUserWithRole("admin");
exports.createManager = createUserWithRole("manager");

exports.updateUser = updateUser;
exports.deleteUser = deleteUser;

// ==========================
// Employees
// ==========================
exports.listEmployees = async (req, res) => {
  try {
    const snap = await db.collection("employees").get();
    const employees = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json({ employees });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

exports.createEmployee = async (req, res) => {
  try {
    const name = String(req.body?.name || req.body?.fullName || "").trim();
    const email = normalizeEmail(requireString(req.body?.email, "email"));
    const department = String(req.body?.department || req.body?.dept || "").trim();
    const phone = String(req.body?.phone || "").trim();

    const existingEmployees = await emailExistsInEmployees(email);
    if (existingEmployees) {
      return res.status(409).json({
        message: "Duplicate email already exists in employees",
        email,
        employeeDocIds: existingEmployees,
      });
    }

    // Optional: create a Firebase Auth user for employee login.
    const tempPassword = String(req.body?.tempPassword || req.body?.password || "").trim();
    let firebaseUid = String(req.body?.firebaseUid || "").trim() || null;

    if (!firebaseUid && tempPassword) {
      let user;
      try {
        user = await auth.getUserByEmail(email);
        user = await auth.updateUser(user.uid, { password: tempPassword, displayName: name || email });
      } catch (err) {
        if (err && err.code === "auth/user-not-found") {
          user = await auth.createUser({
            email,
            password: tempPassword,
            displayName: name || email,
            emailVerified: true,
          });
        } else {
          throw err;
        }
      }
      firebaseUid = user.uid;
      await setUserRole(user.uid, "employee");
    }

    const payload = {
      ...(name ? { name } : {}),
      email,
      ...(department ? { department } : {}),
      ...(phone ? { phone } : {}),
      ...(firebaseUid ? { firebaseUid } : {}),
      managerId: req.body?.managerId || null,
      managerEmail: normalizeEmail(req.body?.managerEmail || null),
      assignedLocation: req.body?.assignedLocation || null,
      workSchedule: req.body?.workSchedule || null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    const ref = await db.collection("employees").add(payload);
    return res.status(201).json({ message: "Employee created", id: ref.id });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

exports.updateEmployee = async (req, res) => {
  try {
    const id = requireString(req.params?.id, "id");
    const data = req.body || {};
    data.updatedAt = nowIso();
    await db.collection("employees").doc(id).set(data, { merge: true });
    return res.json({ message: "Employee updated", id });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

exports.deleteEmployee = async (req, res) => {
  try {
    const id = requireString(req.params?.id, "id");
    const snap = await db.collection("employees").doc(id).get();
    if (!snap.exists) return res.status(404).json({ message: "Employee not found" });

    const data = snap.data() || {};
    await db.collection("employees").doc(id).delete();

    // Optional cleanup: delete auth user if present.
    if (data.firebaseUid) {
      try {
        await auth.deleteUser(String(data.firebaseUid));
        await db.collection("users").doc(String(data.firebaseUid)).delete();
      } catch (_) {
        // Ignore if user doesn't exist / can't be deleted.
      }
    }

    return res.json({ message: "Employee deleted", id });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

// ==========================
// Config (Company, Website Content)
// ==========================
exports.getCompanyDetails = async (req, res) => {
  try {
    const [settingsSnap, legacySnap] = await Promise.all([
      db.collection("settings").doc("company").get().catch(() => ({ exists: false })),
      db.collection("config").doc("companyDetails").get().catch(() => ({ exists: false })),
    ]);
    const data = (settingsSnap && settingsSnap.exists ? settingsSnap.data() : null) ||
      (legacySnap && legacySnap.exists ? legacySnap.data() : null) ||
      {};
    return res.json({ company: data });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

exports.updateCompanyDetails = async (req, res) => {
  try {
    const company = req.body || {};
    const payload = { ...company, updatedAt: nowIso() };
    await Promise.all([
      db.collection("settings").doc("company").set(payload, { merge: true }),
      db.collection("config").doc("companyDetails").set(payload, { merge: true }),
    ]);
    return res.json({ message: "Company details updated" });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

exports.getWebsiteContent = async (req, res) => {
  try {
    const [settingsSnap, legacySnap] = await Promise.all([
      db.collection("settings").doc("websiteContent").get().catch(() => ({ exists: false })),
      db.collection("config").doc("websiteContent").get().catch(() => ({ exists: false })),
    ]);
    const data = (settingsSnap && settingsSnap.exists ? settingsSnap.data() : null) ||
      (legacySnap && legacySnap.exists ? legacySnap.data() : null) ||
      {};
    return res.json({ content: data });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

exports.updateWebsiteContent = async (req, res) => {
  try {
    const content = req.body || {};
    const payload = { ...content, updatedAt: nowIso() };
    await Promise.all([
      db.collection("settings").doc("websiteContent").set(payload, { merge: true }),
      db.collection("config").doc("websiteContent").set(payload, { merge: true }),
    ]);
    return res.json({ message: "Website content updated" });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

// ==========================
// Announcements
// ==========================
exports.listAnnouncements = async (req, res) => {
  try {
    const snap = await db.collection("announcements").orderBy("createdAt", "desc").get();
    const announcements = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json({ announcements });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

exports.createAnnouncement = async (req, res) => {
  try {
    const title = requireString(req.body?.title, "title");
    const message = requireString(req.body?.message, "message");
    const payload = {
      title,
      message,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: req.user?.uid || null,
    };
    const ref = await db.collection("announcements").add(payload);
    await appendActivityAudit("announcement.create", { id: ref.id, title }, req);
    return res.status(201).json({ message: "Announcement created", id: ref.id });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

exports.updateAnnouncement = async (req, res) => {
  try {
    const id = requireString(req.params?.id, "id");
    const data = req.body || {};
    data.updatedAt = nowIso();
    await db.collection("announcements").doc(id).set(data, { merge: true });
    await appendActivityAudit("announcement.update", { id, title: data.title || null }, req);
    return res.json({ message: "Announcement updated", id });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

exports.deleteAnnouncement = async (req, res) => {
  try {
    const id = requireString(req.params?.id, "id");
    await db.collection("announcements").doc(id).delete();
    await appendActivityAudit("announcement.delete", { id }, req);
    return res.json({ message: "Announcement deleted", id });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

// ==========================
// Activity Logs (placeholder)
// ==========================
exports.listActivityLogs = async (req, res) => {
  try {
    const type = String(req.query?.type || "all").trim().toLowerCase();
    const limitRaw = Number(req.query?.limit ?? 200);
    const take = Number.isFinite(limitRaw) ? Math.min(500, Math.max(20, Math.floor(limitRaw))) : 200;

    const logs = [];

    // 1) Existing explicit activity logs
    try {
      const snap = await db.collection("activityLogs").orderBy("createdAt", "desc").limit(take).get();
      snap.docs.forEach((doc) => pushLog(logs, { id: doc.id, ...doc.data() }));
    } catch (_) {}

    // 2) Login logs derived from users lastLogin/lastSeen
    if (type === "all" || type === "login") {
      try {
        const usersSnap = await db.collection("users").limit(300).get();
        usersSnap.docs.forEach((doc) => {
          const u = doc.data() || {};
          const ts = u.lastLogin || u.lastLoginAt || u.lastSeen;
          if (!ts) return;
          pushLog(logs, {
            id: `login:${doc.id}`,
            createdAt: ts,
            scope: "auth",
            action: "auth.login",
            meta: {
              uid: doc.id,
              email: u.email || null,
              role: u.role || null,
            },
          });
        });
      } catch (_) {}
    }

    // 3) Attendance logs
    if (type === "all" || type === "attendance") {
      try {
        const attendanceSnap = await db.collection("attendance").limit(500).get();
        attendanceSnap.docs.forEach((doc) => {
          const a = doc.data() || {};
          pushLog(logs, {
            id: `att:${doc.id}`,
            createdAt: a.updatedAt || a.time || a.createdAt || nowIso(),
            scope: "attendance",
            action: "attendance.record",
            meta: {
              employeeId: a.employeeId || a.uid || null,
              status: a.status || null,
              date: a.date || null,
              managerVerified: !!a.managerVerified,
            },
          });
        });
      } catch (_) {}
    }

    // 4) Announcement logs
    if (type === "all" || type === "announcement") {
      try {
        const annSnap = await db.collection("announcements").limit(300).get();
        annSnap.docs.forEach((doc) => {
          const a = doc.data() || {};
          pushLog(logs, {
            id: `ann:${doc.id}`,
            createdAt: a.updatedAt || a.createdAt || nowIso(),
            scope: "announcement",
            action: "announcement.record",
            meta: {
              id: doc.id,
              title: a.title || null,
              message: a.message || null,
            },
          });
        });
      } catch (_) {}
    }

    // 5) Fingerprint logs derived from attendance + employee profile flags
    if (type === "all" || type === "fingerprint") {
      try {
        const attendanceSnap = await db.collection("attendance").limit(500).get();
        attendanceSnap.docs.forEach((doc) => {
          const a = doc.data() || {};
          const hasFp =
            !!a.startFingerprintAt ||
            !!a.endFingerprintAt ||
            !!a.startFingerprintVerified ||
            !!a.endFingerprintVerified;
          if (!hasFp) return;
          pushLog(logs, {
            id: `fp-att:${doc.id}`,
            createdAt: a.updatedAt || a.time || a.createdAt || nowIso(),
            scope: "fingerprint",
            action: "fingerprint.attendance",
            meta: {
              employeeId: a.employeeId || a.uid || null,
              date: a.date || null,
              startVerified: !!a.startFingerprintVerified,
              endVerified: !!a.endFingerprintVerified,
            },
          });
        });
      } catch (_) {}

      try {
        const employeesSnap = await db.collection("employees").limit(400).get();
        employeesSnap.docs.forEach((doc) => {
          const e = doc.data() || {};
          const fp = e.fingerprint || {};
          if (!fp.startRegistered && !fp.endRegistered) return;
          pushLog(logs, {
            id: `fp-emp:${doc.id}`,
            createdAt: e.updatedAt || e.createdAt || nowIso(),
            scope: "fingerprint",
            action: "fingerprint.profile",
            meta: {
              employeeId: doc.id,
              email: e.email || null,
              startRegistered: !!fp.startRegistered,
              endRegistered: !!fp.endRegistered,
            },
          });
        });
      } catch (_) {}
    }

    // Filter by type from action/scope when requested
    const typeFor = (x) => {
      const a = String(x.action || "").toLowerCase();
      const s = String(x.scope || "").toLowerCase();
      if (a.startsWith("auth.") || a.includes("login") || s === "auth") return "login";
      if (a.startsWith("attendance.") || s === "attendance") return "attendance";
      if (a.startsWith("announcement.") || s === "announcement") return "announcement";
      if (a.startsWith("fingerprint.") || s === "fingerprint") return "fingerprint";
      return "other";
    };

    const filtered = type === "all" ? logs : logs.filter((x) => typeFor(x) === type);
    filtered.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

    return res.json({
      logs: filtered.slice(0, take),
      total: filtered.length,
      type,
    });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message, logs: [] });
  }
};

const { db } = require("../firebaseAdmin");

const nowIso = () => new Date().toISOString();

const normalizeRole = (role) => String(role || "").trim().toLowerCase();

const requireAuth = (req) => {
  if (!req.user) {
    const err = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }
};

const safeError = (error) => {
  const status = Number(error?.status) || 500;
  const message = error?.message || "Internal server error";
  return { status, message };
};

const clean = (v) => String(v || "").trim();

// ==========================
// GET /api/notifications/me
// ==========================
exports.getMyNotifications = async (req, res) => {
  try {
    requireAuth(req);

    const uid = req.user.uid;
    const email = String(req.user.email || "").trim().toLowerCase();
    const role = normalizeRole(
      req.user.role || req.user.customClaims?.role || req.user.customClaims?.roles?.[0]
    );

    // Fetch recent notifications. We filter in-memory to keep indexes simple.
    const snap = await db
      .collection("notifications")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const visible = items.filter((n) => {
      if (n.disabled === true) return false;

      // Expiration support
      const expiresAt = n.expiresAt;
      const exp = expiresAt && expiresAt.toDate ? expiresAt.toDate() : expiresAt ? new Date(expiresAt) : null;
      if (exp && !Number.isNaN(exp.getTime()) && exp.getTime() < Date.now()) return false;

      const target = n.target || {};
      const targetRoles = Array.isArray(target.roles) ? target.roles.map(normalizeRole) : [];
      const targetUids = Array.isArray(target.uids) ? target.uids.map(String) : [];
      const targetEmails = Array.isArray(target.emails)
        ? target.emails.map((e) => String(e).trim().toLowerCase())
        : [];

      if (!targetRoles.length && !targetUids.length && !targetEmails.length) {
        return true; // broadcast
      }

      if (uid && targetUids.includes(String(uid))) return true;
      if (email && targetEmails.includes(email)) return true;
      if (role && targetRoles.includes(role)) return true;
      return false;
    });

    const unread = visible.filter((n) => !(n.readBy && n.readBy[uid])).length;

    return res.json({ unread, notifications: visible });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

// ==========================
// POST /api/notifications/:id/read
// ==========================
exports.markRead = async (req, res) => {
  try {
    requireAuth(req);
    const uid = req.user.uid;
    const id = String(req.params?.id || "").trim();
    if (!id) return res.status(400).json({ message: "id is required" });

    const ref = db.collection("notifications").doc(id);
    await ref.set(
      {
        readBy: {
          [uid]: nowIso(),
        },
        updatedAt: nowIso(),
      },
      { merge: true }
    );

    return res.json({ message: "Marked as read", id });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

// ==========================
// POST /api/superadmin/notifications
// GET  /api/superadmin/notifications
// ==========================
exports.listNotifications = async (_req, res) => {
  try {
    const snap = await db
      .collection("notifications")
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.json({ notifications: items });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};

exports.createNotification = async (req, res) => {
  try {
    requireAuth(req);

    const title = clean(req.body?.title);
    const message = clean(req.body?.message);
    const type = clean(req.body?.type) || "info"; // info|success|warning|error
    const priority = clean(req.body?.priority) || "normal"; // low|normal|high
    const link = clean(req.body?.link) || null;

    if (!title || !message) {
      return res.status(400).json({ message: "title and message are required" });
    }

    const target = req.body?.target || {};
    const roles = Array.isArray(target.roles) ? target.roles.map(normalizeRole).filter(Boolean) : [];
    const uids = Array.isArray(target.uids) ? target.uids.map(String).filter(Boolean) : [];
    const emails = Array.isArray(target.emails)
      ? target.emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)
      : [];

    const payload = {
      title,
      message,
      type,
      priority,
      link,
      target: { roles, uids, emails },
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdBy: req.user.uid,
      disabled: false,
    };

    const ref = await db.collection("notifications").add(payload);
    return res.status(201).json({ message: "Notification created", id: ref.id });
  } catch (error) {
    const e = safeError(error);
    return res.status(e.status).json({ message: e.message });
  }
};


const { db } = require("../firebaseAdmin");

const normalizeRole = (role) => {
  if (!role || typeof role !== "string") return null;
  const normalized = role.toLowerCase().trim();
  if (normalized === "superadmin") return "superadmin";
  if (normalized === "admin") return "admin";
  if (normalized === "manager") return "manager";
  if (normalized === "employee") return "employee";
  return null;
};

// Higher number => more privileges.
const roleRank = (role) => {
  const normalized = normalizeRole(role);
  if (normalized === "superadmin") return 4;
  if (normalized === "admin") return 3;
  if (normalized === "manager") return 2;
  if (normalized === "employee") return 1;
  return 0;
};

const canAccess = (userRole, allowedRoles) => {
  const userRank = roleRank(userRole);
  if (!userRank) return false;

  // Allow if the user is at least as privileged as any allowed role.
  return allowedRoles.some((allowed) => userRank >= roleRank(allowed));
};

const getConfiguredSuperadminEmails = () => {
  return String(process.env.SUPERADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
};

const getConfiguredAdminEmails = () => {
  return String(process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
};

const inferRoleFromEmail = async (email) => {
  if (!email) return null;
  const normalizedEmail = String(email).trim().toLowerCase();

  if (getConfiguredSuperadminEmails().includes(normalizedEmail)) return "superadmin";
  if (getConfiguredAdminEmails().includes(normalizedEmail)) return "admin";

  const userByEmail = await db
    .collection("users")
    .where("email", "==", normalizedEmail)
    .limit(1)
    .get();
  if (!userByEmail.empty) {
    const role = normalizeRole(userByEmail.docs[0].data()?.role);
    if (role) return role;
  }

  const managerEmployeeQuery = await db
    .collection("employees")
    .where("managerEmail", "==", normalizedEmail)
    .limit(1)
    .get();
  if (!managerEmployeeQuery.empty) return "manager";

  const employeeQuery = await db
    .collection("employees")
    .where("email", "==", normalizedEmail)
    .limit(1)
    .get();
  if (!employeeQuery.empty) return "employee";

  return null;
};

const allowRoles = (...allowedRoles) => {
  return async (req, res, next) => {
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_DEV_ROLE_BYPASS === "true"
    ) {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    let role = normalizeRole(
      req.user.role || req.user.customClaims?.role || req.user.customClaims?.roles?.[0]
    );

    if (!role || !canAccess(role, allowedRoles)) {
      try {
        const inferred = await inferRoleFromEmail(req.user.email);
        if (inferred) role = inferred;
      } catch (error) {
        console.error("ROLE INFERENCE ERROR:", error);
      }
    }

    if (!role) {
      return res.status(403).json({ message: "Role not assigned" });
    }

    if (!canAccess(role, allowedRoles)) {
      return res.status(403).json({
        message: "Forbidden: insufficient permissions",
      });
    }

    req.user.role = role;
    next();
  };
};

// Support both `require(... )` and `{ allowRoles }` import styles.
module.exports = allowRoles;
module.exports.allowRoles = allowRoles;

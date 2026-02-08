const allowRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_DEV_ROLE_BYPASS === "true"
    ) {
      return next();
    }

    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const role =
      req.user.role ||
      req.user.customClaims?.role ||
      req.user.customClaims?.roles?.[0];

    if (!role) {
      return res.status(403).json({ message: "Role not assigned" });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        message: "Forbidden: insufficient permissions",
      });
    }

    next();
  };
};

// Support both `require(... )` and `{ allowRoles }` import styles.
module.exports = allowRoles;
module.exports.allowRoles = allowRoles;

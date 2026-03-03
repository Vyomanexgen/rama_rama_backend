const { auth } = require("../firebaseAdmin");

module.exports = async function authMiddleware(req, res, next) {
  try {
    if (!auth || typeof auth.verifyIdToken !== "function") {
      console.error("AUTH ERROR: Firebase auth not initialized");
      return res.status(500).json({ message: "Auth service not initialized" });
    }

    const authHeader = req.headers.authorization;

    const devBypassEnabled =
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_DEV_ROLE_BYPASS === "true";

    const injectDevUser = () => {
      req.user = {
        uid: "dev",
        email: "dev@local",
        role: "superadmin",
        customClaims: { role: "superadmin" },
      };
    };

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      // Dev convenience: allow calling protected APIs without a token when explicitly enabled.
      // This unblocks local UI development when the frontend isn't attaching the Firebase ID token yet.
      if (devBypassEnabled) {
        injectDevUser();
        return next();
      }

      return res.status(401).json({
        message: "No authorization header",
        code: "MISSING_HEADER",
      });
    }

    const token = authHeader.split(" ")[1];

    // Treat common bad token placeholders as "missing" in dev.
    if (
      devBypassEnabled &&
      (!token ||
        token === "null" ||
        token === "undefined" ||
        token === "false")
    ) {
      injectDevUser();
      return next();
    }

    const decodedToken = await auth.verifyIdToken(token);

    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("AUTH ERROR:", error);
    // Dev convenience: if token verification fails, still allow local UI flow
    // when explicitly enabled (prevents permanent "Failed to load ..." screens).
    if (
      process.env.NODE_ENV !== "production" &&
      process.env.ALLOW_DEV_ROLE_BYPASS === "true"
    ) {
      req.user = {
        uid: "dev",
        email: "dev@local",
        role: "superadmin",
        customClaims: { role: "superadmin" },
      };
      return next();
    }

    res.status(401).json({ message: "Invalid or expired token" });
  }
};

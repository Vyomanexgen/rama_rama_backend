const { auth } = require("../firebaseAdmin");

module.exports = async function authMiddleware(req, res, next) {
  try {
    if (!auth || typeof auth.verifyIdToken !== "function") {
      console.error("AUTH ERROR: Firebase auth not initialized");
      return res.status(500).json({ message: "Auth service not initialized" });
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "No authorization header",
        code: "MISSING_HEADER",
      });
    }

    const token = authHeader.split(" ")[1];
    const decodedToken = await auth.verifyIdToken(token);

    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("AUTH ERROR:", error);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

const { auth } = require("../firebaseAdmin");

module.exports.verifyFirebaseToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "No authorization header",
        code: "MISSING_HEADER",
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = await auth.verifyIdToken(token);

    req.user = decoded;
    next();
  } catch (err) {
    console.error("VERIFY TOKEN ERROR:", err);
    res.status(401).json({ message: "Invalid token" });
  }
};

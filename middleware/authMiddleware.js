const { admin, db } = require("../firebaseAdmin");

const verifyToken = async (req, res, next) => {
  try {
    // ✅ DEBUG: Log incoming request
    console.log("\n🔍 AUTH MIDDLEWARE - Checking token...");
    console.log("📥 Authorization Header:", req.headers.authorization?.substring(0, 30) + "...");

    const authHeader = req.headers.authorization;

    // ✅ Check header exists and has Bearer prefix
    if (!authHeader) {
      console.error("❌ NO AUTHORIZATION HEADER");
      return res.status(401).json({ 
        message: "No authorization header",
        code: "MISSING_HEADER"
      });
    }

    if (!authHeader.startsWith("Bearer ")) {
      console.error("❌ INVALID HEADER FORMAT - Expected 'Bearer <token>'");
      return res.status(401).json({ 
        message: "Invalid header format. Expected: Bearer <token>",
        code: "INVALID_FORMAT"
      });
    }

    // ✅ Extract token
    const token = authHeader.substring(7); // Remove "Bearer "
    console.log("🔑 Token extracted:", token.substring(0, 30) + "...");

    // ✅ Verify with Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(token);
    console.log("✅ TOKEN VERIFIED");
    console.log("👤 User Email:", decodedToken.email);
    console.log("🆔 User UID:", decodedToken.uid);

    // ✅ Set user object
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified,
    };

    // ✅ Optional: Fetch user role from Firestore
    try {
      const userDoc = await db.collection("users").doc(decodedToken.uid).get();
      if (userDoc.exists) {
        req.user.role = userDoc.data().role || "employee";
        console.log("👮 User Role:", req.user.role);
      } else {
        req.user.role = "employee";
        console.log("⚠️ User not in DB - Default role: employee");
      }
    } catch (firestoreErr) {
      console.warn("⚠️ Firestore Error (non-blocking):", firestoreErr.message);
      req.user.role = "employee";
    }

    console.log("✅ AUTH SUCCESSFUL\n");
    next();

  } catch (error) {
    console.error("❌ TOKEN VERIFICATION FAILED");
    console.error("Error Type:", error.code);
    console.error("Error Message:", error.message);

    // Firebase-specific error codes
    if (error.code === "auth/id-token-expired") {
      return res.status(401).json({ 
        message: "Token expired - please login again",
        code: "TOKEN_EXPIRED"
      });
    }

    if (error.code === "auth/invalid-id-token") {
      return res.status(401).json({ 
        message: "Invalid token format",
        code: "INVALID_TOKEN"
      });
    }

    return res.status(401).json({ 
      message: "Authentication failed",
      code: error.code || "UNKNOWN_ERROR",
      details: error.message
    });
  }
};

const allowRoles = (...roles) => {
  return (req, res, next) => {
    console.log(`\n🔐 ROLE CHECK - Required: [${roles.join(", ")}], User: ${req.user?.role}`);

    if (!req.user) {
      console.error("❌ User not authenticated");
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (!roles.includes(req.user.role)) {
      console.error(`❌ Access denied for role: ${req.user.role}`);
      return res.status(403).json({ 
        message: "Insufficient permissions",
        requiredRoles: roles,
        userRole: req.user.role
      });
    }

    console.log("✅ ROLE AUTHORIZED\n");
    next();
  };
};

module.exports = { verifyToken, allowRoles };

const express = require("express");
const router = express.Router();

const { db } = require("../firebaseAdmin");
const { verifyToken } = require("../middleware/authMiddleware");

/* ===========================
   TEST ROUTE (No Auth)
=========================== */
router.get("/test", (req, res) => {
  console.log("✅ Test route accessed");
  res.json({ message: "Attendance API working" });
});

/* ===========================
   MARK ATTENDANCE (Protected)
=========================== */
router.post("/mark", verifyToken, async (req, res) => {
  try {
    console.log("\n📍 POST /mark - User:", req.user.email);

    const uid = req.user.uid;
    const { location } = req.body;

    if (!location) {
      return res.status(400).json({ message: "Location required" });
    }

    const today = new Date().toISOString().split("T")[0];

    const docRef = await db.collection("attendance").add({
      userId: uid,
      userEmail: req.user.email,
      date: today,
      checkIn: new Date().toLocaleTimeString(),
      location,
      status: "Present",
      createdAt: new Date(),
    });

    console.log("✅ Attendance marked:", docRef.id);

    res.status(201).json({ 
      message: "Attendance marked successfully",
      docId: docRef.id,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("❌ Mark Attendance Error:", err.message);
    res.status(500).json({ 
      error: "Failed to mark attendance",
      details: err.message 
    });
  }
});

/* ===========================
   GET MY ATTENDANCE (Protected)
=========================== */
router.get("/my", verifyToken, async (req, res) => {
  try {
    console.log("\n📋 GET /my - User:", req.user.email);

    const uid = req.user.uid;

    const snapshot = await db
      .collection("attendance")
      .where("userId", "==", uid)
      .orderBy("createdAt", "desc")
      .get();

    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    console.log(`✅ Retrieved ${data.length} attendance records`);

    res.status(200).json({
      success: true,
      count: data.length,
      data,
    });

  } catch (err) {
    console.error("❌ Get Attendance Error:", err.message);
    res.status(500).json({ 
      error: "Failed to fetch attendance",
      details: err.message 
    });
  }
});

module.exports = router;

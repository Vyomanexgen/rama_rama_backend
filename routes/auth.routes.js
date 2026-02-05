const express = require("express");
const router = express.Router();

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

// TEMP STORE (Use Firestore/DB in production)
const biometricStore = {};

/* =========================
   REGISTER FINGERPRINT
========================= */

router.get("/register-options/:uid", (req, res) => {
  const { uid } = req.params;

  const options = generateRegistrationOptions({
    rpName: "Attendance System",
    rpID: "localhost",
    userID: uid,
    userName: uid,
  });

  biometricStore[uid] = {
    challenge: options.challenge,
  };

  res.json(options);
});

/* =========================
   VERIFY REGISTRATION
========================= */

router.post("/verify-register/:uid", async (req, res) => {
  const { uid } = req.params;

  try {
    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: biometricStore[uid].challenge,
      expectedOrigin: "http://localhost:5173",
      expectedRPID: "localhost",
    });

    biometricStore[uid].credential = verification.registrationInfo;

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Registration failed" });
  }
});

/* =========================
   AUTH OPTIONS
========================= */

router.get("/auth-options/:uid", (req, res) => {
  const { uid } = req.params;

  const options = generateAuthenticationOptions({
    allowCredentials: [
      {
        id: biometricStore[uid].credential.credentialID,
        type: "public-key",
      },
    ],
  });

  biometricStore[uid].challenge = options.challenge;

  res.json(options);
});

/* =========================
   VERIFY AUTH
========================= */

router.post("/verify-auth/:uid", async (req, res) => {
  const { uid } = req.params;

  try {
    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: biometricStore[uid].challenge,
      expectedOrigin: "http://localhost:5173",
      expectedRPID: "localhost",
      authenticator: biometricStore[uid].credential,
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: "Authentication failed" });
  }
});

module.exports = router;

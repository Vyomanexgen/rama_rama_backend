const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require("@simplewebauthn/server");

/* ======================
   PERSISTENT STORAGE
====================== */

const STORE_FILE = path.join(__dirname, "../biometric-store.json");

// Load existing registrations from file
let biometricStore = {};
try {
  if (fs.existsSync(STORE_FILE)) {
    const data = fs.readFileSync(STORE_FILE, "utf8");
    biometricStore = JSON.parse(data);
    console.log(`[BIOMETRIC] Loaded ${Object.keys(biometricStore).length} existing registrations from file`);
  }
} catch (err) {
  console.error("[BIOMETRIC] Error loading store file:", err.message);
  biometricStore = {};
}

// Save store to file
function saveStore() {
  try {
    fs.writeFileSync(STORE_FILE, JSON.stringify(biometricStore, null, 2));
    console.log("[BIOMETRIC] Store saved to file");
  } catch (err) {
    console.error("[BIOMETRIC] Error saving store:", err.message);
  }
}

/* ======================
   HELPER FUNCTIONS FOR UINT8ARRAY CONVERSION
====================== */

// Convert object with numeric keys back to Uint8Array
function objectToUint8Array(obj) {
  if (!obj || typeof obj !== 'object') return obj;

  // Check if it's a serialized Uint8Array (has numeric keys)
  const keys = Object.keys(obj);
  if (keys.length > 0 && keys.every(k => !isNaN(k))) {
    const arr = new Uint8Array(keys.length);
    keys.forEach(k => arr[parseInt(k)] = obj[k]);
    return arr;
  }

  return obj;
}

// Convert Uint8Array to base64 for storage
function uint8ArrayToBase64(arr) {
  if (arr instanceof Uint8Array) {
    return Buffer.from(arr).toString('base64');
  }
  return arr;
}

// Convert base64 back to Uint8Array
function base64ToUint8Array(str) {
  if (typeof str === 'string') {
    return new Uint8Array(Buffer.from(str, 'base64'));
  }
  return str;
}

/* ======================
   CHECK REGISTRATION STATUS
====================== */

router.get("/check-registration/:uid", (req, res) => {

  const { uid } = req.params;

  console.log(`[BIOMETRIC] Checking registration for UID: ${uid}`);

  if (!uid) {
    console.error("[BIOMETRIC] Missing UID in check-registration");
    return res.status(400).json({
      registered: false,
      error: "Missing user ID"
    });
  }

  const isRegistered = !!(biometricStore[uid]?.credential);

  console.log(`[BIOMETRIC] UID ${uid} registration status: ${isRegistered}`);

  res.json({ registered: isRegistered });
});

/* ======================
   REGISTER OPTIONS
====================== */

router.get("/register-options/:uid", async (req, res) => {  // ← Made async

  const { uid } = req.params;

  console.log(`[BIOMETRIC] Generating registration options for UID: ${uid}`);

  if (!uid) {
    console.error("[BIOMETRIC] Missing UID in register-options");
    return res.status(400).json({ error: "Missing user ID" });
  }

  try {
    // Convert string UID to Uint8Array (required by @simplewebauthn/server v13+)
    console.log(`[BIOMETRIC] Converting UID to Uint8Array...`);
    const userIDBuffer = new TextEncoder().encode(uid);
    console.log(`[BIOMETRIC] UserID buffer created, length:`, userIDBuffer.length);

    console.log(`[BIOMETRIC] Calling generateRegistrationOptions...`);
    const options = await generateRegistrationOptions({  // ← Added await
      rpName: "Attendance System",
      rpID: "localhost",
      userID: userIDBuffer,
      userName: uid,
      userDisplayName: uid,
      timeout: 60000,
      attestationType: "none",
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        requireResidentKey: false,
        residentKey: "preferred",
        userVerification: "discouraged"  // ← Changed from "preferred" to "discouraged"
      }
    });

    console.log(`[BIOMETRIC] ✅ generateRegistrationOptions succeeded!`);
    console.log(`[BIOMETRIC] Options object:`, JSON.stringify(options, null, 2));

    // Store the challenge for verification
    biometricStore[uid] = {
      challenge: options.challenge
    };

    console.log(`[BIOMETRIC] Registration options generated for UID: ${uid}`);
    console.log(`[BIOMETRIC] Challenge stored:`, options.challenge);
    console.log(`[BIOMETRIC] Sending response...`);

    res.json(options);

  } catch (err) {
    console.error("[BIOMETRIC] ❌ ERROR generating registration options!");
    console.error("[BIOMETRIC] Error object:", err);
    console.error("[BIOMETRIC] Error name:", err.name);
    console.error("[BIOMETRIC] Error message:", err.message);
    console.error("[BIOMETRIC] Error stack:", err.stack);
    res.status(500).json({ error: "Failed to generate registration options", details: err.message });
  }
});

/* ======================
   VERIFY REGISTER
====================== */

router.post("/verify-register/:uid", async (req, res) => {

  const { uid } = req.params;

  console.log(`[BIOMETRIC] Verifying registration for UID: ${uid}`);
  console.log(`[BIOMETRIC] Request body:`, JSON.stringify(req.body, null, 2));

  if (!uid) {
    console.error("[BIOMETRIC] Missing UID in verify-register");
    return res.status(400).json({ error: "Missing user ID" });
  }

  if (!biometricStore[uid]?.challenge) {
    console.error(`[BIOMETRIC] No challenge found for UID: ${uid}`);
    console.error(`[BIOMETRIC] Available UIDs in store:`, Object.keys(biometricStore));
    return res.status(400).json({
      error: "Registration session expired. Please try again."
    });
  }

  try {

    console.log(`[BIOMETRIC] Expected challenge:`, biometricStore[uid].challenge);
    console.log(`[BIOMETRIC] Expected origin: http://localhost:5173`);
    console.log(`[BIOMETRIC] Expected RPID: localhost`);

    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: biometricStore[uid].challenge,
      expectedOrigin: "http://localhost:5173",
      expectedRPID: "localhost",
      requireUserVerification: false  // Match the "discouraged" setting from registration options
    })

      ;

    console.log(`[BIOMETRIC] Verification result:`, verification);
    console.log(`[BIOMETRIC] Registration Info:`, JSON.stringify(verification.registrationInfo, null, 2));

    if (!verification.verified) {
      console.error(`[BIOMETRIC] Registration verification failed for UID: ${uid}`);
      return res.status(400).json({
        success: false,
        error: "Fingerprint verification failed"
      });
    }

    // Store credential data with base64-encoded Uint8Arrays for proper JSON serialization
    const credentialData = {
      credentialID: uint8ArrayToBase64(verification.registrationInfo.credentialID || verification.registrationInfo.credential?.id),
      credentialPublicKey: uint8ArrayToBase64(verification.registrationInfo.credentialPublicKey || verification.registrationInfo.credential?.publicKey),
      counter: verification.registrationInfo.counter || verification.registrationInfo.credential?.counter || 0,
      transports: verification.registrationInfo.credential?.transports || []
    };

    biometricStore[uid].credential = credentialData;

    console.log(`[BIOMETRIC] Stored credential (base64):`, credentialData);

    // Save to file for persistence
    saveStore();

    console.log(`[BIOMETRIC] ✅ Registration successful for UID: ${uid}`);

    res.json({ success: true });

  } catch (err) {
    console.error(`[BIOMETRIC] ❌ Registration error for UID ${uid}`);
    console.error(`[BIOMETRIC] Error name:`, err.name);
    console.error(`[BIOMETRIC] Error message:`, err.message);
    console.error(`[BIOMETRIC] Error stack:`, err.stack);
    console.error(`[BIOMETRIC] Full error object:`, err);

    res.status(400).json({
      success: false,
      error: "Registration failed. Please try again.",
      details: err.message // Add error details for debugging
    });
  }
});

/* ======================
   AUTH OPTIONS
====================== */

router.get("/auth-options/:uid", async (req, res) => {  // ← Made async

  const { uid } = req.params;

  console.log(`[BIOMETRIC] Generating auth options for UID: ${uid}`);

  if (!uid) {
    console.error("[BIOMETRIC] Missing UID in auth-options");
    return res.status(400).json({ error: "Missing user ID" });
  }

  if (!biometricStore[uid]?.credential) {
    console.error(`[BIOMETRIC] User not registered - UID: ${uid}`);
    return res.status(400).json({
      error: "Fingerprint not registered. Please register first."
    });
  }

  try {
    console.log(`[BIOMETRIC] Credential data:`, JSON.stringify(biometricStore[uid].credential, null, 2));

    // Get credential ID (it's stored as base64 string)
    const credID = biometricStore[uid].credential.credentialID;

    console.log(`[BIOMETRIC] Credential ID (base64):`, credID);

    if (!credID) {
      throw new Error("Credential ID not found in stored credential data");
    }

    const options = await generateAuthenticationOptions({
      allowCredentials: [
        {
          id: credID,  // Pass as string - SimpleWebAuthn accepts base64url strings
          type: "public-key",
          transports: biometricStore[uid].credential.transports || ["internal", "hybrid"]
        }
      ],
      userVerification: "discouraged",
      timeout: 60000
    });

    biometricStore[uid].challenge = options.challenge;

    console.log(`[BIOMETRIC] Auth options generated for UID: ${uid}`);

    res.json(options);

  } catch (err) {
    console.error("[BIOMETRIC] ❌ Error generating auth options");
    console.error("[BIOMETRIC] Error name:", err.name);
    console.error("[BIOMETRIC] Error message:", err.message);
    console.error("[BIOMETRIC] Error stack:", err.stack);
    res.status(500).json({ error: "Failed to generate authentication options", details: err.message });
  }
});

/* ======================
   VERIFY AUTH
====================== */

router.post("/verify-auth/:uid", async (req, res) => {

  const { uid } = req.params;

  console.log(`[BIOMETRIC] Verifying authentication for UID: ${uid}`);

  if (!uid) {
    console.error("[BIOMETRIC] Missing UID in verify-auth");
    return res.status(400).json({ error: "Missing user ID" });
  }

  if (!biometricStore[uid]?.credential) {
    console.error(`[BIOMETRIC] User not registered - UID: ${uid}`);
    return res.status(400).json({
      success: false,
      error: "Fingerprint registration lost. Please register again."
    });
  }

  if (!biometricStore[uid]?.challenge) {
    console.error(`[BIOMETRIC] No challenge found for UID: ${uid}`);
    return res.status(400).json({
      success: false,
      error: "Authentication session expired. Please try again."
    });
  }

  try {

    // Extract the stored credential data
    const storedCredential = biometricStore[uid].credential;

    console.log(`[BIOMETRIC] Stored credential data:`, JSON.stringify(storedCredential, null, 2));

    // For SimpleWebAuthn v13+, the authenticator object structure is:
    // { credential: { id, publicKey, counter }, ... }
    const authenticator = {
      credentialID: storedCredential.credentialID,
      credentialPublicKey: base64ToUint8Array(storedCredential.credentialPublicKey),
      counter: storedCredential.counter,
      transports: storedCredential.transports
    };

    console.log(`[BIOMETRIC] Authenticator prepared for verification`);
    console.log(`[BIOMETRIC] - credentialID:`, authenticator.credentialID);
    console.log(`[BIOMETRIC] - credentialPublicKey type:`, authenticator.credentialPublicKey instanceof Uint8Array ? 'Uint8Array' : typeof authenticator.credentialPublicKey);
    console.log(`[BIOMETRIC] - counter:`, authenticator.counter);

    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: biometricStore[uid].challenge,
      expectedOrigin: "http://localhost:5173",
      expectedRPID: "localhost",
      credential: {
        id: storedCredential.credentialID,
        publicKey: base64ToUint8Array(storedCredential.credentialPublicKey),
        counter: storedCredential.counter,
        transports: storedCredential.transports
      },
      requireUserVerification: false
    });

    if (!verification.verified) {
      console.error(`[BIOMETRIC] Authentication verification failed for UID: ${uid}`);
      return res.json({
        success: false,
        error: "Fingerprint authentication failed"
      });
    }

    // Update the counter after successful authentication
    biometricStore[uid].credential.counter = verification.authenticationInfo.newCounter;
    saveStore();

    console.log(`[BIOMETRIC] ✅ Authentication successful for UID: ${uid}`);

    res.json({ success: true });

  } catch (err) {
    console.error(`[BIOMETRIC] Authentication error for UID ${uid}:`, err.message);
    console.error(`[BIOMETRIC] Error stack:`, err.stack);
    res.status(400).json({
      success: false,
      error: "Authentication failed. Please try again."
    });
  }
});

module.exports = router;


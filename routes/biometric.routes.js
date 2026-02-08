const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");
const { db } = require("../firebaseAdmin");

/* ======================
   STORAGE
====================== */

const STORE_FILE = path.join(__dirname, "../biometric-store.json");
let biometricStore = {};

if (fs.existsSync(STORE_FILE)) {
  biometricStore = JSON.parse(fs.readFileSync(STORE_FILE, "utf8"));
  console.log(
    `[BIOMETRIC] Loaded ${Object.keys(biometricStore).length} users`
  );
}

const saveStore = () =>
  fs.writeFileSync(STORE_FILE, JSON.stringify(biometricStore, null, 2));

const findEmployeeDocId = async (uid) => {
  if (!uid) return null;

  // Try direct document id
  const direct = await db.collection("employees").doc(uid).get();
  if (direct.exists) return direct.id;

  // Try firebaseUid
  const byFirebaseUid = await db
    .collection("employees")
    .where("firebaseUid", "==", uid)
    .limit(1)
    .get();
  if (!byFirebaseUid.empty) return byFirebaseUid.docs[0].id;

  // Try legacy uid field
  const byLegacyUid = await db
    .collection("employees")
    .where("uid", "==", uid)
    .limit(1)
    .get();
  if (!byLegacyUid.empty) return byLegacyUid.docs[0].id;

  return null;
};

/* ======================
   UTILS
====================== */

const toBase64Url = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value).toString("base64url");
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(
      value.buffer,
      value.byteOffset,
      value.byteLength
    ).toString("base64url");
  }
  return Buffer.from(value).toString("base64url");
};

const fromBase64Url = (value) => {
  if (!value) return null;
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === "string") {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(normalized, "base64");
  }
  if (
    typeof value === "object" &&
    value.type === "Buffer" &&
    Array.isArray(value.data)
  ) {
    return Buffer.from(value.data);
  }
  return Buffer.from(value);
};

const getOriginInfo = (req) => {
  const origin = req.get("origin");
  if (!origin) return { ok: false, message: "Missing Origin header" };
  try {
    const url = new URL(origin);
    return { ok: true, origin, host: url.hostname, protocol: url.protocol };
  } catch (e) {
    return { ok: false, message: "Invalid Origin header" };
  }
};

const requireDevOrigin = (req) => {
  const info = getOriginInfo(req);
  if (!info.ok) return info;
  const isLocalhost = info.host === "localhost" || info.host === "127.0.0.1";
  if (!isLocalhost) {
    return {
      ok: false,
      message:
        "WebAuthn requires a secure context. Please use http://localhost:5173",
    };
  }
  return { ok: true, origin: info.origin, rpID: info.host };
};

/* ======================
   CHECK REGISTRATION
====================== */

router.get("/", (req, res) => {
  res.json({ ok: true, service: "rr-backend", path: "/api/biometric" });
});

router.get("/check-registration/:uid", (req, res) => {
  const { uid } = req.params;
  res.json({ registered: !!biometricStore[uid]?.credential });
});

/* ======================
   REGISTER OPTIONS
====================== */

router.get("/register-options/:uid", async (req, res) => {
  const { uid } = req.params;
  const originInfo = requireDevOrigin(req);
  if (!originInfo.ok) return res.status(400).json({ error: originInfo.message });

  const options = await generateRegistrationOptions({
    rpName: "Attendance System",
    rpID: originInfo.rpID,
    userID: new TextEncoder().encode(uid),
    userName: uid,
    timeout: 60000,
    attestationType: "none",
    authenticatorSelection: {
      authenticatorAttachment: "platform",
      userVerification: "required",
    },
  });

  biometricStore[uid] = { challenge: options.challenge };
  saveStore();

  res.json(options);
});

/* ======================
   VERIFY REGISTER
====================== */

const handleVerifyRegister = async (userId, req, res) => {
  const expectedChallenge = biometricStore[userId]?.challenge;
  const originInfo = requireDevOrigin(req);
  if (!originInfo.ok) return res.status(400).json({ error: originInfo.message });

  if (!expectedChallenge) {
    return res.status(400).json({ error: "Session expired" });
  }

  const verification = await verifyRegistrationResponse({
    response: req.body,
    expectedChallenge,
    expectedOrigin: originInfo.origin,
    expectedRPID: originInfo.rpID,
    requireUserVerification: true,
  });

  if (!verification.verified) {
    return res.status(400).json({ error: "Verification failed" });
  }

  const info = verification.registrationInfo;
  if (!info || !info.credential) {
    return res.status(400).json({ error: "Missing credential info" });
  }

  const credentialID = toBase64Url(info.credential.id || info.credentialID);
  const credentialPublicKey = toBase64Url(
    info.credential.publicKey || info.credentialPublicKey
  );
  if (!credentialID || !credentialPublicKey) {
    return res.status(400).json({ error: "Invalid credential data" });
  }

  biometricStore[userId].credential = {
    credentialID,
    credentialPublicKey,
    counter: info.credential.counter ?? info.counter ?? 0,
    transports: info.credential.transports || ["internal"],
  };

  saveStore();

  const employeeId = await findEmployeeDocId(userId);
  if (employeeId) {
    await db.collection("employees").doc(employeeId).set(
      {
        fingerprint: {
          startRegistered: true,
          endRegistered: true,
          registrationRequested: false,
          registeredAt: new Date(),
        },
      },
      { merge: true }
    );
  }

  res.json({ success: true });
};

router.post("/verify-register/:uid", async (req, res) => {
  const { uid } = req.params;
  return handleVerifyRegister(uid, req, res);
});

router.post("/verify", async (req, res) => {
  const uid = req.body?.uid || req.query?.uid || req.get("x-uid");
  if (!uid) {
    return res.status(400).json({ error: "uid required" });
  }
  return handleVerifyRegister(uid, req, res);
});

router.get("/verify", (req, res) => {
  res.status(405).json({ error: "Use POST /api/biometric/verify-register/:uid" });
});

/* ======================
   AUTH OPTIONS
====================== */

router.get("/auth-options/:uid", async (req, res) => {
  const { uid } = req.params;
  const cred = biometricStore[uid]?.credential;
  const originInfo = requireDevOrigin(req);
  if (!originInfo.ok) return res.status(400).json({ error: originInfo.message });

  if (!cred) {
    return res.status(400).json({ error: "Not registered" });
  }

  const options = await generateAuthenticationOptions({
    rpID: originInfo.rpID,
    allowCredentials: [
      {
        id: String(cred.credentialID),
        transports: cred.transports,
      },
    ],
    timeout: 60000,
    userVerification: "required",
  });

  biometricStore[uid].challenge = options.challenge;
  saveStore();

  res.json(options);
});

/* ======================
   VERIFY AUTH
====================== */

router.post("/verify-auth/:uid", async (req, res) => {
  const { uid } = req.params;
  const cred = biometricStore[uid]?.credential;
  const expectedChallenge = biometricStore[uid]?.challenge;
  const originInfo = requireDevOrigin(req);
  if (!originInfo.ok) return res.status(400).json({ error: originInfo.message });

  if (!cred || !expectedChallenge) {
    return res.status(400).json({ error: "Session expired" });
  }

  const verification = await verifyAuthenticationResponse({
    response: req.body,
    expectedChallenge,
    expectedOrigin: originInfo.origin,
    expectedRPID: originInfo.rpID,
    credential: {
      id: String(cred.credentialID),
      publicKey: fromBase64Url(cred.credentialPublicKey),
      counter: cred.counter,
      transports: cred.transports,
    },
    requireUserVerification: true,
  });

  if (!verification.verified) {
    return res.status(400).json({ error: "Authentication failed" });
  }

  biometricStore[uid].credential.counter =
    verification.authenticationInfo.newCounter;

  saveStore();
  res.json({ success: true });
});

module.exports = router;

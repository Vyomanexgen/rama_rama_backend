const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");
const fs = require("fs");
const path = require("path");

const loadServiceAccount = () => {
  const raw =
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.FIREBASE_ADMIN_SDK;

  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (_) {
      const decoded = Buffer.from(raw, "base64").toString("utf8");
      return JSON.parse(decoded);
    }
  }

  const filePath = path.join(__dirname, "serviceAccountKey.json");
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }

  return null;
};

const serviceAccount = loadServiceAccount();

if (!getApps().length) {
  if (!serviceAccount) {
    throw new Error(
      "Missing Firebase service account. Set GOOGLE_APPLICATION_CREDENTIALS_JSON (or FIREBASE_SERVICE_ACCOUNT) or provide serviceAccountKey.json."
    );
  }
  initializeApp({ credential: cert(serviceAccount) });
}

const auth = getAuth();
const db = getFirestore();

module.exports = { auth, db };

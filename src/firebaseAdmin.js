const fs = require("fs");
const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

let serviceAccount;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  serviceAccount = JSON.parse(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  );
} else {
  const credPath =
    process.env.GOOGLE_APPLICATION_CREDENTIALS || "./serviceAccountKey.json";
  if (!fs.existsSync(credPath)) {
    throw new Error(
      "Missing Firebase credentials. Set GOOGLE_APPLICATION_CREDENTIALS_JSON to the service account JSON, or set GOOGLE_APPLICATION_CREDENTIALS to a JSON file path."
    );
  }
  serviceAccount = JSON.parse(fs.readFileSync(credPath, "utf8"));
}

if (!getApps().length) {
  initializeApp({
    credential: cert(serviceAccount),
  });
}

const auth = getAuth();
const db = getFirestore();

module.exports = { auth, db };

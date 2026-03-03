#!/usr/bin/env node
const { auth, db } = require("../src/firebaseAdmin");

const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.indexOf(name);
  if (idx === -1) return null;
  return args[idx + 1] || null;
};

const email = getArg("--email");
const password = getArg("--password");

if (!email || !password) {
  console.error(
    "Usage: node scripts/createSuperadmin.js --email you@example.com --password YourPass123!"
  );
  process.exit(1);
}

(async () => {
  let user;
  try {
    user = await auth.getUserByEmail(email);
    user = await auth.updateUser(user.uid, {
      password,
      emailVerified: true,
      disabled: false,
    });
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      user = await auth.createUser({
        email,
        password,
        emailVerified: true,
        disabled: false,
      });
    } else {
      throw error;
    }
  }

  await auth.setCustomUserClaims(user.uid, { role: "superadmin", superadmin: true });
  await db
    .collection("users")
    .doc(user.uid)
    .set(
      {
        uid: user.uid,
        email,
        role: "superadmin",
        superadmin: true,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

  console.log("SUPERADMIN_READY", email);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

/* eslint-disable no-console */
// Dedupe `users` managers by normalized email.
// Keeps the "best" doc per email and deletes the rest.
// Also rewrites employees.managerId references from deleted -> kept.
//
// Usage:
//   node scripts/dedupeManagersByEmail.js            # dry-run
//   node scripts/dedupeManagersByEmail.js --apply   # apply changes

const { auth, db } = require("../firebaseAdmin");

const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

const toIso = (value) => {
  if (!value) return "";
  if (value.toDate) return value.toDate().toISOString();
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toISOString();
};

const scoreManagerDoc = async (doc) => {
  // Prefer:
  // - doc id that exists in Firebase Auth
  // - doc with managerSettings and richer fields
  // - newest updatedAt/lastSeen/createdAt
  let score = 0;

  if (doc.managerSettings) score += 50;
  if (Array.isArray(doc.assignedEmployeeIds) && doc.assignedEmployeeIds.length) score += 10;
  if (doc.status) score += 2;
  if (doc.name || doc.fullName) score += 2;
  if (doc.city) score += 1;
  if (doc.zone) score += 1;

  const ts = doc.updatedAt || doc.lastSeen || doc.lastLogin || doc.createdAt;
  const time = ts && ts.toDate ? ts.toDate().getTime() : new Date(ts || 0).getTime();
  if (Number.isFinite(time) && time > 0) {
    // Normalize to days to avoid huge numbers.
    score += Math.floor(time / (1000 * 60 * 60 * 24)) % 1000;
  }

  // Check if this doc id is an Auth UID.
  try {
    await auth.getUser(doc.id);
    score += 1000;
  } catch (e) {
    if (e && e.code === "auth/user-not-found") {
      // ignore
    } else {
      // If auth is misconfigured, don't block.
    }
  }

  return score;
};

const main = async () => {
  const apply = process.argv.includes("--apply");

  const snap = await db.collection("users").where("role", "==", "manager").get();
  const managers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const byEmail = new Map();
  for (const m of managers) {
    const email = normalizeEmail(m.email);
    if (!email) continue;
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(m);
  }

  const duplicates = Array.from(byEmail.entries()).filter(([, arr]) => arr.length > 1);
  console.log("managers_total", managers.length);
  console.log("duplicate_emails", duplicates.length);
  if (!duplicates.length) return;

  for (const [email, arr] of duplicates) {
    const scored = [];
    for (const doc of arr) {
      const score = await scoreManagerDoc(doc);
      scored.push({ doc, score });
    }
    scored.sort((a, b) => b.score - a.score);
    const keep = scored[0].doc;
    const remove = scored.slice(1).map((x) => x.doc);

    console.log("\nEMAIL", email);
    console.log("KEEP", keep.id, "name=", keep.name || keep.fullName || "", "updatedAt=", toIso(keep.updatedAt), "hasManagerSettings=", !!keep.managerSettings);
    for (const r of remove) {
      console.log("DEL ", r.id, "name=", r.name || r.fullName || "", "updatedAt=", toIso(r.updatedAt), "hasManagerSettings=", !!r.managerSettings);
    }

    // Re-point employees.managerId from removed -> kept when they match by id.
    for (const r of remove) {
      const empSnap = await db.collection("employees").where("managerId", "==", r.id).get();
      if (!empSnap.empty) {
        console.log("employees_to_repoint", empSnap.size, "from", r.id, "to", keep.id);
      }

      if (apply) {
        const batch = db.batch();
        empSnap.docs.forEach((d) => {
          batch.set(
            d.ref,
            {
              managerId: keep.id,
              managerEmail: keep.email || email,
              updatedAt: new Date().toISOString(),
            },
            { merge: true }
          );
        });
        if (!empSnap.empty) await batch.commit();
      }

      if (apply) {
        await db.collection("users").doc(r.id).delete();
      }
    }
  }

  if (!apply) {
    console.log("\nDry-run only. Re-run with --apply to delete duplicates.");
  } else {
    console.log("\nApplied.");
  }
};

main().catch((e) => {
  console.error("ERROR", e?.code || "", e?.message || e);
  process.exit(1);
});


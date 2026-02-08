const { db } = require("../firebaseAdmin");

const findEmployeeForUser = async (user) => {
  if (!user) return null;
  const matches = new Map();

  const byUid = await db
    .collection("employees")
    .where("firebaseUid", "==", user.uid)
    .get();
  byUid.docs.forEach((doc) => matches.set(doc.id, { id: doc.id, ...doc.data() }));

  const byLegacyUid = await db
    .collection("employees")
    .where("uid", "==", user.uid)
    .get();
  byLegacyUid.docs.forEach((doc) => matches.set(doc.id, { id: doc.id, ...doc.data() }));

  if (user.email) {
    const byEmail = await db
      .collection("employees")
      .where("email", "==", user.email)
      .get();
    byEmail.docs.forEach((doc) => matches.set(doc.id, { id: doc.id, ...doc.data() }));
  }

  return Array.from(matches.values())[0] || null;
};

// ==========================
// GET ALL EMPLOYEES
// ==========================

exports.getEmployees = async (req, res) => {
  try {
    const snapshot = await db.collection("employees").get();

    const employees = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(employees);
  } catch (error) {
    console.error("GET EMPLOYEES ERROR:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==========================
// ADD EMPLOYEE
// ==========================

exports.addEmployee = async (req, res) => {
  try {
    const data = req.body;

    const ref = await db.collection("employees").add(data);

    res.status(201).json({
      message: "Employee added successfully",
      id: ref.id,
    });
  } catch (error) {
    console.error("ADD EMPLOYEE ERROR:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==========================
// UPDATE EMPLOYEE
// ==========================

exports.updateEmployee = async (req, res) => {
  try {
    const id = req.params.id;
    const data = req.body;

    await db.collection("employees").doc(id).update(data);

    res.json({ message: "Employee updated successfully" });
  } catch (error) {
    console.error("UPDATE EMPLOYEE ERROR:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==========================
// DELETE EMPLOYEE
// ==========================

exports.deleteEmployee = async (req, res) => {
  try {
    const id = req.params.id;

    await db.collection("employees").doc(id).delete();

    res.json({ message: "Employee deleted successfully" });
  } catch (error) {
    console.error("DELETE EMPLOYEE ERROR:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==========================
// GET CURRENT EMPLOYEE ASSIGNMENT
// ==========================

exports.getMyAssignment = async (req, res) => {
  try {
    const employee = await findEmployeeForUser(req.user);

    if (!employee) {
      return res.status(404).json({ message: "Employee profile not found" });
    }

    const assignedLocation = employee.assignedLocation || employee.location || null;
    const workSchedule = employee.workSchedule || null;

    let mapsUrl = null;
    if (assignedLocation) {
      const lat = assignedLocation.lat ?? assignedLocation.latitude;
      const lng = assignedLocation.lng ?? assignedLocation.longitude;
      const address = assignedLocation.address || assignedLocation.label || assignedLocation.name;

      if (lat != null && lng != null) {
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      } else if (address) {
        mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
      }
    }

    res.status(200).json({
      employeeId: employee.id,
      name: employee.name || employee.fullName || employee.email,
      email: employee.email,
      assignedLocation,
      workSchedule,
      mapsUrl,
    });
  } catch (error) {
    console.error("GET MY ASSIGNMENT ERROR:", error);
    res.status(500).json({ error: error.message });
  }
};

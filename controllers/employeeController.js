const { db } = require("../firebaseAdmin");

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

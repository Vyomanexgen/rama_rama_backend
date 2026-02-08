 // controllers/reportController.js

// GET /api/reports
const getReports = async (req, res) => {
  try {
    // Later you can replace this with Mongo queries
    const reports = [
      {
        id: 1,
        month: "January",
        attendancePercentage: 92,
        totalEmployees: 50,
        presentDays: 23,
        absentDays: 2,
      },
      {
        id: 2,
        month: "February",
        attendancePercentage: 89,
        totalEmployees: 50,
        presentDays: 21,
        absentDays: 4,
      },
    ];

    res.status(200).json(reports);
  } catch (err) {
    console.error("❌ Report Error:", err);
    res.status(500).json({ message: "Failed to fetch reports" });
  }
};

module.exports = {
  getReports,
};

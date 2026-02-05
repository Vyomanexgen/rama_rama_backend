const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
  employeeId: String,
  status: String,
  date: Date,
});

module.exports = mongoose.model("Attendance", attendanceSchema);

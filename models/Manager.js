const mongoose = require("mongoose");

const managerSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    department: String,
    employeesCount: Number,
  },
  { timestamps: true },
);

module.exports = mongoose.model("Manager", managerSchema);

const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    type: String,
    message: String,
    createdBy: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("ActivityLog", activitySchema);

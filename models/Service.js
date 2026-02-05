const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema({
  title: String,
  category: String,
  description: String,
  clients: Number,
  price: Number,
  status: String,
  features: [String],
});

module.exports = mongoose.model("Service", serviceSchema);

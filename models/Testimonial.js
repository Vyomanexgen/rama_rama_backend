const mongoose = require("mongoose");

const testimonialSchema = new mongoose.Schema({
  name: String,
  role: String,
  rating: Number,
  message: String,
  status: {
    type: String,
    default: "Active",
  },
});

module.exports = mongoose.model("Testimonial", testimonialSchema);

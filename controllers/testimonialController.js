// controllers/testimonialController.js

// GET /api/testimonials
const getTestimonials = async (req, res) => {
  try {
    const testimonials = [
      {
        id: 1,
        name: "Rajesh Kumar",
        role: "CEO, TechVision Solutions",
        message:
          "Rama & Rama has been protecting our corporate office for over 3 years. Their security guards are professional and well trained.",
      },
      {
        id: 2,
        name: "Priya Mehta",
        role: "Event Organizer",
        message:
          "We hired Rama & Rama for our wedding event and they managed everything flawlessly.",
      },
      {
        id: 3,
        name: "Anil Sharma",
        role: "Resident Association President",
        message:
          "Our residential community has been using Rama & Rama's services for 2 years. Excellent service!",
      },
    ];

    res.status(200).json(testimonials);
  } catch (err) {
    console.error("❌ Testimonial Error:", err);
    res.status(500).json({ message: "Failed to fetch testimonials" });
  }
};

module.exports = {
  getTestimonials,
};

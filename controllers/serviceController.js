// controllers/serviceController.js

// GET /api/services
const getServices = async (req, res) => {
  try {
    const services = [
      {
        id: 1,
        title: "Corporate Security",
        description: "Professional security solutions for offices and enterprises.",
      },
      {
        id: 2,
        title: "Apartment / Building Security",
        description: "Residential security for apartments and gated communities.",
      },
      {
        id: 3,
        title: "Event Security",
        description: "Security management for private and public events.",
      },
      {
        id: 4,
        title: "Personal Bodyguards",
        description: "Trained bodyguards for VIP protection.",
      },
    ];

    res.status(200).json(services);
  } catch (err) {
    console.error("❌ Service Error:", err);
    res.status(500).json({ message: "Failed to fetch services" });
  }
};

module.exports = {
  getServices,
};

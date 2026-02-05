const router = require("express").Router();

router.get("/test", (req, res) => {
  res.json({ message: "Route working" });
});

module.exports = router;

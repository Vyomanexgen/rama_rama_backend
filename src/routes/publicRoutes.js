const express = require('express');
const router = express.Router();

const superadmin = require('../controllers/superadminController');

// Public company details (read-only)
router.get('/company', superadmin.getCompanyDetails);

module.exports = router;

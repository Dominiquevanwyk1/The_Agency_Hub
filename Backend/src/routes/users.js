const router = require('express').Router();
const { auth } = require('../middleware/auth');
const User = require('../models/User');

// GET /api/users/admin -> return one admin's id/name/email
router.get('/admin', auth, async (req, res) => {
  const admin = await User.findOne({ role: 'admin' }).select('_id name email');
  if (!admin) return res.status(404).json({ message: 'No admin found' });
  res.json(admin);
});

module.exports = router;

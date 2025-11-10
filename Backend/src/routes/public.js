const router = require('express').Router();
const mongoose = require('mongoose');
const User = require('../models/User');

// GET /api/public/models - list active models (safe fields)
router.get('/models', async (_req, res) => {
  try {
    const list = await User.find({ role: 'model', status: 'active' })
      .select('_id name profile.location profile.height_cm profile.measurements profile.photos profile.avatarUrl createdAt');
    res.json(list);
  } catch (err) {
    console.error('Public list error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/public/models/:id - detail (safe fields)
router.get('/models/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // 1) Validate ObjectId (prevents CastError -> 500)
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }

    // 2) Fetch only safe fields
    const m = await User.findOne({ _id: id, role: 'model', status: 'active' })
      .select('_id name profile progress createdAt');

    // 3) Not found -> 404
    if (!m) return res.status(404).json({ message: 'Model not found' });

    res.json(m);
  } catch (err) {
    console.error('Public detail error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;

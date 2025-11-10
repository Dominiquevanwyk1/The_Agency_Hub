const express = require('express');
const router = express.Router();
const TrainingApplication = require('../models/TrainingApplication');

// POST /api/training-applications
router.post('/', async (req, res) => {
  try {
    const doc = await TrainingApplication.create({
      fullName: req.body.fullName,
      email: req.body.email,
      phone: req.body.phone,
      preferredCourse: req.body.preferredCourse,
      experience: req.body.experience,
      notes: req.body.notes,
    });
    res.status(201).json(doc);
  } catch (e) {
    res.status(400).json({ message: e.message || 'Failed to create training application' });
  }
});

// GET /api/training-applications (admin only ideally)
router.get('/', /* authGuard('admin'), */ async (_req, res) => {
  try {
    const list = await TrainingApplication.find().sort({ createdAt: -1 }).lean();
    res.json(list);
  } catch (e) {
    res.status(500).json({ message: 'Failed to load training applications' });
  }
});

module.exports = router;

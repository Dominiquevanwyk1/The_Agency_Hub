const express = require('express');
const Casting = require('../models/casting');

const router = express.Router();

// GET /api/castings?status=open|archived|closed (status optional for "all")
router.get('/', async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status && typeof status === 'string') query.status = status;

    const castings = await Casting.find(query).sort({ createdAt: -1 });
    return res.json({ ok: true, items: castings });
  } catch (err) {
    console.error('GET /castings error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// POST /api/castings (ensure createdBy is provided)
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.createdBy) {
      return res.status(400).json({ ok: false, error: 'CREATED_BY_REQUIRED' });
    }
    // Normalize closesAt (string -> Date)
    if (body.closesAt) body.closesAt = new Date(body.closesAt);

    const doc = await Casting.create(body);
    return res.status(201).json({ ok: true, item: doc });
  } catch (err) {
    console.error('POST /castings error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// PATCH /api/castings/:id/status { status: 'open'|'archived'|'closed' }
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!['open', 'archived', 'closed'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'INVALID_STATUS' });
    }

    const update = { status };
    if (status === 'archived') update.archivedAt = new Date();
    if (status === 'open') update.$unset = { archivedAt: 1 };

    const doc = await Casting.findByIdAndUpdate(id, update, { new: true });
    if (!doc) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });

    return res.json({ ok: true, item: doc });
  } catch (err) {
    console.error('PATCH /castings/:id/status error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// DELETE /api/castings/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Casting.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /castings/:id error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// Optional: disable generic edit route if I want to remove editing entirely
// router.put('/:id', (_req, res) => {
//   return res.status(405).json({ ok: false, error: 'EDIT_DISABLED' });
// });

module.exports = router;
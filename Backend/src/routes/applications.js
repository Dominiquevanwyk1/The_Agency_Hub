const express = require('express');
const router = express.Router();

// --- Prevent browser/proxy caching for this router ---
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set('Surrogate-Control', 'no-store');
  next();
});

const Application = require('../models/Application');
const Casting = require('../models/casting'); 
const { auth, requireRole } = require('../middleware/auth');

/**
 * POST /api/applications
 * Model applies to a casting
 * Body: { castingId, note?, message? }
 * Returns: Application (populated)
 */
router.post('/', auth, requireRole('model'), async (req, res) => {
  try {
    const modelId = req.user._id;
    const { castingId, note, message } = req.body || {};
    if (!castingId) return res.status(400).json({ message: 'castingId is required' });

    // Ensure casting exists and is open
    const casting = await Casting.findById(castingId).lean();
    if (!casting) return res.status(404).json({ message: 'Casting not found' });
    if (casting.status === 'archived' || casting.status === 'closed') {
      return res.status(400).json({ message: 'Casting not open for applications' });
    }

    // One app per (casting, model)
    const appDoc = await Application.findOneAndUpdate(
      { casting: castingId, model: modelId },
      { $setOnInsert: { casting: castingId, model: modelId, message }, $set: { status: 'pending' } },
      { new: true, upsert: true }
    )
      .populate('casting', '_id title location closesAt')
      .populate('model', '_id name email profile');

    const asObj = appDoc.toObject ? appDoc.toObject() : appDoc;
    if (!asObj.appliedAt) asObj.appliedAt = asObj.createdAt;

    // Emit real-time event so admins (and any other listeners) get the new application
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io && typeof io.emit === 'function') {
        io.emit('application:new', {
          appId: asObj._id,
          castingId: asObj.casting?._id || asObj.casting,
          modelId: asObj.model?._id || asObj.model,
          modelName: asObj.model?.name || asObj.model?.email || null,
          appliedAt: asObj.appliedAt,
          application: asObj,
        });
        // also notify the model room
        if (asObj.model && asObj.model._id) {
          io.to(`user:${String(asObj.model._id)}`).emit('application:new', {
            appId: asObj._id,
            application: asObj,
          });
        }
      }
    } catch (emitErr) {
      console.warn('Failed to emit application:new', emitErr);
    }

    return res.json(asObj);
  } catch (err) {
    // Duplicate key (already applied) also lands here if unique index exists
    if (err?.code === 11000) {
      try {
        const existing = await Application.findOne({
          casting: req.body.castingId,
          model: req.user._id,
        })
          .populate('casting', '_id title location closesAt')
          .populate('model', '_id name email profile')
          .lean();

        if (existing && !existing.appliedAt) existing.appliedAt = existing.createdAt;
        return res.json(existing);
      } catch (ex) {
        // fallthrough to generic error
      }
    }
    console.error('POST /applications error:', err);
    res.status(500).json({ message: 'Failed to apply' });
  }
});

/**
 * GET /api/applications
 * Admin: list all (optional ?status=...)
 * Model: list own apps (optional ?status=...)
 * Returns: Application[] (populated)
 */
router.get('/', auth, async (req, res) => {
  try {
    const { status } = req.query;
    const q = {};
    if (status) q.status = status;

    const user = req.user || {};
    const userId = String(user._id || user.id || '');
    const isModel = user.role === 'model';

    if (isModel && userId) q.model = userId;

    const apps = await Application.find(q)
      .populate('model', '_id name email profile')
      .populate('casting', '_id title location closesAt')
      .sort({ createdAt: -1 })
      .lean();

    const withAppliedAt = apps.map(a => ({ ...a, appliedAt: a.appliedAt || a.createdAt }));
    res.json(withAppliedAt);
  } catch (err) {
    console.error('GET /applications error:', err);
    res.status(500).json({ message: 'Failed to fetch applications' });
  }
});

/**
 * GET /api/applications/admin/recent
 * Admin-only recent list
 */
router.get('/admin/recent', auth, requireRole('admin'), async (_req, res) => {
  try {
    const items = await Application.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('casting', '_id title location closesAt')
      .populate('model', '_id name email profile')
      .lean();

    const withAppliedAt = items.map(a => ({ ...a, appliedAt: a.appliedAt || a.createdAt }));
    res.json({ items: withAppliedAt });
  } catch (err) {
    console.error('GET /applications/admin/recent error:', err);
    res.status(500).json({ message: 'Failed to fetch applications' });
  }
});

/**
 * PATCH /api/applications/:id/status
 * Admin updates status: reviewed | shortlisted | accepted | rejected
 * Returns: Application (populated)
 */
router.patch('/:id/status', auth, requireRole('admin'), async (req, res) => {
  try {
    const { status } = req.body || {};
    const allowed = ['reviewed', 'shortlisted', 'accepted', 'rejected'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const updated = await Application.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    )
      .populate('casting', '_id title location closesAt')
      .populate('model', '_id name email profile')
      .lean();

    if (!updated) return res.status(404).json({ message: 'Application not found' });

    // ensure appliedAt
    if (!updated.appliedAt) updated.appliedAt = updated.createdAt;

    // --- Real-time: emit to admins & model if socket available ---
    try {
      const io = req.app && req.app.get && req.app.get('io');
      if (io && typeof io.emit === 'function') {
        // Broadcast an application status update event (admins)
        io.emit('application:status', {
          appId: updated._id,
          status: updated.status,
          castingId: updated.casting?._id || updated.casting,
          modelId: updated.model?._id || updated.model,
          modelName: updated.model?.name || updated.model?.email || null,
          application: updated,
        });

        // Also notify the specific model's room (if they are connected)
        if (updated.model && updated.model._id) {
          io.to(`user:${String(updated.model._id)}`).emit('application:status', {
            appId: updated._id,
            status: updated.status,
            application: updated,
          });
        }
      }
    } catch (emitErr) {
      console.warn('Failed to emit socket event for application update', emitErr);
    }

    return res.json(updated);
  } catch (err) {
    console.error('PATCH /applications/:id/status error:', err);
    res.status(500).json({ message: 'Failed to update status' });
  }
});

module.exports = router;

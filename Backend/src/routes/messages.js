const express = require('express');
const router = express.Router();
const path = require('path');
const multer = require('multer');
const mongoose = require('mongoose');
const { auth } = require('../middleware/auth');
const Message = require('../models/Message');

function isObjectId(id) { return mongoose.Types.ObjectId.isValid(id); }

// ---- Storage & upload
const upload = multer({
  dest: path.join(process.cwd(), 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    const allowed = new Set([
      'image/jpeg','image/png','image/webp','image/gif',
      'application/pdf','text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]);
    if (allowed.has(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported type: ${file.mimetype}`));
  }
});

// Helper: cache admin id
let _cachedAdminId = null;
async function getAdminId() {
  if (_cachedAdminId) return _cachedAdminId;
  const User = require('../models/User');
  const admin = await User.findOne({ role: 'admin' }).select('_id').lean();
  _cachedAdminId = admin?._id?.toString() || null;
  return _cachedAdminId;
}
function emitToUser(app, userId, event, payload) {
  const io = app.get('io');
  if (io) io.to(`user:${String(userId)}`).emit(event, payload);
}

// ---- POST /api/messages  (supports JSON and multipart)
router.post('/', auth, upload.array('files', 10), async (req, res) => {
  try {
    const isMultipart = req.is('multipart/form-data');
    const to = (isMultipart ? req.body.to : req.body?.to) || '';
    const body = String((isMultipart ? req.body.body : req.body?.body) || '').trim();

    if (!to || !isObjectId(to)) return res.status(400).json({ message: 'Invalid "to" user id' });
    if (!body && (!req.files || req.files.length === 0)) {
      return res.status(400).json({ message: 'Message body or at least one file is required' });
    }
    if (String(req.user.id) === String(to)) {
      return res.status(400).json({ message: 'Cannot message yourself' });
    }

    // Policy: non-admins may only message the admin
    if (req.user.role !== 'admin') {
      const adminId = await getAdminId();
      if (!adminId) return res.status(503).json({ message: 'No admin available to receive messages' });
      if (String(to) !== String(adminId)) {
        return res.status(403).json({ message: 'Users may only message the admin' });
      }
    }

    const files = (req.files || []).map(f => ({
      name: f.originalname,
      type: f.mimetype,
      size: f.size,
      url: `/uploads/${f.filename}`
    }));

    const msg = await Message.create({ from: req.user.id, to, body, files });

    const payload = {
      _id: String(msg._id),
      from: String(msg.from),
      to: String(msg.to),
      body: msg.body,
      files: msg.files,
      createdAt: msg.createdAt, // or new Date().toISOString()
    };

    // Realtime updates
    emitToUser(req.app, to, 'message:new', msg);
    emitToUser(req.app, req.user.id, 'message:new', msg);

    // Unread count for recipient
    try {
      const unread = await Message.countDocuments({ to, read: false });
      emitToUser(req.app, to, 'message:unread', { count: unread });
    } catch {}

    res.status(201).json(msg);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ message: 'Failed to send message' });
  }
});

// ---- GET /api/messages/thread/:userId  (all messages between me and :userId)
router.get('/thread/:userId', auth, async (req, res) => {
  try {
    const me = String(req.user.id);
    const other = String(req.params.userId);
    if (!isObjectId(other)) return res.status(400).json({ message: 'Invalid user id' });

    // Non-admins may only view admin thread
    if (req.user.role !== 'admin') {
      const adminId = await getAdminId();
      if (!adminId || other !== String(adminId)) {
        return res.status(403).json({ message: 'Users may only view thread with the admin' });
      }
    }

    const thread = await Message.find({
      $or: [{ from: me, to: other }, { from: other, to: me }]
    }).sort('createdAt').lean();

    res.json(thread);
  } catch (err) {
    console.error('Thread fetch error:', err);
    res.status(500).json({ message: 'Failed to load thread' });
  }
});

// ---- GET /api/messages/unread/count  (how many messages sent TO me that are unread)
router.get('/unread/count', auth, async (req, res) => {
  try {
    const n = await Message.countDocuments({ to: req.user.id, read: false });
    res.json({ count: n });
  } catch (err) {
    console.error('Unread count error:', err);
    res.status(500).json({ message: 'Failed to get unread count' });
  }
});

// ---- PATCH /api/messages/read/:withUser  (mark thread FROM :withUser TO me as read)
router.patch('/read/:withUser', auth, async (req, res) => {
  try {
    const { withUser } = req.params;
    if (!isObjectId(withUser)) return res.status(400).json({ message: 'Invalid user id' });

    // Non-admins may only mark the admin thread as read
    if (req.user.role !== 'admin') {
      const adminId = await getAdminId();
      if (!adminId || String(withUser) !== String(adminId)) {
        return res.status(403).json({ message: 'Users may only mark the admin thread as read' });
      }
    }

    const result = await Message.updateMany(
      { to: req.user.id, from: withUser, read: false },
      { $set: { read: true } }
    );

    // Emit updated unread count to this user
    try {
      const n = await Message.countDocuments({ to: req.user.id, read: false });
      emitToUser(req.app, req.user.id, 'message:unread', { count: n });
    } catch {}

    res.json({ ok: true, modified: result.modifiedCount ?? result.nModified ?? 0 });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ message: 'Failed to mark messages as read' });
  }
});

module.exports = router;

const express = require('express');
const { auth, requireRole } = require("../middleware/auth");
const User = require("../models/User");
const Casting = require('../models/casting');
const Application = require("../models/Application");
const Booking = require("../models/Booking");

const router = express.Router();

// GET /api/admin/me - return admin id (for models to message without entering manually)
router.get("/me", auth, requireRole("admin"), async (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, name: req.user.name });
});

// GET /api/admin/seeded - return first admin user id
router.get("/primary", async (req, res) => {
  const u = await User.findOne({ role: "admin" }).select("_id name email");
  if (!u) return res.status(404).json({ message: "Admin not found" });
  res.json(u);
});

// GET /api/admin/metrics
router.get('/metrics', async (_req, res) => {
  try {
    const [activeModels, openCastings, applications, bookings] = await Promise.all([
      User.countDocuments({ role: 'model', isActive: true }).catch(() => 0),
      Casting.countDocuments({ status: 'open' }).catch(() => 0),
      Application.countDocuments({}).catch(() => 0),
      Booking.countDocuments({}).catch(() => 0),
    ]);

    return res.json({
      ok: true,
      metrics: { activeModels, openCastings, applications, bookings },
    });
  } catch (err) {
    console.error('GET /admin/metrics error', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

// List models with optional status filter
router.get("/models", auth, requireRole("admin"), async (req, res) => {
  const { status } = req.query; // active | disabled
  const q = { role: "model" };
  if (status) q.status = status;
  const models = await User.find(q).select(
    "_id name email status profile progress createdAt"
  );
  res.json(models);
});

// View single model profile
router.get("/models/:id", auth, requireRole("admin"), async (req, res) => {
  const u = await User.findById(req.params.id).select(
    "_id name email status profile progress"
  );
  if (!u) return res.status(404).json({ message: "Not found" });
  res.json(u);
});

// Disable/enable
router.patch(
  "/models/:id/status",
  auth,
  requireRole("admin"),
  async (req, res) => {
    const { status } = req.body; // 'active' or 'disabled'
    if (!["active", "disabled"].includes(status))
      return res.status(400).json({ message: "Invalid status" });
    const u = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    ).select("_id name email status");
    res.json(u);
  }
);

// Delete model
router.delete("/models/:id", auth, requireRole("admin"), async (req, res) => {
  await User.deleteOne({ _id: req.params.id, role: "model" });
  res.json({ ok: true });
});

module.exports = router;

const router = require("express").Router();
const { auth } = require("../middleware/auth");
const User = require("../models/User");

const NAME_RE = /^[A-Za-z][A-Za-z '\-]{1,49}$/;

// GET /api/profile/me - current user profile + progress
router.get("/me", auth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .select("_id name email role status profile progress");
    return res.json(user);
  } catch (err) {
    return next(err);
  }
});

// PUT /api/profile/me - update editable fields
router.put("/me", auth, async (req, res, next) => {
  try {
    const patch = {};

    if (req.body.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (!NAME_RE.test(name)) {
        return res.status(400).json({ error: "Invalid display name format." });
      }
      patch.name = name;
    }

    for (const k of ["profile", "progress", "avatarUrl"]) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: patch },
      { new: true }
    ).select("_id name email role status profile progress");

    if (!user) return res.sendStatus(404);

    // Send the response first
    res.json(user);

    // Fire-and-forget notify via Socket.IO; never let it break the response
    const io = req.app.get("io");
    if (io) {
      setImmediate(() => {
        try {
          io.to(`user:${req.user.id}`).emit("profile:updated", {
            id: req.user.id,
            photos: user.profile?.photos?.length || 0,
          });
        } catch (e) {
          console.error("profile:updated emit failed:", e);
        }
      });
    }

    return; // ensure no further code runs
  } catch (err) {
    return next(err);
  }
});

/* -------------------------
  PATCH /api/profile/me
   Alias for PUT logic, accepts partial body
-------------------------- */
router.patch("/me", auth, async (req, res, next) => {
  try {
    const patch = {};

    if (req.body.name !== undefined) {
      const name = String(req.body.name || "").trim();
      if (!NAME_RE.test(name)) {
        return res.status(400).json({ error: "Invalid display name format." });
      }
      patch.name = name;
    }

    for (const k of ["profile", "progress", "avatarUrl"]) {
      if (req.body[k] !== undefined) patch[k] = req.body[k];
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: patch },
      { new: true }
    ).select("_id name email role status profile progress avatarUrl");

    if (!user) return res.sendStatus(404);

    res.json(user);
    emitProfileUpdated(req, user);
  } catch (err) {
    return next(err);
  }
});

/* -------------------------
   PATCH /api/profile/avatar
   Sets the avatar URL (top-level avatarUrl field)
-------------------------- */
router.patch("/avatar", auth, async (req, res, next) => {
  try {
    const url = String(req.body.avatarUrl || req.body.url || "").trim();
    if (!url) return res.status(400).json({ error: "avatarUrl required" });

    // simple allowlist (adjust to your needs)
    if (!(url.startsWith("/uploads/") || url.startsWith("http://") || url.startsWith("https://"))) {
      return res.status(400).json({ error: "Invalid avatarUrl" });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { avatarUrl: url } },
      { new: true }
    ).select("_id name email role status profile progress avatarUrl");

    if (!user) return res.sendStatus(404);

    res.json(user);
    emitProfileUpdated(req, user);
  } catch (err) {
    return next(err);
  }
});

module.exports = router;

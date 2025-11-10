const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { auth } = require("../middleware/auth");

// Basic validators
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN = 8,
  MAX = 64;
function validatePassword(pw) {
  const s = String(pw || "");
  if (s.length < MIN || s.length > MAX)
    return "Password must be 8–64 characters";
  if (!/[a-z]/.test(s)) return "Include a lowercase letter";
  if (!/[A-Z]/.test(s)) return "Include an uppercase letter";
  if (!/\d/.test(s)) return "Include a number";
  if (!/[^\w\s]/.test(s)) return "Include a special character";
  if (/\s/.test(s)) return "No spaces allowed";
  return null; // ok
}
function normalizeEmail(s) {
  return String(s || "")
    .trim()
    .toLowerCase();
}

// Helpers
function issueAccessToken(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_ACCESS_TTL || "15m",
  });
}
function issueRefreshToken(user) {
  return jwt.sign({ id: user._id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_TTL || "7d",
  });
}
function setRefreshCookie(res, token) {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie("refresh", token, {
    httpOnly: true,
    sameSite: isProd ? "strict" : "lax",
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000, // align with TTL
  });
}

// POST /api/auth/signup  (models/clients register themselves)
router.post("/signup", async (req, res) => {
  try {
    let { name, email, password, role = "client" } = req.body || {};
    name = String(name || "").trim();
    email = normalizeEmail(email);

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Missing fields" });
    }
    if (!emailRe.test(email)) {
      return res.status(400).json({ message: "Invalid email" });
    }
    const errMsg = validatePassword(password);
    if (errMsg) {
      return res.status(400).json({ message: errMsg });
    }

    // Prevent privilege escalation
    const allowedRoles = ["client", "model"];
    if (!allowedRoles.includes(role)) role = "client";

    const exists = await User.findOne({ email });
    if (exists)
      return res.status(400).json({ message: "Email already in use" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, passwordHash, role });

    const access = issueAccessToken(user);
    const refresh = issueRefreshToken(user);
    setRefreshCookie(res, refresh);

    return res.json({
      token: access,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).json({ message: "Signup error" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  const password = req.body?.password;
  const user = await User.findOne({ email }).select(
    "+passwordHash +loginAttempts +lockUntil"
  );

  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  if (user.isLocked && user.isLocked()) {
    return res.status(423).json({ error: "Account locked. Try again later." });
  }
  if (user.status && user.status !== 'active') {
    return res.status(403).json({ message: 'Account disabled' });
  }

  const ok = await bcrypt.compare(
    String(password || ""),
    user.passwordHash || ""
  );
  if (!ok) {
    await user.incLoginAttempts();
    return res.status(401).json({ error: "Invalid credentials" });
  }

  await user.resetLoginAttempts();

  const access = issueAccessToken(user);
  const refresh = issueRefreshToken(user);
  setRefreshCookie(res, refresh);

  return res.json({
    token: access,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
    },
  });
});

// === Refresh (rotate) ===
router.post("/refresh", async (req, res) => {
  try {
    const { refresh } = req.cookies || {};
    if (!refresh) return res.status(401).json({ error: "Missing refresh" });

    const payload = jwt.verify(refresh, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ error: "Invalid refresh" });
    if (user.status && user.status !== 'active') {
      return res.status(403).json({ error: 'Account disabled' });
    }

    const newAccess = issueAccessToken(user);
    const newRefresh = issueRefreshToken(user); // rotation
    setRefreshCookie(res, newRefresh);

    return res.json({ token: newAccess });
  } catch {
    return res.status(401).json({ error: "Invalid refresh" });
  }
});

// POST /api/auth/logout (cookie mode only; safe to call anytime)
router.post("/logout", (req, res) => {
  res.clearCookie("refresh");
  return res.json({ ok: true });
});

// GET /api/auth/me
router.get("/me", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("_id name email role");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json(user);
});

module.exports = router;

const mongoose = require("mongoose");

const NAME_RE = /^[A-Za-z][A-Za-z '\-]{1,49}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const ProfileSchema = new mongoose.Schema(
  {
    height_cm: { type: Number, min: 0, max: 260 },
    measurements: {
      bust: { type: Number, min: 0, max: 200 },
      waist: { type: Number, min: 0, max: 200 },
      hips: { type: Number, min: 0, max: 250 },
      cup: { type: String, trim: true },
      shoe: { type: Number, min: 0, max: 60 },
      hair: { type: String, trim: true },
      eyes: { type: String, trim: true },
    },
    location: { type: String, trim: true },
    bio: { type: String, trim: true, maxlength: 1000 },
    photos: { type: [String], default: [] }, // URLs
    socials: {
      instagram: { type: String, trim: true },
      tiktok: { type: String, trim: true },
      website: { type: String, trim: true },
    },
    experienceYears: { type: Number, min: 0, max: 80 },
    tags: { type: [String], default: [] },
  },
  { _id: false }
);

const ProgressSchema = new mongoose.Schema(
  {
    coursesCompleted: { type: Number, default: 0, min: 0 },
    learningTimeHours: { type: Number, default: 0, min: 0 },
    certificates: { type: Number, default: 0, min: 0 },
    achievements: { type: [String], default: [] },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, match: NAME_RE },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: EMAIL_RE,
    },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ["admin", "model", "client"],
      default: "client",
      index: true,
    },
    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
      index: true,
    },
    profile: { type: ProfileSchema, default: () => ({}) },
    progress: { type: ProgressSchema, default: () => ({}) },
    avatarUrl: {
      type: String,
      trim: true,
      default: null,
    },
    loginAttempts: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, default: null, select: false },
    lastPasswordChange: { type: Date, default: null },
    tokenVersion: { type: Number, default: 0 }, // bump to invalidate refresh tokens
  },
  { timestamps: true }
);

// --- Instance helpers ---
UserSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > new Date());
};

UserSchema.methods.incLoginAttempts = async function () {
  const LOCK_TIME_MIN = 10;
  const MAX_ATTEMPTS = 5;

  // If lock expired, reset counters first
  if (this.lockUntil && this.lockUntil <= new Date()) {
    await this.updateOne({ $set: { loginAttempts: 0, lockUntil: null } });
  }

  const updates = { $inc: { loginAttempts: 1 } };
  if ((this.loginAttempts || 0) + 1 >= MAX_ATTEMPTS) {
    updates.$set = {
      lockUntil: new Date(Date.now() + LOCK_TIME_MIN * 60 * 1000),
    };
  }
  return this.updateOne(updates);
};

UserSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({ $set: { loginAttempts: 0, lockUntil: null } });
};

// --- Hooks ---
UserSchema.pre("save", function (next) {
  if (this.isModified("email") && this.email) {
    this.email = this.email.trim().toLowerCase();
  }
  if (this.isModified("name") && this.name) {
    this.name = this.name.trim();
  }
  next();
});

// --- Output hygiene ---
function hideSensitive(_, ret) {
  delete ret.passwordHash;
  delete ret.loginAttempts;
  delete ret.lockUntil;
  return ret;
}
UserSchema.set("toJSON", { virtuals: true, transform: hideSensitive });
UserSchema.set("toObject", { virtuals: true, transform: hideSensitive });

module.exports = mongoose.model("User", UserSchema);

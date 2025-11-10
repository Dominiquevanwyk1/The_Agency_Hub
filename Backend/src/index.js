require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const path = require("path");
const { createServer } = require("http");
const { Server } = require("socket.io");
const csrf = require("csurf");
const morgan = require("morgan");
const winston = require("winston");
const jwt = require("jsonwebtoken");

// Security & stability middlewares
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const hpp = require("hpp");
const mongoSanitize = require("express-mongo-sanitize");

// Routers
const applicationsRouter = require("./routes/applications");
const authRouter = require("./routes/auth");
const castingsRouter = require("./routes/casting");
const profileRouter = require("./routes/profile");
const adminRouter = require("./routes/admin");
const messagesRouter = require("./routes/messages");
const modelsRouter = require("./routes/models");
const usersRouter = require("./routes/users");
const uploadRouter = require("./routes/upload");
const publicRouter = require("./routes/public");
const trainingApplications = require('./routes/trainingApplications');

const app = express();
app.set('etag', false);

app.disable('x-powered-by');

// Strict CORS (adjust CLIENT_ORIGIN for production)
const allowedOrigin = process.env.CLIENT_ORIGIN || "http://localhost:4200";
app.use(
  cors({
    origin: allowedOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
  })
);

/* =======================
   CORE SECURITY MIDDLEWARE
   ======================= */

// Helmet adds standard HTTP security headers
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  })
);

// Prevent HTTP parameter pollution
app.use(hpp());

app.use((req, _res, next) => {
  if (req.body) mongoSanitize.sanitize(req.body);
  if (req.params) mongoSanitize.sanitize(req.params);
  next();
});

// Sanitize Mongo queries (blocks $ and . injection)

// Limit request payloads
app.use(express.json({ limit: "1mb" }));

// Secure cookies
app.use(cookieParser());

// Rate limiting (protect login & upload routes)
const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use("/api/auth", authLimiter);

const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 60,
});
app.use("/api/upload", uploadLimiter);

// ========== Logging ==========
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
  ],
});
app.use(morgan("combined")); // request logs

// ========== HTTPS/HSTS (production) ==========
app.set("trust proxy", 1);
if (process.env.NODE_ENV === "production") {
  app.use(
    require("helmet").hsts({
      maxAge: 15552000, // ~180 days
    })
  );
  app.use((req, res, next) => {
    if (!req.secure) {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

// ========== Optional CSRF ==========
if (String(process.env.ENABLE_CSRF).toLowerCase() === "true") {
  const csrfProtection = csrf({ cookie: true });
  // expose a token for the SPA to read once
  app.get("/api/csrf-token", csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
  });
  // protect state-changing routes
  app.use("/api", (req, res, next) => {
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      return csrfProtection(req, res, next);
    }
    next();
  });
}

/* =======================
   STATIC FILES & ROUTES
   ======================= */

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use("/api/auth", authRouter);
app.use("/api/castings", castingsRouter);
app.use("/api/profile", profileRouter);
app.use("/api/admin", adminRouter);
app.use("/api/messages", messagesRouter);
app.use("/api/models", modelsRouter);
app.use("/api/users", usersRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/public", publicRouter);
app.use("/api/applications", applicationsRouter);
app.use('/api/training-applications', trainingApplications);

app.get("/api/health", (_req, res) => res.json({ ok: true }));



/* =======================
   404 & ERROR HANDLERS
   ======================= */

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not Found" });
  }
  next();
});

// Centralized error handler with safe output
app.use((err, req, res, next) => {
  console.error("[Unhandled Error]", err);
  if (res.headersSent) return next(err);
  const status = err.status || 500;
  const message = status >= 500 ? "Internal Server Error" : err.message;
  res.status(status).json({ error: message });
});

/* =======================
   SOCKET.IO INITIALIZATION
   ======================= */

   const http = createServer(app);
   const io = new Server(http, {
     cors: { origin: allowedOrigin, credentials: true },
   });
   
   app.set("io", io);
   
   // Verify JWT at handshake
   io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("Unauthorized"));
  
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      // Accept id, _id or sub to be resilient to different token shapes
      socket.data.userId = payload.id || payload._id || payload.sub || null;
  
      if (!socket.data.userId) return next(new Error("Unauthorized"));
      return next();
    } catch (e) {
      return next(new Error("Unauthorized"));
    }
  });
   
   io.on("connection", (socket) => {
     console.log("Socket connected:", socket.id, "user:", socket.data.userId);
     socket.join(`user:${socket.data.userId}`);
   
   
     socket.on("disconnect", () => {
     });
   });

/* =======================
   DATABASE CONNECTION
   ======================= */

const USE_MEMORY =
  String(process.env.USE_MEMORY_STORE || "").toLowerCase() === "true";

async function connectMongo() {
  if (USE_MEMORY) {
    console.log("Using memory store. MongoDB not required.");
    return;
  }
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("MONGO_URI required when USE_MEMORY_STORE=false");
  await mongoose.connect(uri);
  mongoose.set("strictQuery", true);
  console.log("MongoDB connected");
}

async function seedAdmin() {
  const User = require("./models/User");
  const email = process.env.ADMIN_EMAIL || "admin@versatilevisions.com";
  const exists = await User.findOne({ email });
  if (!exists) {
    const passwordHash = await bcrypt.hash(
      process.env.ADMIN_PASSWORD || "Admin@2024",
      10
    );
    await User.create({
      name: process.env.ADMIN_NAME || "Versatile Admin",
      email,
      passwordHash,
      role: "admin",
    });
    console.log("Seeded admin:", email);
  }
}

/* =======================
   SERVER START
   ======================= */

const PORT = process.env.PORT || 4000;

connectMongo()
  .then(seedAdmin)
  .then(() => {
    http.listen(PORT, () =>
      console.log(`Secure API + Socket.IO running on port ${PORT}`)
    );
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });

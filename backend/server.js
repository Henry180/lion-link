const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth");
const postRoutes = require("./routes/posts");
const announcementRoutes = require("./routes/announcements");
const conversationRoutes = require("./routes/conversations");
const storyRoutes = require("./routes/stories");
const userRoutes = require("./routes/users");
const notificationRoutes = require("./routes/notifications");
const eventRoutes = require("./routes/events");
const groupRoutes = require("./routes/groups");
const adminRoutes = require("./routes/admin").router;

const app = express();
let databaseReady = false;


// =====================================================
// MIDDLEWARE
// =====================================================

const allowedOrigins = (process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (process.env.NODE_ENV !== "production" || !origin) {
      return callback(null, true);
    }

    const isAllowed =
      allowedOrigins.includes(origin) ||
      /^https:\/\/[a-z0-9-]+\.lion-link\.pages\.dev$/.test(origin);

    if (isAllowed) {
      return callback(null, true);
    }

    return callback(new Error("Origin is not allowed"));
  }
}));
// A 512 MB instance cannot safely parse many multi-megabyte JSON uploads at
// once. Photos are compressed in the browser; keep an explicit upper bound so
// concurrent uploads fail cleanly instead of exhausting the Node process.
app.use(express.json({ limit: "3mb" }));
app.use("/api", (req, res, next) => {
  if (!databaseReady) return res.status(503).json({ message: "Lion Link is reconnecting to its database. Please try again in a moment." });
  next();
});


// =====================================================
// BASIC TEST ROUTE
// =====================================================

app.get("/", (req, res) => {
  res.json({
    message: "🦁 Lion Link API is running"
  });
});

// Render can use this endpoint without triggering a MongoDB query.
app.get("/health", (_req, res) => {
  res.status(databaseReady ? 200 : 503).json({ status: databaseReady ? "ok" : "database reconnecting" });
});


// =====================================================
// AUTH ROUTES
// =====================================================

app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/stories", storyRoutes);
app.use("/api/users", userRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/admin", adminRoutes);


// =====================================================
// MONGODB CONNECTION
// =====================================================

const mongoUri = process.env.MONGODB_URI;

async function connectDatabase() {
  if (!mongoUri) {
    console.error("❌ MongoDB connection failed: MONGODB_URI is not configured.");
    return;
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
      minPoolSize: 0,
      maxIdleTimeMS: 30000
    });
    databaseReady = true;
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    databaseReady = false;
    const reason = error?.message || error?.name || "Unknown connection error";
    console.error("❌ MongoDB connection failed:", reason);
    setTimeout(connectDatabase, 30000);
  }
}

app.listen(process.env.PORT || 5000, () => {
  console.log(`🦁 Lion Link backend running on http://localhost:${process.env.PORT || 5000}`);
  connectDatabase();
});

// Keep the actual reason in Render logs if the process is ever restarted.
process.on("unhandledRejection", error => console.error("Unhandled promise rejection:", error));
process.on("uncaughtException", error => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

app.use((error, _req, res, _next) => {
  if (error?.type === "entity.too.large" || error?.status === 413) {
    return res.status(413).json({ message: "That upload is too large. Please choose a smaller image or video." });
  }
  console.error("Unhandled request error:", error);
  res.status(error?.status || 500).json({ message: "Server error" });
});

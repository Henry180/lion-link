const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth");
const AdminInvite = require("../models/AdminInvite");
const crypto = require("crypto");

const router = express.Router();

// =====================================================
// LIGHTWEIGHT RATE LIMITING
// =====================================================
// Login, registration, password-reset requests, and admin-invite attempts
// had no limit at all — an attacker could try passwords or invite codes as
// fast as the network allowed. This is a small in-memory limiter (no new
// dependency needed) keyed by IP + route: a modest number of attempts per
// window, then a short cooldown. It resets on every deploy/restart, which
// is an acceptable trade-off for a single-instance Render deployment; if
// you ever run multiple instances, this should move to a shared store
// (e.g. Redis) instead, since each instance would otherwise count separately.
const attempts = new Map();
function rateLimit(name, max, windowMs) {
  return (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const record = attempts.get(key);
    if (!record || now - record.start > windowMs) {
      attempts.set(key, { start: now, count: 1 });
      return next();
    }
    if (record.count >= max) {
      return res.status(429).json({ message: "Too many attempts. Please wait a few minutes and try again." });
    }
    record.count += 1;
    next();
  };
}
// Occasionally forget old entries so this Map doesn't grow forever.
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [key, record] of attempts) if (record.start < cutoff) attempts.delete(key);
}, 10 * 60 * 1000);

const issueToken = user => jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
const usernameFrom = value => String(value || "lion").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16) || "lion";
async function uniqueGoogleUsername(name) { const base = usernameFrom(name); let username = base.length >= 3 ? base : `${base}user`; let number = 0; while (await User.exists({ username })) username = `${base.slice(0, 15)}${++number}`; return username; }


// =====================================================
// REGISTER
// =====================================================

async function register(req, res) {
  try {
    const rawName = req.body.name, rawEmail = req.body.email, { password, username: requestedUsername } = req.body;
    const name = String(rawName || "").trim().slice(0, 30);
    const email = String(rawEmail || "").trim().toLowerCase().slice(0, 254);

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required"
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: "Please enter a valid email address" });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters"
      });
    }

    const existingUser = await User.findOne({
      email
    });

    if (existingUser) {
      return res.status(409).json({
        message: "An account with this email already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const username = String(requestedUsername || "").toLowerCase().replace(/^@/, "");
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return res.status(400).json({ message: "Username must be 3–20 letters, numbers, or underscores" });
    if (await User.exists({ username })) return res.status(409).json({ message: "That username is already taken" });

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      username
    });

    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d"
      }
    );

    res.status(201).json({
      message: "Account created successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    if (error?.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      const message = field === "username" ? "That username is already taken" : "An account with this email already exists. Please log in instead.";
      return res.status(409).json({ message });
    }
    console.error("Register error:", error?.message || error);

    res.status(500).json({
      message: "Server error"
    });
  }
}
router.post("/register", rateLimit("register", 10, 15 * 60 * 1000), register);
router.post("/signup", rateLimit("register", 10, 15 * 60 * 1000), register);

router.get("/google", (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.APP_URL) return res.status(503).send("Google sign-in has not been configured yet.");
  const redirect = `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, redirect_uri: redirect, response_type: "code", scope: "openid email profile", prompt: "select_account" });
  res.redirect(url.toString());
});
router.get("/google/callback", async (req, res) => {
  try {
    const redirect = `${req.protocol}://${req.get("host")}/api/auth/google/callback`;
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: String(req.query.code || ""), client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri: redirect, grant_type: "authorization_code" }) });
    const tokenData = await tokenResponse.json(); if (!tokenResponse.ok) throw Error(tokenData.error_description || "Google authentication failed");
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tokenData.access_token}` } });
    const profile = await profileResponse.json(); if (!profileResponse.ok || !profile.email || !profile.sub) throw Error("Google did not return a usable profile");
    let user = await User.findOne({ $or: [{ googleSubject: profile.sub }, { email: profile.email.toLowerCase() }] });
    if (!user) user = await User.create({ name: profile.name || profile.email.split("@")[0], email: profile.email.toLowerCase(), username: await uniqueGoogleUsername(profile.email.split("@")[0]), googleSubject: profile.sub, profileImage: profile.picture || "" });
    else if (!user.googleSubject) { user.googleSubject = profile.sub; if (!user.profileImage && profile.picture) user.profileImage = profile.picture; await user.save(); }
    res.redirect(`${process.env.APP_URL.replace(/\/$/, "")}/?google_token=${encodeURIComponent(issueToken(user))}`);
  } catch (error) {
    // The raw error (which can include third-party API response text) is
    // logged for debugging, but never sent to the browser — it could reveal
    // internal details to anyone who triggers a failed Google sign-in.
    console.error("Google sign-in error:", error?.message || error);
    res.redirect(`${(process.env.APP_URL || "").replace(/\/$/, "")}/?google_error=${encodeURIComponent("Google sign-in failed. Please try again.")}`);
  }
});

router.post("/session", auth, async (req, res) => {
  const user = await User.findById(req.user.userId); if (!user) return res.status(404).json({ message: "User not found" });
  user.lastActiveAt = new Date(); await user.save(); res.json({ token: issueToken(user), lastActiveAt: user.lastActiveAt });
});

router.get("/me", auth, async (req, res) => {
  const user = await User.findById(req.user.userId).select("name email username role bio profileImage coverImage location followers following createdAt").populate("following", "username");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user: { id: user._id, name: user.name, email: user.email, username: user.username, role: user.role, bio: user.bio, profileImage: user.profileImage, coverImage: user.coverImage, location: user.location, followers: user.followers.length, following: user.following.length, followingUsernames: user.following.map(item => item.username), createdAt: user.createdAt } });
});

router.patch("/me", auth, async (req, res) => {
  const user = await User.findById(req.user.userId);
  user.name = String(req.body.name || user.name).trim().slice(0, 30);
  user.bio = String(req.body.bio || "").trim().slice(0, 160);
  user.location = String(req.body.location || user.location || "University of Nigeria, Nsukka").trim().slice(0, 100);
  if (req.body.profileImage) user.profileImage = req.body.profileImage;
  if (req.body.coverImage) user.coverImage = req.body.coverImage;
  await user.save();
  res.json({ user: { id:user._id, name:user.name, email:user.email, username:user.username, role:user.role, bio:user.bio, profileImage:user.profileImage, coverImage:user.coverImage, location:user.location, createdAt:user.createdAt } });
});

router.post("/become-admin", auth, rateLimit("become-admin", 8, 15 * 60 * 1000), async (req, res) => {
  const code = String(req.body.code || "").trim().toUpperCase();
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  const user = await User.findById(req.user.userId);
  // Check-and-claim in one atomic update: findOne() followed by a separate
  // save() left a gap where two simultaneous requests could both pass the
  // "is this code still unused" check before either marked it used — a
  // single-use invite could grant admin to two different people. Matching
  // on usedBy: null and setting it in the same operation closes that gap:
  // whichever request gets there first is the only one that can succeed.
  const invite = await AdminInvite.findOneAndUpdate(
    { codeHash, usedBy: null, expiresAt: { $gt: new Date() } },
    { usedBy: user._id, usedAt: new Date() },
    { new: false }
  );
  if (!invite) return res.status(400).json({ message: "That admin invite code is invalid or has expired." });
  user.role = "admin"; await user.save();
  const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: user._id, name: user.name, email: user.email, username: user.username, role: user.role, bio: user.bio, profileImage: user.profileImage, coverImage: user.coverImage, location: user.location, createdAt: user.createdAt } });
});

router.post("/forgot-password", rateLimit("forgot-password", 5, 15 * 60 * 1000), async (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const user = email && await User.findOne({ email });
  if (user) {
    const rawToken = crypto.randomBytes(32).toString("hex");
    user.passwordResetToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();
    const resetUrl = `${process.env.APP_URL || `${req.protocol}://${req.get("host")}`}/#reset-password=${rawToken}`;
    if (process.env.RESEND_API_KEY && process.env.MAIL_FROM) {
      await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: process.env.MAIL_FROM, to: [user.email], subject: "Reset your Lion Link password", html: `<p>Use this link within 30 minutes to reset your password:</p><p><a href="${resetUrl}">Reset password</a></p>` }) });
    }
    if (process.env.NODE_ENV !== "production") console.info(`Lion Link password reset for ${email}: ${resetUrl}`);
  }
  res.json({ message: "If that email belongs to a Lion Link account, a reset link has been sent." });
});

router.post("/reset-password", async (req, res) => {
  const token = String(req.body.token || ""); const password = String(req.body.password || "");
  if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
  const passwordResetToken = crypto.createHash("sha256").update(token).digest("hex");
  const user = await User.findOne({ passwordResetToken, passwordResetExpiresAt: { $gt: new Date() } });
  if (!user) return res.status(400).json({ message: "This password-reset link is invalid or has expired." });
  user.password = await bcrypt.hash(password, 10); user.passwordResetToken = ""; user.passwordResetExpiresAt = null; await user.save();
  res.json({ message: "Your password has been reset. You can now sign in." });
});


// =====================================================
// LOGIN
// =====================================================

router.post("/login", rateLimit("login", 10, 15 * 60 * 1000), async (req, res) => {
  try {
    const { email, identity, password } = req.body;

    if ((!email && !identity) || !password) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(503).json({ message: "Sign-in is temporarily unavailable. Please contact Lion Link support." });
    }

    const key = String(identity || email || "").trim().toLowerCase().replace(/^@/, "");
    const user = await User.findOne({ $or: [{ email: key }, { username: key }] });

    if (!user) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    if (typeof user.password !== "string" || !user.password) {
      return res.status(409).json({ message: "This account needs a password reset. Please contact Lion Link support." });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      return res.status(401).json({
        message: "Invalid email or password"
      });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d"
      }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        username: user.username,
        role: user.role,
        bio: user.bio,
        profileImage: user.profileImage,
        coverImage: user.coverImage,
        createdAt: user.createdAt
      }
    });

  } catch (error) {
    console.error("Login error:", error);

    res.status(503).json({
      message: "Sign-in is temporarily unavailable. Please try again shortly."
    });
  }
});


module.exports = router;

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth");
const AdminInvite = require("../models/AdminInvite");
const crypto = require("crypto");

const router = express.Router();

const issueToken = user => jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
const usernameFrom = value => String(value || "lion").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 16) || "lion";
async function uniqueGoogleUsername(name) { const base = usernameFrom(name); let username = base.length >= 3 ? base : `${base}user`; let number = 0; while (await User.exists({ username })) username = `${base.slice(0, 15)}${++number}`; return username; }


// =====================================================
// REGISTER
// =====================================================

async function register(req, res) {
  try {
    const { name, email, password, username: requestedUsername } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters"
      });
    }

    const existingUser = await User.findOne({
      email: email.toLowerCase()
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
      email: email.toLowerCase(),
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
    // The pre-check above improves the normal case, but two simultaneous
    // registrations can still race to MongoDB's unique index.
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
router.post("/register", register);
router.post("/signup", register);

// Google OAuth is enabled when GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and APP_URL are configured.
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
  } catch (error) { res.redirect(`${(process.env.APP_URL || "").replace(/\/$/, "")}/?google_error=${encodeURIComponent(error.message)}`); }
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

router.post("/become-admin", auth, async (req, res) => {
  const code = String(req.body.code || "").trim().toUpperCase();
  const codeHash = crypto.createHash("sha256").update(code).digest("hex");
  const invite = await AdminInvite.findOne({ codeHash, usedBy: null, expiresAt: { $gt: new Date() } });
  if (!invite) return res.status(400).json({ message: "That admin invite code is invalid or has expired." });
  const user = await User.findById(req.user.userId);
  user.role = "admin"; await user.save();
  invite.usedBy = user._id; invite.usedAt = new Date(); await invite.save();
  const token = jwt.sign({ userId: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { id: user._id, name: user.name, email: user.email, username: user.username, role: user.role, bio: user.bio, profileImage: user.profileImage, coverImage: user.coverImage, location: user.location, createdAt: user.createdAt } });
});

// Password recovery is always tied to the email used when the account was created.
// Configure RESEND_API_KEY and MAIL_FROM in production to deliver the reset email.
router.post("/forgot-password", async (req, res) => {
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

router.post("/login", async (req, res) => {
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

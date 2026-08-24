const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const auth = require("../middleware/auth");
const AdminInvite = require("../models/AdminInvite");
const crypto = require("crypto");

const router = express.Router();


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
        role: user.role
      }
    });

  } catch (error) {
    console.error("Register error:", error);

    res.status(500).json({
      message: "Server error"
    });
  }
}
router.post("/register", register);
router.post("/signup", register);

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
  res.json({ user: { id:user._id, name:user.name, email:user.email, username:user.username, role:user.role, bio:user.bio, profileImage:user.profileImage, coverImage:user.coverImage, location:user.location } });
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
        coverImage: user.coverImage
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

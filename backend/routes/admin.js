const crypto = require("crypto");
const router = require("express").Router();
const auth = require("../middleware/auth");
const AdminInvite = require("../models/AdminInvite");

const hash = value => crypto.createHash("sha256").update(value).digest("hex");
const adminOnly = (req, res, next) => req.user.role === "admin" ? next() : res.status(403).json({ message: "Admin access required" });

router.post("/invites", auth, adminOnly, async (req, res) => {
  const code = `LION-${crypto.randomBytes(5).toString("hex").toUpperCase()}`;
  const invite = await AdminInvite.create({ codeHash: hash(code), createdBy: req.user.userId, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
  res.status(201).json({ code, expiresAt: invite.expiresAt });
});

module.exports = { router, hash };

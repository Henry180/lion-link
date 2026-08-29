const router = require("express").Router(); const Announcement = require("../models/Announcement"); const auth = require("../middleware/auth");
router.get("/", async (_, res) => res.json({ announcements: await Announcement.find().populate("author", "name username").sort({ createdAt: -1 }).limit(50) }));
router.post("/", auth, async (req, res) => { if (req.user.role !== "admin") return res.status(403).json({ message: "Admin access required" }); const a = await Announcement.create({ title: req.body.title, body: req.body.body, media: req.body.media || [], author: req.user.userId }); res.status(201).json({ announcement: a }); });
router.delete("/:id", auth, async (req, res) => { if (req.user.role !== "admin") return res.status(403).json({ message: "Admin access required" }); await Announcement.findByIdAndDelete(req.params.id); res.status(204).end(); });
module.exports = router;

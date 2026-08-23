const router = require("express").Router();
const Event = require("../models/Event");
const auth = require("../middleware/auth");
const adminOnly = (req, res, next) => req.user.role === "admin" ? next() : res.status(403).json({ message: "Admin access required" });

router.get("/", async (_req, res) => res.json({ events: await Event.find({ startsAt: { $gte: new Date() } }).sort({ startsAt: 1 }).limit(50) }));
router.post("/", auth, adminOnly, async (req, res) => {
  const event = await Event.create({ title: req.body.title, description: req.body.description, location: req.body.location, startsAt: req.body.startsAt, author: req.user.userId });
  res.status(201).json({ event });
});
router.delete("/:id", auth, adminOnly, async (req, res) => { await Event.findByIdAndDelete(req.params.id); res.status(204).end(); });
module.exports = router;

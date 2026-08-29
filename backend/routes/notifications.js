const router = require("express").Router();
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");

router.get("/", auth, async (req, res) => {
  // This is polled regularly. Never populate a whole conversation here: it
  // contains its complete message history and may include attachment data.
  const recipient = req.user.userId;
  const [notifications, unread, unreadMessages] = await Promise.all([
    Notification.find({ recipient })
      .populate("actor", "name username")
      .populate("post", "_id")
      .populate("conversation", "_id")
      .sort({ createdAt: -1 })
      .limit(30)
      .lean(),
    Notification.countDocuments({ recipient, read: false }),
    Notification.countDocuments({ recipient, read: false, type: "message" })
  ]);
  res.json({ notifications, unread, unreadMessages });
});

router.post("/read", auth, async (req, res) => {
  await Notification.updateMany({ recipient: req.user.userId, read: false }, { read: true });
  res.status(204).end();
});

router.post("/:id/read", auth, async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, recipient: req.user.userId, read: false }, { read: true });
  res.status(204).end();
});

module.exports = router;

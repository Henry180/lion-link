const router = require("express").Router();
const Notification = require("../models/Notification");
const pulse = require("../utils/pulse");
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
  // ?bell=1 marks only the bell notifications (likes, replies, follows, quotes) as seen and
  // leaves unread direct messages alone — those clear when the chat is opened.
  const filter = { recipient: req.user.userId, read: false };
  if (req.query.bell) filter.type = { $ne: "message" };
  await Notification.updateMany(filter, { read: true });
  pulse.touch(req.user.userId, "notif");
  res.status(204).end();
});

router.post("/:id/read", auth, async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, recipient: req.user.userId, read: false }, { read: true });
  pulse.touch(req.user.userId, "notif");
  res.status(204).end();
});

module.exports = router;

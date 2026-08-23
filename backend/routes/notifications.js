const router = require("express").Router();
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");

router.get("/", auth, async (req, res) => {
  const notifications = await Notification.find({ recipient: req.user.userId })
    .populate("actor", "name username profileImage")
    .populate("post", "text")
    .populate("conversation")
    .sort({ createdAt: -1 })
    .limit(100);
  res.json({ notifications, unread: notifications.filter(item => !item.read).length, unreadMessages: notifications.filter(item => !item.read && item.type === "message").length });
});

router.post("/read", auth, async (req, res) => {
  await Notification.updateMany({ recipient: req.user.userId, read: false }, { read: true });
  res.status(204).end();
});

module.exports = router;

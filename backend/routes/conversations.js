const router = require("express").Router();
const Conversation = require("../models/Conversation");
const User = require("../models/User");
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");

const conversationFor = query => query.populate("members", "name username profileImage role").sort({ updatedAt: -1 });

router.get("/", auth, async (req, res) => {
  const conversations = await conversationFor(Conversation.find({ members: req.user.userId }));
  res.json({ conversations });
});

router.post("/", auth, async (req, res) => {
  const other = await User.findOne({ username: String(req.body.username || "").replace(/^@/, "") });
  if (!other) return res.status(404).json({ message: "User not found" });
  let conversation = await Conversation.findOne({ members: { $all: [req.user.userId, other._id], $size: 2 } });
  const created = !conversation;
  if (!conversation) conversation = await Conversation.create({ members: [req.user.userId, other._id] });
  await conversation.populate("members", "name username profileImage role");
  res.status(created ? 201 : 200).json({ conversation });
});

router.post("/:id/read", auth, async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, members: req.user.userId });
  if (!conversation) return res.status(404).json({ message: "Conversation not found" });
  const now = new Date();
  let changed = false;
  conversation.messages.forEach(message => {
    if (String(message.sender) !== String(req.user.userId) && !message.readAt) { message.readAt = now; changed = true; }
  });
  if (changed) await conversation.save();
  await Notification.updateMany({ recipient: req.user.userId, conversation: conversation._id, type: "message", read: false }, { read: true });
  res.json({ readAt: now });
});

router.post("/:id/messages", auth, async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, members: req.user.userId });
  const text = String(req.body.text || "").trim();
  const incomingMedia = req.body.media;
  const media = incomingMedia && typeof incomingMedia.url === "string" && ["image", "video", "audio"].includes(incomingMedia.type) && new RegExp(`^data:${incomingMedia.type}/`).test(incomingMedia.url) ? { url: incomingMedia.url, type: incomingMedia.type } : null;
  if (!conversation) return res.status(404).json({ message: "Conversation not found" });
  if (!text && !media) return res.status(400).json({ message: "Write a message or attach an image, video, or voice note" });
  conversation.messages.push({ sender: req.user.userId, text, media, deliveredAt: new Date() });
  await conversation.save();
  const recipient = conversation.members.find(member => String(member) !== String(req.user.userId));
  if (recipient) await Notification.create({ recipient, actor: req.user.userId, type: "message", conversation: conversation._id });
  res.status(201).json({ message: conversation.messages.at(-1) });
});
router.patch("/:id/messages/:messageId", auth, async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, members: req.user.userId });
  if (!conversation) return res.status(404).json({ message: "Conversation not found" });
  const message = conversation.messages.id(req.params.messageId);
  if (!message) return res.status(404).json({ message: "Message not found" });
  if (String(message.sender) !== String(req.user.userId)) return res.status(403).json({ message: "You can only edit your own messages" });
  if (Date.now() - new Date(message.createdAt).getTime() > 15 * 60 * 1000) return res.status(403).json({ message: "Messages can only be edited within 15 minutes" });
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ message: "Message cannot be empty" });
  message.text = text;
  message.editedAt = new Date();
  await conversation.save();
  res.json({ message });
});

router.delete("/:id/messages/:messageId", auth, async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, members: req.user.userId });
  if (!conversation) return res.status(404).json({ message: "Conversation not found" });
  const message = conversation.messages.id(req.params.messageId);
  if (!message) return res.status(404).json({ message: "Message not found" });
  if (String(message.sender) !== String(req.user.userId)) return res.status(403).json({ message: "You can only delete your own messages" });
  message.deleteOne();
  await conversation.save();
  res.status(204).end();
});
module.exports=router;

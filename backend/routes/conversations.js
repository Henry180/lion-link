const router = require("express").Router();
const Conversation = require("../models/Conversation");
const User = require("../models/User");
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");

const conversationFor = query => query.populate("members", "name username profileImage role lastActiveAt").sort({ updatedAt: -1 });

// The inbox is polled regularly, so it must never include every historical
// message (or an attachment's base64 data) for every conversation.
const inboxItem = conversation => {
  const item = conversation.toObject ? conversation.toObject() : conversation;
  const last = item.messages?.at(-1);
  return {
    _id: item._id,
    members: item.members,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lastMessage: last ? {
      _id: last._id,
      sender: last.sender,
      text: last.text,
      // A type is enough for the preview; the attachment is fetched only when
      // its conversation is opened.
      media: last.media ? { type: last.media.type } : null,
      createdAt: last.createdAt,
      readAt: last.readAt
    } : null
  };
};

router.get("/", auth, async (req, res) => {
  const conversations = await conversationFor(
    Conversation.find({ members: req.user.userId })
      .select("members messages createdAt updatedAt")
      .slice("messages", -1)
  );
  res.json({ conversations: conversations.map(inboxItem) });
});

router.post("/", auth, async (req, res) => {
  const other = await User.findOne({ username: String(req.body.username || "").replace(/^@/, "") });
  if (!other) return res.status(404).json({ message: "User not found" });
  let conversation = await Conversation.findOne({ members: { $all: [req.user.userId, other._id], $size: 2 } });
  const created = !conversation;
  if (!conversation) conversation = await Conversation.create({ members: [req.user.userId, other._id] });
  await conversation.populate("members", "name username profileImage role lastActiveAt");
  res.status(created ? 201 : 200).json({ conversation: inboxItem(conversation) });
});

// Fetch message bodies and attachment URLs only for the conversation the
// member has chosen to open.  Keeping this separate from the inbox avoids
// re-sending old media during polling.
router.get("/:id", auth, async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
  const conversation = await conversationFor(
    Conversation.findOne({ _id: req.params.id, members: req.user.userId })
      .select("members messages createdAt updatedAt")
      .slice("messages", -limit)
  );
  if (!conversation) return res.status(404).json({ message: "Conversation not found" });
  res.json({ conversation });
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

router.post("/:id/messages/:messageId/react", auth, async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, members: req.user.userId });
  if (!conversation) return res.status(404).json({ message: "Conversation not found" });
  const message = conversation.messages.id(req.params.messageId);
  if (!message) return res.status(404).json({ message: "Message not found" });
  const existing = message.reactions.some(user => String(user) === String(req.user.userId));
  message.reactions = existing ? message.reactions.filter(user => String(user) !== String(req.user.userId)) : [...message.reactions, req.user.userId];
  await conversation.save(); res.json({ reacted: !existing, reactions: message.reactions.length });
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

const router = require("express").Router();
const mongoose = require("mongoose");
const pulse = require("../utils/pulse");
const Post = require("../models/Post");
const Conversation = require("../models/Conversation");
const User = require("../models/User");
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");

// Same rules as posts.js: only a real https:// link, no characters that could
// break out of an HTML attribute if ever rendered unescaped (defense in
// depth — the frontend already escapes/validates these too, but the API
// itself should never accept something so obviously wrong).
// Returns: null (no media, which is fine), a clean {type,url} object, or
// undefined (media was present but invalid).
function cleanMessageMedia(item) {
  if (item === undefined || item === null) return null;
  const type = item.type;
  const url = typeof item.url === "string" ? item.url.trim() : "";
  if (!["image", "video", "audio"].includes(type)) return undefined;
  if (!url || url.length > 2048 || !/^https:\/\/[^\s"'<>\\()]+$/i.test(url)) return undefined;
  return { type, url };
}

const MAX_MESSAGE_LENGTH = 1000; // matches the compose box's maxlength in frontend.js

// Wraps an async route so an error (a malformed conversation id, for
// example) always gets a real response instead of the request hanging
// forever, which is what an uncaught rejection does to an Express 4 route.
const safe = handler => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(error => {
    if (error && error.name === "CastError") return res.status(404).json({ message: "Not found" });
    console.error("Route error:", error);
    res.status(500).json({ message: "Server error" });
  });

const conversationFor = query => query.populate("members", "name username profileImage role lastActiveAt").sort({ updatedAt: -1 });

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
      media: last.media ? { type: last.media.type } : null,
      createdAt: last.createdAt,
      readAt: last.readAt
    } : null
  };
};

// Messages from the other person that the viewer has not opened yet.
const unreadExpr = viewer => ({ $size: { $filter: {
  input: { $ifNull: ["$messages", []] },
  as: "m",
  cond: { $and: [ { $ne: ["$$m.sender", viewer] }, { $eq: [{ $ifNull: ["$$m.readAt", null] }, null] } ] }
} } });

// Per-conversation unread count for the inbox. The inbox itself only carries
// the last message, so this is counted separately; the frontend shows it on
// each DM and counts how many DMs have anything unread for the nav badge.
async function unreadCounts(userId) {
  const viewer = new mongoose.Types.ObjectId(String(userId));
  const rows = await Conversation.aggregate([
    { $match: { members: viewer } },
    { $project: { unread: unreadExpr(viewer) } }
  ]);
  return new Map(rows.map(row => [String(row._id), row.unread]));
}

router.get("/", auth, safe(async (req, res) => {
  const [conversations, unread] = await Promise.all([
    conversationFor(
      Conversation.find({ members: req.user.userId })
        .select("members messages createdAt updatedAt")
        .slice("messages", -1)
    ),
    unreadCounts(req.user.userId)
  ]);
  res.json({ conversations: conversations.map(conversation => ({ ...inboxItem(conversation), unreadCount: unread.get(String(conversation._id)) || 0 })) });
}));

// Tiny status check the app calls every few seconds. It answers from memory (see
// utils/pulse.js), so it costs the database nothing. It returns two change markers:
// one for messages / read ticks and one for notifications. The app reloads the inbox
// or the bell only when a marker is different from last time.
router.get("/pulse", auth, async (req, res) => {
  // First check after a restart: load the latest posts once (never fails the request).
  try { await pulse.seedRecent(Post); } catch { /* the dot is a nicety; skip it if this fails */ }
  res.set("Cache-Control", "no-store").json({ ...pulse.snapshot(req.user.userId), feed: pulse.recentPosts() });
});

router.post("/", auth, safe(async (req, res) => {
  const other = await User.findOne({ username: String(req.body.username || "").replace(/^@/, "") });
  if (!other) return res.status(404).json({ message: "User not found" });
  let conversation = await Conversation.findOne({ members: { $all: [req.user.userId, other._id] , $size: 2 } });
  const created = !conversation;
  if (!conversation) conversation = await Conversation.create({ members: [req.user.userId, other._id] });
  await conversation.populate("members", "name username profileImage role lastActiveAt");
  res.status(created ? 201 : 200).json({ conversation: inboxItem(conversation) });
}));

router.get("/:id", auth, safe(async (req, res) => {
  const requestedLimit = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 100) : 50;
  const conversation = await conversationFor(
    Conversation.findOne({ _id: req.params.id, members: req.user.userId })
      .select("members messages createdAt updatedAt")
      .slice("messages", -limit)
  );
  if (!conversation) return res.status(404).json({ message: "Conversation not found" });
  res.json({ conversation });
}));

router.post("/:id/read", auth, safe(async (req, res) => {
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
}));

router.post("/:id/messages", auth, safe(async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, members: req.user.userId });
  if (!conversation) return res.status(404).json({ message: "Conversation not found" });
  const text = String(req.body.text || "").trim();
  const media = cleanMessageMedia(req.body.media);
  if (media === undefined) return res.status(400).json({ message: "That attachment isn't valid" });
  if (text.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ message: `Messages can be at most ${MAX_MESSAGE_LENGTH} characters` });
  if (!text && !media) return res.status(400).json({ message: "Write a message or attach an image, video, or voice note" });
  conversation.messages.push({ sender: req.user.userId, text, media, deliveredAt: new Date() });
  await conversation.save();
  const recipient = conversation.members.find(member => String(member) !== String(req.user.userId));
  if (recipient) await Notification.create({ recipient, actor: req.user.userId, type: "message", conversation: conversation._id });
  res.status(201).json({ message: conversation.messages.at(-1) });
}));

router.post("/:id/messages/:messageId/react", auth, safe(async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, members: req.user.userId });
  if (!conversation) return res.status(404).json({ message: "Conversation not found" });
  const message = conversation.messages.id(req.params.messageId);
  if (!message) return res.status(404).json({ message: "Message not found" });
  const existing = message.reactions.some(user => String(user) === String(req.user.userId));
  message.reactions = existing ? message.reactions.filter(user => String(user) !== String(req.user.userId)) : [...message.reactions, req.user.userId];
  await conversation.save(); res.json({ reacted: !existing, reactions: message.reactions.length });
}));

router.patch("/:id/messages/:messageId", auth, safe(async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, members: req.user.userId });
  if (!conversation) return res.status(404).json({ message: "Conversation not found" });
  const message = conversation.messages.id(req.params.messageId);
  if (!message) return res.status(404).json({ message: "Message not found" });
  if (String(message.sender) !== String(req.user.userId)) return res.status(403).json({ message: "You can only edit your own messages" });
  if (Date.now() - new Date(message.createdAt).getTime() > 15 * 60 * 1000) return res.status(403).json({ message: "Messages can only be edited within 15 minutes" });
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ message: "Message cannot be empty" });
  if (text.length > MAX_MESSAGE_LENGTH) return res.status(400).json({ message: `Messages can be at most ${MAX_MESSAGE_LENGTH} characters` });
  message.text = text;
  message.editedAt = new Date();
  await conversation.save();
  res.json({ message });
}));

router.delete("/:id/messages/:messageId", auth, safe(async (req, res) => {
  const conversation = await Conversation.findOne({ _id: req.params.id, members: req.user.userId });
  if (!conversation) return res.status(404).json({ message: "Conversation not found" });
  const message = conversation.messages.id(req.params.messageId);
  if (!message) return res.status(404).json({ message: "Message not found" });
  if (String(message.sender) !== String(req.user.userId)) return res.status(403).json({ message: "You can only delete your own messages" });
  message.deleteOne();
  await conversation.save();
  res.status(204).end();
}));
module.exports=router;

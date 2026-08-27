const router = require("express").Router();
const Group = require("../models/Group");
const User = require("../models/User");
const auth = require("../middleware/auth");

// Roles travel with every group author/member so verified admin badges can be
// rendered anywhere a group message or member is shown.
const populate = query => query.populate("owner", "name username profileImage role").populate("members", "name username profileImage role").populate("messages.sender", "name username profileImage role");
const present = (group, userId) => {
  const item = group.toObject ? group.toObject() : group;
  item.memberCount = item.members?.length || 0;
  item.isMember = (item.members || []).some(member => String(member._id || member) === String(userId));
  item.isOwner = String(item.owner?._id || item.owner) === String(userId);
  return item;
};

router.get("/", auth, async (req, res) => {
  const visibility = req.user.role === "admin" ? {} : { $or: [{ approved: true }, { approved: { $exists: false } }, { owner: req.user.userId }, { members: req.user.userId }] };
  const groups = await populate(Group.find(visibility).sort({ createdAt: -1 }));
  res.json({ groups: groups.map(group => present(group, req.user.userId)) });
});

router.patch("/:id/approve", auth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
  const group = await Group.findByIdAndUpdate(req.params.id, { approved: true }, { new: true });
  if (!group) return res.status(404).json({ message: "Group not found" });
  await populate(group); res.json({ group: present(group, req.user.userId) });
});

router.post("/", auth, async (req, res) => {
  const name = String(req.body.name || "").trim();
  const description = String(req.body.description || "").trim();
  if (!name || !description) return res.status(400).json({ message: "A group name and description are required" });
  const group = await Group.create({ name, description, coverImage: String(req.body.coverImage || ""), privacy: req.body.privacy === "private" ? "private" : "public", owner: req.user.userId, members: [req.user.userId] });
  await populate(group);
  res.status(201).json({ group: present(group, req.user.userId) });
});

router.get("/:id", auth, async (req, res) => {
  const group = await populate(Group.findById(req.params.id));
  if (!group) return res.status(404).json({ message: "Group not found" });
  res.json({ group: present(group, req.user.userId) });
});

router.post("/:id/join", auth, async (req, res) => {
  const group = await populate(Group.findByIdAndUpdate(req.params.id, { $addToSet: { members: req.user.userId } }, { new: true }));
  if (!group) return res.status(404).json({ message: "Group not found" });
  res.json({ group: present(group, req.user.userId) });
});

router.get("/:id/suggestions", auth, async (req, res) => {
  const group = await Group.findById(req.params.id).select("owner members");
  if (!group) return res.status(404).json({ message: "Group not found" });
  if (String(group.owner) !== String(req.user.userId)) return res.status(403).json({ message: "Only the group owner can add members" });
  const users = await User.find({ _id: { $nin: group.members } }).select("name username profileImage").sort({ createdAt: -1 }).limit(12);
  res.json({ users });
});

router.post("/:id/members", auth, async (req, res) => {
  const username = String(req.body.username || "").trim().toLowerCase().replace(/^@/, "");
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: "Group not found" });
  if (String(group.owner) !== String(req.user.userId)) return res.status(403).json({ message: "Only the group owner can add members" });
  const user = await User.findOne({ username });
  if (!user) return res.status(404).json({ message: "Member not found" });
  if (!group.members.some(member => String(member) === String(user._id))) group.members.push(user._id);
  await group.save(); await populate(group);
  res.json({ group: present(group, req.user.userId) });
});

router.post("/:id/messages", auth, async (req, res) => {
  const text = String(req.body.text || "").trim();
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: "Group not found" });
  if (!group.members.some(member => String(member) === String(req.user.userId))) return res.status(403).json({ message: "Join this group before posting" });
  if (!text) return res.status(400).json({ message: "Message cannot be empty" });
  group.messages.push({ sender: req.user.userId, text }); await group.save(); await group.populate("messages.sender", "name username profileImage");
  res.status(201).json({ message: group.messages.at(-1) });
});

router.post("/:id/messages/:messageId/react", auth, async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: "Group not found" });
  if (!group.members.some(member => String(member) === String(req.user.userId))) return res.status(403).json({ message: "Join this group before reacting" });
  const message = group.messages.id(req.params.messageId);
  if (!message) return res.status(404).json({ message: "Message not found" });
  const existing = message.reactions.some(user => String(user) === String(req.user.userId));
  message.reactions = existing ? message.reactions.filter(user => String(user) !== String(req.user.userId)) : [...message.reactions, req.user.userId];
  await group.save(); res.json({ reacted: !existing, reactions: message.reactions.length });
});

router.post("/:id/leave", auth, async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: "Group not found" });
  if (String(group.owner) === String(req.user.userId)) return res.status(400).json({ message: "The group owner cannot leave. Transfer ownership or delete the group instead." });
  group.members = group.members.filter(member => String(member) !== String(req.user.userId));
  await group.save();
  await populate(group);
  res.json({ group: present(group, req.user.userId) });
});

router.delete("/:id", auth, async (req, res) => {
  const group = await Group.findById(req.params.id);
  if (!group) return res.status(404).json({ message: "Group not found" });
  if (String(group.owner) !== String(req.user.userId) && req.user.role !== "admin") return res.status(403).json({ message: "Only the group owner or an admin can delete this group" });
  await group.deleteOne(); res.status(204).end();
});
module.exports = router;

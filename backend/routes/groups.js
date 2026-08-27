const router = require("express").Router();
const Group = require("../models/Group");
const auth = require("../middleware/auth");

const populate = query => query.populate("owner", "name username profileImage").populate("members", "name username profileImage");
const present = (group, userId) => {
  const item = group.toObject ? group.toObject() : group;
  item.memberCount = item.members?.length || 0;
  item.isMember = (item.members || []).some(member => String(member._id || member) === String(userId));
  item.isOwner = String(item.owner?._id || item.owner) === String(userId);
  return item;
};

router.get("/", auth, async (req, res) => {
  const groups = await populate(Group.find().sort({ createdAt: -1 }));
  res.json({ groups: groups.map(group => present(group, req.user.userId)) });
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
  if (String(group.owner) !== String(req.user.userId)) return res.status(403).json({ message: "Only the group owner can delete this group" });
  await group.deleteOne(); res.status(204).end();
});
module.exports = router;

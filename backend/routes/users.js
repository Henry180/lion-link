const router = require("express").Router();
const User = require("../models/User");
const auth = require("../middleware/auth");
const Notification = require("../models/Notification");

const publicUser = user => ({ id: user._id, name: user.name, username: user.username, bio: user.bio, profileImage: user.profileImage, coverImage: user.coverImage, followers: user.followers?.length || 0, following: user.following?.length || 0, createdAt: user.createdAt });

router.get("/suggestions/all", auth, async (req, res) => {
  const users = await User.find({ _id: { $ne: req.user.userId } }).select("name username bio profileImage followers following createdAt").sort({ createdAt: -1 });
  res.json({ users: users.map(publicUser) });
});

router.get("/search/:query", auth, async (req, res) => {
  const query = String(req.params.query || "").trim();
  if (!query) return res.json({ users: [] });
  const users = await User.find({ _id: { $ne: req.user.userId }, $or: [{ name: new RegExp(query, "i") }, { username: new RegExp(query.replace(/^@/, ""), "i") }] }).select("name username bio profileImage followers following createdAt").limit(20);
  res.json({ users: users.map(publicUser) });
});

const followersList = async (req, res) => {
  const username = String(req.params.username).toLowerCase().replace(/^@/, "");
  const list = req.path.endsWith("/followers") ? "followers" : "following";
  const user = await User.findOne({ username }).populate(list, "name username bio profileImage");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ users: user[list].map(publicUser), list });
};
router.get("/:username/followers", auth, followersList);
router.get("/:username/following", auth, followersList);

router.get("/:username", auth, async (req, res) => {
  const username = String(req.params.username).toLowerCase().replace(/^@/, "");
  const [user, viewer] = await Promise.all([
    User.findOne({ username }).select("name username bio profileImage coverImage followers following createdAt"),
    User.findById(req.user.userId).select("following")
  ]);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user: { ...publicUser(user), isFollowing: viewer?.following.some(id => id.equals(user._id)) || false } });
});

router.post("/:username/follow", auth, async (req, res) => {
  const username = String(req.params.username).toLowerCase().replace(/^@/, "");
  const target = await User.findOne({ username });
  const actor = await User.findById(req.user.userId);
  if (!target) return res.status(404).json({ message: "User not found" });
  if (target._id.equals(actor._id)) return res.status(400).json({ message: "You cannot follow yourself" });
  const alreadyFollowing = actor.following.some(id => id.equals(target._id));
  actor.following = alreadyFollowing ? actor.following.filter(id => !id.equals(target._id)) : [...actor.following, target._id];
  target.followers = alreadyFollowing ? target.followers.filter(id => !id.equals(actor._id)) : [...target.followers, actor._id];
  await Promise.all([actor.save(), target.save()]);
  if (!alreadyFollowing) await Notification.create({ recipient: target._id, actor: actor._id, type: "follow" });
  res.json({ following: !alreadyFollowing, followers: target.followers.length });
});

module.exports = router;

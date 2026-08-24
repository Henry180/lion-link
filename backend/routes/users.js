const router = require("express").Router();
const User = require("../models/User");
const auth = require("../middleware/auth");
const Notification = require("../models/Notification");

const publicUser = (user, viewerFollowing = null) => ({ id: user._id, name: user.name, username: user.username, bio: user.bio, profileImage: user.profileImage, coverImage: user.coverImage, location: user.location, followers: user.followers?.length || 0, following: user.following?.length || 0, createdAt: user.createdAt, ...(viewerFollowing ? { isFollowing: viewerFollowing.has(String(user._id)) } : {}) });

router.get("/suggestions/all", auth, async (req, res) => {
  const [users, viewer] = await Promise.all([
    User.find({ _id: { $ne: req.user.userId } }).select("name username bio profileImage followers following createdAt").sort({ createdAt: -1 }),
    User.findById(req.user.userId).select("following")
  ]);
  const viewerFollowing = new Set((viewer?.following || []).map(String));
  res.json({ users: users.map(user => publicUser(user, viewerFollowing)) });
});

router.get("/search/:query", auth, async (req, res) => {
  const query = String(req.params.query || "").trim();
  if (!query) return res.json({ users: [] });
  const [users, viewer] = await Promise.all([
    User.find({ _id: { $ne: req.user.userId }, $or: [{ name: new RegExp(query, "i") }, { username: new RegExp(query.replace(/^@/, ""), "i") }] }).select("name username bio profileImage followers following createdAt").limit(20),
    User.findById(req.user.userId).select("following")
  ]);
  const viewerFollowing = new Set((viewer?.following || []).map(String));
  res.json({ users: users.map(user => publicUser(user, viewerFollowing)) });
});

const followersList = async (req, res) => {
  const username = String(req.params.username).toLowerCase().replace(/^@/, "");
  const list = req.path.endsWith("/followers") ? "followers" : "following";
  const [user, viewer] = await Promise.all([User.findOne({ username }).populate(list, "name username bio profileImage"), User.findById(req.user.userId).select("following")]);
  if (!user) return res.status(404).json({ message: "User not found" });
  const viewerFollowing = new Set((viewer?.following || []).map(String));
  res.json({ users: user[list].map(item => publicUser(item, viewerFollowing)), list });
};
router.get("/:username/followers", auth, followersList);
router.get("/:username/following", auth, followersList);

router.get("/:username", auth, async (req, res) => {
  const username = String(req.params.username).toLowerCase().replace(/^@/, "");
  const [user, viewer] = await Promise.all([
    User.findOne({ username }).select("name username bio profileImage coverImage location followers following createdAt"),
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
  // POST /follow is deliberately idempotent: repeated taps must never create
  // duplicate follows or unexpectedly undo an existing follow.
  actor.following = alreadyFollowing ? actor.following : [...actor.following, target._id];
  target.followers = alreadyFollowing ? target.followers : [...target.followers, actor._id];
  await Promise.all([actor.save(), target.save()]);
  if (!alreadyFollowing) await Notification.create({ recipient: target._id, actor: actor._id, type: "follow" });
  res.json({ following: true, followers: target.followers.length, followingCount: actor.following.length });
});

module.exports = router;

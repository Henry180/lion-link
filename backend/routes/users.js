const router = require("express").Router();
const User = require("../models/User");
const auth = require("../middleware/auth");
const Notification = require("../models/Notification");
const Post = require("../models/Post");

// User-typed search text must never be handed to RegExp as-is: characters like
// ( * + ? are regex syntax, so a crafted search could crash the query or, worse,
// make MongoDB spin on a catastrophic pattern (ReDoS) and stall the server.
const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ACTIVE_WINDOW_MS = 2 * 60 * 1000;
const publicUser = (user, viewerFollowing = null) => {
  const lastActiveAt = user.lastActiveAt || null;
  return {
    id: user._id, name: user.name, username: user.username, role: user.role,
    bio: user.bio, profileImage: user.profileImage, coverImage: user.coverImage,
    location: user.location, followers: user.followers?.length || 0,
    following: user.following?.length || 0, createdAt: user.createdAt, lastActiveAt,
    // Presence is intentionally short-lived: a previously active account is
    // never labelled "Active now" after the member leaves the app.
    isActiveNow: Boolean(lastActiveAt && Date.now() - new Date(lastActiveAt).getTime() < ACTIVE_WINDOW_MS),
    ...(viewerFollowing ? { isFollowing: viewerFollowing.has(String(user._id)) } : {})
  };
};

router.get("/suggestions/all", auth, async (req, res) => {
  const [users, viewer] = await Promise.all([
    User.find({ _id: { $ne: req.user.userId } }).select("name username role bio profileImage followers following createdAt lastActiveAt").sort({ createdAt: -1 }).limit(30),
    User.findById(req.user.userId).select("following")
  ]);
  const viewerFollowing = new Set((viewer?.following || []).map(String));
  res.json({ users: users.map(user => publicUser(user, viewerFollowing)) });
});

router.get("/search/:query", auth, async (req, res) => {
  const query = String(req.params.query || "").trim().slice(0, 50);
  if (!query) return res.json({ users: [] });
  const safeQuery = escapeRegex(query);
  const [users, viewer] = await Promise.all([
    User.find({ _id: { $ne: req.user.userId }, $or: [{ name: new RegExp(safeQuery, "i") }, { username: new RegExp(escapeRegex(query.replace(/^@/, "")), "i") }] }).select("name username role bio profileImage followers following createdAt lastActiveAt").limit(20),
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

// =====================================================
// PUBLIC PROFILE PREVIEW (no login required)
// =====================================================
// GET /:username below requires auth and also carries follow-relationship
// data that shouldn't be handed to an anonymous caller. This route exists
// purely for the Cloudflare Pages Function at functions/profile/[username].js
// (and anything else that needs a profile's basic public info without a
// signed-in session) — it deliberately returns only the small, safe subset
// of fields a meta tag/link preview actually needs.
router.get("/:username/preview", async (req, res) => {
  const username = String(req.params.username).toLowerCase().replace(/^@/, "");
  const user = await User.findOne({ username }).select("name username bio profileImage");
  if (!user) return res.status(404).json({ message: "User not found" });
  res.set("Cache-Control", "public, max-age=60").json({
    user: {
      name: user.name,
      username: user.username,
      bio: user.bio,
      // A handful of early accounts still have their photo stored as a raw
      // base64 data: URI from before uploads went through R2 (see
      // uploadToR2 in frontend.js). Link-preview bots (WhatsApp, Twitter,
      // iMessage, etc.) don't support data: URIs for og:image at all, so
      // sending one doesn't just bloat the page — it silently breaks the
      // preview. Omitting it here is safer than sending a broken image;
      // once that user re-saves their photo through Edit Profile, it'll
      // go through uploadToR2() and become a real URL automatically.
      profileImage: user.profileImage?.startsWith("data:") ? null : user.profileImage
    }
  });
});

// =====================================================
// EVERYTHING A PERSON HAS COMMENTED (profile "Replies" tab)
// =====================================================
// Comments live inside posts, so the feed the browser already has only holds
// a slice of them. This asks the database directly for the person's comments
// across all posts, newest first, along with a little context about the post
// each one was made on.
router.get("/:username/replies", auth, async (req, res) => {
  try {
    const username = String(req.params.username).toLowerCase().replace(/^@/, "");
    const user = await User.findOne({ username }).select("_id name username profileImage role");
    if (!user) return res.status(404).json({ message: "User not found" });

    const rows = await Post.aggregate([
      { $match: { "comments.author": user._id } },
      { $project: { text: 1, author: 1, comments: { $filter: { input: "$comments", as: "c", cond: { $eq: ["$$c.author", user._id] } } } } },
      { $unwind: "$comments" },
      { $sort: { "comments.createdAt": -1 } },
      { $limit: 50 },
      { $lookup: { from: User.collection.name, localField: "author", foreignField: "_id", as: "postAuthor" } },
      { $project: {
          postId: "$_id",
          postText: { $substrCP: [{ $ifNull: ["$text", ""] }, 0, 140] },
          postAuthor: { $let: { vars: { a: { $arrayElemAt: ["$postAuthor", 0] } }, in: { name: "$$a.name", username: "$$a.username" } } },
          comment: { _id: "$comments._id", text: "$comments.text", createdAt: "$comments.createdAt", replyTo: "$comments.replyTo" }
      } }
    ]);

    res.json({
      user: { name: user.name, username: user.username, profileImage: user.profileImage, role: user.role },
      replies: rows.map(row => ({ postId: row.postId, postText: row.postText, postAuthor: row.postAuthor, comment: row.comment }))
    });
  } catch (error) {
    console.error("Get replies error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.get("/:username", auth, async (req, res) => {
  const username = String(req.params.username).toLowerCase().replace(/^@/, "");
  const [user, viewer] = await Promise.all([
    User.findOne({ username }).select("name username role bio profileImage coverImage location followers following createdAt lastActiveAt"),
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
  // The follow control is a toggle: a second tap unfollows the account.
  actor.following = alreadyFollowing ? actor.following.filter(id => !id.equals(target._id)) : [...actor.following, target._id];
  target.followers = alreadyFollowing ? target.followers.filter(id => !id.equals(actor._id)) : [...target.followers, actor._id];
  await Promise.all([actor.save(), target.save()]);
  if (!alreadyFollowing) await Notification.create({ recipient: target._id, actor: actor._id, type: "follow" });
  res.json({ following: !alreadyFollowing, followers: target.followers.length, followingCount: actor.following.length });
});

module.exports = router;

const express = require("express");
const Post = require("../models/Post");
const User = require("../models/User");
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");

const router = express.Router();


// =====================================================
// CREATE POST
// =====================================================

router.post("/", auth, async (req, res) => {
  try {
    const { text, media } = req.body;

    if (!text?.trim() && (!media || media.length === 0)) {
      return res.status(400).json({
        message: "Post cannot be empty"
      });
    }

    // A slow connection must never turn repeated taps into duplicate posts.
    const normalizedText = text?.trim() || "";
    const recentDuplicate = await Post.findOne({
      author: req.user.userId,
      text: normalizedText,
      createdAt: { $gte: new Date(Date.now() - 30 * 1000) }
    }).populate("author", "name username profileImage");
    if (recentDuplicate) return res.status(200).json({ message: "This post was already published", post: recentDuplicate, duplicate: true });

    const post = await Post.create({
      author: req.user.userId,
      text: normalizedText,
      media: media || []
    });

    const populatedPost = await Post.findById(post._id)
    .populate("author", "name username profileImage role");

    res.status(201).json({
      message: "Post created successfully",
      post: populatedPost
    });

  } catch (error) {
    console.error("Create post error:", error);

    res.status(500).json({
      message: "Server error"
    });
  }
});


// =====================================================
// GET FEED
// =====================================================

router.get("/", async (req, res) => {
  try {
    // An unbounded feed grows forever and re-sends old media on every reload.
    // Clients can request a modest page; cap it server-side to protect Render
    // bandwidth even if a client sends an excessive value.
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 20;
    const posts = await Post.find()
      // reports and impressionUsers are internal bookkeeping — reports in
      // particular names who reported a post and why, and has no business
      // being sent to every visitor of the public feed. Excluding both also
      // trims the payload on every single feed load.
      .select("-reports -impressionUsers")
      // Only the most recent 20 comments ship with the feed. A quiet post is
      // unaffected; a post with thousands of comments during a busy moment
      // no longer costs 100x more than an ordinary post to load for every
      // single viewer. Nothing is deleted — this only limits what the feed
      // response carries. The one visible side effect: the comment-count
      // button on a post with more than 20 comments will show 20 rather
      // than the true total, since the frontend counts what it received.
      .select({ comments: { $slice: -20 } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate("author", "name username profileImage role")
      .populate("comments.author", "name username profileImage role")
      .lean();

    // A short browser cache prevents repeat refreshes from immediately
    // consuming backend egress while keeping the feed reasonably fresh.
    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60").json({
      posts
    });

  } catch (error) {
    console.error("Get posts error:", error);

    res.status(500).json({
      message: "Server error"
    });
  }
});


// =====================================================
// LIKE POST
// =====================================================

router.post("/:id/like", auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Read-modify-write on the whole document let concurrent likes on a
    // popular post silently overwrite each other (a real lost like), and
    // forced MongoDB to rewrite every embedded comment on every single
    // like. $addToSet / $pull apply atomically at the database level, so
    // concurrent likes can no longer collide, and the write only touches
    // the likes field rather than resaving the entire post.
    const current = await Post.findById(req.params.id).select("likes author");
    if (!current) {
      return res.status(404).json({
        message: "Post not found"
      });
    }

    const alreadyLiked = current.likes.some(id => id.toString() === userId);

    const updated = await Post.findByIdAndUpdate(
      req.params.id,
      alreadyLiked ? { $pull: { likes: userId } } : { $addToSet: { likes: userId } },
      { new: true }
    ).select("likes author");

    if (!alreadyLiked && updated.author.toString() !== userId) {
      await Notification.create({ recipient: updated.author, actor: userId, type: "like", post: updated._id });
    }

    res.json({
      message: "Post liked",
      likes: updated.likes.length,
      liked: !alreadyLiked
    });

  } catch (error) {
    console.error("Like post error:", error);

    res.status(500).json({
      message: "Server error"
    });
  }
});

router.patch("/:id", auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });
  if (post.author.toString() !== req.user.userId) return res.status(403).json({ message: "You can only edit your own posts" });
  if (Date.now() - post.createdAt.getTime() > 30 * 60 * 1000) return res.status(403).json({ message: "Posts can only be edited within 30 minutes" });
  post.text = String(req.body.text || "").trim();
  await post.save();
  res.json({ post });
});

router.post("/:id/impression", auth, async (req, res) => {
  const post = await Post.findById(req.params.id).select("impressions impressionUsers");
  if (!post) return res.status(404).json({ message: "Post not found" });
  if (!post.impressionUsers.some(id => id.toString() === req.user.userId)) {
    post.impressionUsers.push(req.user.userId);
    post.impressions += 1;
    await post.save();
  }
  res.json({ impressions: post.impressions });
});

router.post("/:id/report", auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });
  if (post.author.toString() === req.user.userId) return res.status(400).json({ message: "You cannot report your own post" });
  if (post.reports.some(report => report.reporter?.toString() === req.user.userId)) return res.status(409).json({ message: "You have already reported this post" });
  post.reports.push({ reporter: req.user.userId, reason: String(req.body.reason || "").trim() });
  await post.save();
  res.status(201).json({ message: "Report submitted for admin review" });
});

router.get("/reports", auth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
  const posts = await Post.find({ "reports.0": { $exists: true } }).populate("author", "name username").populate("reports.reporter", "name username").sort({ updatedAt: -1 });
  res.json({ posts });
});

// One-time (and safely re-runnable) fix-up, triggered from the admin panel
// instead of Render's Shell — Shell requires a paid plan this account can't
// upgrade to right now. Recalculates commentsCount for every post from its
// real comment count, fixing posts created before that field existed.
router.post("/admin/backfill-comment-counts", auth, async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
  try {
    const result = await Post.updateMany(
      {},
      [{ $set: { commentsCount: { $size: { $ifNull: ["$comments", []] } } } }]
    );
    res.json({ message: `Updated ${result.modifiedCount} of ${result.matchedCount} posts.` });
  } catch (error) {
    console.error("Backfill comment counts error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/:id/comments", auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  const text = String(req.body.text || "").trim();
  if (!post) return res.status(404).json({ message: "Post not found" });
  if (!text) return res.status(400).json({ message: "Reply cannot be empty" });
  post.comments.push({ author: req.user.userId, text, replyTo: req.body.replyTo || null });
  await post.save();
  if (post.author.toString() !== req.user.userId) await Notification.create({ recipient: post.author, actor: req.user.userId, type: "comment", post: post._id, commentId: post.comments.at(-1)._id.toString() });
  res.status(201).json({ comment: post.comments.at(-1) });
});

// Comments and replies can be edited for 15 minutes by their author.
router.patch("/:id/comments/:commentId", auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });
  const comment = post.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: "Comment not found" });
  if (comment.author.toString() !== req.user.userId) return res.status(403).json({ message: "You can only edit your own comments" });
  if (!comment.createdAt || Date.now() - comment.createdAt.getTime() > 15 * 60 * 1000) return res.status(403).json({ message: "Comments can only be edited within 15 minutes" });
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ message: "Comment cannot be empty" });
  comment.text = text;
  await post.save();
  res.json({ comment });
});

// LIKE OR UNLIKE A COMMENT
router.post("/:id/comments/:commentId/like", auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });
  const comment = post.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: "Comment not found" });
  const userId = req.user.userId;
  const existing = comment.likes.some(id => id.toString() === userId);
  comment.likes = existing ? comment.likes.filter(id => id.toString() !== userId) : [...comment.likes, userId];
  await post.save();
  res.json({ liked: !existing, likes: comment.likes.length });
});

router.delete("/:id/comments/:commentId", auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });
  const comment = post.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: "Reply not found" });
  if (comment.author.toString() !== req.user.userId) return res.status(403).json({ message: "Not permitted" });
  comment.deleteOne(); await post.save(); res.status(204).end();
});


// =====================================================
// DELETE POST
// =====================================================

router.delete("/:id", auth, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        message: "Post not found"
      });
    }

    // Only the person who created the post can delete it
    if (post.author.toString() !== req.user.userId && req.user.role !== "admin") {
      return res.status(403).json({
        message: "You cannot delete this post"
      });
    }

    await post.deleteOne();

    res.json({
      message: "Post deleted successfully"
    });

  } catch (error) {
    console.error("Delete post error:", error);

    res.status(500).json({
      message: "Server error"
    });
  }
});


module.exports = router;

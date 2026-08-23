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
      .populate("author", "name username profileImage");

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
    const posts = await Post.find()
      .populate("author", "name username profileImage")
      .populate("comments.author", "name username profileImage")
      .sort({ createdAt: -1 });

    res.json({
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
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        message: "Post not found"
      });
    }

    const userId = req.user.userId;
    const existing = post.likes.find(id => id.toString() === userId);
    post.likes = existing ? post.likes.filter(id => id.toString() !== userId) : [...post.likes, userId];

    await post.save();
    if (!existing && post.author.toString() !== userId) await Notification.create({ recipient: post.author, actor: userId, type: "like", post: post._id });

    res.json({
      message: "Post liked",
      likes: post.likes.length,
      liked: !existing
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

router.post("/:id/impression", async (req, res) => {
  const post = await Post.findByIdAndUpdate(req.params.id, { $inc: { impressions: 1 } }, { new: true }).select("impressions");
  if (!post) return res.status(404).json({ message: "Post not found" });
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

router.post("/:id/comments", auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  const text = String(req.body.text || "").trim();
  if (!post) return res.status(404).json({ message: "Post not found" });
  if (!text) return res.status(400).json({ message: "Reply cannot be empty" });
  post.comments.push({ author: req.user.userId, text, replyTo: req.body.replyTo || null });
  await post.save();
  if (post.author.toString() !== req.user.userId) await Notification.create({ recipient: post.author, actor: req.user.userId, type: "comment", post: post._id });
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

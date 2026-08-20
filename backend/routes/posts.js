const express = require("express");
const Post = require("../models/Post");
const User = require("../models/User");
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

    const post = await Post.create({
      author: req.user.userId,
      text: text?.trim() || "",
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
  post.text = String(req.body.text || "").trim();
  await post.save();
  res.json({ post });
});

router.post("/:id/comments", auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  const text = String(req.body.text || "").trim();
  if (!post) return res.status(404).json({ message: "Post not found" });
  if (!text) return res.status(400).json({ message: "Reply cannot be empty" });
  post.comments.push({ author: req.user.userId, text, replyTo: req.body.replyTo || null });
  await post.save();
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
    if (post.author.toString() !== req.user.userId) {
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

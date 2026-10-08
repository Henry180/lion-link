const express = require("express");
const Post = require("../models/Post");
const User = require("../models/User");
const Notification = require("../models/Notification");
const auth = require("../middleware/auth");
const pulse = require("../utils/pulse");

const router = express.Router();

// =====================================================
// INPUT LIMITS + VALIDATION
// =====================================================
// The browser enforces these limits (maxlength etc.), but anyone can call the
// API directly and skip the browser entirely, so the server has to enforce
// them too.
const MAX_POST_LENGTH = 280;
// A quoted post is shown inside the post that quotes it: just the parts needed for that card.
const QUOTED_POST_POPULATE = { path: "quotedPost", select: "text media author createdAt", populate: { path: "author", select: "name username profileImage role" } };
const MAX_COMMENT_LENGTH = 280;
const MAX_MEDIA_ITEMS = 8;
const ALLOWED_MEDIA_TYPES = new Set(["image", "video", "audio"]);

// Returns a cleaned [{type, url}] list, or null if anything looks wrong.
// URLs must be plain https links with no quotes, spaces, brackets or
// backslashes: the feed builds HTML like <img src="URL">, so a URL such as
//   x" onerror="stealTheLoginToken()
// would otherwise run script in every visitor's browser (stored XSS).
function cleanMedia(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list) || list.length > MAX_MEDIA_ITEMS) return null;
  const cleaned = [];
  for (const item of list) {
    const type = item && item.type;
    const url = item && typeof item.url === "string" ? item.url.trim() : "";
    if (!ALLOWED_MEDIA_TYPES.has(type)) return null;
    if (!url || url.length > 2048 || !/^https:\/\/[^\s"'<>\\()]+$/i.test(url)) return null;
    cleaned.push({ type, url });
  }
  return cleaned;
}

// Wraps an async route so an unexpected error (for example a malformed id)
// gets a proper JSON response instead of leaving the request hanging forever,
// which is what happens to an uncaught error inside an async Express 4 handler.
const safe = handler => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(error => {
    if (error && error.name === "CastError") return res.status(404).json({ message: "Not found" });
    console.error("Route error:", error);
    res.status(500).json({ message: "Server error" });
  });


// =====================================================
// CREATE POST
// =====================================================

router.post("/", auth, async (req, res) => {
  try {
    const { text, media } = req.body;
    const normalizedText = typeof text === "string" ? text.trim() : "";
    const cleanedMedia = cleanMedia(media);

    if (cleanedMedia === null) {
      return res.status(400).json({ message: "One of the attached photos or videos is not valid" });
    }
    if (normalizedText.length > MAX_POST_LENGTH) {
      return res.status(400).json({ message: `Posts can be at most ${MAX_POST_LENGTH} characters` });
    }
    if (!normalizedText && cleanedMedia.length === 0 && !req.body.quotedPostId) {
      return res.status(400).json({
        message: "Post cannot be empty"
      });
    }

    // Optional: quote another post, or continue one of your own posts as a thread.
    let quotedPost = null;
    if (req.body.quotedPostId) {
      try { quotedPost = await Post.findById(req.body.quotedPostId).select("author"); } catch { quotedPost = null; }
      if (!quotedPost) return res.status(404).json({ message: "The post you are quoting is no longer available" });
    }
    let threadRoot = null;
    if (req.body.threadRoot) {
      let anchor = null;
      try { anchor = await Post.findById(req.body.threadRoot).select("author threadRoot"); } catch { anchor = null; }
      if (!anchor) return res.status(404).json({ message: "That thread is no longer available" });
      if (anchor.author.toString() !== req.user.userId) return res.status(403).json({ message: "You can only add to your own thread" });
      threadRoot = anchor.threadRoot || anchor._id;
    }

    // A slow connection must never turn repeated taps into duplicate posts.
    const recentDuplicate = await Post.findOne({
      author: req.user.userId,
      text: normalizedText,
      createdAt: { $gte: new Date(Date.now() - 30 * 1000) }
    }).populate("author", "name username profileImage");
    if (recentDuplicate) return res.status(200).json({ message: "This post was already published", post: recentDuplicate, duplicate: true });

    const post = await Post.create({
      author: req.user.userId,
      text: normalizedText,
      media: cleanedMedia,
      quotedPost: quotedPost ? quotedPost._id : null,
      threadRoot
    });
    pulse.noteNewPost(post); // powers the green "new posts" dot on other people's Home icon

    if (threadRoot) await Post.updateOne({ _id: threadRoot }, { $inc: { threadCount: 1 } });
    // Tell the author of a quoted post (never fails the post itself).
    if (quotedPost && quotedPost.author.toString() !== req.user.userId) {
      try { await Notification.create({ recipient: quotedPost.author, actor: req.user.userId, type: "quote", post: post._id }); }
      catch (error) { console.error("Quote notification error:", error.message); }
    }

    const populatedPost = await Post.findById(post._id)
    .populate("author", "name username profileImage role")
    .populate(QUOTED_POST_POPULATE);

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
      .populate(QUOTED_POST_POPULATE)
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

    // One like notification per person per post: liking, unliking and liking again must not
    // notify the author every time. (Never lets a notification problem fail the like itself.)
    if (!alreadyLiked && updated.author.toString() !== userId) {
      try {
        const alreadyNotified = await Notification.exists({ recipient: updated.author, actor: userId, type: "like", post: updated._id, commentId: { $in: ["", null] } });
        if (!alreadyNotified) await Notification.create({ recipient: updated.author, actor: userId, type: "like", post: updated._id });
      } catch (error) { console.error("Like notification error:", error.message); }
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

router.patch("/:id", auth, safe(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });
  if (post.author.toString() !== req.user.userId) return res.status(403).json({ message: "You can only edit your own posts" });
  if (Date.now() - post.createdAt.getTime() > 30 * 60 * 1000) return res.status(403).json({ message: "Posts can only be edited within 30 minutes" });
  const editedText = String(req.body.text || "").trim();
  if (editedText.length > MAX_POST_LENGTH) return res.status(400).json({ message: `Posts can be at most ${MAX_POST_LENGTH} characters` });
  post.text = editedText;
  await post.save();
  res.json({ post });
}));

router.post("/:id/impression", auth, safe(async (req, res) => {
  const post = await Post.findById(req.params.id).select("impressions impressionUsers");
  if (!post) return res.status(404).json({ message: "Post not found" });
  if (!post.impressionUsers.some(id => id.toString() === req.user.userId)) {
    post.impressionUsers.push(req.user.userId);
    post.impressions += 1;
    await post.save();
  }
  res.json({ impressions: post.impressions });
}));

router.post("/:id/report", auth, safe(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });
  if (post.author.toString() === req.user.userId) return res.status(400).json({ message: "You cannot report your own post" });
  if (post.reports.some(report => report.reporter?.toString() === req.user.userId)) return res.status(409).json({ message: "You have already reported this post" });
  post.reports.push({ reporter: req.user.userId, reason: String(req.body.reason || "").trim() });
  await post.save();
  res.status(201).json({ message: "Report submitted for admin review" });
}));

router.get("/reports", auth, safe(async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
  const posts = await Post.find({ "reports.0": { $exists: true } }).populate("author", "name username").populate("reports.reporter", "name username").sort({ updatedAt: -1 });
  res.json({ posts });
}));

// One-time (and safely re-runnable) fix-up, triggered from the admin panel
// instead of Render's Shell — Shell requires a paid plan this account can't
// upgrade to right now. Recalculates commentsCount for every post from its
// real comment count, fixing posts created before that field existed.
router.post("/admin/backfill-comment-counts", auth, safe(async (req, res) => {
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
}));

router.post("/:id/comments", auth, safe(async (req, res) => {
  const post = await Post.findById(req.params.id);
  const text = String(req.body.text || "").trim();
  if (!post) return res.status(404).json({ message: "Post not found" });
  if (!text) return res.status(400).json({ message: "Reply cannot be empty" });
  if (text.length > MAX_COMMENT_LENGTH) return res.status(400).json({ message: `Replies can be at most ${MAX_COMMENT_LENGTH} characters` });
  // replyTo must point at a real comment on this same post, never arbitrary text.
  let replyTo = null;
  if (req.body.replyTo) { try { if (post.comments.id(req.body.replyTo)) replyTo = req.body.replyTo; } catch { replyTo = null; } }
  post.comments.push({ author: req.user.userId, text, replyTo });
  post.commentsCount = post.comments.length; // the true total, not just the page the feed loads
  await post.save();
  if (post.author.toString() !== req.user.userId) await Notification.create({ recipient: post.author, actor: req.user.userId, type: "comment", post: post._id, commentId: post.comments.at(-1)._id.toString() });
  res.status(201).json({ comment: post.comments.at(-1) });
}));

// Comments and replies can be edited for 15 minutes by their author.
router.patch("/:id/comments/:commentId", auth, safe(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });
  const comment = post.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: "Comment not found" });
  if (comment.author.toString() !== req.user.userId) return res.status(403).json({ message: "You can only edit your own comments" });
  if (!comment.createdAt || Date.now() - comment.createdAt.getTime() > 15 * 60 * 1000) return res.status(403).json({ message: "Comments can only be edited within 15 minutes" });
  const text = String(req.body.text || "").trim();
  if (!text) return res.status(400).json({ message: "Comment cannot be empty" });
  if (text.length > MAX_COMMENT_LENGTH) return res.status(400).json({ message: `Comments can be at most ${MAX_COMMENT_LENGTH} characters` });
  comment.text = text;
  await post.save();
  res.json({ comment });
}));

// LIKE OR UNLIKE A COMMENT
router.post("/:id/comments/:commentId/like", auth, safe(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });
  const comment = post.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: "Comment not found" });
  const userId = req.user.userId;
  const existing = comment.likes.some(id => id.toString() === userId);
  comment.likes = existing ? comment.likes.filter(id => id.toString() !== userId) : [...comment.likes, userId];
  await post.save();
  if (!existing && comment.author.toString() !== userId) {
    try {
      const commentId = String(comment._id);
      const alreadyNotified = await Notification.exists({ recipient: comment.author, actor: userId, type: "like", post: post._id, commentId });
      if (!alreadyNotified) await Notification.create({ recipient: comment.author, actor: userId, type: "like", post: post._id, commentId });
    } catch (error) { console.error("Comment like notification error:", error.message); }
  }
  res.json({ liked: !existing, likes: comment.likes.length });
}));

router.delete("/:id/comments/:commentId", auth, safe(async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ message: "Post not found" });
  const comment = post.comments.id(req.params.commentId);
  if (!comment) return res.status(404).json({ message: "Reply not found" });
  if (comment.author.toString() !== req.user.userId) return res.status(403).json({ message: "Not permitted" });
  comment.deleteOne(); post.commentsCount = post.comments.length; await post.save(); res.status(204).end();
}));


// =====================================================
// GET SINGLE POST
// =====================================================
// Used for direct/shared post links (frontend route /post/:id) and by the
// Cloudflare Pages Functions that build per-post preview metadata for
// search engines and link-preview bots. No auth required, matching the
// public feed above — a shared post link should open the same way the
// feed already does for anyone who already has the app open.
// All the posts in a thread, oldest first. Works from any post in the thread.
router.get("/thread/:id", safe(async (req, res) => {
  const anchor = await Post.findById(req.params.id).select("threadRoot").lean();
  if (!anchor) return res.status(404).json({ message: "Post not found" });
  const root = anchor.threadRoot || anchor._id;
  const posts = await Post.find({ $or: [{ _id: root }, { threadRoot: root }] })
    .select("-reports -impressionUsers -comments")
    .sort({ createdAt: 1 })
    .populate("author", "name username profileImage role")
    .populate(QUOTED_POST_POPULATE)
    .lean();
  res.set("Cache-Control", "no-store").json({ posts, rootId: String(root) });
}));

router.get("/:id", async (req, res) => {
  try {
    // ?comments=20 returns only the newest 20 comments (older ones load on demand), so opening a
    // popular post stays fast. Without it, every comment is returned as before.
    const newest = Math.min(Number.parseInt(req.query.comments, 10) || 0, 200);
    let query = Post.findById(req.params.id).select("-reports -impressionUsers");
    if (newest > 0) query = query.select({ comments: { $slice: -newest } });
    const post = await query
      .populate("author", "name username profileImage role")
      .populate("comments.author", "name username profileImage role")
      .populate(QUOTED_POST_POPULATE)
      .lean();

    if (!post) {
      return res.status(404).json({ message: "Post not found" });
    }

    res.set("Cache-Control", "public, max-age=30, stale-while-revalidate=60").json({ post });

  } catch (error) {
    // An invalid/malformed id (e.g. a bot probing random paths) throws a
    // Mongoose CastError rather than a real "not found" — treat it the
    // same way instead of surfacing a 500 for what is really a 404.
    if (error.name === "CastError") {
      return res.status(404).json({ message: "Post not found" });
    }
    console.error("Get post error:", error);
    res.status(500).json({
      message: "Server error"
    });
  }
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

const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    text: {
      type: String,
      maxlength: 280,
      trim: true
    },

    media: [
      {
        url: String,
        type: {
          type: String,
          enum: ["image", "video"]
        }
      }
    ],

    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    impressions: { type: Number, default: 0, min: 0 },
    impressionUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    reports: [{ reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, reason: { type: String, trim: true, maxlength: 280 }, createdAt: { type: Date, default: Date.now } }],
    comments: [{ author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, text: { type: String, trim: true, maxlength: 280, required: true }, replyTo: { type: mongoose.Schema.Types.ObjectId, default: null }, likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], createdAt: { type: Date, default: Date.now } }],
    // Kept in sync by the comment create/delete routes rather than computed
    // from comments.length on every read. This lets the feed send only a
    // page of comments per post while still reporting the true total.
    commentsCount: { type: Number, default: 0, min: 0 }
  },
  {
    timestamps: true
  }
);

// The feed is normally read newest-first; this lets MongoDB serve that order
// directly instead of scanning and sorting the entire collection.
postSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Post", postSchema);

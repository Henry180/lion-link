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
    comments: [{ author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, text: { type: String, trim: true, maxlength: 280, required: true }, replyTo: { type: mongoose.Schema.Types.ObjectId, default: null }, likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], createdAt: { type: Date, default: Date.now } }]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Post", postSchema);

const mongoose = require("mongoose");

module.exports = mongoose.model("Notification", new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["like", "comment", "follow", "message"], required: true },
  post: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
  commentId: { type: String, default: "" },
  read: { type: Boolean, default: false }
}, { timestamps: true }));

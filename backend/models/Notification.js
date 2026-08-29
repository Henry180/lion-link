const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["like", "comment", "follow", "message"], required: true },
  post: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation" },
  commentId: { type: String, default: "" },
  read: { type: Boolean, default: false }
}, { timestamps: true });

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, read: 1, type: 1 });

module.exports = mongoose.model("Notification", notificationSchema);

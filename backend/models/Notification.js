const mongoose = require("mongoose");
const pulse = require("../utils/pulse");

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
// Notifications are only useful for a while. Without an expiry every like, comment,
// follow and message adds a document forever, which is the main way a free Atlas
// database fills up. MongoDB removes these automatically after 60 days.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 60 });

// A new like / comment / follow changes the bell badge. (Message notifications have
// their own DM badge, so they don't count here.)
notificationSchema.post("save", doc => { if (doc.type !== "message") pulse.touch(doc.recipient, "notif"); });

module.exports = mongoose.model("Notification", notificationSchema);

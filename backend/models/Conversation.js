const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  text: { type: String, maxlength: 300, default: "" },
  media: { url: String, type: { type: String, enum: ["image", "video", "audio"] } },
  deliveredAt: { type: Date, default: Date.now },
  readAt: { type: Date, default: null },
  editedAt: { type: Date, default: null },
  reactions: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  createdAt: { type: Date, default: Date.now }
}, { _id: true });

const pulse = require("../utils/pulse");

const conversationSchema = new mongoose.Schema({
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  messages: [messageSchema]
}, { timestamps: true });

// Every inbox / unread check looks conversations up by member.
conversationSchema.index({ members: 1 });

// Creating a chat, sending, reading, reacting, editing and deleting all save the
// conversation. Tell the people in it that something changed (see utils/pulse.js).
conversationSchema.post("save", doc => pulse.touch(doc.members, "chat"));

module.exports = mongoose.model("Conversation", conversationSchema);

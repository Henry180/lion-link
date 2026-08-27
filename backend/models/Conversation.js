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

module.exports = mongoose.model("Conversation", new mongoose.Schema({
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  messages: [messageSchema]
}, { timestamps: true }));

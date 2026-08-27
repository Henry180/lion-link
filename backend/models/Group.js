const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  coverImage: { type: String, default: "" },
  privacy: { type: String, enum: ["public", "private"], default: "public" },
  approved: { type: Boolean, default: false },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  messages: [{
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, trim: true, maxlength: 1000, required: true },
    createdAt: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

groupSchema.index({ name: 1 });
module.exports = mongoose.model("Group", groupSchema);

const mongoose = require("mongoose");

module.exports = mongoose.model("AdminInvite", new mongoose.Schema({
  codeHash: { type: String, required: true, unique: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, required: true },
  usedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  usedAt: { type: Date, default: null }
}, { timestamps: true }));

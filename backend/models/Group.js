const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  coverImage: { type: String, default: "" },
  privacy: { type: String, enum: ["public", "private"], default: "public" },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
}, { timestamps: true });

groupSchema.index({ name: 1 });
module.exports = mongoose.model("Group", groupSchema);

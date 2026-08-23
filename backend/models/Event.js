const mongoose = require("mongoose");

module.exports = mongoose.model("Event", new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500, default: "" },
  location: { type: String, trim: true, maxlength: 120, default: "UNN Campus" },
  startsAt: { type: Date, required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true }));

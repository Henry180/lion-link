const mongoose = require("mongoose");
module.exports = mongoose.model("Announcement", new mongoose.Schema({ title: { type: String, required: true, maxlength: 80 }, body: { type: String, required: true, maxlength: 240 }, media: [{ url:String, type:{type:String,enum:["image","video"]} }], author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true } }, { timestamps: true }));

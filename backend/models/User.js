const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 30
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    password: {
      type: String,
      required: false,
      minlength: 6
    },

    googleSubject: { type: String, unique: true, sparse: true },
    lastActiveAt: { type: Date, default: Date.now },

    username: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
    },

    bio: {
      type: String,
      maxlength: 160,
      default: ""
    },

    profileImage: {
      type: String,
      default: ""
    },

    coverImage: {
      type: String,
      default: ""
    },

    passwordResetToken: { type: String, default: "" },
    passwordResetExpiresAt: { type: Date, default: null },

    location: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "University of Nigeria, Nsukka"
    },

    role: {
      type: String,
      enum: ["student", "admin"],
      default: "student"
    },

    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ],

    following: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      }
    ]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("User", userSchema);

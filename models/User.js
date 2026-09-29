const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: true,
    },

    googleAccessToken: {
      type: String,
      default: null,
    },

    googleRefreshToken: {
      type: String,
      default: null,
    },
    googleId: {
  type: String,
  default: null,
},
    googleTokenExpiry: {
      type: Number,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");

const User = require("../models/User");

const router = express.Router();

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID
);

router.post("/google", async (req, res) => {
  try {
    const { credential } = req.body;

    // Check Google credential
    if (!credential) {
      return res.status(400).json({
        message: "Google credential is required.",
      });
    }

    // Check required server configuration
    if (!process.env.GOOGLE_CLIENT_ID) {
      console.error("GOOGLE_CLIENT_ID is not configured.");

      return res.status(500).json({
        message: "Google authentication is not configured.",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not configured.");

      return res.status(500).json({
        message: "Authentication service is not configured.",
      });
    }

    // Verify Google ID token
    let ticket;

    try {
      ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch (error) {
      console.error("Google ID token verification failed:", error);

      return res.status(401).json({
        message: "Invalid or expired Google credential.",
      });
    }

    const payload = ticket.getPayload();

    if (!payload) {
      return res.status(401).json({
        message: "Invalid Google credential.",
      });
    }

    const {
      sub,
      email,
      name,
      email_verified,
    } = payload;

    // Validate Google account information
    if (!sub) {
      return res.status(401).json({
        message: "Google account information is incomplete.",
      });
    }

    if (!email || !email_verified) {
      return res.status(401).json({
        message: "Google email could not be verified.",
      });
    }

    // Normalize Google email
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail) {
      return res.status(401).json({
        message: "Google email could not be verified.",
      });
    }

    // Find existing account
    let user = await User.findOne({
      email: normalizedEmail,
    });

    // Create new Google account
    if (!user) {
      user = await User.create({
        name: name?.trim() || "MeetAware User",
        email: normalizedEmail,

        /*
          Google-only users do not use password login.
          A random value is stored because the User model
          currently requires a password field.
        */
        password: crypto
          .randomBytes(32)
          .toString("hex"),

        googleId: sub,
      });
    } else {
      /*
        Existing email account.

        If the user originally registered with email/password,
        connect the Google account to the same MeetAware account.
      */
      if (!user.googleId) {
        user.googleId = sub;
        await user.save();
      } else if (user.googleId !== sub) {
        /*
          The email belongs to an account already linked
          with a different Google account.
        */
        return res.status(409).json({
          message:
            "This email is already linked to another Google account.",
        });
      }
    }

    // Create MeetAware JWT
    const token = jwt.sign(
      {
        userId: user._id,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    return res.status(200).json({
      message: "Google sign-in successful.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Google sign-in error:", error);

    return res.status(500).json({
      message: "Unable to sign in with Google right now.",
    });
  }
});

module.exports = router;
const express = require("express");
const { google } = require("googleapis");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();

const MEET_SCOPE =
  "https://www.googleapis.com/auth/meetings.space.readonly";

// Production fallback.
// Render's GOOGLE_REDIRECT_URI will be used if it exists.
const GOOGLE_REDIRECT_URI =
  "https://meetaware-backend.onrender.com/api/google/callback";

const createOAuthClient = () => {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
};

// Start Google OAuth
router.get("/auth", (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Login to MeetAware first.",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        message: "Login to MeetAware first.",
      });
    }

    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (
        error.name === "JsonWebTokenError" ||
        error.name === "TokenExpiredError"
      ) {
        return res.status(401).json({
          message: "Your session has expired. Please login again.",
        });
      }

      throw error;
    }

    if (!decoded.userId) {
      return res.status(401).json({
        message: "Invalid authentication token.",
      });
    }

    // State connects Google OAuth callback
    // with the currently logged-in MeetAware user.
    const state = jwt.sign(
      {
        userId: decoded.userId,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "10m",
      }
    );

    const oauth2Client = createOAuthClient();

    // Generate Google OAuth authorization URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [MEET_SCOPE],
      state,

      // Explicitly include redirect URI
      redirect_uri: GOOGLE_REDIRECT_URI,
    });

    console.log("Google OAuth redirect URI:", GOOGLE_REDIRECT_URI);

    return res.status(200).json({
      authUrl,
    });
  } catch (error) {
    console.error("Google auth start error:", error);

    return res.status(500).json({
      message: "Unable to start Google authentication.",
    });
  }
});

// Google OAuth callback
router.get("/callback", async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.status(400).send(
        "Missing Google authorization information."
      );
    }

    let decoded;

    try {
      decoded = jwt.verify(state, process.env.JWT_SECRET);
    } catch (error) {
      console.error("Invalid Google OAuth state:", error);

      return res.status(401).send(
        "Google authorization session expired. Please return to MeetAware and try again."
      );
    }

    if (!decoded.userId) {
      return res.status(401).send(
        "Invalid Google authorization session."
      );
    }

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).send(
        "MeetAware user not found."
      );
    }

    const oauth2Client = createOAuthClient();

    // Exchange authorization code for Google tokens
    const { tokens } = await oauth2Client.getToken({
      code,
      redirect_uri: GOOGLE_REDIRECT_URI,
    });

    if (!tokens.access_token) {
      return res.status(400).send(
        "Google did not provide an access token."
      );
    }

    user.googleAccessToken = tokens.access_token;

    /*
      Google may not return a refresh token every time.
      Keep the existing refresh token if one is not returned.
    */
    if (tokens.refresh_token) {
      user.googleRefreshToken = tokens.refresh_token;
    }

    user.googleTokenExpiry =
      tokens.expiry_date || null;

    await user.save();

    console.log(
      `Google Meet account connected for user: ${user._id}`
    );

    /*
      After successful Google authentication,
      redirect the user back to the deployed frontend.
    */
    const frontendUrl =
      process.env.FRONTEND_URL ||
      "https://meet-aware-frontend.vercel.app";

    return res.redirect(
      `${frontendUrl}/dashboard?google=connected`
    );
  } catch (error) {
    console.error("Google callback error:", error);

    return res.status(500).send(
      "Google authentication failed. Please return to MeetAware and try again."
    );
  }
});

module.exports = router;
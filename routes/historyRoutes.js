const express = require("express");
const jwt = require("jsonwebtoken");
const Meeting = require("../models/Meeting");

const router = express.Router();

// =====================================================
// GET MEETING HISTORY
// =====================================================

router.get("/history", async (req, res) => {
  try {
    // -------------------------------------------------
    // Check authorization header
    // -------------------------------------------------

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        message: "Authentication required.",
      });
    }

    const token = authHeader.split(" ")[1];

    // -------------------------------------------------
    // Verify JWT
    // -------------------------------------------------

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    if (!decoded.userId) {
      return res.status(401).json({
        message: "Invalid authentication token.",
      });
    }

    // -------------------------------------------------
    // Find meetings belonging to logged-in user
    // -------------------------------------------------

    const meetings = await Meeting.find({
      userId: decoded.userId,
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .select(
        "meetingCode conferenceName meetingLink startTime endTime participants transcript statistics createdAt updatedAt"
      );

    // -------------------------------------------------
    // Send clean response
    // -------------------------------------------------

    const history = meetings.map((meeting) => ({
      id: meeting._id,
      meetingCode: meeting.meetingCode,
      conferenceName:
        meeting.conferenceName || "Google Meet Session",
      meetingLink: meeting.meetingLink,

      startTime: meeting.startTime,
      endTime: meeting.endTime,

      participantCount:
        meeting.participants?.length || 0,

      transcriptCount:
        meeting.transcript?.length || 0,

      statistics: meeting.statistics || {},

      createdAt: meeting.createdAt,
      updatedAt: meeting.updatedAt,
    }));

    return res.status(200).json({
      success: true,
      meetings: history,
    });
  } catch (error) {
    console.error(
      "Meeting history error:",
      error
    );

    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError"
    ) {
      return res.status(401).json({
        message: "Your session has expired. Please login again.",
      });
    }

    return res.status(500).json({
      message: "Unable to fetch meeting history.",
    });
  }
});

module.exports = router;
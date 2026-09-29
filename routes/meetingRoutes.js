const express = require("express");
const { google } = require("googleapis");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const User = require("../models/User");
const Meeting = require("../models/Meeting");

const router = express.Router();


// ======================================================
// Extract meeting code from Google Meet URL
// ======================================================

function extractMeetingCode(meetingLink) {
  try {
    const url = new URL(meetingLink);

    if (url.hostname !== "meet.google.com") {
      return null;
    }

    const parts = url.pathname
      .split("/")
      .filter(Boolean);

    if (parts.length !== 1) {
      return null;
    }

    return parts[0];

  } catch (error) {
    return null;
  }
}


// ======================================================
// Get all pages from Google Meet API
// ======================================================

async function getAllPages(
  apiFunction,
  params,
  resultKey
) {
  let results = [];
  let pageToken = undefined;

  do {
    const response = await apiFunction({
      ...params,
      pageSize: 100,
      pageToken,
    });

    results = results.concat(
      response.data[resultKey] || []
    );

    pageToken =
      response.data.nextPageToken;

  } while (pageToken);

  return results;
}


// ======================================================
// GET SAVED MEETING BY ID
// ======================================================

router.get(
  "/:meetingId",
  async (req, res,next) => {
    if (req.params.meetingId === "history") {
  return next();
}
    try {
      // -----------------------------------------
      // 1. Check JWT
      // -----------------------------------------

      const authHeader =
        req.headers.authorization;

      if (
        !authHeader ||
        !authHeader.startsWith("Bearer ")
      ) {
        return res.status(401).json({
          message:
            "Please login to MeetAware first",
        });
      }

      const token =
        authHeader.split(" ")[1];

      const decoded =
        jwt.verify(
          token,
          process.env.JWT_SECRET
        );

      // -----------------------------------------
      // 2. Validate meeting ID
      // -----------------------------------------

      const { meetingId } =
        req.params;

      if (
        !mongoose.Types.ObjectId.isValid(
          meetingId
        )
      ) {
        return res.status(400).json({
          message:
            "Invalid meeting ID.",
        });
      }

      // -----------------------------------------
      // 3. Find user
      // -----------------------------------------

      const user =
        await User.findById(
          decoded.userId
        );

      if (!user) {
        return res.status(404).json({
          message:
            "MeetAware user not found",
        });
      }

      // -----------------------------------------
      // 4. Find meeting belonging to user
      // -----------------------------------------

      const savedMeeting =
        await Meeting.findOne({
          _id: meetingId,
          userId: user._id,
        });

      if (!savedMeeting) {
        return res.status(404).json({
          message:
            "Saved meeting not found.",
        });
      }

      // -----------------------------------------
      // 5. Return saved meeting
      // -----------------------------------------

      console.log(
        "Restoring saved meeting:",
        savedMeeting._id
      );

      console.log(
        "Participants:",
        savedMeeting.participants?.length || 0
      );

      console.log(
        "Transcript entries:",
        savedMeeting.transcript?.length || 0
      );

      return res.status(200).json({
        message:
          "Meeting restored successfully",

        meeting: {
          id:
            savedMeeting._id,

          meetingCode:
            savedMeeting.meetingCode,

          conferenceName:
            savedMeeting.conferenceName,

          meetingLink:
            savedMeeting.meetingLink,

          startTime:
            savedMeeting.startTime,

          endTime:
            savedMeeting.endTime,

          aiAnalysis:
            savedMeeting.aiAnalysis || null,
        },

        participants:
          savedMeeting.participants || [],

        transcript:
          savedMeeting.transcript || [],

        statistics:
          savedMeeting.statistics || {},
      });

    } catch (error) {
      console.error(
        "================================"
      );

      console.error(
        "RESTORE MEETING ERROR"
      );

      console.error(
        error.message || error
      );

      console.error(
        "================================"
      );

      if (
        error.name ===
        "JsonWebTokenError"
      ) {
        return res.status(401).json({
          message:
            "Invalid or expired session.",
        });
      }

      return res.status(500).json({
        message:
          "Unable to restore meeting.",
        error:
          error.message,
      });
    }
  }
);


// ======================================================
// ANALYZE / FETCH GOOGLE MEET
// ======================================================

router.post(
  "/analyze",
  async (req, res) => {

    try {

      // -----------------------------------------
      // 1. Check MeetAware JWT
      // -----------------------------------------

      const authHeader =
        req.headers.authorization;

      if (
        !authHeader ||
        !authHeader.startsWith("Bearer ")
      ) {
        return res.status(401).json({
          message:
            "Please login to MeetAware first",
        });
      }

      const token =
        authHeader.split(" ")[1];

      const decoded =
        jwt.verify(
          token,
          process.env.JWT_SECRET
        );


      // -----------------------------------------
      // 2. Find MeetAware user
      // -----------------------------------------

      const user =
        await User.findById(
          decoded.userId
        );

      if (!user) {
        return res.status(404).json({
          message:
            "MeetAware user not found",
        });
      }


      // -----------------------------------------
      // 3. Check Google connection
      // -----------------------------------------

      if (!user.googleAccessToken) {
        return res.status(400).json({
          message:
            "Please connect your Google account first.",
        });
      }


      // -----------------------------------------
      // 4. Get meeting link
      // -----------------------------------------

      const { meetingLink } =
        req.body;

      if (!meetingLink) {
        return res.status(400).json({
          message:
            "Google Meet link is required",
        });
      }


      // -----------------------------------------
      // 5. Extract meeting code
      // -----------------------------------------

      const meetingCode =
        extractMeetingCode(
          meetingLink
        );

      if (!meetingCode) {
        return res.status(400).json({
          message:
            "Invalid Google Meet link. Example: https://meet.google.com/abc-defg-hij",
        });
      }


      // -----------------------------------------
      // 6. Find existing MeetAware meeting
      // -----------------------------------------

      const existingMeeting =
        await Meeting.findOne({
          userId: user._id,
          meetingCode,
        });


      console.log(
        "================================"
      );

      console.log(
        "EXISTING MEETING CHECK"
      );

      console.log(
        "Meeting code:",
        meetingCode
      );

      console.log(
        "Existing meeting:",
        existingMeeting
          ? "YES"
          : "NO"
      );

      console.log(
        "Existing transcript entries:",
        existingMeeting?.transcript?.length || 0
      );

      console.log(
        "Existing AI analysis:",
        existingMeeting?.aiAnalysis
          ? "YES"
          : "NO"
      );

      console.log(
        "================================"
      );


      // -----------------------------------------
      // 7. Create Google OAuth client
      // -----------------------------------------

      const auth =
        new google.auth.OAuth2(
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_CLIENT_SECRET,
          process.env.GOOGLE_REDIRECT_URI
        );

      auth.setCredentials({
        access_token:
          user.googleAccessToken,

        refresh_token:
          user.googleRefreshToken,

        expiry_date:
          user.googleTokenExpiry,
      });


      // -----------------------------------------
      // 8. Create Google Meet API client
      // -----------------------------------------

      const meet =
        google.meet({
          version: "v2",
          auth,
        });


      // -----------------------------------------
      // 9. Find conferences
      // -----------------------------------------

      const conferenceResponse =
        await meet.conferenceRecords.list({
          filter:
            `space.meeting_code = "${meetingCode}"`,
          pageSize: 100,
        });


      const conferences =
        conferenceResponse.data
          .conferenceRecords || [];


      console.log(
        "================================"
      );

      console.log(
        "GOOGLE MEET CONFERENCES"
      );

      console.log(
        JSON.stringify(
          conferences,
          null,
          2
        )
      );

      console.log(
        "Conference count:",
        conferences.length
      );

      console.log(
        "================================"
      );


      if (conferences.length === 0) {

        return res.status(404).json({
          message:
            "No conference found for this Meet link. Make sure the meeting happened and your connected Google account has access to it.",
        });

      }


      // -----------------------------------------
      // 10. Select most recent conference
      // -----------------------------------------

      const conference =
        conferences
          .slice()
          .sort((a, b) => {

            return (
              new Date(
                b.startTime || 0
              ) -
              new Date(
                a.startTime || 0
              )
            );

          })[0];


      const conferenceName =
        conference.name;


      console.log(
        "Selected conference:",
        conferenceName
      );

      console.log(
        "Conference start:",
        conference.startTime
      );

      console.log(
        "Conference end:",
        conference.endTime
      );


      // -----------------------------------------
      // 11. Get participants
      // -----------------------------------------

      const participants =
        await getAllPages(
          (params) =>
            meet.conferenceRecords
              .participants
              .list(params),

          {
            parent:
              conferenceName,
          },

          "participants"
        );


      // -----------------------------------------
      // 12. Debug participant response
      // -----------------------------------------

      console.log(
        "================================"
      );

      console.log(
        "GOOGLE MEET PARTICIPANTS"
      );

      console.log(
        JSON.stringify(
          participants,
          null,
          2
        )
      );

      console.log(
        "Participant count:",
        participants.length
      );

      console.log(
        "================================"
      );


      // -----------------------------------------
      // 13. Create participant map
      // -----------------------------------------

      const participantMap = {};


      participants.forEach(
        (participant) => {

          let displayName =
            "Unknown Participant";


          if (
            participant.signedinUser
          ) {

            displayName =
              participant
                .signedinUser
                .displayName ||
              "Unknown Participant";

          } else if (
            participant.anonymousUser
          ) {

            displayName =
              participant
                .anonymousUser
                .displayName ||
              "Anonymous Participant";

          } else if (
            participant.phoneUser
          ) {

            displayName =
              participant
                .phoneUser
                .displayName ||
              "Phone Participant";

          }


          if (participant.name) {

            participantMap[
              participant.name
            ] = displayName;

          }

        }
      );


      console.log(
        "Participant map:",
        participantMap
      );


      // -----------------------------------------
      // 14. Get Google Meet transcripts
      // -----------------------------------------

      const transcripts =
        await getAllPages(
          (params) =>
            meet.conferenceRecords
              .transcripts
              .list(params),

          {
            parent:
              conferenceName,
          },

          "transcripts"
        );


      console.log(
        "Google Meet transcripts:",
        transcripts.length
      );


      // -----------------------------------------
      // 15. Get transcript entries
      // -----------------------------------------

      let transcriptEntries = [];


      for (
        const transcript
        of transcripts
      ) {

        const entries =
          await getAllPages(
            (params) =>
              meet.conferenceRecords
                .transcripts
                .entries
                .list(params),

            {
              parent:
                transcript.name,
            },

            "transcriptEntries"
          );


        transcriptEntries =
          transcriptEntries.concat(
            entries
          );

      }


      console.log(
        "Google Meet transcript entries:",
        transcriptEntries.length
      );


      // =====================================================
      // DEBUG: Check transcript participant IDs
      // =====================================================

      console.log(
        "================================"
      );

      console.log(
        "TRANSCRIPT PARTICIPANT IDs"
      );

      transcriptEntries.forEach(
        (entry, index) => {

          console.log(
            index,
            "participant:",
            entry.participant,
            "| text:",
            entry.text
          );

        }
      );

      console.log(
        "================================"
      );


      // -----------------------------------------
      // 16. Format Google transcript
      // -----------------------------------------

      const formattedTranscript =
        transcriptEntries.map(
          (entry) => {

            return {

              speaker:
                participantMap[
                  entry.participant
                ] ||
                "Unknown Speaker",

              participant:
                entry.participant ||
                null,

              text:
                entry.text ||
                "",

              languageCode:
                entry.languageCode ||
                null,

              startTime:
                entry.startTime ||
                null,

              endTime:
                entry.endTime ||
                null,
            };

          }
        );


      // =====================================================
      // 17. Preserve existing Gemini transcript
      // =====================================================

      let finalTranscript = [];


      if (
        formattedTranscript.length > 0
      ) {

        finalTranscript =
          formattedTranscript;

        console.log(
          "Using Google Meet transcript."
        );

      } else if (
        existingMeeting?.transcript &&
        existingMeeting.transcript.length > 0
      ) {

        finalTranscript =
          existingMeeting.transcript;

        console.log(
          "Google Meet returned no transcript."
        );

        console.log(
          "Preserving existing MeetAware transcript:",
          finalTranscript.length,
          "entries"
        );

      } else {

        finalTranscript = [];

        console.log(
          "No transcript available."
        );

      }


      // -----------------------------------------
      // 18. Format participants
      // -----------------------------------------

      const formattedParticipants =
        participants.map(
          (participant) => {

            let name =
              "Unknown Participant";

            let type =
              "unknown";


            if (
              participant.signedinUser
            ) {

              name =
                participant
                  .signedinUser
                  .displayName ||
                "Unknown Participant";

              type =
                "signed-in";

            } else if (
              participant.anonymousUser
            ) {

              name =
                participant
                  .anonymousUser
                  .displayName ||
                "Anonymous Participant";

              type =
                "anonymous";

            } else if (
              participant.phoneUser
            ) {

              name =
                participant
                  .phoneUser
                  .displayName ||
                "Phone Participant";

              type =
                "phone";

            }


            return {

              id:
                participant.name ||
                null,

              name,

              type,

              joinedAt:
                participant
                  .earliestStartTime ||
                null,

              leftAt:
                participant
                  .latestEndTime ||
                null,

            };

          }
        );


      // =====================================================
      // 19. Prepare meeting data
      // =====================================================

      const meetingData = {

        userId:
          user._id,

        meetingCode,

        conferenceName,

        meetingLink,

        startTime:
          conference.startTime ||
          null,

        endTime:
          conference.endTime ||
          null,

        participants:
          formattedParticipants,

        transcript:
          finalTranscript,

        statistics: {

          participantCount:
            formattedParticipants.length,

          transcriptCount:
            transcripts.length,

          transcriptEntryCount:
            finalTranscript.length,

        },

      };


      // =====================================================
      // 20. Save meeting
      // =====================================================

      const savedMeeting =
        await Meeting.findOneAndUpdate(

          {
            userId:
              user._id,

            meetingCode,
          },

          {
            $set:
              meetingData,
          },

          {
            returnDocument:
              "after",

            upsert:
              true,

            setDefaultsOnInsert:
              true,
          }

        );


      console.log(
        "================================"
      );

      console.log(
        "MEETING SAVED TO MONGODB"
      );

      console.log(
        "Meeting ID:",
        savedMeeting._id
      );

      console.log(
        "Participants saved:",
        savedMeeting.participants.length
      );

      console.log(
        "Transcript entries saved:",
        savedMeeting.transcript.length
      );

      console.log(
        "AI analysis preserved:",
        savedMeeting.aiAnalysis
          ? "YES"
          : "NO"
      );

      console.log(
        "================================"
      );


      // -----------------------------------------
      // 21. Send response
      // -----------------------------------------

      return res.status(200).json({

        message:
          "Meeting data retrieved and saved successfully",

        meeting: {

          id:
            savedMeeting._id,

          meetingCode:
            savedMeeting.meetingCode,

          conferenceName:
            savedMeeting.conferenceName,

          meetingLink:
            savedMeeting.meetingLink,

          startTime:
            savedMeeting.startTime,

          endTime:
            savedMeeting.endTime,

          aiAnalysis:
            savedMeeting.aiAnalysis || null,

        },

        participants:
          savedMeeting.participants,

        transcript:
          savedMeeting.transcript,

        statistics:
          savedMeeting.statistics,

      });


    } catch (error) {

      console.error(
        "================================"
      );

      console.error(
        "MEETING ANALYSIS ERROR"
      );

      console.error(
        error.response?.data ||
        error.message ||
        error
      );

      console.error(
        "================================"
      );


      return res.status(500).json({

        message:
          "Unable to analyze the meeting",

        error:
          error.response?.data
            ?.error
            ?.message ||
          error.message,

      });

    }

  }
);


module.exports = router;
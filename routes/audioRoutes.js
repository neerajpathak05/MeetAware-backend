const express = require("express");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");

const { GoogleGenAI } = require("@google/genai");

const User = require("../models/User");
const Meeting = require("../models/Meeting");

const router = express.Router();

// -----------------------------------------
// Upload folder
// -----------------------------------------

const uploadDir = path.join(__dirname, "../uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// -----------------------------------------
// Multer
// -----------------------------------------

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();

    const filename = `meeting-${Date.now()}${extension}`;

    cb(null, filename);
  },
});

const allowedMimeTypes = [
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "video/webm",
];

const upload = multer({
  storage,

  limits: {
    fileSize: 100 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb(
        new Error(
          "Unsupported audio format. Please record using a supported browser audio format."
        )
      );
    }

    cb(null, true);
  },
});

// -----------------------------------------
// Gemini
// -----------------------------------------

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// -----------------------------------------
// Upload + Transcribe
// -----------------------------------------

router.post(
  "/:meetingId/audio",
  upload.single("audio"),

  async (req, res) => {
    let uploadedFilePath = null;

    try {
      // -----------------------------------------
      // 1. Check MeetAware JWT
      // -----------------------------------------

      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          message: "Please login first.",
        });
      }

      const token = authHeader.split(" ")[1];

      let decoded;

      try {
        decoded = jwt.verify(
          token,
          process.env.JWT_SECRET
        );
      } catch (error) {
        if (
          error.name === "JsonWebTokenError" ||
          error.name === "TokenExpiredError"
        ) {
          return res.status(401).json({
            message:
              "Your session has expired. Please login again.",
          });
        }

        throw error;
      }

      // -----------------------------------------
      // 2. Find user
      // -----------------------------------------

      const user = await User.findById(decoded.userId);

      if (!user) {
        return res.status(404).json({
          message: "User not found.",
        });
      }

      // -----------------------------------------
      // 3. Find meeting
      // -----------------------------------------

      const meeting = await Meeting.findOne({
        _id: req.params.meetingId,
        userId: user._id,
      });

      if (!meeting) {
        return res.status(404).json({
          message: "Meeting not found.",
        });
      }

      // -----------------------------------------
      // 4. Check audio
      // -----------------------------------------

      if (!req.file) {
        return res.status(400).json({
          message: "No audio file received.",
        });
      }

      uploadedFilePath = req.file.path;

      console.log("================================");
      console.log("MEETING AUDIO RECEIVED");
      console.log("Filename:", req.file.filename);
      console.log("MIME type:", req.file.mimetype);
      console.log("Audio size:", req.file.size);
      console.log("================================");

      // -----------------------------------------
      // 5. Upload audio to Gemini
      // -----------------------------------------

      console.log("Uploading audio to Gemini...");

      const audioFile = await ai.files.upload({
        file: uploadedFilePath,

        config: {
          mimeType:
            req.file.mimetype || "audio/webm",
        },
      });

      console.log("Audio uploaded to Gemini:");
      console.log(audioFile.uri);

      // -----------------------------------------
      // 6. Ask Gemini for transcript
      // -----------------------------------------

      console.log("Generating transcript...");

      const transcriptionModel =
        process.env.GEMINI_TRANSCRIPTION_MODEL ||
        "gemini-3.5-transcribe";

      console.log(
        "Transcription model:",
        transcriptionModel
      );

      const response =
        await ai.models.generateContent({
          model: transcriptionModel,

          contents: [
            {
              role: "user",

              parts: [
                {
                  fileData: {
                    mimeType:
                      audioFile.mimeType ||
                      req.file.mimetype ||
                      "audio/webm",

                    fileUri: audioFile.uri,
                  },
                },

                {
                  text: `
Generate an accurate transcript of this meeting audio.

Rules:

1. Transcribe the complete spoken conversation.
2. Keep the conversation in chronological order.
3. Separate speakers when possible.
4. Do NOT invent speaker names.
5. If the real name cannot be determined, use:
   Speaker 1
   Speaker 2
   Speaker 3
   etc.
6. Do not summarize.
7. Do not skip important spoken content.
8. Return ONLY the transcript.

Format:

Speaker 1: sentence

Speaker 2: sentence

Speaker 1: sentence
`,
                },
              ],
            },
          ],
        });

      // -----------------------------------------
      // 7. Extract Gemini transcription
      // -----------------------------------------

      let transcriptText = "";

      console.log("Gemini response received.");

      if (response.candidates) {
        for (const candidate of response.candidates) {
          const parts =
            candidate.content?.parts || [];

          for (const part of parts) {
            console.log(
              "Gemini part:",
              JSON.stringify(part, null, 2)
            );

            // -------------------------------------
            // Normal text
            // -------------------------------------

            if (part.text) {
              transcriptText +=
                part.text + "\n";
            }

            // -------------------------------------
            // Audio transcription
            // -------------------------------------

            if (
              part.audioTranscription &&
              part.audioTranscription.text
            ) {
              transcriptText +=
                part.audioTranscription.text +
                "\n";
            }
          }
        }
      }

      transcriptText =
        transcriptText.trim();

      console.log(
        "=============================="
      );

      console.log("Gemini transcript:");

      console.log(transcriptText);

      console.log(
        "=============================="
      );

      // -----------------------------------------
      // Check transcript
      // -----------------------------------------

      if (!transcriptText) {
        throw new Error(
          "Gemini did not return a transcript."
        );
      }

      // -----------------------------------------
      // 8. Convert transcript into entries
      // -----------------------------------------

      const lines = transcriptText
        .split("\n")
        .map((line) => line.trim())
        .filter(
          (line) => line.length > 0
        );

      const transcriptEntries =
        lines.map((line) => {
          const separatorIndex =
            line.indexOf(":");

          // No speaker label
          if (separatorIndex === -1) {
            return {
              speaker: "Unknown Speaker",
              participant: null,
              text: line,
              languageCode: "en",
              startTime: null,
              endTime: null,
            };
          }

          const speaker = line
            .substring(0, separatorIndex)
            .trim();

          const text = line
            .substring(separatorIndex + 1)
            .trim();

          return {
            speaker:
              speaker || "Unknown Speaker",

            participant: null,

            text,

            languageCode: "en",

            startTime: null,

            endTime: null,
          };
        });

      // -----------------------------------------
      // 9. Save transcript to MongoDB
      // -----------------------------------------

      meeting.transcript =
        transcriptEntries;

      if (!meeting.statistics) {
        meeting.statistics = {};
      }

      meeting.statistics.transcriptCount = 1;

      meeting.statistics.transcriptEntryCount =
        transcriptEntries.length;

      await meeting.save();

      console.log(
        `Transcript saved: ${transcriptEntries.length} entries`
      );

      // -----------------------------------------
      // 10. Delete temporary audio
      // -----------------------------------------

      fs.unlink(
        uploadedFilePath,
        (error) => {
          if (error) {
            console.error(
              "Unable to delete temporary audio:",
              error.message
            );
          }
        }
      );

      uploadedFilePath = null;

      // -----------------------------------------
      // 11. Send response
      // -----------------------------------------

      return res.json({
        message:
          "Meeting audio transcribed successfully.",

        transcript:
          transcriptEntries,

        transcriptText,
      });
    } catch (error) {
      console.error(
        "================================"
      );

      console.error(
        "AUDIO TRANSCRIPTION ERROR"
      );

      console.error(error);

      console.error(
        "================================"
      );

      // -----------------------------------------
      // Delete temporary file if something failed
      // -----------------------------------------

      if (uploadedFilePath) {
        fs.unlink(
          uploadedFilePath,
          () => {}
        );
      }

      // -----------------------------------------
      // Multer errors
      // -----------------------------------------

      if (
        error instanceof multer.MulterError
      ) {
        if (
          error.code === "LIMIT_FILE_SIZE"
        ) {
          return res.status(400).json({
            message:
              "Audio file is too large. Maximum size is 100 MB.",
          });
        }

        return res.status(400).json({
          message:
            "Unable to upload the audio file.",
        });
      }

      // -----------------------------------------
      // Unsupported audio format
      // -----------------------------------------

      if (
        error.message?.includes(
          "Unsupported audio format"
        )
      ) {
        return res.status(400).json({
          message: error.message,
        });
      }

      // -----------------------------------------
      // Gemini/API failure
      // -----------------------------------------

      return res.status(500).json({
        message:
          "Unable to transcribe the meeting audio right now. Please try again.",
      });
    }
  }
);

module.exports = router;
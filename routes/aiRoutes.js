const express = require("express");
const jwt = require("jsonwebtoken");

const { GoogleGenAI } = require("@google/genai");

const User = require("../models/User");
const Meeting = require("../models/Meeting");

const router = express.Router();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});


// ======================================================
// AI ANALYSIS
// POST /api/meetings/:meetingId/analyze
// ======================================================

router.post(
  "/:meetingId/analyze",
  async (req, res) => {

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
            "Please login to MeetAware first.",
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
      // 2. Find user
      // -----------------------------------------

      const user =
        await User.findById(
          decoded.userId
        );


      if (!user) {
        return res.status(404).json({
          message:
            "MeetAware user not found.",
        });
      }


      // -----------------------------------------
      // 3. Find meeting
      // -----------------------------------------

      const meeting =
        await Meeting.findOne({
          _id: req.params.meetingId,
          userId: user._id,
        });


      if (!meeting) {
        return res.status(404).json({
          message:
            "Meeting not found.",
        });
      }


      // -----------------------------------------
      // 4. Check transcript
      // -----------------------------------------

      if (
        !meeting.transcript ||
        meeting.transcript.length === 0
      ) {

        return res.status(400).json({
          message:
            "No transcript available. Record and transcribe the meeting first.",
        });

      }


      // -----------------------------------------
      // 5. Prepare transcript
      // -----------------------------------------

      const transcriptText =
        meeting.transcript
          .map((entry) => {

            const speaker =
              entry.speaker ||
              "Unknown Speaker";

            const text =
              entry.text ||
              "";

            return `${speaker}: ${text}`;

          })
          .join("\n");


      console.log(
        "================================"
      );

      console.log(
        "AI MEETING ANALYSIS"
      );

      console.log(
        "Meeting:",
        meeting._id.toString()
      );

      console.log(
        "Transcript entries:",
        meeting.transcript.length
      );

      console.log(
        "================================"
      );


      // -----------------------------------------
      // 6. Gemini prompt
      // -----------------------------------------

  const prompt = `
You are an intelligent meeting analysis assistant.

The current MeetAware user is:

Name: ${user.name}
Email: ${user.email}

Analyze the following meeting transcript.

Your task is to extract useful and factual information
from the conversation.

IMPORTANT RULES:

1. Do not invent information.
2. Do not create decisions that were not discussed.
3. Do not create action items that were not discussed.
4. Do not invent deadlines.
5. Keep the analysis based only on the transcript.
6. If a person's identity is unclear, use "Unknown".
7. Do not assume that a person agreed to a task unless the transcript indicates it.
8. For personalAlerts, focus specifically on information relevant to the current MeetAware user.
9. A personal alert can include:
   - The user's name being mentioned.
   - A task assigned to the user.
   - A question directed at the user.
   - A decision that directly affects the user.
   - A deadline that the user is responsible for.
10. Do NOT create a personal alert simply because the user participated in the meeting.
11. If there is no information relevant to the user, return an empty personalAlerts array.
12. Return valid JSON only.
13. Do not use markdown.
14. Keep the summary concise but informative.

Return JSON using exactly this structure:

{
  "summary": "A concise summary of the complete meeting.",

  "speakerDiscussions": [
    {
      "speaker": "Speaker name",
      "discussion": "What this speaker discussed."
    }
  ],

  "decisions": [
    "Decision made during the meeting"
  ],

  "actionItems": [
    {
      "person": "Person responsible",
      "task": "Task assigned",
      "deadline": "Deadline if explicitly mentioned, otherwise empty string"
    }
  ],

  "deadlines": [
    {
      "task": "Task",
      "person": "Person responsible",
      "deadline": "Explicit deadline"
    }
  ],

  "personalAlerts": [
    "Information specifically relevant to the current MeetAware user"
  ]
}

If a category has no information, return an empty array.

Meeting transcript:

${transcriptText}
`;


      // -----------------------------------------
      // 7. Call Gemini
      // -----------------------------------------

      console.log(
        "Sending transcript to Gemini..."
      );


      const response =
        await ai.models.generateContent({

          model:
            "gemini-3.7-flash",

          contents: [
            {
              role: "user",

              parts: [
                {
                  text: prompt,
                },
              ],
            },
          ],

        });


      // -----------------------------------------
      // 8. Get Gemini response
      // -----------------------------------------

      let resultText = "";


      if (response.text) {
        resultText =
          response.text.trim();
      }


      console.log(
        "Gemini raw response:"
      );

      console.log(
        resultText
      );


      if (!resultText) {

        throw new Error(
          "Gemini returned an empty response."
        );

      }


      // -----------------------------------------
      // 9. Remove markdown fences if present
      // -----------------------------------------

      resultText =
        resultText
          .replace(/^```json\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/\s*```$/i, "")
          .trim();


      // -----------------------------------------
      // 10. Parse JSON
      // -----------------------------------------

      let analysis;


      try {

        analysis =
          JSON.parse(resultText);

      } catch (parseError) {

        console.error(
          "Gemini JSON parsing error:"
        );

        console.error(
          parseError.message
        );

        console.error(
          "Response was:"
        );

        console.error(
          resultText
        );

        throw new Error(
          "Gemini returned invalid JSON."
        );

      }


      // -----------------------------------------
      // 11. Validate structure
      // -----------------------------------------

      const safeAnalysis = {

        summary:
          typeof analysis.summary === "string"
            ? analysis.summary
            : "",

        speakerDiscussions:
          Array.isArray(
            analysis.speakerDiscussions
          )
            ? analysis.speakerDiscussions
            : [],

        decisions:
          Array.isArray(
            analysis.decisions
          )
            ? analysis.decisions
            : [],

        actionItems:
          Array.isArray(
            analysis.actionItems
          )
            ? analysis.actionItems
            : [],

        deadlines:
          Array.isArray(
            analysis.deadlines
          )
            ? analysis.deadlines
            : [],

        personalAlerts:
          Array.isArray(
            analysis.personalAlerts
          )
            ? analysis.personalAlerts
            : [],

      };


      // -----------------------------------------
      // 12. Save AI analysis to MongoDB
      // -----------------------------------------

      meeting.aiAnalysis =
        safeAnalysis;


      await meeting.save();


      console.log(
        "================================"
      );

      console.log(
        "AI ANALYSIS SAVED"
      );

      console.log(
        "Summary:",
        safeAnalysis.summary
      );

      console.log(
        "Speaker discussions:",
        safeAnalysis
          .speakerDiscussions.length
      );

      console.log(
        "Decisions:",
        safeAnalysis
          .decisions.length
      );

      console.log(
        "Action items:",
        safeAnalysis
          .actionItems.length
      );

      console.log(
        "Deadlines:",
        safeAnalysis
          .deadlines.length
      );

      console.log(
        "Personal alerts:",
        safeAnalysis
          .personalAlerts.length
      );

      console.log(
        "================================"
      );


      // -----------------------------------------
      // 13. Send response
      // -----------------------------------------

      return res.status(200).json({

        message:
          "Meeting analyzed successfully.",

        meetingId:
          meeting._id,

        aiAnalysis:
          meeting.aiAnalysis,

      });


    } catch (error) {

      console.error(
        "================================"
      );

      console.error(
        "AI ANALYSIS ERROR"
      );

      console.error(
        error
      );

      console.error(
        "================================"
      );


      return res.status(500).json({

        message:
          "Unable to analyze meeting.",

        error:
          error.message,

      });

    }

  }
);


module.exports = router;
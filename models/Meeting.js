const mongoose = require("mongoose");

const transcriptEntrySchema = new mongoose.Schema(
  {
    speaker: {
      type: String,
      default: "Unknown Speaker",
    },

    participant: {
      type: String,
      default: null,
    },

    text: {
      type: String,
      required: true,
    },

    languageCode: {
      type: String,
      default: null,
    },

    startTime: {
      type: String,
      default: null,
    },

    endTime: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const participantSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: null,
    },

    name: {
      type: String,
      required: true,
    },

    type: {
      type: String,
      default: "unknown",
    },

    joinedAt: {
      type: String,
      default: null,
    },

    leftAt: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);

const meetingSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    meetingCode: {
      type: String,
      required: true,
    },

    conferenceName: {
      type: String,
      required: true,
    },

    meetingLink: {
      type: String,
      required: true,
    },

    startTime: {
      type: String,
      default: null,
    },

    endTime: {
      type: String,
      default: null,
    },

    participants: {
      type: [participantSchema],
      default: [],
    },

    transcript: {
      type: [transcriptEntrySchema],
      default: [],
    },

    aiAnalysis: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    statistics: {
      participantCount: {
        type: Number,
        default: 0,
      },

      transcriptCount: {
        type: Number,
        default: 0,
      },

      transcriptEntryCount: {
        type: Number,
        default: 0,
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Meeting", meetingSchema);
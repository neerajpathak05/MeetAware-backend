const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
require("dotenv").config();
const authRoutes = require("./routes/authRoutes");
const loginRoutes = require("./routes/loginRoutes");
const meetingRoutes = require("./routes/meetingRoutes");
const googleAuthRoutes = require("./routes/googleAuthRoutes");
const aiRoutes = require("./routes/aiRoutes");
const audioRoutes = require("./routes/audioRoutes");
const googleSignInRoutes = require("./routes/googleSignInRoutes");
const historyRoutes = require("./routes/historyRoutes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/auth", loginRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/google", googleAuthRoutes);
app.use("/api/meetings", aiRoutes);
app.use("/api/meetings", audioRoutes);
app.use("/api/auth", googleSignInRoutes);
app.use("/api/meetings", historyRoutes);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected");
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error);
  });

app.get("/", (req, res) => {
  res.json({
    message: "MeetAware backend is running",
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
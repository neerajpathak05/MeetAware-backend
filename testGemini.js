require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

async function testGemini() {
  try {
    const response = await ai.models.generateContent({
      model:"gemini-3.7-flash",
      contents: `
        This is a meeting transcript:

        Neeraj: I will complete the login module by Friday.
        Anita: I will prepare the presentation.
        Rahul: We decided to use MongoDB.

        Give me:
        1. A short summary
        2. Decisions
        3. Action items
        4. Deadlines
      `,
    });

    console.log("Gemini response:");
    console.log(response.text);
  } catch (error) {
    console.error("Gemini error:", error.message);
  }
}

testGemini();
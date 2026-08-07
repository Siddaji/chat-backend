import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";
import fs from "fs";
import mongoose from "mongoose";
import authMiddleware from "./middleware/authMiddleware.js";
import authRoutes from "./routes/Auth.js";

dotenv.config();

// Ensure uploads directory exists
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
  });

const app = express();

app.use(
  cors({
    origin: "*",
    credentials: true,
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());
app.use("/api/auth", authRoutes);

const upload = multer({ dest: "uploads/" });

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

let uploadedText = ""; // Shared uploaded content

// ================= CHAT =================
app.post("/chat", authMiddleware, async (req, res) => {
  try {
    const { messages, agent } = req.body;
    let systemPrompt = "You are a helpful assistant";

    if (agent === "study") {
      systemPrompt = `You are a strict tutor. Explain step by step. Use simple words. Ask one follow-up question.`;
    } else if (agent === "resume") {
      const resumeText = `Siddaji | Software developer | Skills: JavaScript, React, Node.js | Projects: AI chat App | Education: B.Tech CSE`;
      systemPrompt = `You are a resume assistant. Answer only using the resume below. If info is missing say "Not mentioned in the resume".\nResume:${resumeText}`;
    }

    const formattedMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({
        role: m.role === "ai" ? "assistant" : "user",
        content: m.text,
      })),
    ];

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    const stream = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: formattedMessages,
      stream: true,
    });

    for await (const chunk of stream) {
      const token = chunk?.choices?.[0]?.delta?.content;
      if (token) res.write(token);
    }

    res.end();
  } catch (err) {
    console.error("Chat error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Chat failed" });
    } else {
      res.end();
    }
  }
});

// ================= FILE UPLOAD =================
app.post("/upload", authMiddleware, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const filePath = req.file.path;

  try {
    uploadedText = fs.readFileSync(filePath, "utf-8");

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Summarize the document clearly" },
        { role: "user", content: uploadedText },
      ],
    });

    res.json({ reply: completion.choices[0].message.content });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  } finally {
    // Always clean up uploaded file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

// ================= RESUME ANALYZER =================
app.post("/resume", authMiddleware, async (req, res) => {
  try {
    const resumeText =
      uploadedText ||
      `Siddaji Software Engineering Student Skills: JavaScript, React, Node.js, Express, MongoDB Projects: AI Chat Application Resume Analyzer Education: B.Tech CSE (3rd Year)`;

    const prompt = `Analyze this resume and respond in MARKDOWN:\n## Overall Score (out of 10)\n## Strengths\n## Weaknesses\n## ATS Improvements\n## Improved Resume Bullets (rewrite 2 bullets)\n\nResume:${resumeText}`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an expert resume reviewer." },
        { role: "user", content: prompt },
      ],
    });

    res.json({ reply: completion.choices[0].message.content });
  } catch (err) {
    console.error("Resume error:", err);
    res.status(500).json({ error: "Resume analysis failed" });
  }
});

app.listen(5000, "0.0.0.0", () => {
  console.log("Server running on port 5000");
});
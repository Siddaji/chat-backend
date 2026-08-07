import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import mongoose from "mongoose";
import authMiddleware from "./middleware/authMiddleware.js";
import authRoutes from "./routes/Auth.js";

dotenv.config();

const OLLAMA_API_URL = process.env.OLLAMA_API_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "llama3.2";

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
console.log(process.env);
// Auth routes
app.use("/api/auth", authRoutes);

const upload = multer({ dest: "uploads/" });
let uploadedText = ""; // Shared uploaded content

// Helper function for non-streaming Ollama calls
async function callOllama(messages) {
  const response = await fetch(`${OLLAMA_API_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      messages: messages,
      stream: false,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama server error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return data.message?.content || "";
}

// ================= CHAT (STREAMING) =================
app.post("/chat", authMiddleware, async (req, res) => {
  try {
    const { messages, agent } = req.body;
    let systemPrompt = "You are a helpful assistant";

    if (agent === "study") {
      systemPrompt = "You are a strict tutor. Explain step by step. Use simple words. Ask one follow-up question.";
    } else if (agent === "resume") {
      const resumeText =
        uploadedText ||
        "Siddaji | Software developer | Skills: JavaScript, React, Node.js | Projects: AI chat App | Education: B.Tech CSE";
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

    const response = await fetch(`${OLLAMA_API_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: formattedMessages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(500).write(`Ollama connection error: ${errorText}`);
      return res.end();
    }

    // Handle streaming chunks from Ollama
    if (response.body.getReader) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop(); // keep partial line in buffer

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.message?.content) {
              res.write(parsed.message.content);
            }
          } catch {
            // Ignore incomplete JSON chunks
          }
        }
      }

      if (buffer.trim()) {
        try {
          const parsed = JSON.parse(buffer);
          if (parsed.message?.content) {
            res.write(parsed.message.content);
          }
        } catch {}
      }
    }

    res.end();
  } catch (err) {
    console.error("Chat error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Chat failed: " + err.message });
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

    const reply = await callOllama([
      { role: "system", content: "Summarize the document clearly" },
      { role: "user", content: uploadedText },
    ]);

    res.json({ reply });
  } catch (err) {
    console.error("Upload error:", err);
    res.status(500).json({ error: "Upload failed: " + err.message });
  } finally {
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

    const reply = await callOllama([
      { role: "system", content: "You are an expert resume reviewer." },
      { role: "user", content: prompt },
    ]);

    res.json({ reply });
  } catch (err) {
    console.error("Resume error:", err);
    res.status(500).json({ error: "Resume analysis failed: " + err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Connected to Ollama at: ${OLLAMA_API_URL} (Model: ${OLLAMA_MODEL})`);
});
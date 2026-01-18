import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";
import fs from "fs";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.post("/chat", async (req, res) => {
  try {
    const { messages } = req.body;

    const formattedMessages = messages.map(m => ({
      role: m.role === "ai" ? "assistant" : "user",
      content: m.text,
    }));

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
    res.status(500).send("Error");
  }
});

app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const content = fs.readFileSync(filePath, "utf-8");
    fs.unlinkSync(filePath);

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Summarize the uploaded document clearly" },
        { role: "user", content }
      ],
    })
    // console.log(content);
    res.json({
      success: true,
      reply: completion.choices[0].message.content
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({err:"File processing failed"});
  }
});

app.listen(5000, () => {
  console.log("Server running on port 5000");
});

// server.js (relevant parts)

// 1) Imports
import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const PORT = process.env.PORT || 10000;

// 2) CORS (your allow-list)
const allowed = [
  "https://sarazeneditions.webflow.io",
  "https://www.sarazeneditions.com",
];
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowed.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  }
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3) Advisor instructions (was `systemPrompt` before; now `instructions`)
const instructions = `
You are Sarazen Editions Print, Scan and Web Design Advisor, a professional production assistant for artist Mark Sarazen.
…
• Calculating Gallery Wraps — price = length × width × 0.32 (USD). “gallery wrap” and “gallerywrap” are the same.
• Using pricing from the Sarazen Editions website for standard sizes; custom prints = length × width × 0.16 (USD).
… (rest of your text)
`.trim();

// 4) OpenAI client
const openai = new OpenAI();

// 5) Routes
app.get("/", (_req, res) => res.send("Server is running and CORS is restricted"));
app.get("/health", (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// 6) Chat endpoint — IMPORTANT: uses `instructions` (not systemPrompt)
app.post("/api/message", async (req, res) => {
  try {
    const { message = "" } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ reply: "Server missing OPENAI_API_KEY." });
    }

    const resp = await openai.responses.create({
      model: "gpt-4o-mini",
      instructions,       // <-- use this variable
      input: message,
      max_output_tokens: 400
    });

    const text =
      resp.output?.[0]?.content?.[0]?.text ||
      "Thanks—tell me your size, paper, and deadline and I’ll help estimate.";

    return res.json({ reply: text });
  } catch (err) {
    console.error("OpenAI error:", err);
    return res.status(500).json({ reply: "Sorry—issue reaching the advisor just now." });
  }
});

app.listen(PORT, () => console.log(`✅ Server on ${PORT}`));

// server.js (ESM, drop-in)
// ---------------------------------------------
import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const PORT = process.env.PORT || 10000;

// --- CORS allow-list: staging + production domains ---
const allowed = [
  "https://sarazeneditions.webflow.io",
  "https://www.sarazeneditions.com",
];
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);            // same-origin / server-to-server
    if (allowed.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
}));

// Optional: cleaner error if blocked by CORS
app.use((err, _req, res, next) => {
  if (err && err.message === "Not allowed by CORS") {
    return res.status(403).json({ ok: false, error: "CORS blocked" });
  }
  next(err);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Health + root routes ---
app.get("/", (_req, res) => res.send("Server is running and CORS is restricted"));
app.get("/health", (_req, res) =>
  res.json({ ok: true, uptime: process.uptime(), ts: new Date().toISOString() })
);

// --- OpenAI client (reads OPENAI_API_KEY from env) ---
const openai = new OpenAI();

const DROPBOX_URL = "https://www.sarazeneditions.com/file-submissions";


// --- Advisor instructions (replicates your GPT behavior) ---
const instructions = `
You are Sarazen Editions Print, Scan and Web Design Advisor, a professional production assistant for artist Mark Sarazen.

You specialize in fine-art giclée printing, archival scanning, color management, and web design using Webflow.

Your tasks include:
• Calculating print sizes and aspect ratios from pixel dimensions and DPI.
• Helping with information on uploading files to Sarazen Editions via Dropbox (share links rather than direct uploads unless the page provides an uploader).
• Calculating Gallery Wraps — price = length × width × 0.32 (USD). The terms “gallery wrap” and “gallerywrap” are the same product.
• Advising on paper types: Hahnemühle Photo Rag, Hahnemühle Baryta, Arches Aquarelle Rag, PremierArt Duravel Satin Canvas, etc.
• Explaining printer-specific settings for the Canon iPF4100.
• Using pricing from the Sarazen Editions website for standard sizes (e.g., 11×14, 16×20, 20×24). For custom prints, price = length × width × 0.16 (USD).
• Explaining drum scanning and the finer points of the Heidelberg Tango Drum Scanner.
• Explaining digital capture from the Sony A7R III.
• Offering guidance on color matching, proofing, and soft-proof profiles.
• Helping prepare files for Webflow galleries and Cloudinary uploads.

Tone & behavior:
• Warm, collegial, professional, and practical—assume you are assisting inside a working studio as a skilled production partner.
• Ask for the key details you need (size in inches, quantity, paper, deadline, pixel dimensions, DPI, source format).
• When pricing: show the math clearly (e.g., 20×24 @ $0.16/in² → $76.80) and note that standard-size menu prices from the website take precedence if they differ.
• If uploads are needed, suggest sharing a Dropbox/Drive link with view/download access unless an uploader is present on the page.
`.trim();

// --- Chat endpoint (Responses API) ---
app.post("/api/message", async (req, res) => {
  try {
    const { message = "" } = req.body || {};

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ reply: "Server missing OPENAI_API_KEY." });
    }

    const resp = await openai.responses.create({
      model: "gpt-4o-mini",
      instructions,
      input: message,
      max_output_tokens: 400,
    });

    // Extract first text output safely
    let text = "Thanks—tell me your size, paper, and deadline and I’ll help estimate.";
    const out = resp.output?.[0];
    if (out?.content?.[0]?.text) text = out.content[0].text;

    return res.json({ reply: text });
  } catch (err) {
    // Graceful fallback for quota/rate limits or outages
    if (err?.status === 429) {
      return res.json({
        reply:
`Here’s a quick overview while the AI is busy:

• Giclée printing on archival papers & canvas (gallery wraps)
• Heidelberg Tango drum scanning (film & reflective art)
• Artwork capture with a Sony A7R III, color-managed workflow
• Proofing & color correction; soft-proof profiles
• Webflow/web help for artists and photographers

Share size, quantity, paper, and deadline, and I’ll estimate the job.`,
      });
    }
    console.error("OpenAI error:", err);
    return res.status(500).json({ reply: "Sorry—issue reaching the advisor just now." });
  }
});

app.listen(PORT, () => console.log(`✅ Server on ${PORT}`));
// ---------------------------------------------

// server.js (ESM)
import express from "express";
import cors from "cors";
import OpenAI from "openai";

const app = express();
const PORT = process.env.PORT || 10000;

// --- CORS: allow only your Webflow domains ---
const allowed = [
  "https://sarazeneditions.webflow.io",
  "https://www.sarazeneditions.com",
];
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true); // same-origin / server-to-server
      if (allowed.includes(origin)) return cb(null, true);
      return cb(new Error("Not allowed by CORS"));
    },
  })
);
// return nicer JSON if blocked by CORS
app.use((err, _req, res, next) => {
  if (err && err.message === "Not allowed by CORS") {
    return res.status(403).json({ ok: false, error: "CORS blocked" });
  }
  next(err);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Health + Root ---
app.get("/", (_req, res) => {
  res.send("Server is running and CORS is restricted");
});
app.get("/health", (_req, res) =>
  res.json({ ok: true, uptime: process.uptime(), ts: new Date().toISOString() })
);

// --- OpenAI client (reads OPENAI_API_KEY from env) ---
const openai = new OpenAI();

// --- Chat endpoint (uses OpenAI Responses API) ---
app.post("/api/message", async (req, res) => {
  try {
    const { name = "Visitor", message = "" } = req.body || {};

    // Basic guardrail if key missing
    if (!process.env.OPENAI_API_KEY) {
      return res
        .status(500)
        .json({ reply: "Server missing OPENAI_API_KEY – contact site admin." });
    }

    // System instruction tailored to you
// Advisor instructions (ESM)
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


    // Call OpenAI Responses API
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
      max_output_tokens: 400,
    });

    // Extract first text output safely
    let aiText = "Thanks for your message!";
    const out = response.output?.[0];
    if (out?.type === "message") {
      const part = out.content?.find((c) => c.type === "output_text");
      if (part?.text) aiText = part.text;
    } else if (out?.content?.[0]?.text) {
      aiText = out.content[0].text;
    }

    return res.json({ reply: aiText });
  } catch (err) {
    console.error("OpenAI error:", err);
    return res
      .status(500)
      .json({ reply: "Sorry—ran into an issue talking to the AI just now." });
  }
});

app.listen(PORT, () => console.log(`✅ Server on ${PORT}`));

// server.js (ESM, with quote builder + email via Resend)
import express from "express";
import cors from "cors";
import OpenAI from "openai";

// ===== Config =====
const app = express();
const PORT = process.env.PORT || 10000;

const allowed = [
  "https://sarazeneditions.webflow.io",
  "https://www.sarazeneditions.com",
];

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (allowed.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  },
}));
app.use((err, _req, res, next) => {
  if (err && err.message === "Not allowed by CORS") {
    return res.status(403).json({ ok: false, error: "CORS blocked" });
  }
  next(err);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===== Basic routes =====
app.get("/", (_req, res) => res.send("Server is running and CORS is restricted"));
app.get("/health", (_req, res) =>
  res.json({ ok: true, uptime: process.uptime(), ts: new Date().toISOString() })
);

// ===== OpenAI (advisor) =====
const openai = new OpenAI();

const instructions = `
You are Sarazen Editions Print, Scan and Web Design Advisor, a professional production assistant for artist Mark Sarazen.
You specialize in fine-art giclée printing, archival scanning, color management, and web design using Webflow.

Your tasks include:
• Calculating print sizes and aspect ratios from pixel dimensions and DPI.
• Helping with information on uploading files to Sarazen Editions via Dropbox (share links unless an uploader is present).
• Calculating Gallery Wraps — price = length × width × 0.32 (USD). “gallery wrap” and “gallerywrap” are the same product.
• Advising on paper types: Hahnemühle Photo Rag, Hahnemühle Baryta, Arches Aquarelle Rag, PremierArt Duravel Satin Canvas, etc.
• Explaining printer-specific settings for the Canon iPF4100.
• Using pricing from the Sarazen Editions website for standard sizes (e.g., 11×14, 16×20, 20×24). For custom prints, price = length × width × 0.16 (USD).
• Explaining drum scanning and the finer points of the Heidelberg Tango Drum Scanner.
• Explaining digital capture from the Sony A7R III.
• Offering guidance on color matching, proofing, and soft-proof profiles.
• Helping prepare files for Webflow galleries and Cloudinary uploads.

Tone & behavior:
• Warm, collegial, professional, and practical—assume you are assisting inside a working studio as a skilled production partner.
• Ask for key details (size in inches, quantity, paper, deadline, pixel dimensions, DPI, source format).
• When pricing: show the math clearly and note that menu prices for standard sizes take precedence if they differ.
• For uploads, direct users to https://www.sarazeneditions.com/file-submissions.
`.trim();

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
    const out = resp.output?.[0];
    const text = out?.content?.[0]?.text || "Thanks—tell me your size, paper, and deadline and I’ll help estimate.";
    return res.json({ reply: text });
  } catch (err) {
    if (err?.status === 429) {
      return res.json({ reply:
`Here’s a quick overview while the AI is busy:
• Giclée printing (archival papers & canvas)
• Heidelberg Tango drum scanning
• Artwork capture with Sony A7R III
• Proofing & color management
• Webflow/web help
Share size, quantity, paper, and deadline, and I’ll estimate the job.` });
    }
    console.error("OpenAI error:", err);
    return res.status(500).json({ reply: "Sorry—issue reaching the advisor just now." });
  }
});

// ===== Pricing helpers =====
function round2(n) { return Math.round(n * 100) / 100; }
function calcCustomPrintUSD(lengthIn, widthIn, qty=1) {
  const unit = lengthIn * widthIn * 0.16;
  return { unit: round2(unit), total: round2(unit * qty) };
}
function calcGalleryWrapUSD(lengthIn, widthIn, qty=1) {
  const unit = lengthIn * widthIn * 0.32;
  return { unit: round2(unit), total: round2(unit * qty) };
}

// ===== Quote API =====
// Accepts: { name, email, sizeL, sizeW, qty, paper, wrap, deadline, notes, sessionId, transcript }
app.post("/api/quote", async (req, res) => {
  try {
    const {
      name="", email="", sizeL=0, sizeW=0, qty=1, paper="", wrap=false,
      deadline="", notes="", sessionId="", transcript=[]
    } = req.body || {};

    const L = Number(sizeL) || 0;
    const W = Number(sizeW) || 0;
    const Q = Math.max(1, Number(qty) || 1);

    let pricing = wrap ? calcGalleryWrapUSD(L, W, Q) : calcCustomPrintUSD(L, W, Q);
    const product = wrap ? "Gallery Wrap (canvas)" : "Custom Giclée Print";

    // Build summary object
    const summary = {
      product,
      size_in: `${L} × ${W} in`,
      paper,
      qty: Q,
      deadline,
      notes,
      unit_usd: pricing.unit,
      total_usd: pricing.total
    };

    // Try to email via Resend
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const TO = process.env.QUOTE_EMAIL_TO || "mark@sarazeneditions.com";
    const FROM = process.env.QUOTE_EMAIL_FROM || "quotes@sarazeneditions.com";

    const bodyLines = [
      `New quote request from ${name || "(no name)"} <${email || "no email"}>`,
      "",
      `Product: ${product}`,
      `Size: ${L} × ${W} in`,
      `Paper: ${paper || "(unspecified)"}`,
      `Quantity: ${Q}`,
      `Deadline: ${deadline || "(unspecified)"}`,
      `Notes: ${notes || "(none)"}`,
      "",
      `Pricing: $${summary.unit_usd.toFixed(2)} each  →  $${summary.total_usd.toFixed(2)} total`,
      "",
      `Session: ${sessionId || "(unknown)"}`,
      "Transcript:",
      ...(Array.isArray(transcript) ? transcript.map(t => `- ${t.role}: ${t.text}`) : ["(none)"]),
      "",
      `IP/User-Agent may be visible in Render logs.`
    ].join("\n");

    if (RESEND_API_KEY) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${RESEND_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          from: FROM,
          to: [TO],
          subject: `Quote Request — ${product} — ${L}×${W}in ×${Q}`,
          text: bodyLines
        })
      });
      if (!r.ok) {
        console.error("Resend error:", await r.text());
      }
    } else {
      console.log("QUOTE (no RESEND_API_KEY):\n" + bodyLines);
    }

    return res.json({ ok: true, summary });
  } catch (e) {
    console.error("Quote error:", e);
    return res.status(500).json({ ok: false, error: "Server error creating quote" });
  }
});

app.listen(PORT, () => console.log(`✅ Server on ${PORT}`));

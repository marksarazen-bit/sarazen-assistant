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
You are the **Sarazen Editions – Print, Scan & Web Design Advisor**, a professional production assistant for artist Mark Sarazen.
Act like you're in a working studio: warm, concise, decisive. Keep answers tight unless the user asks for detail.

## Scope
- Fine-art giclée printing (papers, canvas, gallery wraps), proofs/test strips
- Drum scanning (Heidelberg Tango) & digital capture (Sony A7R III)
- Color management, proofing, soft-proof profiles
- Webflow help; file prep for galleries/Cloudinary
- Dropbox intake via the on-page **Submit files** button (never print raw URLs)

## Fast-Path Intents (answer first, then minimal follow-ups)

### A) “Can you make a proof from my scan?”
- Start with **“Yes, absolutely.”**
- Offer a default proof and a choice, not a questionnaire.
- Default proof size: **8×10 in** (or the user’s target size if they state it).
- Ask for **only two** things up front: **paper preference** and **timeline**.
- **Do not ask** for file format, pixels, or DPI. If the user volunteers them, you may use them silently.
- Next step: **Submit files** (button) or **Get quote**.
- Example:
  - “Yes—happy to make a proof. I can do an 8×10 on Photo Rag or Baryta. Do you have a preference and a date you need it by? If you’d like a different size, tell me the inches. Use **Submit files** above, and I’ll price it and confirm.”

### B) Reprint / size change
- Confirm **size in inches**, **paper/canvas**, **quantity**, **deadline**.
- No file-format/pixels/DPI questions.

### C) Gallery wrap
- Confirm inches + qty; treat “gallery wrap” and “gallerywrap” as the same product.
- Give an estimate (see Pricing), show simple math, then offer **Get quote**.

### D) Scan quote / capture
- Ask **original type/size**, **target print size**, **timeline**. Keep it brief.

## Pricing (simple, visible math)
- **Custom giclée print estimate:** price = length_in × width_in × **0.16** USD.
- **Gallery wrap estimate:** price = length_in × width_in × **0.32** USD.
- If user mentions **standard menu sizes** (11×14, 16×20, 20×24…), say: *“We follow the site’s menu pricing for those; this is a quick estimate for customs.”*
- Show the math clearly (e.g., *8×10 at $0.16/in² → $12.80*). For multiple quantities, show **unit** and **total**.

## Materials & devices
- Papers: Hahnemühle Photo Rag, Hahnemühle Baryta, Arches Aquarelle Rag, PremierArt Duravel Satin Canvas (others on request).
- Printer: Canon iPF4100—practical guidance only (media type, ICC/soft-proofing, avoid double-profiling).
- Scanner: Heidelberg Tango—benefits (DR, acuity); ask original type & target size when relevant.

## File handling & links
- When users ask about uploads/sharing: **refer to the “Submit files” button** in the header. Do **not** print raw URLs.
- For large jobs, suggest Dropbox/Drive **via that page** (still no raw URLs in text).

## Tone & style
- Friendly, collegial, practical. Short paragraphs and bullet points over long prose.
- Ask **at most 1–2 questions** before offering a next step.

## Next steps / Handoffs
- Ready to price? Invite **Get quote** and pre-fill what you’ve inferred (size, paper, qty, deadline).
- After a quote is sent, summarize: product, size, qty, paper/canvas, and the calculated total.

## Link formatting
- Never paste raw URLs. Refer to the **Submit files** and **Get quote** buttons in the chat header.

(End.)
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

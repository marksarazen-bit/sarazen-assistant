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
    const systemPrompt = `
You are the Sarazen Editions site assistant. Be concise, warm, and specific.
If asked about services, cover: giclée printing, drum scanning (Heidelberg Tango),
art capture/photography, color management & proofs, canvas/gallery wraps,
Webflow/web design help, and typical turnaround. Invite users to upload or
contact for quotes when appropriate. Avoid overselling; be practical.
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

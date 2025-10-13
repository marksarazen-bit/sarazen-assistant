// server.js (ESM)
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 10000;

// 1) Put your Webflow domains here (staging + production)
const allowed = [
  "https://sarazeneditions.webflow.io",
  "https://www.sarazeneditions.com"
];

// 2) REPLACE your existing app.use(cors()) with this:
app.use(cors({
  origin(origin, cb) {
    // Allow same-origin or non-browser requests (no Origin header)
    if (!origin) return cb(null, true);
    if (allowed.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  }
  // If you need cookies/headers across origins, also set:
  // credentials: true
}));

// 3) Keep parsers and routes AFTER CORS
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => res.send("Server is running and CORS is restricted"));

app.post("/api/message", (req, res) => {
  const { name, message } = req.body || {};
  res.json({ reply: `Hi ${name || "there"} — I got: "${message || ""}"` });
});

app.listen(PORT, () => console.log(`✅ Server on ${PORT}`));
// ESM version
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("Server is running and CORS is enabled!");
});

app.post("/api/message", (req, res) => {
  const { name, message } = req.body || {};
  console.log(`Received message from ${name}: ${message}`);
  res.json({ success: true, reply: `Hello ${name}, your message was received.` });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

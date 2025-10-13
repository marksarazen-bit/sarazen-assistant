// server.js (ESM)
import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 10000;

// Allow only your Webflow staging & prod domains
const allowed = [
  "https://sarazeneditions.webflow.io",
  "https://www.sarazeneditions.com"
];

app.use(cors({
  origin(origin, cb) {
    // allow same-origin / server-to-server (no Origin header)
    if (!origin) return cb(null, true);
    if (allowed.includes(origin)) return cb(null, true);
    return cb(new Error("Not allowed by CORS"));
  }
}));

// (optional) nicer JSON for blocked origins instead of a generic 500
app.use((err, _req, res, next) => {
  if (err && err.message === "Not allowed by CORS") {
    return res.status(403).json({ ok: false, error: "CORS blocked" });
  }
  next(err);
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.send("Server is running and CORS is restricted");
});

app.post("/api/message", (req, res) => {
  const { name, message } = req.body || {};
  res.json({ reply: `Hi ${name || "there"} — I got: "${message || ""}"` });
});

app.listen(PORT, () => console.log(`✅ Server on ${PORT}`));

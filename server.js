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

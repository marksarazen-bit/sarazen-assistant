// server.js
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 10000;

// Enable CORS for all routes (Webflow can make requests)
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Example test route
app.get("/", (req, res) => {
  res.send("Server is running and CORS is enabled!");
});

// Example API route Webflow can call
app.post("/api/message", (req, res) => {
  const { name, message } = req.body;
  console.log(`Received message from ${name}: ${message}`);
  res.json({ success: true, reply: `Hello ${name}, your message was received.` });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

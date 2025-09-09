const express = require("express");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/hello", (req, res) => {
  res.json({ ok: true, message: "Selam! Node.js'ten geldim 🚀" });
});

app.get("/api/time", (req, res) => {
  res.json({ now: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
});

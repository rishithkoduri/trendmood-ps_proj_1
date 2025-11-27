require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// create express app
const app = express();

// middleware
app.use(helmet());
app.use(express.json());
app.use(cors({
  origin: [
     'http://localhost:3000', 'http://127.0.0.1:3000',
     'http://localhost:5000', 'http://127.0.0.1:5000',
     'http://localhost:5500', 'http://127.0.0.1:5500',
     'http://localhost:5500/index.html', 'http://127.0.0.1:5500/index.html',
     'http://localhost:5500/trendmood/index.html', 'http://127.0.0.1:5500/trendmood/index.html'
    ]
}));

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 30
}));

// env values
const HF_TOKEN = process.env.HF_TOKEN;
const MODEL_ID = process.env.MODEL_ID || "cardiffnlp/twitter-roberta-base-sentiment-latest";

if (!HF_TOKEN) {
  console.error("❌ ERROR: HF_TOKEN missing in .env");
  process.exit(1);
}

// ----- API ROUTE -----
app.post('/api/analyze', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Invalid text" });
    }

    // HuggingFace Router endpoint (MANDATORY)
    const hfUrl = `https://router.huggingface.co/hf-inference/models/${MODEL_ID}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const hfRes = await fetch(hfUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ inputs: text }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    const data = await hfRes.json().catch(() => null);

    console.log(
      `HF => status ${hfRes.status} | preview:`,
      JSON.stringify(data).slice(0, 200)
    );

    if (!hfRes.ok) {
      return res.status(hfRes.status).json({ error: data });
    }

    if (Array.isArray(data)) {
      return res.json(data);
    } else {
      return res.json([data]);
    }

  } catch (err) {
    if (err.name === "AbortError") {
      return res.status(504).json({ error: "HF request timeout" });
    }
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// health check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

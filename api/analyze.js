export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const HF_TOKEN = process.env.HF_TOKEN;
  const MODEL_ID =
    process.env.MODEL_ID ||
    "cardiffnlp/twitter-roberta-base-sentiment-latest";

  if (!HF_TOKEN) {
    return res.status(500).json({ error: "HF_TOKEN missing" });
  }

  try {
    const { text } = req.body;

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "Invalid text" });
    }

    const hfUrl = `https://router.huggingface.co/hf-inference/models/${MODEL_ID}`;

    const hfRes = await fetch(hfUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ inputs: text }),
    });

    const data = await hfRes.json();

    if (!hfRes.ok) {
      return res.status(hfRes.status).json({ error: data });
    }

    // HF sometimes returns wrapped prediction
    if (Array.isArray(data)) {
      return res.status(200).json(data);
    } else {
      return res.status(200).json([data]);
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

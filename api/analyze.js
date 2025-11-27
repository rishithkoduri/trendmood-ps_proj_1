// api/analyze.js
// Minimal Vercel serverless handler for HF inference.
// Put this file at /api/analyze.js in your repo.

const TIMEOUT_MS = 25000; // 25s fetch timeout

function timeoutSignal(ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(id) };
}

function flattenAndSanitize(data) {
  // Sometimes HF returns [[...]] or {...}. Normalize to flat array of {label, score}
  while (Array.isArray(data) && data.length === 1 && Array.isArray(data[0])) data = data[0];
  if (!Array.isArray(data)) data = [data];

  return data.map(it => {
    if (!it || typeof it !== 'object') return { label: 'unknown', score: 0 };
    const label = String(it.label ?? it[0] ?? 'unknown');
    const score = Number(it.score ?? 0);
    return { label, score: Number.isFinite(score) ? score : 0 };
  });
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const HF_TOKEN = process.env.HF_TOKEN;
    const MODEL_ID = process.env.MODEL_ID || 'cardiffnlp/twitter-roberta-base-sentiment-latest';

    if (!HF_TOKEN) {
      console.error('Missing HF_TOKEN in environment');
      return res.status(500).json({ error: 'Server misconfigured: missing HF_TOKEN' });
    }

    const { text } = req.body ?? {};
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Invalid text' });
    }

    const hfUrl = `https://router.huggingface.co/hf-inference/models/${MODEL_ID}`;

    const { signal, cancel } = timeoutSignal(TIMEOUT_MS);

    const hfRes = await fetch(hfUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ inputs: text }),
      signal
    }).catch(err => {
      // network/abort error
      if (err.name === 'AbortError') throw Object.assign(new Error('HF request aborted (timeout)'), { code: 'HF_TIMEOUT' });
      throw err;
    });

    cancel();

    const raw = await hfRes.json().catch(() => null);

    console.log('HF status:', hfRes.status, 'preview:', JSON.stringify(raw).slice(0, 300));

    if (!hfRes.ok) {
      // forward HF error body
      return res.status(hfRes.status || 500).json({ error: raw ?? 'HuggingFace error' });
    }

    const normalized = flattenAndSanitize(raw);
    return res.status(200).json(normalized);

  } catch (err) {
    console.error('Function error:', err);
    if (err && err.code === 'HF_TIMEOUT') return res.status(504).json({ error: 'HF request timeout' });
    return res.status(500).json({ error: 'Function crashed', details: String(err.message ?? err) });
  }
};

// app.js (full, robust, ready-to-drop-in)
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('form_el');
  const nameInput = document.getElementById('name');
  const textBox = document.getElementById('text_box');
  const resultDiv = document.getElementById('result');
  const historyList = document.getElementById('history_list');
  const clearHistoryBtn = document.getElementById('clear_history');
  const emptyMsg = document.getElementById('empty_msg');
  const micBtn = document.getElementById('mic_btn');

  // --------------------
  // Helpers
  // --------------------
  // Unwrap any number of single-element nested arrays: [[[...]]] -> [...]
  function flattenPredictions(data) {
    while (Array.isArray(data) && data.length === 1 && Array.isArray(data[0])) {
      data = data[0];
    }
    return data;
  }

  // Small HTML escape to avoid injecting user text into innerHTML unsafely
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // --------------------
  // Backend call (proxy)
  // --------------------
  async function queryHuggingFace(text) {
    try {
      const res = await fetch("http://127.0.0.1:8080/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });

      const raw = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("Backend returned non-OK:", res.status, raw);
        return null;
      }
      if (!raw) {
        console.error("Backend returned empty/non-json response");
        return null;
      }

      return flattenPredictions(raw);
    } catch (err) {
      console.error("Network / unexpected error in queryHuggingFace:", err);
      return null;
    }
  }

  // --------------------
  // Interpret HF predictions robustly
  // --------------------
  function getTopSentiment(pred) {
    // ensure flattened
    pred = flattenPredictions(pred);

    if (!Array.isArray(pred) || pred.length === 0) {
      return { label: "Unknown", score: 0 };
    }

    // sanitize items to {label:string, score:number}
    const cleaned = pred.map(item => {
      if (!item) return { label: "Unknown", score: 0 };
      const label = (item.label ?? item[0] ?? "Unknown").toString();
      const score = typeof item.score === "number" ? item.score : Number(item.score);
      return { label, score: Number.isFinite(score) ? score : 0 };
    });

    // pick top by numeric score
    const top = cleaned.slice().sort((a, b) => b.score - a.score)[0];

    const lab = (top.label || "unknown").toString().toLowerCase();

    if (lab.startsWith("label_")) {
      if (lab.includes("0")) return { label: "Negative", score: top.score };
      if (lab.includes("1")) return { label: "Neutral", score: top.score };
      if (lab.includes("2")) return { label: "Positive", score: top.score };
    }
    if (lab.includes("neg")) return { label: "Negative", score: top.score };
    if (lab.includes("neu")) return { label: "Neutral", score: top.score };
    if (lab.includes("pos")) return { label: "Positive", score: top.score };

    // fallback: Capitalize the label
    return {
      label: String(top.label).charAt(0).toUpperCase() + String(top.label).slice(1),
      score: top.score
    };
  }

  // --------------------
  // UI helpers
  // --------------------
  function renumberHistory() {
    [...historyList.children].forEach((li, i, arr) => {
      const el = li.querySelector('.history-number');
      if (el) el.textContent = (arr.length - i) + '.';
    });
  }

  function checkEmptyHistory() {
    emptyMsg.style.display = historyList.children.length ? 'none' : 'block';
  }

  // add an entry to history with safe formatting
  function addToHistory(name, text, sentiment, score) {
    const li = document.createElement('li');
    const colors = { positive: '#22c55e', negative: '#ef4444', neutral: '#facc15' };

    const scoreNum = Number(score);
    const scoreValid = Number.isFinite(scoreNum) && scoreNum >= 0 && scoreNum <= 1;
    const scoreText = scoreValid ? (scoreNum * 100).toFixed(1) + "%" : "—";

    const color = colors[(sentiment || 'neutral').toLowerCase()] || '#9ca3af';
    const safeName = escapeHtml(name || 'Unknown');
    const safeText = escapeHtml(text.length > 50 ? text.slice(0,50) + '...' : text);

    li.innerHTML = `
      <div style="flex-grow:1;margin-right:10px;">
        <strong class="history-number"></strong> <strong>${safeName}</strong>:
        <span style="color:#d1d5db;">"${safeText}"</span><br>
        <small style="color:${color};font-weight:bold;text-transform:uppercase;">
          ${escapeHtml(sentiment || 'Unknown')} (${scoreText})
        </small>
      </div>
      <button class="delete_btn" style="background:#ef4444;color:white;border:none;border-radius:4px;padding:2px 8px;cursor:pointer;">Delete</button>
    `;

    li.querySelector('.delete_btn').onclick = () => { li.remove(); renumberHistory(); checkEmptyHistory(); };
    historyList.prepend(li);
    renumberHistory();
    checkEmptyHistory();
  }

  // --------------------
  // Wire up events
  // --------------------
  if (form) form.addEventListener('submit', (e) => e.preventDefault()); // prevent default submit

  const analyzeBtn = document.getElementById('analyze_btn');
  if (analyzeBtn) {
    console.log('attaching analyze_btn click handler');
    analyzeBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      console.log('analyze button clicked');

      const name = (nameInput && nameInput.value || '').trim();
      const text = (textBox && textBox.value || '').trim();

      if (!name || !text) { alert('Please enter both a name and some text.'); return; }

      resultDiv.style.display = 'block';
      resultDiv.style.color = '#38bdf8';
      resultDiv.textContent = 'Sending to Hugging Face API...';

      const pred = await queryHuggingFace(text);
      console.log('queryHuggingFace returned', pred);

      if (!pred) {
        resultDiv.style.color = '#ef4444';
        resultDiv.textContent = 'Analysis failed.';
        return;
      }

      const result = getTopSentiment(pred);
      console.log('normalized result:', result);

      const color = ({ Positive: '#22c55e', Negative: '#ef4444', Neutral: '#facc15' })[result.label] || '#9ca3af';

      const scoreNum = Number(result.score);
      const scoreValid = Number.isFinite(scoreNum) && scoreNum >= 0 && scoreNum <= 1;
      const scoreText = scoreValid ? (scoreNum * 100).toFixed(1) + "%" : "—";

      resultDiv.style.color = color;
      resultDiv.innerHTML = `
        <span style="color:#e5e7eb;">Result:</span>
        <strong style="text-transform:uppercase;">${escapeHtml(result.label || 'Unknown')}</strong>
        <span style="font-size:.8em;color:#9ca3af;">(${scoreText} confidence)</span>
      `;

      addToHistory(name, text, result.label, result.score);
      form.reset();
    });
  } else {
    console.warn('analyze_btn not found — ensure HTML has <button id="analyze_btn">');
  }

  if (micBtn) micBtn.style.color = '#fff';
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.continuous = false;

    micBtn.onclick = () => micBtn.classList.contains('listening') ? recognition.stop() : recognition.start();
    recognition.onstart = () => micBtn.classList.add('listening');
    recognition.onspeechend = () => { micBtn.classList.remove('listening'); recognition.stop(); };
    recognition.onresult = (e) => {
      const t = e.results[0][0].transcript;
      textBox.value = textBox.value ? textBox.value + ' ' + t : t;
    };
    recognition.onerror = () => micBtn.classList.remove('listening');
  } else if (micBtn) {
    micBtn.style.display = 'none';
  }

  clearHistoryBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!historyList.children.length) return;
    historyList.classList.add('wipe-active');
    setTimeout(() => { historyList.innerHTML = ''; checkEmptyHistory(); }, 300);
    setTimeout(() => historyList.classList.remove('wipe-active'), 600);
  });

  // initial empty check
  checkEmptyHistory();
});

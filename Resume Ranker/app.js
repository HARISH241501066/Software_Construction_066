/* ── ResumeRank — app.js ─────────────────────────────────────── */
'use strict';

// ── PDF.js worker ─────────────────────────────────────────────
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── State ──────────────────────────────────────────────────────
const state = {
  files: [],       // { file, name, size }
  results: [],     // ranked results
  keywords: []
};

// ── DOM refs ──────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const jdInput       = $('job-description');
const jdCharCount   = $('jd-char-count');
const keyPreview    = $('keywords-preview');
const keyList       = $('keywords-list');
const dropZone      = $('drop-zone');
const resumeInput   = $('resume-input');
const fileList      = $('file-list');
const analyzeBtn    = $('analyze-btn');
const analyzeBtnTxt = $('analyze-btn-text');
const kwWeight      = $('kw-weight');
const densWeight    = $('dens-weight');
const phraseWeight  = $('phrase-weight');
const kwVal         = $('kw-val');
const densVal       = $('dens-val');
const phraseVal     = $('phrase-val');
const resultPlaceholder = $('results-placeholder');
const resultLoading     = $('results-loading');
const resultContent     = $('results-content');
const resultsList       = $('results-list');
const resultsCount      = $('results-count');
const summaryBar        = $('summary-bar');
const loadingProgress   = $('loading-progress');
const exportBtn         = $('export-btn');
const resetBtn          = $('reset-btn');
const modalOverlay      = $('modal-overlay');
const modalClose        = $('modal-close');
const modalContent      = $('modal-content');

// ── Navbar scroll effect ──────────────────────────────────────
window.addEventListener('scroll', () => {
  const nav = $('navbar');
  nav.style.boxShadow = window.scrollY > 20
    ? '0 4px 32px rgba(0,0,0,0.5)'
    : '';
});

// ── Character count ───────────────────────────────────────────
jdInput.addEventListener('input', () => {
  const len = jdInput.value.length;
  jdCharCount.textContent = `${len.toLocaleString()} character${len !== 1 ? 's' : ''}`;
  updateKeywordsPreview();
  updateAnalyzeBtn();
});

// ── Slider updates ────────────────────────────────────────────
function updateSlider(input, display) {
  display.textContent = input.value + '%';
}
kwWeight.addEventListener('input',     () => updateSlider(kwWeight, kwVal));
densWeight.addEventListener('input',   () => updateSlider(densWeight, densVal));
phraseWeight.addEventListener('input', () => updateSlider(phraseWeight, phraseVal));

// ── Keyword extraction ────────────────────────────────────────
const STOPWORDS = new Set([
  'the','a','an','and','or','of','to','in','for','with','on','at','by','is',
  'are','was','were','be','been','being','have','has','had','do','does','did',
  'will','would','could','should','may','might','shall','can','need','this',
  'that','these','those','we','you','they','it','he','she','our','your','their',
  'its','from','into','about','as','not','but','if','so','then','than','when',
  'where','who','which','what','how','all','any','each','more','most','other',
  'some','such','no','only','own','same','too','very','just','both','during',
  'before','after','above','below','between','through','during','use','using'
]);

function extractKeywords(text) {
  if (!text.trim()) return [];
  const words = text.toLowerCase()
    .replace(/[^a-z0-9#+.]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));

  const freq = {};
  words.forEach(w => { freq[w] = (freq[w] || 0) + 1; });

  // Also extract 2-word phrases
  const phrases = [];
  const arr = text.toLowerCase().split(/\s+/);
  for (let i = 0; i < arr.length - 1; i++) {
    const pair = arr[i].replace(/[^a-z0-9#+.]/g,'') + ' ' + arr[i+1].replace(/[^a-z0-9#+.]/g,'');
    if (pair.split(' ').every(w => !STOPWORDS.has(w) && w.length > 1)) {
      phrases.push(pair);
    }
  }

  const sorted = Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 40);

  return { single: sorted, phrases: [...new Set(phrases)].slice(0, 30) };
}

function updateKeywordsPreview() {
  const text = jdInput.value;
  if (text.length < 30) { keyPreview.style.display = 'none'; return; }
  const { single } = extractKeywords(text);
  state.keywords = single;
  keyPreview.style.display = 'block';
  keyList.innerHTML = single.slice(0, 20).map(k =>
    `<span class="kw-tag">${k}</span>`
  ).join('');
}

// ── File handling ─────────────────────────────────────────────
dropZone.addEventListener('click', () => resumeInput.click());
dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') resumeInput.click(); });
resumeInput.addEventListener('change', e => addFiles(Array.from(e.target.files)));

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  addFiles(Array.from(e.dataTransfer.files).filter(f => /\.(pdf|txt)$/i.test(f.name)));
});

function addFiles(files) {
  files.forEach(f => {
    if (!state.files.find(x => x.name === f.name && x.size === f.size)) {
      state.files.push({ file: f, name: f.name, size: f.size });
    }
  });
  renderFileList();
  updateAnalyzeBtn();
}

function removeFile(index) {
  state.files.splice(index, 1);
  renderFileList();
  updateAnalyzeBtn();
}

function renderFileList() {
  fileList.innerHTML = state.files.map((f, i) => `
    <div class="file-item">
      <span class="file-icon">${f.name.endsWith('.pdf') ? '📄' : '📝'}</span>
      <span class="file-name" title="${escHtml(f.name)}">${escHtml(f.name)}</span>
      <span class="file-size">${formatSize(f.size)}</span>
      <button class="file-remove" onclick="removeFile(${i})" title="Remove">✕</button>
    </div>
  `).join('');
}

window.removeFile = removeFile;

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

function updateAnalyzeBtn() {
  const ready = state.files.length > 0 && jdInput.value.trim().length > 30;
  analyzeBtn.disabled = !ready;
  analyzeBtnTxt.textContent = ready
    ? `Analyze & Rank ${state.files.length} Resume${state.files.length > 1 ? 's' : ''}`
    : 'Analyze & Rank Resumes';
}

// ── Text extraction ───────────────────────────────────────────
async function extractText(fileEntry) {
  const { file } = fileEntry;
  if (file.name.toLowerCase().endsWith('.txt')) {
    return new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = e => res(e.target.result);
      reader.onerror = rej;
      reader.readAsText(file);
    });
  }
  // PDF
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      text += content.items.map(i => i.str).join(' ') + '\n';
    }
    return text;
  } catch {
    return '';
  }
}

// ── Scoring ───────────────────────────────────────────────────
function scoreResume(resumeText, jdText, weights) {
  const rt = resumeText.toLowerCase();
  const { single: keywords, phrases } = extractKeywords(jdText);

  if (!keywords.length) return { total: 0, kwScore: 0, densScore: 0, phraseScore: 0, matched: [], missing: [] };

  // Keyword match score
  const matched = keywords.filter(k => rt.includes(k));
  const missing = keywords.filter(k => !rt.includes(k));
  const kwScore = matched.length / keywords.length;

  // Density score (keyword count / total words in resume)
  const resumeWords = rt.split(/\s+/).length;
  let kwCount = 0;
  matched.forEach(k => {
    const re = new RegExp(`\\b${k}\\b`, 'g');
    kwCount += (rt.match(re) || []).length;
  });
  const densScore = Math.min(kwCount / Math.max(resumeWords, 1) * 20, 1);

  // Phrase score
  const matchedPhrases = phrases.filter(p => rt.includes(p));
  const phraseScore = phrases.length ? matchedPhrases.length / phrases.length : kwScore;

  const wKw   = parseInt(weights.kw) / 100;
  const wDens = parseInt(weights.dens) / 100;
  const wPh   = parseInt(weights.phrase) / 100;
  const total = ((kwScore * wKw) + (densScore * wDens) + (phraseScore * wPh)) * 100;

  return {
    total: Math.round(Math.min(total, 100)),
    kwScore: Math.round(kwScore * 100),
    densScore: Math.round(densScore * 100),
    phraseScore: Math.round(phraseScore * 100),
    matched: matched.slice(0, 15),
    missing: missing.slice(0, 10),
    matchedPhrases
  };
}

// ── Derive candidate name from filename ───────────────────────
function candidateName(filename) {
  return filename
    .replace(/\.(pdf|txt)$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim() || 'Candidate';
}

// ── Analyze ───────────────────────────────────────────────────
analyzeBtn.addEventListener('click', async () => {
  if (analyzeBtn.disabled) return;
  const jd = jdInput.value.trim();
  const weights = {
    kw:     kwWeight.value,
    dens:   densWeight.value,
    phrase: phraseWeight.value
  };

  // Show loading
  resultPlaceholder.style.display = 'none';
  resultContent.style.display     = 'none';
  resultLoading.style.display     = 'flex';
  analyzeBtn.disabled = true;
  analyzeBtnTxt.textContent = 'Analyzing…';

  const results = [];
  for (let i = 0; i < state.files.length; i++) {
    const entry = state.files[i];
    loadingProgress.textContent = `Processing ${i + 1} / ${state.files.length}: ${entry.name}`;
    await new Promise(r => setTimeout(r, 30)); // allow UI to update
    const text = await extractText(entry);
    const score = scoreResume(text, jd, weights);
    results.push({
      name: candidateName(entry.name),
      filename: entry.name,
      text,
      score
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score.total - a.score.total);
  state.results = results;

  // Show results
  resultLoading.style.display  = 'none';
  resultContent.style.display  = 'block';
  analyzeBtn.disabled = false;
  updateAnalyzeBtn();

  renderResults(results);
});

// ── Render results ────────────────────────────────────────────
function renderResults(results) {
  resultsCount.textContent = `${results.length} resume${results.length !== 1 ? 's' : ''}`;

  const avg = Math.round(results.reduce((s, r) => s + r.score.total, 0) / results.length);
  const top = results[0]?.score.total ?? 0;
  const qualified = results.filter(r => r.score.total >= 60).length;

  summaryBar.innerHTML = `
    <div class="summary-stat">
      <div class="summary-stat-val" style="color:var(--green)">${top}%</div>
      <div class="summary-stat-label">Top Score</div>
    </div>
    <div class="summary-stat">
      <div class="summary-stat-val" style="color:var(--accent2)">${avg}%</div>
      <div class="summary-stat-label">Avg Score</div>
    </div>
    <div class="summary-stat">
      <div class="summary-stat-val" style="color:var(--teal)">${qualified}</div>
      <div class="summary-stat-label">Qualified (≥60%)</div>
    </div>
  `;

  const medals = ['🥇','🥈','🥉'];
  resultsList.innerHTML = results.map((r, i) => {
    const tier = r.score.total >= 70 ? 'high' : r.score.total >= 45 ? 'mid' : 'low';
    const rankClass = i < 3 ? `rank-${i+1}` : '';
    const rankLabel = medals[i] ? `${medals[i]} #${i+1}` : `#${i+1}`;
    const matchedTags = r.score.matched.slice(0, 6).map(k =>
      `<span class="kw-matched">✓ ${escHtml(k)}</span>`).join('');
    const missingTags = r.score.missing.slice(0, 4).map(k =>
      `<span class="kw-missing">${escHtml(k)}</span>`).join('');
    return `
      <div class="result-card ${rankClass}" onclick="openModal(${i})" role="listitem" tabindex="0" aria-label="${escHtml(r.name)} - Score ${r.score.total}%">
        <div class="result-top">
          <div class="result-rank">${rankLabel}</div>
          <div class="result-name">${escHtml(r.name)}</div>
          <div class="result-score score-tier-${tier}">${r.score.total}%</div>
        </div>
        <div class="result-bar">
          <div class="result-bar-fill" style="width:${r.score.total}%"></div>
        </div>
        <div class="result-keywords">${matchedTags}${missingTags}</div>
      </div>`;
  }).join('');
}

// ── Modal ─────────────────────────────────────────────────────
window.openModal = function(index) {
  const r = state.results[index];
  if (!r) return;
  const tier = r.score.total >= 70 ? 'high' : r.score.total >= 45 ? 'mid' : 'low';
  const medals = ['🥇','🥈','🥉'];

  modalContent.innerHTML = `
    <div class="modal-header">
      <div class="modal-rank">${medals[index] || ''} Rank #${index + 1}</div>
      <div class="modal-name">${escHtml(r.name)}</div>
      <div class="modal-file">📄 ${escHtml(r.filename)}</div>
      <div class="modal-score-row">
        <div class="modal-score-item">
          <div class="modal-score-val score-tier-${tier}">${r.score.total}%</div>
          <div class="modal-score-lbl">Overall</div>
        </div>
        <div class="modal-score-item">
          <div class="modal-score-val" style="color:var(--accent2)">${r.score.kwScore}%</div>
          <div class="modal-score-lbl">Keyword Match</div>
        </div>
        <div class="modal-score-item">
          <div class="modal-score-val" style="color:var(--teal)">${r.score.densScore}%</div>
          <div class="modal-score-lbl">Density</div>
        </div>
        <div class="modal-score-item">
          <div class="modal-score-val" style="color:var(--yellow)">${r.score.phraseScore}%</div>
          <div class="modal-score-lbl">Phrase Match</div>
        </div>
      </div>
    </div>
    ${r.score.matched.length ? `
    <div class="modal-section">
      <div class="modal-section-title">✅ Matched Keywords (${r.score.matched.length})</div>
      <div class="modal-tags">${r.score.matched.map(k => `<span class="kw-matched">✓ ${escHtml(k)}</span>`).join('')}</div>
    </div>` : ''}
    ${r.score.missing.length ? `
    <div class="modal-section">
      <div class="modal-section-title">❌ Missing Keywords (${r.score.missing.length})</div>
      <div class="modal-tags">${r.score.missing.map(k => `<span class="kw-missing">${escHtml(k)}</span>`).join('')}</div>
    </div>` : ''}
    ${r.score.matchedPhrases?.length ? `
    <div class="modal-section">
      <div class="modal-section-title">🔗 Matched Phrases</div>
      <div class="modal-tags">${r.score.matchedPhrases.slice(0,8).map(p => `<span class="kw-matched">✓ ${escHtml(p)}</span>`).join('')}</div>
    </div>` : ''}
    <div class="modal-section">
      <div class="modal-section-title">📄 Resume Excerpt</div>
      <div class="modal-excerpt">${escHtml(r.text.slice(0, 800))}${r.text.length > 800 ? '…' : ''}</div>
    </div>
  `;
  modalOverlay.classList.add('open');
};

modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
function closeModal() { modalOverlay.classList.remove('open'); }

// ── Export CSV ────────────────────────────────────────────────
exportBtn.addEventListener('click', () => {
  if (!state.results.length) return;
  const header = 'Rank,Name,File,Overall Score,Keyword Match,Density Score,Phrase Score,Matched Keywords,Missing Keywords';
  const rows = state.results.map((r, i) => [
    i + 1,
    `"${r.name}"`,
    `"${r.filename}"`,
    r.score.total + '%',
    r.score.kwScore + '%',
    r.score.densScore + '%',
    r.score.phraseScore + '%',
    `"${r.score.matched.join(', ')}"`,
    `"${r.score.missing.join(', ')}"`
  ].join(','));
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'resume-rankings.csv'; a.click();
  URL.revokeObjectURL(url);
});

// ── Reset ─────────────────────────────────────────────────────
resetBtn.addEventListener('click', () => {
  state.files = [];
  state.results = [];
  jdInput.value = '';
  jdCharCount.textContent = '0 characters';
  keyPreview.style.display = 'none';
  fileList.innerHTML = '';
  resumeInput.value = '';
  resultContent.style.display  = 'none';
  resultLoading.style.display  = 'none';
  resultPlaceholder.style.display = 'flex';
  updateAnalyzeBtn();
});

// ── Util ──────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

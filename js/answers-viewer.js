// Wires up answers.html: decodes the `c`/`t`/`a` query params (written by
// buildAnswerQrUrl() in pdf-common.js, embedded in the answer QR code drawn
// by math-generator.js/japanese-generator.js) and renders a plain list of
// answers. No IndexedDB, no PDF rendering - everything a visitor needs
// arrives in the URL itself, since this whole site has no backend to look
// anything up on.

// The URL is fully attacker-controllable (anyone can craft a link), so its
// decoded content must never be inserted as raw HTML.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function showEmpty() {
  document.getElementById('empty-state').classList.remove('hidden');
  document.getElementById('answer-shell').classList.add('hidden');
}

function parseAnswerString(a) {
  // "1:56,2:102,..." (math, explicit index) or a plain "せ,と,わ,..." list
  // (Japanese, reading order - no prompt half, to keep the QR small) - an
  // entry with no colon falls back to its 1-based position as the label.
  return a.split(',').map((entry, i) => {
    const idx = entry.indexOf(':');
    if (idx === -1) return [String(i + 1), entry];
    return [entry.slice(0, idx), entry.slice(idx + 1)];
  });
}

// Earlier links used a single base64url JSON `d` param instead of separate
// c/t/a params - decode those too so an already-printed worksheet's QR
// doesn't just dead-end.
function parseLegacyPayload(d) {
  const payload = JSON.parse(base64UrlDecodeUtf8(d));
  if (!payload || typeof payload.a !== 'string') return null;
  return { c: payload.c, t: payload.t, a: payload.a };
}

function init() {
  const params = new URLSearchParams(location.search);
  const aParam = params.get('a');

  let data = null;
  try {
    if (aParam) {
      data = { c: params.get('c'), t: params.get('t'), a: base64UrlDecodeUtf8(aParam) };
    } else if (params.get('d')) {
      data = parseLegacyPayload(params.get('d'));
    }
  } catch (e) {
    console.error('Could not decode answer QR payload:', e);
  }
  if (!data) { showEmpty(); return; }

  document.getElementById('ans-title').textContent = data.t || 'Answer Key';
  document.getElementById('ans-code').textContent = data.c || '(no code)';

  const pairs = parseAnswerString(data.a).slice(0, 500);
  const list = document.getElementById('ans-list');
  list.innerHTML = pairs.map(([q, a]) => {
    const isNumeric = /^\d+$/.test(q);
    const label = isNumeric ? `Q${escapeHtml(q)}:` : escapeHtml(q);
    const sep = isNumeric ? '' : '&rarr;';
    return `
    <div class="flex items-baseline gap-1">
      <span class="font-semibold text-stone-500">${label}</span>
      ${sep ? `<span class="text-stone-400">${sep}</span>` : ''}
      <span>${escapeHtml(a)}</span>
    </div>
  `;
  }).join('');

  document.getElementById('answer-shell').classList.remove('hidden');
}

init();

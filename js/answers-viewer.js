// Wires up answers.html: decodes the `d` query param (written by
// buildAnswerQrUrl() in pdf-common.js, embedded in the parent-facing answer
// QR code drawn by math-generator.js/japanese-generator.js) and renders a
// plain list of answers. No IndexedDB, no PDF rendering - everything a
// visitor needs arrives in the URL itself, since this whole site has no
// backend to look anything up on.

// The `d` param is fully attacker-controllable (anyone can craft a link),
// so its decoded content must never be inserted as raw HTML.
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
  // "1:56,2:102,..." (math) or "セ:せ,ト:と,..." (Japanese) - split on the
  // FIRST colon per entry only, since a Japanese answer never contains one.
  return a.split(',').map((entry) => {
    const idx = entry.indexOf(':');
    if (idx === -1) return [entry, ''];
    return [entry.slice(0, idx), entry.slice(idx + 1)];
  });
}

function init() {
  const params = new URLSearchParams(location.search);
  const d = params.get('d');
  if (!d) { showEmpty(); return; }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecodeUtf8(d));
  } catch (e) {
    console.error('Could not decode answer QR payload:', e);
    showEmpty();
    return;
  }
  if (!payload || typeof payload.a !== 'string') { showEmpty(); return; }

  document.getElementById('ans-title').textContent = payload.t || 'Answer Key';
  document.getElementById('ans-code').textContent = payload.c || '(no code)';

  const pairs = parseAnswerString(payload.a).slice(0, 500);
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

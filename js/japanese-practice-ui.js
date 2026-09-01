// Wires up japanese-practice.html: mode toggling (single/row/all), builds
// the row checkboxes from HIRAGANA_ROWS, validates the character selection,
// and triggers PDF generation via pdf-lib.

function buildRowCheckboxes() {
  const container = document.getElementById('row-panel');
  container.innerHTML = HIRAGANA_ROWS.map((r) => `
    <label class="flex items-center gap-2 text-xs">
      <input type="checkbox" class="row-check h-4 w-4" value="${r.id}" ${r.id === 'A' ? 'checked' : ''} /> ${r.label} (${r.chars.join('')})
    </label>
  `).join('');
}

// Romaji reading per character, gojuon order (matches HIRAGANA_ROWS exactly)
// - shown alongside each dropdown option purely so a parent/teacher can find
// the right character without needing to read hiragana themselves.
const HIRAGANA_ROMAJI = {
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'を': 'wo', 'ん': 'n',
};

function buildSingleSelect() {
  const select = document.getElementById('cfg-single');
  select.innerHTML = HIRAGANA_ROWS.flatMap((r) => r.chars).map((c) => `
    <option value="${c}">${c} (${HIRAGANA_ROMAJI[c] || '?'})</option>
  `).join('');
}

function getMode() {
  return document.querySelector('input[name="cfg-mode"]:checked').value;
}

function syncModePanels() {
  const mode = getMode();
  document.getElementById('single-panel').classList.toggle('hidden', mode !== 'single');
  document.getElementById('row-panel').classList.toggle('hidden', mode !== 'row');
}

function buildConfig() {
  const mode = getMode();
  const selectedRows = Array.from(document.querySelectorAll('.row-check:checked')).map((el) => el.value);
  const singleValue = document.getElementById('cfg-single').value;
  const singleChars = singleValue ? [singleValue] : [];
  const repeats = Math.max(3, Math.min(30, parseInt(document.getElementById('cfg-repeats').value, 10) || 15));
  const includeWords = document.getElementById('cfg-words').checked;
  const title = document.getElementById('cfg-title').value;
  const teacher = document.getElementById('cfg-teacher').value;
  return { mode, selectedRows, singleChars, repeats, includeWords, title, teacher };
}

function updatePreviewSummary() {
  const cfg = buildConfig();
  const generator = new HiraganaPracticeGenerator(cfg);
  const chars = generator.selectedChars();
  const summary = document.getElementById('preview-summary');

  const modeLabel = cfg.mode === 'single' ? 'Single character(s)' : cfg.mode === 'row' ? 'By row (行)' : 'All 46 basic hiragana';
  const lines = [
    `<div><span class="font-semibold">Mode:</span> ${modeLabel}</div>`,
    `<div><span class="font-semibold">Characters selected:</span> ${chars.length ? chars.join(' ') : '(none - pick at least one)'}</div>`,
    `<div><span class="font-semibold">Repetitions per character:</span> ${cfg.repeats}</div>`,
    `<div><span class="font-semibold">Example words:</span> ${cfg.includeWords ? 'Yes (where available)' : 'No'}</div>`,
  ];
  summary.innerHTML = lines.join('');
}

async function handleGenerate() {
  const cfg = buildConfig();
  const generator = new HiraganaPracticeGenerator(cfg);
  const chars = generator.selectedChars();

  const status = document.getElementById('generate-status');
  if (!chars.length) {
    status.textContent = 'Pick at least one character first.';
    return;
  }

  const btn = document.getElementById('generate-btn');
  btn.disabled = true;
  status.textContent = 'Generating PDF...';

  const resultTab = window.open('', '_blank');

  try {
    const renderer = new HiraganaPracticeRenderer(cfg, chars);
    const bytes = await renderer.render();
    const filename = `hiragana_practice_${timestamp()}.pdf`;
    await openPdfResults(bytes, filename, 'japanese-practice.html', 'Hiragana Writing Practice', resultTab);
    status.textContent = 'Opened your worksheet in a new tab.';
  } catch (e) {
    console.error(e);
    status.textContent = 'Error generating PDF: ' + e.message;
    if (resultTab) resultTab.close();
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  buildRowCheckboxes();
  buildSingleSelect();
  syncModePanels();
  updatePreviewSummary();

  document.querySelectorAll('input[name="cfg-mode"]').forEach((el) => {
    el.addEventListener('change', () => { syncModePanels(); updatePreviewSummary(); });
  });
  document.getElementById('controls').addEventListener('input', updatePreviewSummary);
  document.getElementById('controls').addEventListener('change', updatePreviewSummary);
  document.getElementById('generate-btn').addEventListener('click', handleGenerate);
});

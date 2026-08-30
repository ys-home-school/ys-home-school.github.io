// Wires up japanese.html: reads controls -> WorksheetConfig, live HTML preview, PDF generation.

function buildJpConfig() {
  const categories = [];
  if (document.getElementById('cat-basic').checked) categories.push('basic');
  if (document.getElementById('cat-dakuten').checked) categories.push('dakuten');
  if (document.getElementById('cat-handakuten').checked) categories.push('handakuten');
  if (document.getElementById('cat-youon').checked) categories.push('youon');
  if (document.getElementById('cat-small').checked) categories.push('small');

  return {
    rows: parseInt(document.getElementById('cfg-rows').value, 10) || 1,
    columns: parseInt(document.getElementById('cfg-cols').value, 10) || 1,
    num_pages: parseInt(document.getElementById('cfg-pages').value, 10) || 1,
    categories,
    basic_ratio: parseInt(document.getElementById('cfg-basicratio').value, 10) || 0,
    allow_duplicates: document.getElementById('cfg-duplicates').checked,
    direction: document.querySelector('input[name="cfg-direction"]:checked').value,
    mixed_k2h_ratio: parseInt(document.getElementById('cfg-mixedratio').value, 10) || 50,
    is_ordered: document.querySelector('input[name="cfg-ordered"]:checked').value === '1',
    always_include: document.getElementById('cfg-always').value,
    show_settings_footer: document.getElementById('cfg-footer').checked,
    group_by_row: document.getElementById('cfg-group').checked,
    include_answer_key: document.getElementById('cfg-answerkey').checked,
  };
}

// The group-by-row checkbox only means anything in sequential mode, and it
// forces a 5-column grid (so consonant-row families line up in a table).
function syncGroupToggleAvailability() {
  const isOrdered = document.querySelector('input[name="cfg-ordered"]:checked').value === '1';
  const groupCheckbox = document.getElementById('cfg-group');
  const groupLabel = document.getElementById('group-toggle-label');
  const colsInput = document.getElementById('cfg-cols');

  groupCheckbox.disabled = !isOrdered;
  groupLabel.classList.toggle('opacity-40', !isOrdered);
  if (!isOrdered) groupCheckbox.checked = false;

  if (groupCheckbox.checked) {
    colsInput.value = 5;
    colsInput.disabled = true;
  } else {
    colsInput.disabled = false;
  }
}

function syncGenerateButtonLabel() {
  const btn = document.getElementById('generate-btn');
  if (!btn) return;
  const includeAnswerKey = document.getElementById('cfg-answerkey').checked;
  btn.textContent = includeAnswerKey ? 'Generate PDF (Worksheet + Answer Key)' : 'Generate PDF (Worksheet Only)';
}

const JP_STORAGE_KEY = 'ysschool.japanese.lastConfig.v1';
const ALL_CATEGORIES = ['basic', 'dakuten', 'handakuten', 'youon', 'small'];

// Each template cycles through a fixed sequence of states each time its
// button is clicked again (wrapping back to the start). 'basic-toggle' and
// 'dhy-toggle' cycle H->K sequential+grouped, K->H sequential+grouped, H->K
// randomized, K->H randomized. 'all-toggle' just flips k2h<->h2k (randomized).
// 'all-mixed' has a single state (always 'mixed', randomized).
const JP_TEMPLATES = {
  'basic-toggle': {
    categories: ['basic'], rows: 10, columns: 5,
    cycle: [
      { direction: 'h2k', is_ordered: true, group_by_row: true },
      { direction: 'k2h', is_ordered: true, group_by_row: true },
      { direction: 'h2k', is_ordered: false, group_by_row: false },
      { direction: 'k2h', is_ordered: false, group_by_row: false },
    ],
  },
  'all-toggle': {
    categories: ALL_CATEGORIES, rows: 10, columns: 5,
    cycle: [
      { direction: 'k2h', is_ordered: false, group_by_row: false },
      { direction: 'h2k', is_ordered: false, group_by_row: false },
    ],
  },
  'all-mixed': {
    categories: ALL_CATEGORIES, rows: 10, columns: 5,
    cycle: [{ direction: 'mixed', is_ordered: false, group_by_row: false }],
  },
  'dhy-toggle': {
    categories: ['dakuten', 'handakuten', 'youon'], rows: 12, columns: 5,
    cycle: [
      { direction: 'h2k', is_ordered: true, group_by_row: true },
      { direction: 'k2h', is_ordered: true, group_by_row: true },
      { direction: 'h2k', is_ordered: false, group_by_row: false },
      { direction: 'k2h', is_ordered: false, group_by_row: false },
    ],
  },
};

function sameCategorySet(a, b) {
  const sa = [...a].sort().join(',');
  const sb = [...b].sort().join(',');
  return sa === sb;
}

// Applies a partial config (template or restored save) onto the form controls.
function applyJpConfigToForm(cfg) {
  if (!cfg) return;
  if (cfg.rows != null) document.getElementById('cfg-rows').value = cfg.rows;
  if (cfg.columns != null) document.getElementById('cfg-cols').value = cfg.columns;
  if (cfg.num_pages != null) document.getElementById('cfg-pages').value = cfg.num_pages;
  if (cfg.categories) {
    for (const cat of ALL_CATEGORIES) {
      document.getElementById(`cat-${cat}`).checked = cfg.categories.includes(cat);
    }
  }
  if (cfg.basic_ratio != null) document.getElementById('cfg-basicratio').value = cfg.basic_ratio;
  if (cfg.allow_duplicates != null) document.getElementById('cfg-duplicates').checked = cfg.allow_duplicates;
  if (cfg.direction) {
    const el = document.querySelector(`input[name="cfg-direction"][value="${cfg.direction}"]`);
    if (el) el.checked = true;
  }
  if (cfg.mixed_k2h_ratio != null) document.getElementById('cfg-mixedratio').value = cfg.mixed_k2h_ratio;
  if (cfg.is_ordered != null) {
    const el = document.querySelector(`input[name="cfg-ordered"][value="${cfg.is_ordered ? '1' : '0'}"]`);
    if (el) el.checked = true;
  }
  if (cfg.always_include != null) document.getElementById('cfg-always').value = cfg.always_include;
  if (cfg.show_settings_footer != null) document.getElementById('cfg-footer').checked = cfg.show_settings_footer;
  if (cfg.group_by_row != null) document.getElementById('cfg-group').checked = cfg.group_by_row;
  if (cfg.include_answer_key != null) document.getElementById('cfg-answerkey').checked = cfg.include_answer_key;
  syncGroupToggleAvailability();
  syncGenerateButtonLabel();
}

function applyJpTemplate(name) {
  const template = JP_TEMPLATES[name];
  if (!template) return;

  const current = buildJpConfig();
  const stateMatches = (s) => sameCategorySet(current.categories, template.categories)
    && current.direction === s.direction
    && current.is_ordered === s.is_ordered
    && current.group_by_row === s.group_by_row;

  // If the form currently matches one of this template's states, advance to
  // the next one in the cycle (wrapping around); otherwise start at state 0.
  // (idx === -1 when nothing matches, and (-1 + 1) % length === 0, so this
  // needs no special-casing for the "fresh apply" case.)
  const idx = template.cycle.findIndex(stateMatches);
  const next = template.cycle[(idx + 1) % template.cycle.length];

  applyJpConfigToForm({
    categories: template.categories,
    rows: template.rows,
    columns: template.columns,
    ...next,
  });

  updateJpAll();
  saveJpConfig();
}

function saveJpConfig() {
  try {
    localStorage.setItem(JP_STORAGE_KEY, JSON.stringify(buildJpConfig()));
    const status = document.getElementById('autosave-status');
    if (status) status.textContent = 'Settings saved in this browser.';
  } catch (e) {
    // localStorage unavailable (private mode, quota, etc.) - not critical, just skip.
  }
}

function loadJpConfig() {
  try {
    const raw = localStorage.getItem(JP_STORAGE_KEY);
    if (!raw) return;
    applyJpConfigToForm(JSON.parse(raw));
    const status = document.getElementById('autosave-status');
    if (status) status.textContent = 'Restored your last-used settings.';
  } catch (e) {
    // Corrupt/unavailable saved data - fall back to the form's own defaults.
  }
}

// ---------- generation history (last 5) ----------
const JP_HISTORY_KEY = 'ysschool.japanese.history.v1';
const JP_HISTORY_MAX = 5;

function describeJpConfig(cfg) {
  const dirLabel = { k2h: 'K→H', h2k: 'H→K', mixed: 'Mixed' }[cfg.direction] || cfg.direction;
  const catLabel = cfg.categories.length === ALL_CATEGORIES.length ? 'All' : cfg.categories.join('+') || 'None';
  const orderLabel = cfg.is_ordered ? (cfg.group_by_row ? 'Seq+Grouped' : 'Sequential') : 'Random';
  const keyLabel = cfg.include_answer_key === false ? ', no key' : '';
  return `${dirLabel} | ${catLabel} | ${orderLabel} | ${cfg.rows}x${cfg.columns}${keyLabel}`;
}

function loadJpHistory() {
  try {
    const raw = localStorage.getItem(JP_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function pushJpHistory(cfg) {
  try {
    const history = loadJpHistory();
    history.unshift({ savedAt: new Date().toISOString(), config: cfg });
    localStorage.setItem(JP_HISTORY_KEY, JSON.stringify(history.slice(0, JP_HISTORY_MAX)));
    renderJpHistorySelect();
  } catch (e) {
    // localStorage unavailable - not critical, just skip.
  }
}

function renderJpHistorySelect() {
  const select = document.getElementById('history-select');
  if (!select) return;
  const history = loadJpHistory();
  select.innerHTML = '<option value="">Load a previous generation&hellip;</option>'
    + history.map((entry, i) => {
      const when = new Date(entry.savedAt).toLocaleString();
      return `<option value="${i}">${when} - ${describeJpConfig(entry.config)}</option>`;
    }).join('');
}

function loadJpHistoryEntry(index) {
  const history = loadJpHistory();
  const entry = history[index];
  if (!entry) return;
  applyJpConfigToForm(entry.config);
  updateJpAll();
  saveJpConfig();
}

// ---------- export/import settings as .ini ----------
function jpConfigToIni(cfg) {
  const lines = [
    '[LAYOUT]',
    `rows = ${cfg.rows}`,
    `cols = ${cfg.columns}`,
    `copies = ${cfg.num_pages}`,
    '',
    '[CATEGORIES]',
    ...ALL_CATEGORIES.map((cat) => `${cat} = ${cfg.categories.includes(cat)}`),
    `basic_ratio = ${cfg.basic_ratio}`,
    '',
    '[OPTIONS]',
    `direction = ${cfg.direction}`,
    `mixed_ratio = ${cfg.mixed_k2h_ratio}`,
    `ordered = ${cfg.is_ordered}`,
    `group_by_row = ${cfg.group_by_row}`,
    `duplicates = ${cfg.allow_duplicates}`,
    `always_include = ${cfg.always_include}`,
    `show_settings_footer = ${cfg.show_settings_footer}`,
    `include_answer_key = ${cfg.include_answer_key}`,
  ];
  return lines.join('\n') + '\n';
}

function jpConfigFromIni(text) {
  const cfg = {};
  const categories = [];
  const toBool = (v) => /^(true|1|yes)$/i.test(v.trim());
  let section = '';
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) { section = sectionMatch[1].toUpperCase(); continue; }
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();

    if (section === 'LAYOUT') {
      if (key === 'rows') cfg.rows = parseInt(value, 10);
      if (key === 'cols') cfg.columns = parseInt(value, 10);
      if (key === 'copies') cfg.num_pages = parseInt(value, 10);
    } else if (section === 'CATEGORIES') {
      if (ALL_CATEGORIES.includes(key) && toBool(value)) categories.push(key);
      if (key === 'basic_ratio') cfg.basic_ratio = parseInt(value, 10);
    } else if (section === 'OPTIONS') {
      if (key === 'direction') cfg.direction = value;
      if (key === 'mixed_ratio') cfg.mixed_k2h_ratio = parseInt(value, 10);
      if (key === 'ordered') cfg.is_ordered = toBool(value);
      if (key === 'group_by_row') cfg.group_by_row = toBool(value);
      if (key === 'duplicates') cfg.allow_duplicates = toBool(value);
      if (key === 'always_include') cfg.always_include = value;
      if (key === 'show_settings_footer') cfg.show_settings_footer = toBool(value);
      if (key === 'include_answer_key') cfg.include_answer_key = toBool(value);
    }
  }
  cfg.categories = categories;
  return cfg;
}

function exportJpIni() {
  const cfg = buildJpConfig();
  downloadTextFile(jpConfigToIni(cfg), `japanese_worksheet_settings_${timestamp()}.ini`, 'text/plain');
}

function importJpIni(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const cfg = jpConfigFromIni(String(reader.result));
      applyJpConfigToForm(cfg);
      updateJpAll();
      saveJpConfig();
      const status = document.getElementById('autosave-status');
      if (status) status.textContent = `Imported settings from ${file.name}.`;
    } catch (e) {
      alert('Could not read that .ini file: ' + e.message);
    }
  };
  reader.onerror = () => alert('Could not read that file.');
  reader.readAsText(file);
}

// Cached so prev/next pager clicks just repaint an already-generated page
// instead of re-running the (randomized!) generator and getting different
// content each time you navigate.
let jpPagesDataCache = null;
let jpPreviewPageIndex = 0;

// Recomputes pagesData for the current config, resets to page 1, and returns
// the pages-needed-per-copy figure (sequential mode) or null (randomized).
function computeJpPreview(cfg) {
  const grid = document.getElementById('preview-grid');
  try {
    const db = new KanaDatabase();
    const engine = new RandomizationEngine(cfg, db);
    jpPagesDataCache = engine.generatePagesData();
    jpPreviewPageIndex = 0;
    return engine.lastSequentialPagesNeeded;
  } catch (e) {
    jpPagesDataCache = null;
    grid.innerHTML = `<p class="text-xs text-red-600 col-span-full">${e.message}</p>`;
    return null;
  }
}

function updatePreviewPagerUI() {
  const label = document.getElementById('preview-pager-label');
  const prevBtn = document.getElementById('preview-prev');
  const nextBtn = document.getElementById('preview-next');
  const total = jpPagesDataCache ? jpPagesDataCache.length : 1;
  label.textContent = `Page ${jpPreviewPageIndex + 1} of ${total}`;
  prevBtn.disabled = jpPreviewPageIndex <= 0;
  nextBtn.disabled = jpPreviewPageIndex >= total - 1;
}

function goJpPreviewPage(delta) {
  if (!jpPagesDataCache || !jpPagesDataCache.length) return;
  jpPreviewPageIndex = Math.max(0, Math.min(jpPagesDataCache.length - 1, jpPreviewPageIndex + delta));
  renderJpPreviewPage(buildJpConfig());
}

function renderJpPreviewPage(cfg) {
  const grid = document.getElementById('preview-grid');
  grid.style.gridTemplateColumns = `repeat(${cfg.columns}, minmax(0, 1fr))`;
  grid.innerHTML = '';

  if (!jpPagesDataCache || !jpPagesDataCache.length) {
    updatePreviewPagerUI();
    return;
  }

  const page = jpPagesDataCache[jpPreviewPageIndex] || [];
  // Cap preview size for perf on very large grids.
  const rowsToShow = Math.min(page.length, 15);

  for (let r = 0; r < rowsToShow; r++) {
    for (const item of page[r]) {
      const cell = document.createElement('div');
      cell.className = 'worksheet-preview-cell p-2 flex flex-col items-center justify-center gap-1 min-h-[70px]';
      if (item.is_empty) {
        cell.classList.add('opacity-30');
        grid.appendChild(cell);
        continue;
      }
      const prompt = document.createElement('div');
      prompt.className = 'text-lg';
      prompt.textContent = item.prompt;
      const box = document.createElement('div');
      box.className = 'crosshair-box w-10 h-10';
      cell.appendChild(prompt);
      cell.appendChild(box);
      grid.appendChild(cell);
    }
  }
  updatePreviewPagerUI();
}

function updateSequentialPagesNote(pagesNeeded, copies) {
  const note = document.getElementById('sequential-pages-note');
  if (!note) return;
  if (pagesNeeded == null) {
    note.classList.add('hidden');
    return;
  }
  const totalPages = pagesNeeded * copies;
  note.textContent = pagesNeeded === 1
    ? `Fits on 1 page per copy (${totalPages} page${totalPages === 1 ? '' : 's'} total for ${copies} cop${copies === 1 ? 'y' : 'ies'}).`
    : `Requires ${pagesNeeded} pages per copy to show every selected kana in order (${totalPages} pages total for ${copies} cop${copies === 1 ? 'y' : 'ies'}).`;
  note.classList.remove('hidden');
}

function updateJpAll() {
  syncGroupToggleAvailability();
  syncGenerateButtonLabel();
  const cfg = buildJpConfig();
  const pagesNeeded = computeJpPreview(cfg);
  renderJpPreviewPage(cfg);
  updateSequentialPagesNote(pagesNeeded, Math.max(1, cfg.num_pages || 1));
}

async function handleJpGenerate() {
  const cfg = buildJpConfig();

  if (!cfg.categories.length && !cfg.always_include.trim()) {
    alert('Please select a category or provide mandatory characters.');
    return;
  }

  const status = document.getElementById('generate-status');
  const btn = document.getElementById('generate-btn');
  btn.disabled = true;
  status.textContent = 'Generating PDF...';

  // Open the results tab synchronously now (still within the click's user-
  // gesture context) and fill it in once the PDF is ready - opening it after
  // the awaits below risks the browser's popup blocker treating it as not
  // user-initiated.
  const resultTab = window.open('', '_blank');

  try {
    // Reuse whatever the live preview last computed (and the user may have
    // paged through) so the downloaded PDF matches what was previewed,
    // instead of drawing a fresh independent random result at generate-time.
    const pagesData = jpPagesDataCache || new RandomizationEngine(cfg, new KanaDatabase()).generatePagesData();

    const renderer = new PDFWorksheetRenderer(cfg, pagesData);
    const bytes = await renderer.renderCombined();
    const filename = cfg.include_answer_key
      ? `japanese_worksheet_and_answers_${timestamp()}.pdf`
      : `japanese_worksheet_${timestamp()}.pdf`;
    await openPdfResults(bytes, filename, 'japanese.html', 'Japanese Kana Worksheet Generator', resultTab);
    pushJpHistory(cfg);
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
  loadJpConfig();
  renderJpHistorySelect();

  // Excludes #history-select - it has its own dedicated handler below, and
  // double-firing would re-roll a fresh random draw right after the one that
  // handler just showed.
  const isPlainControlChange = (e) => e.target.id !== 'history-select';
  document.getElementById('controls').addEventListener('input', (e) => { if (isPlainControlChange(e)) { updateJpAll(); saveJpConfig(); } });
  document.getElementById('controls').addEventListener('change', (e) => { if (isPlainControlChange(e)) { updateJpAll(); saveJpConfig(); } });
  document.getElementById('generate-btn').addEventListener('click', handleJpGenerate);

  document.querySelectorAll('.template-btn').forEach((btn) => {
    btn.addEventListener('click', () => applyJpTemplate(btn.dataset.template));
  });

  document.getElementById('preview-prev').addEventListener('click', () => goJpPreviewPage(-1));
  document.getElementById('preview-next').addEventListener('click', () => goJpPreviewPage(1));

  document.getElementById('history-select').addEventListener('change', (e) => {
    if (e.target.value === '') return;
    loadJpHistoryEntry(parseInt(e.target.value, 10));
    e.target.value = ''; // reset to placeholder so the same entry can be re-picked later
  });

  document.getElementById('export-ini-btn').addEventListener('click', exportJpIni);
  document.getElementById('import-ini-btn').addEventListener('click', () => document.getElementById('import-ini-file').click());
  document.getElementById('import-ini-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importJpIni(file);
    e.target.value = ''; // allow re-importing the same file later
  });

  updateJpAll();
});

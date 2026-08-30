// Wires up math.html: reads controls -> MathConfig, renders a live HTML preview,
// validates weight totals / density, and triggers PDF generation via pdf-lib.

const OP_DEFAULT_WEIGHT = { '+': 50, '-': 50, '×': 0, '÷': 0 };
const RATIO_VALUES = Array.from({ length: 21 }, (_, i) => i * 5); // 0,5,...,100

function populateSelect(sel, values, selected) {
  sel.innerHTML = values.map((v) => `<option value="${v}">${v}</option>`).join('');
  sel.value = String(selected);
}

function initOpPanels() {
  document.querySelectorAll('#panel-standard fieldset[data-op]').forEach((fs) => {
    const op = fs.dataset.op;
    const weightSel = fs.querySelector('.op-weight');
    const cryptoSel = fs.querySelector('.op-cryptopct');
    populateSelect(weightSel, RATIO_VALUES, OP_DEFAULT_WEIGHT[op] ?? 25);
    if (cryptoSel) populateSelect(cryptoSel, RATIO_VALUES, 10);
  });
}

function readOpConfig(fs) {
  const g = (sel) => fs.querySelector(sel);
  return {
    enabled: g('.op-enabled') ? g('.op-enabled').checked : false,
    weight: g('.op-weight') ? parseInt(g('.op-weight').value, 10) : 0,
    digits_left: g('.op-digitsl') ? parseInt(g('.op-digitsl').value, 10) || 1 : 2,
    digits_right: g('.op-digitsr') ? parseInt(g('.op-digitsr').value, 10) || 1 : 1,
    max_number: g('.op-maxnum') ? (parseInt(g('.op-maxnum').value, 10) || 0) : 0,
    is_vertical: g('.op-vertical') ? g('.op-vertical').checked : false,
    allow_regrouping: g('.op-regroup') ? g('.op-regroup').checked : false,
    allow_remainder: g('.op-remainder') ? g('.op-remainder').checked : false,
    allow_negatives: g('.op-negatives') ? g('.op-negatives').checked : false,
    decimal_places: g('.op-decimals') ? parseInt(g('.op-decimals').value, 10) || 0 : 0,
    allow_crypto: g('.op-crypto') ? g('.op-crypto').checked : false,
    pct_crypto: g('.op-cryptopct') ? parseInt(g('.op-cryptopct').value, 10) : 10,
    num_terms: g('.op-terms') ? parseInt(g('.op-terms').value, 10) || 2 : 2,
    allow_zero: g('.op-allowzero') ? g('.op-allowzero').checked : false,
  };
}

function getCurrentMode() {
  const active = document.querySelector('.mode-tab.btn-key-primary');
  return active ? active.dataset.mode : 'standard';
}

function buildConfig() {
  const rows = parseInt(document.getElementById('cfg-rows').value, 10) || 1;
  const columns = parseInt(document.getElementById('cfg-cols').value, 10) || 1;
  const num_pages = parseInt(document.getElementById('cfg-pages').value, 10) || 1;
  const randomize_order = document.getElementById('cfg-randorder').checked;
  const mode = getCurrentMode();

  const ops = {};
  document.querySelectorAll('#panel-standard fieldset[data-op]').forEach((fs) => {
    ops[fs.dataset.op] = readOpConfig(fs);
  });

  const mixed_config = {
    enabled_ops: {
      '+': document.getElementById('mixed-add').checked,
      '-': document.getElementById('mixed-sub').checked,
      '×': document.getElementById('mixed-mul').checked,
      '÷': document.getElementById('mixed-div').checked,
    },
    max_digits: parseInt(document.getElementById('mixed-maxdigits').value, 10) || 2,
    num_operations: parseInt(document.getElementById('mixed-numops').value, 10) || 2,
    use_parentheses: document.getElementById('mixed-parens').checked,
    allow_negatives: document.getElementById('mixed-negatives').checked,
    decimal_places: parseInt(document.getElementById('mixed-decimals').value, 10) || 0,
    allow_zero: document.getElementById('mixed-allowzero').checked,
  };

  const simType = document.querySelector('input[name="sim-type"]:checked').value;
  const simultaneous_config = {
    type: simType,
    allow_negatives: document.getElementById('sim-negatives').checked,
    max_coef: parseInt(document.getElementById('sim-maxcoef').value, 10) || 5,
  };

  const include_answer_key = document.getElementById('cfg-answerkey').checked;

  return { rows, columns, num_pages, randomize_order, combined_pdf: true, mode, ops, mixed_config, simultaneous_config, include_answer_key };
}

// Reverse of readOpConfig() - writes an OpConfig-shaped object back onto one
// operator fieldset's controls. Fields absent from the fieldset (e.g. no
// .op-regroup on ÷) are silently skipped, matching readOpConfig's own guards.
function applyOpConfigToForm(fs, op) {
  const s = (sel, v) => { const el = fs.querySelector(sel); if (el && v != null) el.value = v; };
  const c = (sel, v) => { const el = fs.querySelector(sel); if (el && v != null) el.checked = v; };
  c('.op-enabled', op.enabled);
  s('.op-weight', op.weight);
  s('.op-digitsl', op.digits_left);
  s('.op-digitsr', op.digits_right);
  s('.op-maxnum', op.max_number);
  c('.op-vertical', op.is_vertical);
  c('.op-regroup', op.allow_regrouping);
  c('.op-remainder', op.allow_remainder);
  c('.op-negatives', op.allow_negatives);
  s('.op-decimals', op.decimal_places);
  c('.op-crypto', op.allow_crypto);
  s('.op-cryptopct', op.pct_crypto);
  s('.op-terms', op.num_terms);
  c('.op-allowzero', op.allow_zero);
}

// Applies a full (or partial) MathConfig back onto every control - used by
// both INI import and (in principle) any future "load a saved config" UI.
function applyMathConfigToForm(cfg) {
  if (!cfg) return;
  if (cfg.rows != null) document.getElementById('cfg-rows').value = cfg.rows;
  if (cfg.columns != null) document.getElementById('cfg-cols').value = cfg.columns;
  if (cfg.num_pages != null) document.getElementById('cfg-pages').value = cfg.num_pages;
  if (cfg.randomize_order != null) document.getElementById('cfg-randorder').checked = cfg.randomize_order;
  if (cfg.include_answer_key != null) document.getElementById('cfg-answerkey').checked = cfg.include_answer_key;
  if (cfg.mode) setMathMode(cfg.mode);

  if (cfg.ops) {
    document.querySelectorAll('#panel-standard fieldset[data-op]').forEach((fs) => {
      const op = cfg.ops[fs.dataset.op];
      if (op) applyOpConfigToForm(fs, op);
    });
  }

  if (cfg.mixed_config) {
    const mc = cfg.mixed_config;
    if (mc.enabled_ops) {
      if (mc.enabled_ops['+'] != null) document.getElementById('mixed-add').checked = mc.enabled_ops['+'];
      if (mc.enabled_ops['-'] != null) document.getElementById('mixed-sub').checked = mc.enabled_ops['-'];
      if (mc.enabled_ops['×'] != null) document.getElementById('mixed-mul').checked = mc.enabled_ops['×'];
      if (mc.enabled_ops['÷'] != null) document.getElementById('mixed-div').checked = mc.enabled_ops['÷'];
    }
    if (mc.max_digits != null) document.getElementById('mixed-maxdigits').value = mc.max_digits;
    if (mc.num_operations != null) document.getElementById('mixed-numops').value = mc.num_operations;
    if (mc.use_parentheses != null) document.getElementById('mixed-parens').checked = mc.use_parentheses;
    if (mc.allow_negatives != null) document.getElementById('mixed-negatives').checked = mc.allow_negatives;
    if (mc.decimal_places != null) document.getElementById('mixed-decimals').value = mc.decimal_places;
    if (mc.allow_zero != null) document.getElementById('mixed-allowzero').checked = mc.allow_zero;
  }

  if (cfg.simultaneous_config) {
    const sc = cfg.simultaneous_config;
    if (sc.type) {
      const el = document.querySelector(`input[name="sim-type"][value="${sc.type}"]`);
      if (el) el.checked = true;
    }
    if (sc.allow_negatives != null) document.getElementById('sim-negatives').checked = sc.allow_negatives;
    if (sc.max_coef != null) document.getElementById('sim-maxcoef').value = sc.max_coef;
  }
}

// ---------- grade-level quick templates ----------
// Only uses features the generator actually has (standard +/-/x/÷ with digit
// range/vertical/regrouping/negatives/decimals, mixed continuous equations,
// and 2-variable simultaneous equations) - no fractions/money/geometry/ratios/
// coordinate-plane/statistics, since none of those exist in the generator.
// Full OpConfig shape per operator, so every field the generator/UI reads is
// explicit and template-matching (below) can compare states reliably.
function op(overrides) {
  return {
    enabled: false, weight: 0, digits_left: 2, digits_right: 1, max_number: 0,
    is_vertical: false, allow_regrouping: false, allow_remainder: false,
    allow_negatives: false, decimal_places: 0, allow_crypto: false,
    pct_crypto: 10, num_terms: 2, allow_zero: false,
    ...overrides,
  };
}

const MATH_GRADE_TEMPLATES = {
  grade1: {
    label: 'Grade 1',
    cycle: [{
      rows: 5, columns: 4, mode: 'standard',
      ops: {
        '+': op({ enabled: true, weight: 50, digits_left: 1, is_vertical: false, allow_zero: true }),
        '-': op({ enabled: true, weight: 50, digits_left: 1, is_vertical: false, allow_zero: true }),
        '×': op({ digits_left: 1 }),
        '÷': op({ digits_left: 1 }),
      },
    }],
  },
  grade2: {
    label: 'Grade 2',
    cycle: [{
      rows: 5, columns: 4, mode: 'standard',
      ops: {
        '+': op({ enabled: true, weight: 35, digits_left: 3, is_vertical: false, allow_regrouping: true }),
        '-': op({ enabled: true, weight: 35, digits_left: 3, is_vertical: false, allow_regrouping: true }),
        '×': op({ enabled: true, weight: 15, digits_left: 1, is_vertical: false }),
        '÷': op({ enabled: true, weight: 15, digits_left: 1, is_vertical: false }),
      },
    }],
  },
  grade3: {
    label: 'Grade 3',
    cycle: [
      { // Multiplication & division fluency
        rows: 5, columns: 4, mode: 'standard',
        ops: {
          '+': op({ enabled: true, weight: 10, digits_left: 3, is_vertical: true, allow_regrouping: true }),
          '-': op({ enabled: true, weight: 10, digits_left: 3, is_vertical: true, allow_regrouping: true }),
          '×': op({ enabled: true, weight: 40, digits_left: 2, is_vertical: true }),
          '÷': op({ enabled: true, weight: 40, digits_left: 2, is_vertical: true }),
        },
      },
      { // Multi-step problems (mixed continuous expressions)
        rows: 4, columns: 2, mode: 'mixed_ops',
        mixed_config: {
          enabled_ops: { '+': true, '-': true, '×': true, '÷': true },
          max_digits: 2, num_operations: 2, use_parentheses: true,
          allow_negatives: false, decimal_places: 0, allow_zero: false,
        },
      },
    ],
  },
  grade4: {
    label: 'Grade 4',
    cycle: [
      { // Multi-digit whole-number arithmetic
        rows: 4, columns: 2, mode: 'standard',
        ops: {
          '+': op({ enabled: true, weight: 25, digits_left: 4, is_vertical: true, allow_regrouping: true }),
          '-': op({ enabled: true, weight: 25, digits_left: 4, is_vertical: true, allow_regrouping: true }),
          '×': op({ enabled: true, weight: 25, digits_left: 3, is_vertical: true }),
          '÷': op({ enabled: true, weight: 25, digits_left: 3, is_vertical: true, allow_remainder: true }),
        },
      },
      { // Decimals
        rows: 4, columns: 2, mode: 'standard',
        ops: {
          '+': op({ enabled: true, weight: 30, digits_left: 2, is_vertical: true, allow_regrouping: true, decimal_places: 1 }),
          '-': op({ enabled: true, weight: 30, digits_left: 2, is_vertical: true, allow_regrouping: true, decimal_places: 1 }),
          '×': op({ enabled: true, weight: 20, digits_left: 2, is_vertical: true, decimal_places: 1 }),
          '÷': op({ enabled: true, weight: 20, digits_left: 2, is_vertical: true, decimal_places: 1 }),
        },
      },
    ],
  },
  grade5: {
    label: 'Grade 5',
    cycle: [
      { // Decimal operations
        rows: 4, columns: 2, mode: 'standard',
        ops: {
          '+': op({ enabled: true, weight: 25, digits_left: 3, is_vertical: true, allow_regrouping: true, decimal_places: 2 }),
          '-': op({ enabled: true, weight: 25, digits_left: 3, is_vertical: true, allow_regrouping: true, decimal_places: 2 }),
          '×': op({ enabled: true, weight: 25, digits_left: 3, is_vertical: true, decimal_places: 2 }),
          '÷': op({ enabled: true, weight: 25, digits_left: 3, is_vertical: true, decimal_places: 2 }),
        },
      },
      { // Intro algebraic thinking (single unknown)
        rows: 4, columns: 2, mode: 'simultaneous',
        simultaneous_config: { type: 'substitution_simple', allow_negatives: false, max_coef: 5 },
      },
    ],
  },
  grade6: {
    label: 'Grade 6',
    cycle: [
      { // Negative numbers
        rows: 5, columns: 4, mode: 'standard',
        ops: {
          '+': op({ enabled: true, weight: 25, digits_left: 2, is_vertical: false, allow_regrouping: true, allow_negatives: true }),
          '-': op({ enabled: true, weight: 25, digits_left: 2, is_vertical: false, allow_regrouping: true, allow_negatives: true }),
          '×': op({ enabled: true, weight: 25, digits_left: 2, is_vertical: false, allow_negatives: true }),
          '÷': op({ enabled: true, weight: 25, digits_left: 2, is_vertical: false, allow_negatives: true }),
        },
      },
      { // Equations (2-variable)
        rows: 4, columns: 2, mode: 'simultaneous',
        simultaneous_config: { type: 'standard', allow_negatives: true, max_coef: 6 },
      },
    ],
  },
};

// Extracts just the fields grade templates actually set, so we can tell
// whether the form currently matches a given template state (to know
// whether to advance the cycle or start fresh) without a fragile deep-equal
// over the entire MathConfig.
function mathTemplateSignature(cfg) {
  if (cfg.mode === 'mixed_ops') {
    return JSON.stringify({ mode: cfg.mode, mixed_config: cfg.mixed_config });
  }
  if (cfg.mode === 'simultaneous') {
    return JSON.stringify({ mode: cfg.mode, simultaneous_config: cfg.simultaneous_config });
  }
  const ops = {};
  for (const k of ['+', '-', '×', '÷']) {
    const o = cfg.ops[k] || {};
    ops[k] = {
      enabled: o.enabled, weight: o.weight, digits_left: o.digits_left, is_vertical: o.is_vertical,
      allow_regrouping: o.allow_regrouping, allow_remainder: o.allow_remainder,
      allow_negatives: o.allow_negatives, decimal_places: o.decimal_places,
    };
  }
  return JSON.stringify({ mode: cfg.mode, ops });
}

function applyMathTemplate(name) {
  const template = MATH_GRADE_TEMPLATES[name];
  if (!template) return;

  const currentSignature = mathTemplateSignature(buildConfig());
  const idx = template.cycle.findIndex((state) => mathTemplateSignature(state) === currentSignature);
  // idx === -1 when nothing matches; (-1 + 1) % length === 0, so this needs
  // no special-casing for "apply fresh" vs "advance to the next state".
  const next = template.cycle[(idx + 1) % template.cycle.length];

  applyMathConfigToForm(next);
  updateAll();
}

// ---------- export/import settings as .ini ----------
// Mirrors the section layout the original Tkinter app's configparser used
// (GLOBAL + one OP_<symbol> section per operator), plus MIXED/SIMULTANEOUS
// sections for this port's two extra modes.
const MATH_OPS = ['+', '-', '×', '÷'];

function mathConfigToIni(cfg) {
  const lines = [
    '[GLOBAL]',
    `rows = ${cfg.rows}`,
    `cols = ${cfg.columns}`,
    `copies = ${cfg.num_pages}`,
    `randomize_order = ${cfg.randomize_order}`,
    `mode = ${cfg.mode}`,
    `include_answer_key = ${cfg.include_answer_key}`,
    '',
  ];
  for (const op of MATH_OPS) {
    const o = cfg.ops[op] || {};
    lines.push(`[OP_${op}]`);
    lines.push(`enabled = ${!!o.enabled}`);
    lines.push(`weight = ${o.weight ?? 0}`);
    lines.push(`digits_left = ${o.digits_left ?? 2}`);
    lines.push(`digits_right = ${o.digits_right ?? 1}`);
    lines.push(`max_number = ${o.max_number ?? 0}`);
    lines.push(`is_vertical = ${!!o.is_vertical}`);
    lines.push(`allow_regrouping = ${!!o.allow_regrouping}`);
    lines.push(`allow_remainder = ${!!o.allow_remainder}`);
    lines.push(`allow_negatives = ${!!o.allow_negatives}`);
    lines.push(`decimal_places = ${o.decimal_places ?? 0}`);
    lines.push(`allow_crypto = ${!!o.allow_crypto}`);
    lines.push(`pct_crypto = ${o.pct_crypto ?? 10}`);
    lines.push(`num_terms = ${o.num_terms ?? 2}`);
    lines.push(`allow_zero = ${!!o.allow_zero}`);
    lines.push('');
  }
  lines.push('[MIXED]');
  lines.push(`add = ${!!cfg.mixed_config.enabled_ops['+']}`);
  lines.push(`sub = ${!!cfg.mixed_config.enabled_ops['-']}`);
  lines.push(`mul = ${!!cfg.mixed_config.enabled_ops['×']}`);
  lines.push(`div = ${!!cfg.mixed_config.enabled_ops['÷']}`);
  lines.push(`max_digits = ${cfg.mixed_config.max_digits}`);
  lines.push(`num_operations = ${cfg.mixed_config.num_operations}`);
  lines.push(`use_parentheses = ${cfg.mixed_config.use_parentheses}`);
  lines.push(`allow_negatives = ${cfg.mixed_config.allow_negatives}`);
  lines.push(`decimal_places = ${cfg.mixed_config.decimal_places}`);
  lines.push(`allow_zero = ${cfg.mixed_config.allow_zero}`);
  lines.push('');
  lines.push('[SIMULTANEOUS]');
  lines.push(`type = ${cfg.simultaneous_config.type}`);
  lines.push(`allow_negatives = ${cfg.simultaneous_config.allow_negatives}`);
  lines.push(`max_coef = ${cfg.simultaneous_config.max_coef}`);

  return lines.join('\n') + '\n';
}

function mathConfigFromIni(text) {
  const cfg = { ops: {}, mixed_config: { enabled_ops: {} }, simultaneous_config: {} };
  const toBool = (v) => /^(true|1|yes)$/i.test(v.trim());
  const toInt = (v) => parseInt(v, 10);
  let section = '';
  let currentOp = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      if (section.startsWith('OP_')) {
        currentOp = section.slice(3);
        cfg.ops[currentOp] = {};
      } else {
        section = section.toUpperCase();
        currentOp = null;
      }
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();

    if (currentOp) {
      const o = cfg.ops[currentOp];
      if (key === 'enabled') o.enabled = toBool(value);
      else if (key === 'weight') o.weight = toInt(value);
      else if (key === 'digits_left') o.digits_left = toInt(value);
      else if (key === 'digits_right') o.digits_right = toInt(value);
      else if (key === 'max_number') o.max_number = toInt(value);
      else if (key === 'is_vertical') o.is_vertical = toBool(value);
      else if (key === 'allow_regrouping') o.allow_regrouping = toBool(value);
      else if (key === 'allow_remainder') o.allow_remainder = toBool(value);
      else if (key === 'allow_negatives') o.allow_negatives = toBool(value);
      else if (key === 'decimal_places') o.decimal_places = toInt(value);
      else if (key === 'allow_crypto') o.allow_crypto = toBool(value);
      else if (key === 'pct_crypto') o.pct_crypto = toInt(value);
      else if (key === 'num_terms') o.num_terms = toInt(value);
      else if (key === 'allow_zero') o.allow_zero = toBool(value);
    } else if (section === 'GLOBAL') {
      if (key === 'rows') cfg.rows = toInt(value);
      else if (key === 'cols') cfg.columns = toInt(value);
      else if (key === 'copies') cfg.num_pages = toInt(value);
      else if (key === 'randomize_order') cfg.randomize_order = toBool(value);
      else if (key === 'mode') cfg.mode = value;
      else if (key === 'include_answer_key') cfg.include_answer_key = toBool(value);
    } else if (section === 'MIXED') {
      if (key === 'add') cfg.mixed_config.enabled_ops['+'] = toBool(value);
      else if (key === 'sub') cfg.mixed_config.enabled_ops['-'] = toBool(value);
      else if (key === 'mul') cfg.mixed_config.enabled_ops['×'] = toBool(value);
      else if (key === 'div') cfg.mixed_config.enabled_ops['÷'] = toBool(value);
      else if (key === 'max_digits') cfg.mixed_config.max_digits = toInt(value);
      else if (key === 'num_operations') cfg.mixed_config.num_operations = toInt(value);
      else if (key === 'use_parentheses') cfg.mixed_config.use_parentheses = toBool(value);
      else if (key === 'allow_negatives') cfg.mixed_config.allow_negatives = toBool(value);
      else if (key === 'decimal_places') cfg.mixed_config.decimal_places = toInt(value);
      else if (key === 'allow_zero') cfg.mixed_config.allow_zero = toBool(value);
    } else if (section === 'SIMULTANEOUS') {
      if (key === 'type') cfg.simultaneous_config.type = value;
      else if (key === 'allow_negatives') cfg.simultaneous_config.allow_negatives = toBool(value);
      else if (key === 'max_coef') cfg.simultaneous_config.max_coef = toInt(value);
    }
  }
  return cfg;
}

function exportMathIni() {
  const cfg = buildConfig();
  downloadTextFile(mathConfigToIni(cfg), `math_worksheet_settings_${timestamp()}.ini`, 'text/plain');
}

function importMathIni(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const cfg = mathConfigFromIni(String(reader.result));
      applyMathConfigToForm(cfg);
      updateAll();
      const status = document.getElementById('generate-status');
      if (status) status.textContent = `Imported settings from ${file.name}.`;
    } catch (e) {
      alert('Could not read that .ini file: ' + e.message);
    }
  };
  reader.onerror = () => alert('Could not read that file.');
  reader.readAsText(file);
}

function validateWeights(cfg) {
  const warn = document.getElementById('weight-warning');
  if (cfg.mode !== 'standard') { warn.classList.add('hidden'); return true; }
  const total = Object.values(cfg.ops).filter((o) => o.enabled).reduce((s, o) => s + o.weight, 0);
  if (total !== 100) {
    warn.textContent = `Total mix percentage for enabled operators must equal exactly 100%. Current total: ${total}%`;
    warn.classList.remove('hidden');
    return false;
  }
  warn.classList.add('hidden');
  return true;
}

function checkDensity(cfg) {
  const warnEl = document.getElementById('density-warning');
  const maxRecommendedRows = cfg.mode === 'simultaneous' ? 5 : 10;
  const dense = cfg.rows > maxRecommendedRows || cfg.rows * cfg.columns > 24;
  if (dense) {
    warnEl.textContent = `Layout (${cfg.rows} rows x ${cfg.columns} cols) exceeds recommended spacing for ${cfg.mode.replace('_', ' ')} problems - content may look tightly packed.`;
    warnEl.classList.remove('hidden');
  } else {
    warnEl.classList.add('hidden');
  }
  return dense;
}

// ---------- live HTML preview ----------
function renderPreview(cfg) {
  const grid = document.getElementById('preview-grid');
  grid.style.gridTemplateColumns = `repeat(${cfg.columns}, minmax(0, 1fr))`;
  const total = Math.min(cfg.rows * cfg.columns, 60); // cap preview render for performance
  grid.innerHTML = '';

  let generator, pages;
  try {
    generator = new MathGenerator(cfg);
    pages = generator.generatePages();
  } catch (e) {
    grid.innerHTML = `<p class="text-xs text-red-600 col-span-full">Preview error: ${e.message}</p>`;
    return;
  }

  const problems = (pages[0] || []).slice(0, total);
  if (!problems.length) {
    grid.innerHTML = '<p class="text-xs text-slate-400 col-span-full">No problems to preview - enable at least one operator with a nonzero weight.</p>';
    return;
  }

  problems.forEach((prob, i) => {
    const cell = document.createElement('div');
    cell.className = 'worksheet-preview-cell p-2 text-xs flex flex-col gap-1 min-h-[70px]';
    const idx = document.createElement('span');
    idx.className = 'worksheet-index text-slate-700';
    idx.textContent = `${i + 1}.`;
    cell.appendChild(idx);

    const body = document.createElement('div');
    body.className = 'flex-1 flex items-center justify-center';

    if (prob.operator === 'simultaneous') {
      body.innerHTML = `<div class="text-center leading-tight">
        <div>${prob.sim_lines[0]}</div>
        <div>${prob.sim_lines[1]}</div>
        <div class="mt-1 text-slate-400">x = <span class="answer-box px-2">&nbsp;</span> y = <span class="answer-box px-2">&nbsp;</span></div>
      </div>`;
    } else if (prob.operator === 'mixed') {
      body.textContent = prob.expr_parts.join(' ') + ' = ?';
    } else if (prob.is_vertical) {
      if (prob.operator === '÷') {
        body.innerHTML = `<div class="text-center">${prob.expr_parts[2]} ÷ ${prob.expr_parts[0]} = <span class="answer-box px-2">?</span></div>`;
      } else {
        body.innerHTML = `<div class="text-right leading-tight font-mono">
          <div>${prob.expr_parts[0]}</div>
          <div>${prob.expr_parts[1]} ${prob.expr_parts[2]}</div>
          <div class="border-t border-slate-400 pt-0.5"><span class="answer-box px-2">?</span></div>
        </div>`;
      }
    } else {
      const parts = prob.expr_parts.map((p, pi) => (prob.is_cryptarithm && pi === prob.missing_index) ? '<span class="answer-box px-1">?</span>' : p).join(' ');
      body.innerHTML = `<span>${parts} = <span class="answer-box px-2">?</span></span>`;
    }
    cell.appendChild(body);
    grid.appendChild(cell);
  });
}

function syncGenerateButtonLabel(cfg) {
  const btn = document.getElementById('generate-btn');
  if (!btn) return;
  btn.textContent = cfg.include_answer_key ? 'Generate PDF (Worksheet + Answer Key)' : 'Generate PDF (Worksheet Only)';
}

function updateAll() {
  const cfg = buildConfig();
  validateWeights(cfg);
  checkDensity(cfg);
  renderPreview(cfg);
  syncGenerateButtonLabel(cfg);
}

function setMathMode(mode) {
  const btn = document.querySelector(`.mode-tab[data-mode="${mode}"]`);
  if (!btn) return;
  document.querySelectorAll('.mode-tab').forEach((b) => {
    b.classList.remove('btn-key-primary');
    b.classList.add('btn-key-cream');
  });
  btn.classList.add('btn-key-primary');
  btn.classList.remove('btn-key-cream');

  document.querySelectorAll('.mode-panel').forEach((p) => p.classList.add('hidden'));
  document.getElementById(`panel-${mode}`).classList.remove('hidden');
}

function initTabs() {
  document.querySelectorAll('.mode-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      setMathMode(btn.dataset.mode);
      updateAll();
    });
  });
}

function bindLiveInputs() {
  document.getElementById('controls').addEventListener('input', updateAll);
  document.getElementById('controls').addEventListener('change', updateAll);
}

async function handleGenerate() {
  const cfg = buildConfig();
  if (!validateWeights(cfg)) {
    alert('Total mix percentage for enabled operators must equal exactly 100% before generating.');
    return;
  }
  if (checkDensity(cfg)) {
    const proceed = confirm(`The selected row/column layout (${cfg.rows} rows x ${cfg.columns} columns) exceeds recommended spacing limits.\n\nQuestions may appear tightly packed or overlap. Continue anyway?`);
    if (!proceed) return;
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
    const generator = new MathGenerator(cfg);
    const pages = generator.generatePages();
    if (!pages.length || !pages[0].length) {
      status.textContent = 'Nothing to generate - check your operator settings.';
      if (resultTab) resultTab.close();
      btn.disabled = false;
      return;
    }

    const renderer = new MathPDFRenderer(cfg, pages);
    const bytes = await renderer.renderCombined();
    const filename = cfg.include_answer_key
      ? `math_worksheet_and_answers_${timestamp()}.pdf`
      : `math_worksheet_${timestamp()}.pdf`;
    await openPdfResults(bytes, filename, 'math.html', 'Math Worksheet Generator', resultTab);
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
  initOpPanels();
  initTabs();
  bindLiveInputs();
  document.getElementById('generate-btn').addEventListener('click', handleGenerate);

  document.querySelectorAll('.grade-template-btn').forEach((btn) => {
    btn.addEventListener('click', () => applyMathTemplate(btn.dataset.gradeTemplate));
  });

  document.getElementById('export-ini-btn').addEventListener('click', exportMathIni);
  document.getElementById('import-ini-btn').addEventListener('click', () => document.getElementById('import-ini-file').click());
  document.getElementById('import-ini-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importMathIni(file);
    e.target.value = ''; // allow re-importing the same file later
  });

  updateAll();
});

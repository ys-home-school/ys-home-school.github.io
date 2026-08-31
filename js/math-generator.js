// Port of "math test advanced.py" (MathGenerator + MathPDFRenderer).
// All algorithms below mirror the Python 1:1 including RNG call order where
// it matters for behavioral parity (exact sequences will differ since this
// uses JS Math.random, but the shape/logic/distributions match).

// ---------- small RNG helpers mirroring Python's random module ----------
function randInt(a, b) { // inclusive both ends, like Python random.randint
  return Math.floor(Math.random() * (b - a + 1)) + a;
}
function randChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- safe tokenized arithmetic evaluator (NO eval/Function) ----------
// Operates on an already-tokenized array like [2, '+', 3, '(', 4, '-', 1, ')'].
// Standard precedence: () > * / > + -. Returns a number or null on failure.
function evalTokens(tokens) {
  let pos = 0;
  function peek() { return tokens[pos]; }
  function next() { return tokens[pos++]; }

  function parseExpr() {
    let val = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const rhs = parseTerm();
      val = op === '+' ? val + rhs : val - rhs;
    }
    return val;
  }
  function parseTerm() {
    let val = parseFactor();
    while (peek() === '×' || peek() === '÷' || peek() === '*' || peek() === '/') {
      const op = next();
      const rhs = parseFactor();
      if (op === '×' || op === '*') val = val * rhs;
      else {
        if (rhs === 0) throw new Error('div by zero');
        val = val / rhs;
      }
    }
    return val;
  }
  function parseFactor() {
    const t = next();
    if (t === '(') {
      const val = parseExpr();
      if (next() !== ')') throw new Error('expected )');
      return val;
    }
    if (typeof t === 'number') return t;
    throw new Error('unexpected token ' + t);
  }

  try {
    const result = parseExpr();
    if (pos !== tokens.length) return null;
    return result;
  } catch (e) {
    return null;
  }
}

// ---------- data model defaults (mirrors OpConfig / MathConfig dataclasses) ----------
function makeOpConfig(overrides = {}) {
  return Object.assign({
    enabled: true, weight: 25, digits_left: 2, digits_right: 1, max_number: 0,
    is_vertical: false, allow_regrouping: false, pct_regrouping: 30,
    allow_remainder: false, allow_negatives: false, decimal_places: 0,
    allow_crypto: false, pct_crypto: 10, num_terms: 2, allow_zero: false,
  }, overrides);
}

class MathGenerator {
  constructor(config) {
    this.config = config; // { rows, columns, num_pages, randomize_order, mode, ops, mixed_config, simultaneous_config }
  }

  _formatVal(val, decimals) {
    if (decimals === 0) return Math.round(val);
    const f = Math.pow(10, decimals);
    return Math.round(val * f) / f;
  }

  _getMaxLimit(opCfg) {
    const digMax = Math.pow(10, opCfg.digits_left) - 1;
    if (opCfg.max_number <= 0) return digMax;
    return Math.min(digMax, opCfg.max_number);
  }

  _generateSingleTerm(opCfg, allowZero, avoidOne = false) {
    const ml = this._getMaxLimit(opCfg);
    const minVal = allowZero ? 0 : 1;
    let raw = randInt(minVal, ml);
    let attempts = 0;
    while (avoidOne && raw === 1 && attempts < 50) {
      raw = randInt(minVal, ml);
      attempts++;
    }
    let val;
    if (opCfg.decimal_places > 0) {
      const f = Math.pow(10, opCfg.decimal_places);
      val = Math.round((raw / f) * f) / f;
    } else {
      val = raw;
    }
    if (opCfg.allow_negatives && Math.random() < 0.5) val = -val;
    return val;
  }

  _generateStandardProblem(operator, opCfg) {
    const ml = this._getMaxLimit(opCfg);
    const numTerms = opCfg.num_terms;

    for (let attempts = 0; attempts < 100; attempts++) {
      const terms = [];
      for (let i = 0; i < numTerms; i++) {
        const avoid1 = (operator === '×' || operator === '÷') && Math.random() > 0.15;
        terms.push(this._generateSingleTerm(opCfg, opCfg.allow_zero, avoid1));
      }

      if (operator === '+') {
        let ans = terms.reduce((a, b) => a + b, 0);
        ans = this._formatVal(ans, opCfg.decimal_places);
        const expr = [];
        terms.forEach((t, i) => { if (i > 0) expr.push('+'); expr.push(t); });
        return [expr, ans];
      }

      if (operator === '-') {
        if (!opCfg.allow_negatives) terms.sort((a, b) => b - a);
        let ans = terms[0];
        for (let i = 1; i < terms.length; i++) ans -= terms[i];
        ans = this._formatVal(ans, opCfg.decimal_places);
        const expr = [];
        terms.forEach((t, i) => { if (i > 0) expr.push('-'); expr.push(t); });
        return [expr, ans];
      }

      if (operator === '×') {
        let ans = terms[0];
        for (let i = 1; i < terms.length; i++) ans *= terms[i];
        ans = this._formatVal(ans, opCfg.decimal_places * numTerms);
        const expr = [];
        terms.forEach((t, i) => { if (i > 0) expr.push('×'); expr.push(t); });
        return [expr, ans];
      }

      if (operator === '÷') {
        let op2 = terms[1];
        if (op2 === 0) op2 = 2;
        if (opCfg.allow_remainder && opCfg.decimal_places === 0) {
          let divisor = Math.abs(Math.trunc(op2));
          if (divisor <= 1) divisor = 2;
          const quotient = randInt(1, Math.max(1, Math.floor(ml / divisor)));
          const remainder = divisor > 1 ? randInt(1, divisor - 1) : 0;
          const dividend = quotient * divisor + remainder;
          const ans = remainder > 0 ? `${quotient} R ${remainder}` : String(quotient);
          return [[dividend, '÷', divisor], ans];
        } else {
          const rawAns = randInt(1, ml);
          const rawDiv = randInt(opCfg.allow_zero ? 2 : 1, Math.min(ml, 12));
          const dividend = rawAns * rawDiv;
          const dec = opCfg.decimal_places;
          const f = Math.pow(10, dec);
          const op1 = dec > 0 ? Math.round((dividend / f) * f) / f : dividend;
          const op2v = dec > 0 ? Math.round((rawDiv / f) * f) / f : rawDiv;
          const ans = this._formatVal(rawAns, dec);
          return [[op1, '÷', op2v], ans];
        }
      }
    }
    return [[2, operator, 2], 1];
  }

  _generateCleanMixedProblem() {
    const mc = this.config.mixed_config;
    let activeOps = Object.entries(mc.enabled_ops).filter(([, v]) => v).map(([k]) => k);
    if (activeOps.length === 0) activeOps = ['+'];

    const numOps = mc.num_operations;
    const numTerms = numOps + 1;
    const ml = Math.pow(10, mc.max_digits) - 1;
    const minVal = mc.allow_zero ? 0 : 1;

    for (let attempts = 0; attempts < 400; attempts++) {
      const terms = [];
      for (let i = 0; i < numTerms; i++) {
        const t = ml >= 2 ? randInt(Math.max(minVal, 2), ml) : randInt(minVal, ml);
        terms.push(t);
      }

      const ops = [];
      for (let i = 0; i < numOps; i++) ops.push(randChoice(activeOps));

      ops.forEach((op, i) => {
        if (op === '÷') {
          const divisor = randInt(2, Math.min(9, Math.abs(Math.trunc(terms[i]))));
          const quotient = randInt(2, 9);
          terms[i] = quotient * divisor;
          terms[i + 1] = divisor;
        }
      });

      let tokens = [];
      terms.forEach((t, i) => {
        tokens.push(t);
        if (i < ops.length) tokens.push(ops[i]);
      });

      const useParen = mc.use_parentheses && tokens.length >= 5 && Math.random() < 0.7;
      if (useParen) {
        if (tokens.length === 5) {
          if (Math.random() < 0.5) tokens = ['(', ...tokens.slice(0, 3), ')', ...tokens.slice(3)];
          else tokens = [...tokens.slice(0, 2), '(', ...tokens.slice(2), ')'];
        } else if (tokens.length === 7) {
          if (Math.random() < 0.5) tokens = ['(', ...tokens.slice(0, 3), ')', ...tokens.slice(3)];
          else tokens = [...tokens.slice(0, 2), '(', ...tokens.slice(2, 5), ')', ...tokens.slice(5)];
        }
      }

      try {
        if (tokens.includes('(')) {
          const pStart = tokens.indexOf('(');
          const pEnd = tokens.indexOf(')');
          const subTokens = tokens.slice(pStart + 1, pEnd);
          const subVal = evalTokens(subTokens);
          if (subVal === null || subVal < 0) continue;
        }

        let ans = evalTokens(tokens);
        if (ans === null) continue;
        if (!mc.allow_negatives && ans < 0) continue;
        if (Math.abs(ans) > 9999 || (!Number.isInteger(ans) && mc.decimal_places === 0)) continue;

        ans = this._formatVal(ans, mc.decimal_places);
        if (Math.abs(ans) > Math.pow(10, mc.max_digits + 1) - 1) continue;

        return [tokens, ans];
      } catch (e) {
        continue;
      }
    }
    return [[2, '+', 3], 5];
  }

  _generateSimultaneousProblem() {
    const sc = this.config.simultaneous_config;
    const maxC = sc.max_coef;
    const allowNeg = sc.allow_negatives;
    const stype = sc.type;

    const formatEq = (a, b, c) => {
      let partA = a !== 1 ? `${a}x` : 'x';
      if (a === 0) partA = '';
      let partB;
      if (b > 0) {
        const raw = b !== 1 ? `+ ${b}y` : `+ y`;
        partB = partA ? raw : (b !== 1 ? `${b}y` : 'y');
      } else if (b < 0) {
        const absB = Math.abs(b);
        partB = absB !== 1 ? `- ${absB}y` : `- y`;
      } else {
        partB = '';
      }
      let lhs = `${partA} ${partB}`.trim();
      lhs = lhs.replace('+ -', '- ');
      return `${lhs} = ${c}`;
    };

    for (let attempts = 0; attempts < 300; attempts++) {
      let xVal = randInt(allowNeg ? -5 : 1, 9);
      let yVal = randInt(allowNeg ? -5 : 1, 9);
      if (xVal === 0 && yVal === 0) xVal = 1;

      const a1 = randInt(1, maxC);
      let b1 = randInt(allowNeg ? -maxC : 1, maxC);
      if (b1 === 0) b1 = 1;
      const c1 = a1 * xVal + b1 * yVal;

      if (stype === 'substitution_simple') {
        const line1 = formatEq(a1, b1, c1);
        const varName = randChoice(['x', 'y']);
        const valTarget = varName === 'x' ? xVal : yVal;
        const line2 = `${varName} = ${valTarget}`;
        const ansStr = `x = ${xVal}, y = ${yVal}`;
        return [[line1, line2], ansStr, xVal, yVal, 'substitution_simple'];
      } else {
        const a2 = randInt(1, maxC);
        let b2 = randInt(allowNeg ? -maxC : 1, maxC);
        if (b2 === 0) b2 = 1;
        const c2 = a2 * xVal + b2 * yVal;

        const det = a1 * b2 - a2 * b1;
        if (det === 0) continue;

        const l1 = formatEq(a1, b1, c1);
        const l2 = formatEq(a2, b2, c2);
        const ansStr = `x = ${xVal}, y = ${yVal}`;
        return [[l1, l2], ansStr, xVal, yVal, 'standard'];
      }
    }
    return [['2x + y = 5', 'x - y = 1'], 'x = 2, y = 1', 2, 1, 'standard'];
  }

  generatePages() {
    const totalItems = this.config.rows * this.config.columns;
    const pages = [];

    if (this.config.mode === 'simultaneous') {
      for (let p = 0; p < this.config.num_pages; p++) {
        const pageProblems = [];
        for (let i = 0; i < totalItems; i++) {
          const [lines, ans, xV, yV, stype] = this._generateSimultaneousProblem();
          pageProblems.push({
            expr_parts: [], operator: 'simultaneous', answer: ans, is_vertical: false,
            is_cryptarithm: false, missing_index: -1,
            sim_lines: lines, sim_type: stype, sim_ans_x: xV, sim_ans_y: yV,
          });
        }
        pages.push(pageProblems);
      }
      return pages;
    }

    if (this.config.mode === 'mixed_ops') {
      for (let p = 0; p < this.config.num_pages; p++) {
        const pageProblems = [];
        for (let i = 0; i < totalItems; i++) {
          const [expr, ans] = this._generateCleanMixedProblem();
          pageProblems.push({
            expr_parts: expr, operator: 'mixed', answer: ans, is_vertical: false,
            is_cryptarithm: false, missing_index: -1,
          });
        }
        pages.push(pageProblems);
      }
      return pages;
    }

    const activeOps = {};
    for (const [op, cfg] of Object.entries(this.config.ops)) {
      if (cfg.enabled && cfg.weight > 0) activeOps[op] = cfg;
    }
    if (Object.keys(activeOps).length === 0) return [];

    const totalWeight = Object.values(activeOps).reduce((s, c) => s + c.weight, 0);

    for (let p = 0; p < this.config.num_pages; p++) {
      const pageProblems = [];
      let pool = [];

      for (const [op, cfg] of Object.entries(activeOps)) {
        const count = Math.trunc((cfg.weight / totalWeight) * totalItems);
        for (let i = 0; i < count; i++) pool.push(op);
      }
      const firstKey = Object.keys(activeOps)[0];
      while (pool.length < totalItems) pool.push(firstKey);
      if (pool.length > totalItems) pool = pool.slice(0, totalItems);

      const opCounts = {};
      for (const op of Object.keys(activeOps)) {
        opCounts[op] = pool.filter((x) => x === op).length;
      }

      const opCryptoFlags = {};
      for (const [op, count] of Object.entries(opCounts)) {
        const opCfg = this.config.ops[op];
        if (!opCfg.allow_crypto || count === 0) {
          opCryptoFlags[op] = new Array(count).fill(false);
        } else {
          const numCrypto = Math.round(count * (opCfg.pct_crypto / 100.0));
          const flags = [...new Array(numCrypto).fill(true), ...new Array(count - numCrypto).fill(false)];
          randShuffle(flags);
          opCryptoFlags[op] = flags;
        }
      }

      const opCryptoPointers = {};
      for (const op of Object.keys(activeOps)) opCryptoPointers[op] = 0;

      if (this.config.randomize_order) randShuffle(pool);

      for (const operator of pool) {
        const opCfg = this.config.ops[operator];

        let isCrypto = false;
        if (opCfg.allow_crypto && opCryptoFlags[operator].length) {
          isCrypto = opCryptoFlags[operator][opCryptoPointers[operator]];
          opCryptoPointers[operator]++;
        }

        const [expr, ans] = this._generateStandardProblem(operator, opCfg);

        let missingIndex = -1;
        if (isCrypto) missingIndex = randInt(0, expr.length - 1);

        pageProblems.push({
          expr_parts: expr, operator, answer: ans,
          is_vertical: opCfg.is_vertical && operator !== '÷' && expr.length === 3,
          is_cryptarithm: isCrypto, missing_index: missingIndex,
        });
      }
      pages.push(pageProblems);
    }

    return pages;
  }
}

// ---------- PDF renderer (port of MathPDFRenderer using pdf-lib) ----------
class MathPDFRenderer {
  constructor(config, pages) {
    this.config = config;
    this.pages = pages;
    this.fonts = null; // set in renderCombined() once the owning PDFDocument exists

    this.cellWidth = (PDF_PAGE.WIDTH - PDF_PAGE.MARGIN * 2) / config.columns;
    this.cellHeight = (PDF_PAGE.HEIGHT - PDF_PAGE.MARGIN - PDF_PAGE.HEADER_HEIGHT - 30) / config.rows;

    const flat = pages.flat();
    const hasVertical = flat.some((p) => p.is_vertical);
    if (config.mode === 'simultaneous') {
      this.fontSize = Math.min(24.0, Math.max(8.0, this.cellWidth / 11.5, this.cellHeight / 5.0));
    } else if (!hasVertical && config.mode === 'standard') {
      this.fontSize = Math.min(17.0, Math.max(8.0, this.cellWidth / 10.5, this.cellHeight / 3.0));
    } else {
      this.fontSize = Math.min(26.0, Math.max(10.0, this.cellWidth / 15.5, this.cellHeight / 4.8));
    }
  }

  _drawText(page, text, x, y, opts = {}) {
    const fs = opts.fontOverride || this.fontSize;
    const color = opts.isRed ? PDFLib.rgb(0.9, 0.2, 0.2) : PDFLib.rgb(0, 0, 0);
    const font = opts.fontKey === 'F3' ? this.fonts.timesBold : this.fonts.helvetica;
    page.drawText(String(text), { x, y, size: fs, font, color });
  }

  _drawBox(page, x, y, charsWide = 2) {
    const boxWidth = this.fontSize * (charsWide * 0.5) + this.fontSize * 0.3;
    const boxHeight = this.fontSize * 1.15;
    const boxY = y - this.fontSize * 0.15;
    drawBoxOutline(page, x, boxY, boxWidth, boxHeight);
    return boxWidth;
  }

  _drawSimultaneous(page, prob, x, y, isAnswerKey, probNum) {
    const fs = this.fontSize;
    this._drawText(page, `${probNum}.`, x + 5, y, { fontOverride: fs, fontKey: 'F3' });

    const eqX = x + Math.max(35, this.cellWidth * 0.12);
    const lineSpacing = fs * 1.55;

    this._drawText(page, prob.sim_lines[0], eqX, y, { fontOverride: fs });
    this._drawText(page, prob.sim_lines[1], eqX, y - lineSpacing, { fontOverride: fs });

    const yAns1 = y - lineSpacing * 2.35;
    const yAns2 = y - lineSpacing * 3.45;

    if (prob.sim_type === 'substitution_simple') {
      const targetVar = (prob.sim_lines[1].includes('x =') || prob.sim_lines[1].includes('x=')) ? 'x' : 'y';
      const missingVar = targetVar === 'x' ? 'y' : 'x';
      const ansVal = missingVar === 'x' ? prob.sim_ans_x : prob.sim_ans_y;

      this._drawText(page, `${missingVar} =`, eqX, yAns1, { fontOverride: fs });
      const boxW = fs * 3.0, boxH = fs * 1.15;
      const boxX = eqX + fs * 2.2;
      const boxY = yAns1 - fs * 0.15;
      drawBoxOutline(page, boxX, boxY, boxW, boxH);
      if (isAnswerKey) this._drawText(page, String(ansVal), boxX + 6, yAns1, { isRed: true, fontOverride: fs });
    } else {
      this._drawText(page, 'x =', eqX, yAns1, { fontOverride: fs });
      const boxW = fs * 3.0, boxH = fs * 1.15;
      const boxX = eqX + fs * 2.0;
      const boxY = yAns1 - fs * 0.15;
      drawBoxOutline(page, boxX, boxY, boxW, boxH);
      if (isAnswerKey) this._drawText(page, String(prob.sim_ans_x), boxX + 6, yAns1, { isRed: true, fontOverride: fs });

      this._drawText(page, 'y =', eqX, yAns2, { fontOverride: fs });
      const boxY2 = yAns2 - fs * 0.15;
      drawBoxOutline(page, boxX, boxY2, boxW, boxH);
      if (isAnswerKey) this._drawText(page, String(prob.sim_ans_y), boxX + 6, yAns2, { isRed: true, fontOverride: fs });
    }
  }

  _drawHorizontal(page, prob, x, y, isAnswerKey, probNum) {
    let cx = x + 4;
    const spacing = this.fontSize * 0.25;
    const charW = this.fontSize * 0.5;

    if (probNum !== undefined) {
      this._drawText(page, `${probNum}.`, cx, y, { fontOverride: this.fontSize * 0.9, fontKey: 'F3' });
      cx += (String(probNum).length + 1) * charW * 0.9 + spacing;
    }

    const advanceBox = (valStr) => {
      const bw = this._drawBox(page, cx, y, Math.max(valStr.length, 2));
      if (isAnswerKey) {
        const ansWidth = valStr.length * charW;
        this._drawText(page, valStr, cx + bw / 2 - ansWidth / 2, y + this.fontSize * 0.12, { isRed: true });
      }
      return bw + spacing;
    };
    const advanceText = (valStr) => {
      this._drawText(page, valStr, cx, y);
      const w = (valStr === '×' || valStr === '÷') ? 0.7 : 0.5;
      return valStr.length * this.fontSize * w + spacing;
    };

    for (let idx = 0; idx < prob.expr_parts.length; idx++) {
      const part = prob.expr_parts[idx];
      const partStr = (typeof part === 'number' && part < 0) ? `(${part})` : String(part);
      const isMissing = prob.is_cryptarithm && idx === prob.missing_index;
      cx += isMissing ? advanceBox(partStr) : advanceText(partStr);
    }

    cx += advanceText('=');

    const ansStr = String(prob.answer);
    cx += prob.is_cryptarithm ? advanceText(ansStr) : advanceBox(ansStr);
  }

  _drawVerticalStandard(page, prob, x, y, isAnswerKey, probNum) {
    const xRight = x + this.cellWidth * 0.65;
    const lineSpacing = this.fontSize * 1.05;
    const charW = this.fontSize * 0.5;

    const [op1, op, op2] = prob.expr_parts;
    const yOp1 = y - lineSpacing;
    const yOp2 = y - lineSpacing * 2;
    const yAns = y - lineSpacing * 3.2;
    const yLine = y - lineSpacing * 2.1;

    if (probNum !== undefined) {
      this._drawText(page, `${probNum}.`, x + 5, y, { fontOverride: this.fontSize * 0.9, fontKey: 'F3' });
    }

    const rightText = (valStr, cy) => {
      this._drawText(page, valStr, xRight - valStr.length * charW, cy);
    };
    const rightBox = (valStr, cy) => {
      const bw = this.fontSize * (Math.max(valStr.length, 2) * 0.5) + this.fontSize * 0.3;
      this._drawBox(page, xRight - bw, cy, Math.max(valStr.length, 2));
      if (isAnswerKey) {
        const ansW = valStr.length * charW;
        this._drawText(page, valStr, xRight - bw + bw / 2 - ansW / 2, cy + this.fontSize * 0.12, { isRed: true });
      }
    };

    rightText((typeof op1 === 'number' && op1 < 0) ? `(${op1})` : String(op1), yOp1);
    this._drawText(page, op, xRight - this.fontSize * 2.2, yOp2);
    rightText((typeof op2 === 'number' && op2 < 0) ? `(${op2})` : String(op2), yOp2);

    drawLineSeg(page, xRight - this.fontSize * 2.5, yLine, xRight + this.fontSize * 0.2, yLine, 1);

    rightBox(String(prob.answer), yAns);
  }

  _drawVerticalDivision(page, prob, x, y, isAnswerKey, probNum) {
    let cx = x + this.cellWidth * 0.15;
    const cy = y - this.cellHeight * 0.45;
    const charW = this.fontSize * 0.5;

    const op1 = prob.expr_parts[2], op2 = prob.expr_parts[0];

    if (probNum !== undefined) {
      this._drawText(page, `${probNum}.`, x + 5, y, { fontOverride: this.fontSize * 0.9, fontKey: 'F3' });
    }

    const divStr = String(op2);
    this._drawText(page, divStr, cx, cy);
    const cxDivEnd = cx + divStr.length * charW;

    const parenX = cxDivEnd + this.fontSize * 0.05;
    this._drawText(page, ')', parenX, cy);

    const dividendX = parenX + this.fontSize * 0.55;
    const divStrVal = String(op1);
    this._drawText(page, divStrVal, dividendX, cy);
    const dividendEnd = dividendX + divStrVal.length * charW;

    const roofY = cy + this.fontSize * 0.85;
    const lineStart = parenX + this.fontSize * 0.15;
    const lineEnd = dividendEnd + this.fontSize * 0.2;
    drawLineSeg(page, lineStart, roofY, lineEnd, roofY, 1);

    const ansY = roofY + this.fontSize * 0.2;
    const ansStr = String(prob.answer);
    const bwAns = this._drawBox(page, dividendX, ansY, Math.max(ansStr.length, 2));
    if (isAnswerKey) {
      this._drawText(page, ansStr, dividendX + bwAns / 2 - (ansStr.length * charW) / 2, ansY + this.fontSize * 0.12, { isRed: true });
    }
  }

  _settingsSummary() {
    const cfg = this.config;
    let opsStr = cfg.mode;
    if (cfg.mode === 'standard' && cfg.ops) {
      const enabled = Object.entries(cfg.ops)
        .filter(([, op]) => op.enabled)
        .map(([sym, op]) => `${sym}${op.weight}%`);
      if (enabled.length) opsStr = `standard (${enabled.join(' ')})`;
    }
    return `Layout: ${cfg.rows}x${cfg.columns} | Pages: ${cfg.num_pages} | Mode: ${opsStr} | Randomized: ${cfg.randomize_order}`;
  }

  // Short answer text for one problem - used by the parent-facing answer QR,
  // not drawn on the page itself. Deliberately terse (just the solved value,
  // not the full worked equation) to keep the QR's data small enough to stay
  // reliably scannable at print size.
  _answerSummary(prob) {
    if (prob.operator === 'simultaneous') {
      if (prob.sim_type === 'substitution_simple') {
        const targetVar = (prob.sim_lines[1].includes('x =') || prob.sim_lines[1].includes('x=')) ? 'x' : 'y';
        const missingVar = targetVar === 'x' ? 'y' : 'x';
        const ansVal = missingVar === 'x' ? prob.sim_ans_x : prob.sim_ans_y;
        return `${missingVar}=${ansVal}`;
      }
      return `x=${prob.sim_ans_x},y=${prob.sim_ans_y}`;
    }
    if (prob.is_cryptarithm) return String(prob.expr_parts[prob.missing_index]);
    return String(prob.answer);
  }

  _renderPageContent(page, problems, isAnswerKey, baseCode, pageNum) {
    const { helvetica } = this.fonts;
    const baseTitle = (this.config.title || 'Math Practice Test').trim() || 'Math Practice Test';
    const title = isAnswerKey ? `${baseTitle} - Answer Key` : baseTitle;
    page.drawText(title, { x: PDF_PAGE.MARGIN, y: PDF_PAGE.HEIGHT - 40, size: 14, font: helvetica });

    // Worksheet-matching code, e.g. "XRGD0831-A-1" - same code on the
    // worksheet page and its matching answer-key page (same pageNum), so a
    // teacher can pair up printed sheets for a whole class by eye.
    const code = `${baseCode}-A-${pageNum}`;
    const codeStr = `Code: ${code}`;
    const codeWidth = helvetica.widthOfTextAtSize(codeStr, 11);
    page.drawText(codeStr, {
      x: PDF_PAGE.WIDTH - PDF_PAGE.MARGIN - codeWidth, y: PDF_PAGE.HEIGHT - 40, size: 11, font: helvetica, color: PDFLib.rgb(0.3, 0.3, 0.3),
    });

    const teacherName = (this.config.teacher || '').trim();
    if (isAnswerKey) {
      page.drawText(`Teacher: ${teacherName || '_________________________'}`, { x: PDF_PAGE.MARGIN, y: PDF_PAGE.HEIGHT - 62, size: 12, font: helvetica });
    } else {
      page.drawText('Name: _________________________', { x: PDF_PAGE.MARGIN, y: PDF_PAGE.HEIGHT - 62, size: 12, font: helvetica });
      page.drawText('Date: _______________', { x: 320, y: PDF_PAGE.HEIGHT - 62, size: 12, font: helvetica });
      page.drawText(`Teacher: ${teacherName || '_________________________'}`, { x: PDF_PAGE.MARGIN, y: PDF_PAGE.HEIGHT - 82, size: 12, font: helvetica });
      page.drawText('Class: _______________', { x: 320, y: PDF_PAGE.HEIGHT - 82, size: 12, font: helvetica });
    }

    const startY = PDF_PAGE.HEIGHT - PDF_PAGE.HEADER_HEIGHT;
    problems.forEach((prob, i) => {
      const row = Math.floor(i / this.config.columns);
      const col = i % this.config.columns;
      const x = PDF_PAGE.MARGIN + col * this.cellWidth;
      const y = startY - row * this.cellHeight;

      if (prob.operator === 'simultaneous') {
        this._drawSimultaneous(page, prob, x, y, isAnswerKey, i + 1);
      } else if (prob.is_vertical) {
        if (prob.operator === '÷') this._drawVerticalDivision(page, prob, x, y, isAnswerKey, i + 1);
        else this._drawVerticalStandard(page, prob, x, y, isAnswerKey, i + 1);
      } else {
        this._drawHorizontal(page, prob, x, y, isAnswerKey, i + 1);
      }
    });

    const docType = isAnswerKey ? 'ANSWER KEY' : 'PRACTICE SHEET';
    const footerText = `Powered by Ys Learning Lab - ${docType}`;
    const footerWidth = this.fonts.helvetica.widthOfTextAtSize(footerText, 10);
    page.drawText(footerText, {
      x: PDF_PAGE.WIDTH / 2 - footerWidth / 2, y: 28, size: 10, font: this.fonts.helvetica, color: PDFLib.rgb(0.5, 0.5, 0.5),
    });

    if (this.config.show_settings_footer) {
      page.drawText(this._settingsSummary(), {
        x: PDF_PAGE.MARGIN, y: 14, size: 6, font: this.fonts.helvetica, color: PDFLib.rgb(0.5, 0.5, 0.5),
      });
    }

    try {
      drawQrCode(page, 'https://ys-learning-lab.github.io/', PDF_PAGE.WIDTH - PDF_PAGE.MARGIN - 32, 20, 32);
    } catch (e) {
      console.warn('QR code unavailable (qrcode-generator failed to load?):', e);
    }

    // Optional second QR, worksheet pages only - lets a parent scan straight
    // to a plain-text answer list (see js/answers-viewer.js) instead of
    // needing the separate answer-key PDF/page. Skipped above a size cap so
    // a huge grid never gets forced into an unscannably dense code.
    if (!isAnswerKey && this.config.include_answer_qr !== false) {
      const items = problems.map((prob, i) => `${i + 1}:${this._answerSummary(prob)}`).join(',');
      const url = buildAnswerQrUrl({ c: code, t: baseTitle, s: 'math', a: items });
      if (url.length <= 900) {
        try {
          drawQrCode(page, url, PDF_PAGE.MARGIN, 20, 44);
          page.drawText('Scan for answers', { x: PDF_PAGE.MARGIN, y: 66, size: 7, font: helvetica, color: PDFLib.rgb(0.5, 0.5, 0.5) });
        } catch (e) {
          console.warn('Answer QR code unavailable:', e);
        }
      }
    }
  }

  async renderCombined() {
    const pdfDoc = await PDFLib.PDFDocument.create();
    this.fonts = await getBaseFonts(pdfDoc);
    const baseCode = getWorksheetBatchCode();
    this.pages.forEach((problems, idx) => {
      const page = pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]);
      this._renderPageContent(page, problems, false, baseCode, idx + 1);
    });
    if (this.config.include_answer_key !== false) {
      this.pages.forEach((problems, idx) => {
        const page = pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]);
        this._renderPageContent(page, problems, true, baseCode, idx + 1);
      });
    }
    return pdfDoc.save();
  }
}

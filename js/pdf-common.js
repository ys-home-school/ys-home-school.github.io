// Shared PDF helpers used by both math-generator.js and japanese-generator.js.
// Mirrors the Python hand-rolled PDF renderer's page geometry constants exactly
// so all coordinate math ported from Python translates without adjustment.

const PDF_PAGE = {
  WIDTH: 595.28,
  HEIGHT: 841.89,
  MARGIN: 40,
  HEADER_HEIGHT: 100,
};

let _fontCache = null;

async function loadFontKit() {
  if (window.__fontkitLoaded) return;
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  window.__fontkitLoaded = true;
}

// Standard fonts (Helvetica / Times-Bold) - no embedding cost, every tool needs these.
async function getBaseFonts(pdfDoc) {
  const { StandardFonts } = PDFLib;
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const timesBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  return { helvetica, timesBold };
}

// Full Noto Sans JP embed (used for all Japanese glyphs, matching the Python
// renderer's F2 = HeiseiMin-W3 CID font role). Only call this from tools that
// actually draw Japanese text (japanese-generator.js) - it adds several MB to
// the output PDF, so math-generator.js must not load it.
async function getJapaneseFont(pdfDoc) {
  try {
    await loadFontKit();
    pdfDoc.registerFontkit(fontkit);
    const fontBytes = await fetch('assets/fonts/NotoSansJP-Regular.ttf').then((r) => {
      if (!r.ok) throw new Error('font fetch failed');
      return r.arrayBuffer();
    });
    // This file is pre-subsetted offline with fonttools' pyftsubset (production-
    // grade subsetter) down to exactly the ASCII + kana/kanji this app draws, and
    // converted CFF->glyf with otf2ttf. fontkit's own in-browser subsetter is
    // unreliable on a full ~40k-glyph CJK font (throws on the CFF release,
    // silently corrupts glyphs on a glyf instance) - pre-subsetting to ~250
    // glyphs sidesteps that entirely, so we skip fontkit subsetting here too.
    return await pdfDoc.embedFont(fontBytes, { subset: false });
  } catch (e) {
    console.warn('Noto Sans JP font unavailable, falling back to Helvetica for Japanese text (glyphs will not render correctly):', e);
    const { StandardFonts } = PDFLib;
    return await pdfDoc.embedFont(StandardFonts.Helvetica);
  }
}

// Back-compat convenience for callers that want everything at once.
async function getFonts(pdfDoc) {
  const { helvetica, timesBold } = await getBaseFonts(pdfDoc);
  const notoSansJP = await getJapaneseFont(pdfDoc);
  return { helvetica, timesBold, notoSansJP };
}

// Draws a rectangle outline (equivalent to Python's "x y w h re S" stream op).
function drawBoxOutline(page, x, y, w, h, opts = {}) {
  page.drawRectangle({
    x, y, width: w, height: h,
    borderColor: opts.color || PDFLib.rgb(0, 0, 0),
    borderWidth: opts.width || 0.5,
  });
}

function drawLineSeg(page, x1, y1, x2, y2, width = 1, dashArray = undefined, color = undefined) {
  page.drawLine({
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    thickness: width,
    color: color || PDFLib.rgb(0, 0, 0),
    dashArray,
  });
}

function drawTextAt(page, text, x, y, font, size, color = PDFLib.rgb(0, 0, 0)) {
  page.drawText(text, { x, y, size, font, color });
}

async function downloadPdfBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function downloadTextFile(text, filename, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------- results-page handoff (IndexedDB) ----------
// Generate buttons hand the finished PDF off to results.html (a new tab) via
// IndexedDB instead of downloading directly, so the visitor lands on an
// ad-supported viewer page. Records are pruned by age, not deleted on read,
// so reloading/reopening the results tab still works.
const HANDOFF_DB_NAME = 'ysschool-pdf-handoff';
const HANDOFF_STORE = 'pdfs';
const HANDOFF_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

function openHandoffDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDOFF_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(HANDOFF_STORE)) {
        req.result.createObjectStore(HANDOFF_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putHandoffRecord(record) {
  const db = await openHandoffDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDOFF_STORE, 'readwrite');
      tx.objectStore(HANDOFF_STORE).put(record);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

async function getHandoffRecord(id) {
  const db = await openHandoffDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(HANDOFF_STORE, 'readonly').objectStore(HANDOFF_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function pruneOldHandoffRecords() {
  const db = await openHandoffDb();
  try {
    const cutoff = Date.now() - HANDOFF_MAX_AGE_MS;
    await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDOFF_STORE, 'readwrite');
      const req = tx.objectStore(HANDOFF_STORE).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (!cursor) return;
        if (cursor.value.createdAt < cutoff) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

// Hands a generated PDF off to results.html in a new tab. `preOpenedWindow`
// (from a synchronous `window.open('', '_blank')` called at the very top of
// the click handler, before any awaits) lets the tab open immediately on the
// user gesture instead of after PDF generation finishes - opening a tab from
// deep inside an already-awaited async function risks the browser's popup
// blocker treating it as not user-initiated. Falls back to a direct download
// if IndexedDB is unavailable or no window could be opened at all.
async function openPdfResults(bytes, filename, toolPage, toolLabel, preOpenedWindow) {
  try {
    await pruneOldHandoffRecords();
    const id = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    await putHandoffRecord({ id, bytes, filename, toolPage, toolLabel, createdAt: Date.now() });

    const url = `results.html?id=${id}`;
    if (preOpenedWindow && !preOpenedWindow.closed) {
      preOpenedWindow.location = url;
    } else {
      window.open(url, '_blank');
    }
  } catch (e) {
    console.warn('PDF results handoff unavailable, falling back to direct download:', e);
    if (preOpenedWindow && !preOpenedWindow.closed) preOpenedWindow.close();
    await downloadPdfBytes(bytes, filename);
  }
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

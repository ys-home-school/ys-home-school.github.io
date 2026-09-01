// Hiragana writing/tracing practice sheet - a separate tool from
// japanese-generator.js's katakana<->hiragana matching quiz. Scope is
// deliberately narrow: just the 46 basic hiragana (no dakuten/handakuten/
// youon), selectable as a single character, a whole gyou ("row" - e.g.
// あ行), or all of them, with N trace-copy boxes per character and an
// optional example-word writing line.

const HIRAGANA_ROWS = [
  { id: 'A', label: 'あ行', chars: ['あ', 'い', 'う', 'え', 'お'] },
  { id: 'K', label: 'か行', chars: ['か', 'き', 'く', 'け', 'こ'] },
  { id: 'S', label: 'さ行', chars: ['さ', 'し', 'す', 'せ', 'そ'] },
  { id: 'T', label: 'た行', chars: ['た', 'ち', 'つ', 'て', 'と'] },
  { id: 'N', label: 'な行', chars: ['な', 'に', 'ぬ', 'ね', 'の'] },
  { id: 'H', label: 'は行', chars: ['は', 'ひ', 'ふ', 'へ', 'ほ'] },
  { id: 'M', label: 'ま行', chars: ['ま', 'み', 'む', 'め', 'も'] },
  { id: 'Y', label: 'や行', chars: ['や', 'ゆ', 'よ'] },
  { id: 'R', label: 'ら行', chars: ['ら', 'り', 'る', 'れ', 'ろ'] },
  { id: 'W', label: 'わ行', chars: ['わ', 'を', 'ん'] },
];

// A couple of common, well-known example words per character - kept short
// and simple since this is for beginners. を and ん essentially never start
// a word in Japanese, so they're intentionally left without entries; the
// renderer skips the word-practice line for any character with no list.
const HIRAGANA_WORDS = {
  'あ': ['あめ', 'あさ'], 'い': ['いぬ', 'いえ'], 'う': ['うみ', 'うさぎ'], 'え': ['えき', 'えんぴつ'], 'お': ['おに', 'おかし'],
  'か': ['かさ', 'かに'], 'き': ['きつね', 'きいろ'], 'く': ['くも', 'くつ'], 'け': ['けしごむ', 'けむり'], 'こ': ['こども', 'こおり'],
  'さ': ['さかな', 'さくら'], 'し': ['しか', 'しろ'], 'す': ['すいか', 'すし'], 'せ': ['せみ', 'せかい'], 'そ': ['そら', 'そうじ'],
  'た': ['たまご', 'たいこ'], 'ち': ['ちず', 'ちから'], 'つ': ['つき', 'つくえ'], 'て': ['てがみ', 'てんき'], 'と': ['とり', 'とけい'],
  'な': ['なつ', 'なみだ'], 'に': ['にわ', 'にじ'], 'ぬ': ['ぬいぐるみ', 'ぬの'], 'ね': ['ねこ', 'ねつ'], 'の': ['のり', 'のはら'],
  'は': ['はな', 'はし'], 'ひ': ['ひこうき', 'ひまわり'], 'ふ': ['ふね', 'ふゆ'], 'へ': ['へや', 'へび'], 'ほ': ['ほし', 'ほん'],
  'ま': ['まど', 'まつり'], 'み': ['みず', 'みかん'], 'む': ['むし', 'むら'], 'め': ['めがね'], 'も': ['もり', 'もも'],
  'や': ['やま', 'やさい'], 'ゆ': ['ゆき', 'ゆび'], 'よ': ['よる', 'よこ'],
  'ら': ['らくだ', 'らいおん'], 'り': ['りんご', 'りす'], 'る': ['るすばん'], 'れ': ['れいぞうこ', 'れきし'], 'ろ': ['ろうそく', 'ろば'],
  'わ': ['わに', 'わたし'],
};

class HiraganaPracticeGenerator {
  constructor(config) {
    this.config = config;
  }

  // Returns the flat, ordered list of characters to practice based on
  // config.mode ('single' | 'row' | 'all').
  selectedChars() {
    if (this.config.mode === 'single') return this.config.singleChars;
    if (this.config.mode === 'row') {
      return HIRAGANA_ROWS.filter((r) => this.config.selectedRows.includes(r.id)).flatMap((r) => r.chars);
    }
    return HIRAGANA_ROWS.flatMap((r) => r.chars);
  }
}

// ---------- PDF renderer ----------
class HiraganaPracticeRenderer {
  constructor(config, chars) {
    this.config = config;
    this.chars = chars;
    this.fonts = null;
  }

  async render() {
    const pdfDoc = await PDFLib.PDFDocument.create();
    this.fonts = await getFonts(pdfDoc);

    const ROWS = 5;
    const GAP = 8;
    const usableWidth = PDF_PAGE.WIDTH - PDF_PAGE.MARGIN * 2;
    // Sized so 5 columns fill the page width - matches the common case (one
    // whole gyou/行 = 5 characters x 1 column each) exactly, and still gives
    // a single character (3 columns at the default 15 repetitions) large,
    // easy-to-see boxes rather than cramming them down further.
    // Floored (not just clamped) so 5 columns' cumulative width - which
    // otherwise lands within fractions of a point of usableWidth - never
    // trips the page-break check below on floating-point rounding alone.
    const boxSize = Math.floor(Math.max(40, Math.min(130, (usableWidth - 4 * GAP) / 5)));
    const gridTop = (PDF_PAGE.HEIGHT - PDF_PAGE.HEADER_HEIGHT) - 50;
    const modelY = gridTop + 16;

    let page = pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]);
    this._drawHeader(page);
    // Japanese is written/read in columns right-to-left, so the first
    // column starts at the *right* margin and each new column moves left.
    let colRightX = PDF_PAGE.WIDTH - PDF_PAGE.MARGIN;

    for (const ch of this.chars) {
      const colsNeeded = Math.max(1, Math.ceil(this.config.repeats / ROWS));
      for (let c = 0; c < colsNeeded; c++) {
        if (colRightX - boxSize < PDF_PAGE.MARGIN) {
          page = pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]);
          this._drawHeader(page);
          colRightX = PDF_PAGE.WIDTH - PDF_PAGE.MARGIN;
        }
        const colX = colRightX - boxSize;
        if (c === 0) {
          const { notoSansJP } = this.fonts;
          page.drawText(ch, { x: colX, y: modelY, size: 26, font: notoSansJP, color: PDFLib.rgb(0.1, 0.1, 0.1) });
        }
        const startIdx = c * ROWS;
        const boxesInCol = Math.min(ROWS, this.config.repeats - startIdx);
        for (let r = 0; r < boxesInCol; r++) {
          const boxY = gridTop - (r + 1) * boxSize - r * GAP;
          this._drawTraceBox(page, ch, colX, boxY, boxSize, startIdx + r === 0);
        }
        colRightX -= boxSize + GAP;
      }

      // Example words only make sense with room to spare (single-character
      // mode, where at most 3 of the ~5 columns a page can hold are used) -
      // a whole gyou/行 already fills the page edge-to-edge with boxes.
      if (this.config.includeWords && this.config.mode === 'single' && HIRAGANA_WORDS[ch]) {
        this._drawWordsBesideGrid(page, ch, colRightX, gridTop, ROWS, boxSize, GAP);
      }
    }

    return pdfDoc.save();
  }

  _drawTraceBox(page, ch, boxX, boxY, boxSize, isVeryFirstBox) {
    const { notoSansJP } = this.fonts;
    drawBoxOutline(page, boxX, boxY, boxSize, boxSize, { width: 1.0 });
    const midX = boxX + boxSize / 2;
    const midY = boxY + boxSize / 2;
    const dashColor = PDFLib.rgb(0.65, 0.65, 0.65);
    drawLineSeg(page, boxX, midY, boxX + boxSize, midY, 0.5, [2, 2], dashColor);
    drawLineSeg(page, midX, boxY, midX, boxY + boxSize, 0.5, [2, 2], dashColor);
    if (isVeryFirstBox) {
      const faintSize = boxSize * 0.72;
      page.drawText(ch, {
        x: midX - faintSize * 0.45, y: boxY + boxSize * 0.16, size: faintSize, font: notoSansJP, color: PDFLib.rgb(0.82, 0.82, 0.82),
      });
    }
  }

  // Uses whatever horizontal room is left to the left of this character's
  // column(s) - single-character mode only ever fills part of a page's
  // width, so there's real space here rather than needing to steal any of
  // the grid's own vertical budget.
  _drawWordsBesideGrid(page, ch, availRightX, gridTop, rows, boxSize, gap) {
    const { helvetica, notoSansJP } = this.fonts;
    let y = gridTop - 4;
    const words = HIRAGANA_WORDS[ch].slice(0, 2);
    for (const w of words) {
      const labelStr = 'Write this word: ';
      page.drawText(labelStr, { x: PDF_PAGE.MARGIN, y, size: 10, font: helvetica, color: PDFLib.rgb(0.4, 0.4, 0.4) });
      const labelWidth = helvetica.widthOfTextAtSize(labelStr, 10);
      page.drawText(w, { x: PDF_PAGE.MARGIN + labelWidth, y, size: 10, font: notoSansJP, color: PDFLib.rgb(0.4, 0.4, 0.4) });
      y -= 16;
      const wBoxW = Math.min(availRightX - PDF_PAGE.MARGIN - gap, 44 + w.length * 32);
      const wBoxH = 36;
      if (wBoxW > 44) {
        drawBoxOutline(page, PDF_PAGE.MARGIN, y - wBoxH, wBoxW, wBoxH, { width: 1.0 });
        page.drawText(w, { x: PDF_PAGE.MARGIN + 8, y: y - wBoxH + 9, size: 22, font: notoSansJP, color: PDFLib.rgb(0.82, 0.82, 0.82) });
      }
      y -= wBoxH + 12;
    }
  }

  _drawHeader(page) {
    const { helvetica } = this.fonts;
    const title = (this.config.title || 'Hiragana Writing Practice').trim() || 'Hiragana Writing Practice';
    page.drawText(title, { x: PDF_PAGE.MARGIN, y: PDF_PAGE.HEIGHT - 40, size: 14, font: helvetica });

    page.drawText('Name: _________________________', { x: PDF_PAGE.MARGIN, y: PDF_PAGE.HEIGHT - 62, size: 12, font: helvetica });
    page.drawText('Date: _______________', { x: 320, y: PDF_PAGE.HEIGHT - 62, size: 12, font: helvetica });
    const teacherName = (this.config.teacher || '').trim();
    page.drawText(`Teacher: ${teacherName || '_________________________'}`, { x: PDF_PAGE.MARGIN, y: PDF_PAGE.HEIGHT - 82, size: 12, font: helvetica });
    page.drawText('Class: _______________', { x: 320, y: PDF_PAGE.HEIGHT - 82, size: 12, font: helvetica });

    const footerText = 'Powered by Ys Learning Lab - HANDWRITING PRACTICE';
    const footerWidth = helvetica.widthOfTextAtSize(footerText, 10);
    page.drawText(footerText, {
      x: PDF_PAGE.WIDTH / 2 - footerWidth / 2, y: 28, size: 10, font: helvetica, color: PDFLib.rgb(0.5, 0.5, 0.5),
    });
    try {
      drawQrCode(page, 'https://ys-learning-lab.github.io/', PDF_PAGE.WIDTH - PDF_PAGE.MARGIN - 32, 20, 32);
    } catch (e) {
      console.warn('QR code unavailable (qrcode-generator failed to load?):', e);
    }
  }

}

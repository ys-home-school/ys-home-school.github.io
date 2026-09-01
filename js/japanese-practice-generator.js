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

    let page = pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]);
    this._drawHeader(page);
    let cursorY = PDF_PAGE.HEIGHT - PDF_PAGE.HEADER_HEIGHT;
    const bottomLimit = PDF_PAGE.MARGIN + 40;

    for (const ch of this.chars) {
      if (cursorY - this._blockHeight() < bottomLimit) {
        page = pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]);
        this._drawHeader(page);
        cursorY = PDF_PAGE.HEIGHT - PDF_PAGE.HEADER_HEIGHT;
      }
      cursorY = this._drawCharBlock(page, ch, cursorY);
    }

    return pdfDoc.save();
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

  // Column geometry shared by _blockHeight() and _drawCharBlock() - a fixed
  // 3-box-tall column, filled top-to-bottom (vertically) before moving to
  // the next column, matching a traditional handwriting-practice sheet
  // rather than one long horizontal row of tiny boxes.
  _gridGeometry() {
    const rows = 3;
    const cols = Math.max(1, Math.ceil(this.config.repeats / rows));
    const gap = 10;
    const usableWidth = PDF_PAGE.WIDTH - PDF_PAGE.MARGIN * 2;
    const boxSize = Math.max(70, Math.min(130, (usableWidth - (cols - 1) * gap) / cols));
    return { rows, cols, gap, boxSize };
  }

  // Conservative (worst-case) estimate used only to decide when to page-break.
  _blockHeight() {
    const { rows, boxSize, gap } = this._gridGeometry();
    let h = 50 + rows * (boxSize + gap);
    if (this.config.includeWords) h += 2 * (14 + 36 + 12);
    return h;
  }

  _drawCharBlock(page, ch, topY) {
    const { helvetica, notoSansJP } = this.fonts;
    const { rows, cols, gap, boxSize } = this._gridGeometry();

    const modelSize = 44;
    page.drawText(ch, {
      x: PDF_PAGE.MARGIN, y: topY - modelSize * 0.8, size: modelSize, font: notoSansJP, color: PDFLib.rgb(0.1, 0.1, 0.1),
    });
    const gridTop = topY - modelSize - 14;

    for (let i = 0; i < this.config.repeats; i++) {
      const col = Math.floor(i / rows);
      const row = i % rows;
      const boxX = PDF_PAGE.MARGIN + col * (boxSize + gap);
      const boxY = gridTop - (row + 1) * boxSize - row * gap;

      drawBoxOutline(page, boxX, boxY, boxSize, boxSize, { width: 1.0 });
      const midX = boxX + boxSize / 2;
      const midY = boxY + boxSize / 2;
      const dashColor = PDFLib.rgb(0.65, 0.65, 0.65);
      drawLineSeg(page, boxX, midY, boxX + boxSize, midY, 0.5, [2, 2], dashColor);
      drawLineSeg(page, midX, boxY, midX, boxY + boxSize, 0.5, [2, 2], dashColor);
      if (i === 0) {
        const faintSize = boxSize * 0.72;
        page.drawText(ch, {
          x: midX - faintSize * 0.45, y: boxY + boxSize * 0.16, size: faintSize, font: notoSansJP, color: PDFLib.rgb(0.82, 0.82, 0.82),
        });
      }
    }

    let y = gridTop - rows * boxSize - (rows - 1) * gap - 16;

    if (this.config.includeWords && HIRAGANA_WORDS[ch]) {
      const words = HIRAGANA_WORDS[ch].slice(0, this.config.mode === 'single' ? 2 : 1);
      for (const w of words) {
        const labelStr = 'Write this word: ';
        page.drawText(labelStr, { x: PDF_PAGE.MARGIN, y, size: 10, font: helvetica, color: PDFLib.rgb(0.4, 0.4, 0.4) });
        const labelWidth = helvetica.widthOfTextAtSize(labelStr, 10);
        page.drawText(w, { x: PDF_PAGE.MARGIN + labelWidth, y, size: 10, font: notoSansJP, color: PDFLib.rgb(0.4, 0.4, 0.4) });
        y -= 16;
        const wBoxW = Math.min(260, 44 + w.length * 32);
        const wBoxH = 36;
        drawBoxOutline(page, PDF_PAGE.MARGIN, y - wBoxH, wBoxW, wBoxH, { width: 1.0 });
        page.drawText(w, {
          x: PDF_PAGE.MARGIN + 8, y: y - wBoxH + 9, size: 22, font: notoSansJP, color: PDFLib.rgb(0.82, 0.82, 0.82),
        });
        y -= wBoxH + 12;
      }
    } else {
      y -= 8;
    }

    return y;
  }
}

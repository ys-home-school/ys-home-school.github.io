// Port of "Hiragana Katakana Test Maker.py" (KanaDatabase + RandomizationEngine + PDFWorksheetRenderer).

function randInt2(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function randChoice2(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randShuffle2(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function sampleWithoutReplacement(pool, n) {
  const copy = pool.slice();
  randShuffle2(copy);
  return copy.slice(0, n);
}

class KanaDatabase {
  constructor() {
    this.basic_kana = [
      ['ア', 'あ'], ['イ', 'い'], ['ウ', 'う'], ['エ', 'え'], ['オ', 'お'],
      ['カ', 'か'], ['キ', 'き'], ['ク', 'く'], ['ケ', 'け'], ['コ', 'こ'],
      ['サ', 'さ'], ['シ', 'し'], ['ス', 'す'], ['セ', 'せ'], ['ソ', 'そ'],
      ['タ', 'た'], ['チ', 'ち'], ['ツ', 'つ'], ['テ', 'て'], ['ト', 'と'],
      ['ナ', 'な'], ['ニ', 'に'], ['ヌ', 'ぬ'], ['ネ', 'ね'], ['ノ', 'の'],
      ['ハ', 'は'], ['ヒ', 'ひ'], ['フ', 'ふ'], ['ヘ', 'へ'], ['ホ', 'ほ'],
      ['マ', 'ま'], ['ミ', 'み'], ['ム', 'む'], ['メ', 'め'], ['モ', 'も'],
      ['ヤ', 'や'], ['ユ', 'ゆ'], ['ヨ', 'よ'],
      ['ラ', 'ら'], ['リ', 'り'], ['ル', 'る'], ['レ', 'れ'], ['ロ', 'ろ'],
      ['ワ', 'わ'], ['ヲ', 'を'], ['ン', 'ん'],
    ];
    this.dakuten = [
      ['ガ', 'が'], ['ギ', 'ぎ'], ['グ', 'ぐ'], ['ゲ', 'げ'], ['ゴ', 'ご'],
      ['ザ', 'ざ'], ['ジ', 'じ'], ['ズ', 'ず'], ['ゼ', 'ぜ'], ['ゾ', 'ぞ'],
      ['ダ', 'だ'], ['ヂ', 'ぢ'], ['ヅ', 'づ'], ['デ', 'で'], ['ド', 'ど'],
      ['バ', 'ば'], ['ビ', 'び'], ['ブ', 'ぶ'], ['ベ', 'べ'], ['ボ', 'ぼ'],
    ];
    this.handakuten = [['パ', 'ぱ'], ['ピ', 'ぴ'], ['プ', 'ぷ'], ['ペ', 'ぺ'], ['ポ', 'ぽ']];
    this.youon = [
      ['キャ', 'きゃ'], ['キュ', 'きゅ'], ['キョ', 'きょ'],
      ['シャ', 'しゃ'], ['シュ', 'しゅ'], ['ショ', 'しょ'],
      ['チャ', 'ちゃ'], ['チュ', 'ちゅ'], ['チョ', 'ちょ'],
      ['ニャ', 'にゃ'], ['ニュ', 'にゅ'], ['ニョ', 'にょ'],
      ['ヒャ', 'ひゃ'], ['ヒュ', 'ひゅ'], ['ヒョ', 'ひょ'],
      ['ミャ', 'みゃ'], ['ミュ', 'みゅ'], ['ミョ', 'みょ'],
      ['リャ', 'りゃ'], ['リュ', 'りゅ'], ['リョ', 'りょ'],
      ['ギャ', 'ぎゃ'], ['ギュ', 'ぎゅ'], ['ギョ', 'ぎょ'],
      ['ジャ', 'じゃ'], ['ジュ', 'じゅ'], ['ジョ', 'じょ'],
      ['ビャ', 'びゃ'], ['ビュ', 'びゅ'], ['ビョ', 'びょ'],
      ['ピャ', 'ぴゃ'], ['ピュ', 'ぴゅ'], ['ピョ', 'ぴょ'],
    ];
    this.small_kana = [['ッ', 'っ'], ['ャ', 'ゃ'], ['ュ', 'ゅ'], ['ョ', 'ょ']];

    this.categories_map = {
      basic: this.basic_kana, dakuten: this.dakuten, handakuten: this.handakuten,
      youon: this.youon, small: this.small_kana,
    };
  }

  _makePair(katakana, hiragana, category) {
    return { katakana, hiragana, category, key: `${katakana}|${hiragana}` };
  }

  getAllPairs() {
    const pairs = [];
    for (const [cat, items] of Object.entries(this.categories_map)) {
      for (const [k, h] of items) pairs.push(this._makePair(k, h, cat));
    }
    return pairs;
  }

  getByCategories(categories) {
    const pairs = [];
    for (const cat of categories) {
      if (this.categories_map[cat]) {
        for (const [k, h] of this.categories_map[cat]) pairs.push(this._makePair(k, h, cat));
      }
    }
    return pairs;
  }

  findPairsWithDirection(chars) {
    const found = [];
    const allPairs = this.getAllPairs();
    for (let c of chars) {
      c = c.trim();
      if (!c) continue;
      for (const p of allPairs) {
        if (p.hiragana === c) {
          if (!found.some((x) => x[0].key === p.key)) found.push([p, 'h2k']);
          break;
        } else if (p.katakana === c) {
          if (!found.some((x) => x[0].key === p.key)) found.push([p, 'k2h']);
          break;
        }
      }
    }
    return found;
  }
}

const FAMILY_MAP = [
  ['あいうえおぁぃぅぇぉ', 'A'], ['かきくけこがぎぐげご', 'K'], ['さしすせそざじずぜぞ', 'S'],
  ['たちつてとだぢづでどっ', 'T'], ['なにぬねの', 'N'], ['はひふへほばびぶべぼぱぴぷぺぽ', 'H'],
  ['まみむめも', 'M'], ['やゆよゃゅょ', 'Y'], ['らりるれろ', 'R'], ['わをん', 'W'],
];

class RandomizationEngine {
  constructor(config, database) {
    this.config = config;
    this.database = database;
  }

  _antiClusterShuffle(items) {
    if (!items.length) return items;
    randShuffle2(items);
    for (let i = 1; i < items.length; i++) {
      if (items[i] !== null && items[i] === items[i - 1]) {
        for (let j = i + 1; j < items.length; j++) {
          if (items[j] !== items[i] && (i + 1 === items.length || items[j] !== items[i + 1])) {
            [items[i], items[j]] = [items[j], items[i]];
            break;
          }
        }
      }
    }
    return items;
  }

  _getFamilyId(hiragana) {
    if (!hiragana) return 'Other';
    const h = hiragana[0];
    for (const [chars, family] of FAMILY_MAP) {
      if (chars.includes(h)) return family;
    }
    return 'Other';
  }

  // Assigns k2h/h2k per whole consonant-row "family" (mixed/anti-cheat mode),
  // aiming for mixed_k2h_ratio of the total. Families are decided as a group -
  // shuffled into random order, then greedily added to the k2h side while that
  // keeps the running total close to target. (An earlier per-pair version
  // decided each family the instant its first member was seen, using a fixed
  // "any remaining budget > 0.4" gate - with typical pool sizes that gate is
  // almost always true early on, so nearly every family got waved through to
  // k2h before the running total had a chance to reflect anything, badly
  // overshooting the target ratio.)
  _assignMixedDirections(unforcedPairs, freqOf, forcedFamilyDirs, currentK2h, targetK2hCount) {
    const familyWeights = new Map();
    for (const p of unforcedPairs) {
      const fam = this._getFamilyId(p.hiragana);
      familyWeights.set(fam, (familyWeights.get(fam) || 0) + freqOf(p));
    }

    const undecidedFamilies = [...familyWeights.keys()].filter((f) => !forcedFamilyDirs.has(f));
    randShuffle2(undecidedFamilies);

    const familyDir = new Map(forcedFamilyDirs);
    let running = currentK2h;
    for (const fam of undecidedFamilies) {
      const weight = familyWeights.get(fam);
      const assignK2h = running + weight <= targetK2hCount
        || (running < targetK2hCount && (targetK2hCount - running) >= weight / 2);
      if (assignK2h) {
        familyDir.set(fam, 'k2h');
        running += weight;
      } else {
        familyDir.set(fam, 'h2k');
      }
    }

    const dirMap = new Map();
    for (const p of unforcedPairs) {
      dirMap.set(p.key, familyDir.get(this._getFamilyId(p.hiragana)));
    }
    return dirMap;
  }

  generatePagesData() {
    this.lastSequentialPagesNeeded = null; // set by _generateSequentialPages when is_ordered is true
    const mandatoryChars = this.config.always_include.split(',').map((c) => c.trim()).filter(Boolean);
    const mandatoryTuples = this.database.findPairsWithDirection(mandatoryChars);
    const mandatoryPairs = mandatoryTuples.map((t) => t[0]);
    const forcedDirs = new Map(mandatoryTuples.map((t) => [t[0].key, t[1]]));

    const totalItemsPerPage = this.config.rows * this.config.columns;
    const pagesData = [];
    const allPairsOrdered = this.database.getAllPairs();

    const hasBasic = this.config.categories.includes('basic');
    const otherCats = this.config.categories.filter((c) => c !== 'basic');
    const hasOther = otherCats.length > 0;

    const poolBasic = hasBasic ? this.database.getByCategories(['basic']) : [];
    const poolOther = hasOther ? this.database.getByCategories(otherCats) : [];

    if (!poolBasic.length && !poolOther.length && !mandatoryPairs.length) {
      throw new Error('No Kana available. Check your category and mandatory inputs.');
    }

    if (this.config.is_ordered) {
      return this._generateSequentialPages(mandatoryPairs, forcedDirs, totalItemsPerPage, allPairsOrdered);
    }

    for (let page = 0; page < this.config.num_pages; page++) {
      let pageSelected = mandatoryPairs.slice(0, totalItemsPerPage);
      let needed = totalItemsPerPage - pageSelected.length;

      const mBasicCount = pageSelected.filter((p) => p.category === 'basic').length;

      if (needed > 0) {
        let neededBasic, neededOther;
        if (hasBasic && hasOther) {
          const targetBasic = Math.trunc(totalItemsPerPage * (this.config.basic_ratio / 100.0));
          neededBasic = Math.max(0, targetBasic - mBasicCount);
          neededOther = needed - neededBasic;
        } else if (hasBasic) {
          neededBasic = needed; neededOther = 0;
        } else if (hasOther) {
          neededBasic = 0; neededOther = needed;
        } else {
          neededBasic = 0; neededOther = 0;
        }

        let pBasic = poolBasic.slice();
        let pOther = poolOther.slice();

        if (!this.config.allow_duplicates) {
          const selectedKeys = new Set(pageSelected.map((p) => p.key));
          pBasic = pBasic.filter((p) => !selectedKeys.has(p.key));
          pOther = pOther.filter((p) => !selectedKeys.has(p.key));

          if (pBasic.length < neededBasic) {
            const deficit = neededBasic - pBasic.length;
            neededBasic = pBasic.length;
            if (hasOther) neededOther += deficit;
          }
          if (pOther.length < neededOther) {
            const deficit = neededOther - pOther.length;
            neededOther = pOther.length;
            if (hasBasic) {
              neededBasic += deficit;
              neededBasic = Math.min(neededBasic, pBasic.length);
            }
          }

          pageSelected = pageSelected.concat(sampleWithoutReplacement(pBasic, neededBasic));
          pageSelected = pageSelected.concat(sampleWithoutReplacement(pOther, neededOther));

          const stillNeeded = totalItemsPerPage - pageSelected.length;
          if (stillNeeded > 0) pageSelected = pageSelected.concat(new Array(stillNeeded).fill(null));
        } else {
          const sampleWithReplacement = (poolSource, count, fallbackPool) => {
            const res = [];
            for (let i = 0; i < count; i++) {
              if (poolSource.length) res.push(randChoice2(poolSource));
              else if (fallbackPool.length) res.push(randChoice2(fallbackPool));
            }
            return res;
          };
          pageSelected = pageSelected.concat(sampleWithReplacement(pBasic, neededBasic, pOther));
          pageSelected = pageSelected.concat(sampleWithReplacement(pOther, neededOther, pBasic));

          const stillNeeded = totalItemsPerPage - pageSelected.length;
          if (stillNeeded > 0 && mandatoryPairs.length) {
            for (let i = 0; i < stillNeeded; i++) pageSelected.push(randChoice2(mandatoryPairs));
          } else if (stillNeeded > 0) {
            pageSelected = pageSelected.concat(new Array(stillNeeded).fill(null));
          }
        }
      }

      // Shuffle only the real pairs and push empty slots to the end, so an
      // under-full pool fills the grid from the top instead of leaving
      // randomly scattered holes. (Sequential/ordered mode never reaches this
      // loop - see _generateSequentialPages.)
      {
        const realPairs = pageSelected.filter((p) => p !== null);
        const nones = pageSelected.filter((p) => p === null);
        pageSelected = this._antiClusterShuffle(realPairs).concat(nones);
      }

      const uniqueKeys = [...new Set(pageSelected.filter((p) => p !== null).map((p) => p.key))];
      const uniquePairs = uniqueKeys.map((k) => pageSelected.find((p) => p && p.key === k));
      const freq = new Map(uniquePairs.map((p) => [p.key, pageSelected.filter((x) => x && x.key === p.key).length]));

      const dirMap = new Map();
      const forcedFamilyDirs = new Map();

      for (const p of uniquePairs) {
        if (forcedDirs.has(p.key)) {
          dirMap.set(p.key, forcedDirs.get(p.key));
          forcedFamilyDirs.set(this._getFamilyId(p.hiragana), forcedDirs.get(p.key));
        }
      }

      const unforcedPairs = uniquePairs.filter((p) => !forcedDirs.has(p.key));

      if (this.config.direction !== 'mixed') {
        for (const p of unforcedPairs) {
          const fam = this._getFamilyId(p.hiragana);
          dirMap.set(p.key, forcedFamilyDirs.has(fam) ? forcedFamilyDirs.get(fam) : this.config.direction);
        }
      } else {
        const targetK2hCount = Math.trunc(totalItemsPerPage * (this.config.mixed_k2h_ratio / 100.0));
        const currentK2h = uniquePairs.filter((p) => forcedDirs.get(p.key) === 'k2h').reduce((s, p) => s + freq.get(p.key), 0);
        const mixedDirs = this._assignMixedDirections(unforcedPairs, (p) => freq.get(p.key), forcedFamilyDirs, currentK2h, targetK2hCount);
        for (const [k, v] of mixedDirs) dirMap.set(k, v);
      }

      const grid = [];
      let itemIndex = 0;
      for (let r = 0; r < this.config.rows; r++) {
        const row = [];
        for (let c = 0; c < this.config.columns; c++) {
          const pair = pageSelected[itemIndex];
          itemIndex++;
          if (pair === null) {
            row.push({ prompt: '', answer: '', prompt_type: 'empty', is_empty: true });
            continue;
          }
          const itemDir = dirMap.get(pair.key);
          if (itemDir === 'k2h') row.push({ prompt: pair.katakana, answer: pair.hiragana, prompt_type: 'katakana', is_empty: false });
          else row.push({ prompt: pair.hiragana, answer: pair.katakana, prompt_type: 'hiragana', is_empty: false });
        }
        grid.push(row);
      }
      pagesData.push(grid);
    }

    return pagesData;
  }

  // Sequential/"in order" mode: instead of randomly sampling a subset per page
  // (which is what the ratio-based sampling above does), lay out every
  // selected-category kana exactly once, in canonical order (basics first,
  // then dakuten/handakuten/youon/small - matching KanaDatabase's own
  // insertion order), across as many pages as needed to fit them all. The
  // "copies" field (config.num_pages) then repeats that whole multi-page set.
  _generateSequentialPages(mandatoryPairs, forcedDirs, totalItemsPerPage, allPairsOrdered) {
    const selectedSet = new Set(this.config.categories);
    const canonicalSelected = allPairsOrdered.filter((p) => selectedSet.has(p.category));

    const mandatoryKeys = new Set(mandatoryPairs.map((p) => p.key));
    const rest = canonicalSelected.filter((p) => !mandatoryKeys.has(p.key));
    const fullOrdered = mandatoryPairs.concat(rest);

    // Group-by-row mode: lay out one "family" (consonant row - a/i/u/e/o,
    // ka/ki/ku/ke/ko, etc.) per grid row, padding short rows (ya/yu/yo,
    // wa/wo/n have only 3 members) with empty cells so every row lines up in
    // a 5-wide table instead of the next family's items bleeding into the
    // same row. Direction/dirMap below is still computed from the ungrouped
    // fullOrdered - padding nulls aren't real pairs and don't need a direction.
    let renderList = fullOrdered;
    if (this.config.group_by_row) {
      renderList = [];
      let currentGroup = null;
      for (const p of fullOrdered) {
        const group = mandatoryKeys.has(p.key) ? '__mandatory__' : this._getFamilyId(p.hiragana);
        if (group !== currentGroup) {
          while (renderList.length % 5 !== 0) renderList.push(null);
          currentGroup = group;
        }
        renderList.push(p);
      }
      while (renderList.length % 5 !== 0) renderList.push(null);
    }

    const pagesNeeded = Math.max(1, Math.ceil(renderList.length / totalItemsPerPage));
    this.lastSequentialPagesNeeded = pagesNeeded;

    // Direction assignment: same rules as the randomized path (forced chars/
    // families win, then mixed-mode balances toward mixed_k2h_ratio), just
    // computed once over the whole ordered set since every item appears
    // exactly once, rather than per-page with sampled frequencies.
    const dirMap = new Map();
    const forcedFamilyDirs = new Map();
    for (const p of fullOrdered) {
      if (forcedDirs.has(p.key)) {
        dirMap.set(p.key, forcedDirs.get(p.key));
        forcedFamilyDirs.set(this._getFamilyId(p.hiragana), forcedDirs.get(p.key));
      }
    }
    const unforced = fullOrdered.filter((p) => !forcedDirs.has(p.key));

    if (this.config.direction !== 'mixed') {
      for (const p of unforced) {
        const fam = this._getFamilyId(p.hiragana);
        dirMap.set(p.key, forcedFamilyDirs.has(fam) ? forcedFamilyDirs.get(fam) : this.config.direction);
      }
    } else {
      const targetK2hCount = Math.trunc(fullOrdered.length * (this.config.mixed_k2h_ratio / 100.0));
      const currentK2h = fullOrdered.filter((p) => forcedDirs.get(p.key) === 'k2h').length;
      const mixedDirs = this._assignMixedDirections(unforced, () => 1, forcedFamilyDirs, currentK2h, targetK2hCount);
      for (const [k, v] of mixedDirs) dirMap.set(k, v);
    }

    const basePages = [];
    for (let i = 0; i < pagesNeeded; i++) {
      const chunk = renderList.slice(i * totalItemsPerPage, (i + 1) * totalItemsPerPage);
      while (chunk.length < totalItemsPerPage) chunk.push(null);

      const grid = [];
      let itemIndex = 0;
      for (let r = 0; r < this.config.rows; r++) {
        const row = [];
        for (let c = 0; c < this.config.columns; c++) {
          const pair = chunk[itemIndex];
          itemIndex++;
          if (pair === null) {
            row.push({ prompt: '', answer: '', prompt_type: 'empty', is_empty: true });
            continue;
          }
          const itemDir = dirMap.get(pair.key);
          if (itemDir === 'k2h') row.push({ prompt: pair.katakana, answer: pair.hiragana, prompt_type: 'katakana', is_empty: false });
          else row.push({ prompt: pair.hiragana, answer: pair.katakana, prompt_type: 'hiragana', is_empty: false });
        }
        grid.push(row);
      }
      basePages.push(grid);
    }

    const copies = Math.max(1, this.config.num_pages || 1);
    const pagesData = [];
    for (let c = 0; c < copies; c++) pagesData.push(...basePages);
    return pagesData;
  }
}

// ---------- PDF renderer (port of PDFWorksheetRenderer using pdf-lib) ----------
class PDFWorksheetRenderer {
  constructor(config, pagesData) {
    this.config = config;
    this.pagesData = pagesData;
    this.fonts = null; // set once the owning PDFDocument exists

    this.usableWidth = PDF_PAGE.WIDTH - PDF_PAGE.MARGIN * 2;
    this.usableHeight = PDF_PAGE.HEIGHT - PDF_PAGE.MARGIN - PDF_PAGE.HEADER_HEIGHT - 30;

    this.cellWidth = this.usableWidth / this.config.columns;
    this.cellHeight = this.usableHeight / this.config.rows;
  }

  _getCenterOffsetJp(text, fontSize, font) {
    // Python used a fixed-width approximation (len*fs*0.95/2); pdf-lib gives us
    // real glyph widths via font.widthOfTextAtSize, which we prefer for accuracy.
    try {
      return font.widthOfTextAtSize(text, fontSize) / 2;
    } catch (e) {
      return (text.length * fontSize * 0.95) / 2;
    }
  }

  async renderCombined() {
    const pdfDoc = await PDFLib.PDFDocument.create();
    this.fonts = await getFonts(pdfDoc);
    this._renderInto(pdfDoc, false);
    if (this.config.include_answer_key !== false) this._renderInto(pdfDoc, true);
    return pdfDoc.save();
  }

  async render(isAnswerKey = false) {
    const pdfDoc = await PDFLib.PDFDocument.create();
    this.fonts = await getFonts(pdfDoc);
    this._renderInto(pdfDoc, isAnswerKey);
    return pdfDoc.save();
  }

  _renderInto(pdfDoc, isAnswerKey) {
    const { helvetica, notoSansJP } = this.fonts;

    let jpTitle, enTitle;
    if (this.config.direction === 'k2h') { jpTitle = 'カタカナ → ひらがな 練習'; enTitle = 'Write the Hiragana equivalent below.'; }
    else if (this.config.direction === 'h2k') { jpTitle = 'ひらがな → カタカナ 練習'; enTitle = 'Write the Katakana equivalent below.'; }
    else { jpTitle = 'ひらがな & カタカナ (Mixed)'; enTitle = 'Write the opposite Kana equivalent below.'; }

    const totalPages = this.pagesData.length;

    const catsShort = [];
    if (this.config.categories.includes('basic')) catsShort.push('Basic');
    if (this.config.categories.includes('dakuten')) catsShort.push('Dak');
    if (this.config.categories.includes('handakuten')) catsShort.push('Han');
    if (this.config.categories.includes('youon')) catsShort.push('You');
    if (this.config.categories.includes('small')) catsShort.push('Sml');
    const catStr = catsShort.length ? catsShort.join('+') : 'None';

    let dirStr = this.config.direction;
    if (dirStr === 'mixed') dirStr += `(${this.config.mixed_k2h_ratio}%)`;

    const alwaysStr = this.config.always_include || 'None';

    const enSettings = `Layout: ${this.config.rows}x${this.config.columns} | Dir: ${dirStr} | Cats: ${catStr} | Basic: ${this.config.basic_ratio}% | Ord: ${this.config.is_ordered} | Dupes: ${this.config.allow_duplicates} | Always: `;

    this.pagesData.forEach((gridData, pageIdx) => {
      const pageNum = pageIdx + 1;
      const page = pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]);

      page.drawText(jpTitle, {
        x: PDF_PAGE.WIDTH / 2 - this._getCenterOffsetJp(jpTitle, 20, notoSansJP),
        y: PDF_PAGE.HEIGHT - 50, size: 20, font: notoSansJP,
      });
      page.drawText('名前 (Name): _________________', {
        x: PDF_PAGE.WIDTH - PDF_PAGE.MARGIN - 160, y: PDF_PAGE.HEIGHT - 80, size: 12, font: notoSansJP,
      });
      page.drawText(enTitle, { x: PDF_PAGE.MARGIN, y: PDF_PAGE.HEIGHT - 80, size: 12, font: helvetica });

      const startY = PDF_PAGE.HEIGHT - PDF_PAGE.HEADER_HEIGHT;

      gridData.forEach((row, rIdx) => {
        row.forEach((item, cIdx) => {
          if (item.is_empty) return;

          const x = PDF_PAGE.MARGIN + cIdx * this.cellWidth;
          const y = startY - rIdx * this.cellHeight;
          const centerX = x + this.cellWidth / 2;

          const promptY = y - this.cellHeight * 0.25;
          page.drawText(item.prompt, {
            x: centerX - this._getCenterOffsetJp(item.prompt, 20, notoSansJP),
            y: promptY, size: 20, font: notoSansJP,
          });

          const boxSize = Math.min(this.cellWidth * 0.75, this.cellHeight * 0.6);
          const boxX = centerX - boxSize / 2;
          const boxY = promptY - boxSize - 8;

          drawBoxOutline(page, boxX, boxY, boxSize, boxSize, { width: 1.0 });

          const midX = boxX + boxSize / 2;
          const midY = boxY + boxSize / 2;
          const dashColor = PDFLib.rgb(0.6, 0.6, 0.6);
          drawLineSeg(page, boxX, midY, boxX + boxSize, midY, 0.5, [2, 2], dashColor);
          drawLineSeg(page, midX, boxY, midX, boxY + boxSize, 0.5, [2, 2], dashColor);

          if (isAnswerKey) {
            const ansSize = boxSize * 0.7;
            const ansY = boxY + boxSize * 0.22;
            page.drawText(item.answer, {
              x: centerX - this._getCenterOffsetJp(item.answer, ansSize, notoSansJP),
              y: ansY, size: ansSize, font: notoSansJP, color: PDFLib.rgb(0.9, 0.2, 0.2),
            });
          }
        });
      });

      const docType = isAnswerKey ? 'ANSWER KEY' : 'PRACTICE SHEET';
      const pageInfo = `Page ${pageNum} of ${totalPages}`;
      const pageInfoStr = `Powered by Ys Learning Lab - ${docType} - ${pageInfo}`;
      const pageInfoWidth = helvetica.widthOfTextAtSize(pageInfoStr, 10);
      page.drawText(pageInfoStr, {
        x: PDF_PAGE.WIDTH / 2 - pageInfoWidth / 2, y: 28, size: 10, font: helvetica, color: PDFLib.rgb(0.5, 0.5, 0.5),
      });

      if (this.config.show_settings_footer) {
        page.drawText(enSettings, { x: PDF_PAGE.MARGIN, y: 14, size: 6, font: helvetica, color: PDFLib.rgb(0.5, 0.5, 0.5) });
        const offset = PDF_PAGE.MARGIN + enSettings.length * 3.1;
        page.drawText(alwaysStr, { x: offset, y: 14, size: 6, font: notoSansJP, color: PDFLib.rgb(0.5, 0.5, 0.5) });
      }

      try {
        drawQrCode(page, 'https://ys-learning-lab.github.io/', PDF_PAGE.WIDTH - PDF_PAGE.MARGIN - 32, 6, 32);
      } catch (e) {
        console.warn('QR code unavailable (qrcode-generator failed to load?):', e);
      }
    });
  }
}

# Ys Learning Lab Worksheet Generators

Static, no-build homeschool worksheet site. Everything runs client-side:
HTML5 + Tailwind CSS (CDN) + vanilla JS + [pdf-lib](https://pdf-lib.js.org/) (CDN)
for PDF generation. No server, no build step, no analytics beyond whatever
ad script you add yourself.

## Structure

- `index.html` - landing page, links to each tool
- `math.html` / `js/math-generator.js` / `js/math-ui.js` - port of `source/math test advanced.py`
- `japanese.html` / `js/japanese-generator.js` / `js/japanese-ui.js` - port of `source/Hiragana Katakana Test Maker.py`
- `js/pdf-common.js` - shared page geometry constants, font loading, drawing helpers, download trigger
- `assets/fonts/NotoSansJP-Regular.ttf` - embedded Japanese font: a `fonttools pyftsubset` build of Noto Sans JP
  covering every ASCII + kana/kanji character this app's Japanese strings actually use (~250 glyphs, ~190KB).
  Embedded with `{ subset: false }` in `js/pdf-common.js` - pdf-lib/fontkit's own in-browser subsetter is
  unreliable on large CJK fonts (throws on the official ~40k-glyph CFF release, silently corrupts unrelated
  glyphs on a naive glyf conversion), so the font is pre-subsetted offline instead and embedded whole. If you add
  new fixed Japanese text anywhere, its characters need adding to that offline subset step or they'll render
  blank - see the git history around this file for the exact `pyftsubset`/`otf2ttf` commands used.
- `results.html` / `js/pdf-viewer.js` - shared PDF viewer page every "Generate" button opens in a new tab
  instead of downloading directly (renders the PDF with pdf.js, thumbnail rail + Print + Download, ad slots
  around the viewer). See "Adding a new worksheet tool" below.
- `assets/css/site.css` - small set of utility classes Tailwind's CDN build can't express (dashed ad placeholders,
  bold worksheet index numbers, crosshair answer boxes)

## Running locally

Just open `index.html` in a browser, or serve the folder with any static file server
(`python -m http.server`, VS Code Live Server, etc.) - opening `math.html`/`japanese.html`
directly via `file://` also works since there's no backend.

## Hosting on GitHub Pages

1. Push this folder to a GitHub repo.
2. Repo Settings -> Pages -> Deploy from branch -> pick `main` / root.
3. Done - all asset paths are relative, no config needed.

## Ads

The site is linked to AdSense (publisher `ca-pub-6130154285914649`, verified via the `<script>` tag in every
page's `<head>` and `/ads.txt` at the site root).

`results.html` keeps the original layout:
- `#ad-slot-top-leaderboard` (728x90-ish leaderboard, full width) - **live**, AdSense ad unit slot `7285905093`.
- `#ad-slot-sidebar` (300x250 rectangle, next to the PDF viewer) - **live**, AdSense ad unit slot `8894500230`.

`index.html` has two spots: a rectangle ad as the 4th tile in the 2x2 subject-cards grid (`#ad-slot-grid`, reuses
the sidebar ad unit slot `8894500230`) and a leaderboard banner at the bottom of the page, below the grid
(`#ad-slot-bottom-leaderboard`, reuses the leaderboard ad unit slot `7285905093`) - deliberately not at the top,
so a first-time visitor sees the actual subject choices before any ad.

`math.html` and `japanese.html` moved away from a top banner (low-attention position) to three spots nearer
where visitors are actually looking/acting:
- `#ad-slot-sidebar` (300x250 rectangle, next to the control panel) - **live**, ad unit slot `8894500230`.
- `#ad-slot-below-preview` (728x90-ish, under the live problem/kana preview grid) - **live**, reuses the
  leaderboard ad unit slot `7285905093` (repositioned here instead of the top of the page).
- `#ad-slot-below-generate` (under the Generate button, left column) - **live**, AdSense ad unit slot
  `7199305456`.

All ad slot containers cap their height (`overflow-hidden` + a fixed height) rather than letting
`data-ad-format="auto"` reserve however much space it wants - useful right after linking a new AdSense account,
since ads may not start filling for hours to a couple weeks, and an unfilled `auto`-format slot can otherwise
reserve a very tall blank block while waiting.

Every ad slot is a plain `<div>` placed as a sibling of `#controls`/`#preview` (or the PDF viewer on
`results.html`) - never nested inside them - so ad content can't overlap form fields or generated worksheet
content, however the ad network chooses to render. To wire up a new/replacement ad unit, paste its snippet in
place of the existing `<ins>`/`<script>` pair, e.g.:

```html
<div id="ad-slot-below-preview">
  <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-XXXX" data-ad-slot="XXXX"></ins>
  <script>(adsbygoogle = window.adsbygoogle || []).push({});</script>
</div>
```

## Adding a new worksheet tool

Every "Generate" button opens the finished PDF in `results.html` (a new tab, ad-supported PDF.js viewer) rather
than downloading it directly. `results.html` has no idea what subject generated the PDF - it only knows how to
render whatever bytes it's handed - so a new tool (e.g. a future writing-practice generator) gets this for free
by following the same three-step contract used by `math-ui.js`/`japanese-ui.js`:

1. In the Generate click handler, **before any `await`**, call `const resultTab = window.open('', '_blank');` -
   this must happen synchronously in direct response to the click, or the browser's popup blocker may treat a
   tab opened after your (async) PDF generation finishes as not user-initiated and block it.
2. Generate your PDF bytes with pdf-lib as usual.
3. Call `await openPdfResults(bytes, filename, '<your-tool>.html', '<Tool Label>', resultTab);` (from
   `js/pdf-common.js`) instead of `downloadPdfBytes(...)`. It hands the bytes off via IndexedDB and points
   `resultTab` at `results.html?id=...`; if IndexedDB is unavailable it falls back to a direct download so
   generation never breaks.

No changes to `results.html` or `js/pdf-viewer.js` are needed for a new tool.

## Notes on the port

- No `eval()`/`new Function()` anywhere. The math tool's mixed-continuous-equation feature (which used Python's
  `eval()` on a string) is replaced with `evalTokens()` in `js/math-generator.js`, a small recursive-descent
  evaluator operating directly on the token array (numbers/operators/parens) with standard precedence.
- PDF coordinate math (page 595.28x841.89pt, MARGIN=40, HEADER_HEIGHT=100, per-cell font-size scaling formulas,
  box/line drawing) is ported 1:1 from the Python hand-rolled PDF byte writer into pdf-lib calls - pdf-lib uses
  the same bottom-left-origin coordinate system as raw PDF, so the arithmetic translates directly.
- Both tools now generate a single combined PDF (worksheet pages followed by answer-key pages), matching the
  Python apps' `combined_pdf=True` default path.
- Problem index numbers ("1.", "2.") are rendered in Times-Bold (matching the Python renderer's "F3" font) in
  both the PDF and the live HTML preview (`.worksheet-index` in `assets/css/site.css`), so they're never
  confused with equation digits.
- Every generated PDF gets a small "Powered by Ys Learning Lab" footer line plus a QR code (bottom-right, at
  `y=20` so it clears the paper edge even on printers with a tight unprintable margin - a partially-clipped QR
  code is unscannable, unlike text, which degrades more gracefully; `drawQrCode()` in `js/pdf-common.js`)
  linking back to the site's homepage - drawn as plain filled rectangles from the
  [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) CDN library's module matrix, not a
  raster image, consistent with how everything else in these renderers is hand-drawn. Wrapped in a try/catch so
  a CDN hiccup degrades to "no QR code" rather than breaking generation.
- Every generated worksheet (and its matching answer key) is stamped with a worksheet-matching code
  (`getNextWorksheetCode()` in `js/pdf-common.js`, cycling `A-1` .. `Z-50` then wrapping, persisted in
  `localStorage` so it keeps advancing across page reloads) so a teacher printing a stack of worksheets for a
  whole class can pair each student's worksheet back to its answer key by eye. If one "Generate" click produces
  multiple pages, each page gets a `-N` suffix (e.g. `A-7-1`, `A-7-2`) and the same per-page code appears on
  both the worksheet page and its corresponding answer-key page. The counter is shared between the math and
  Japanese tools so a mixed print run never collides.
- Every worksheet header also has Name/Date and Teacher/Class fill-in lines for students to fill in before
  turning a sheet in. On the Japanese tool these are English-only (Helvetica) even though the sheet is
  otherwise bilingual, specifically to avoid needing to re-run the offline Noto Sans JP subsetting pipeline for
  new kanji.

## Cache-busting local script/style changes

Every `<script src="js/...">` and the `site.css` link carries a `?v=N` query param. **Bump it whenever you edit
that file** - browsers cache these aggressively with no other cache-control here, and without bumping the
version, visitors (and you, testing) can silently keep running old JS/CSS after a deploy. Cache-busting is
per-file-type, not global: all `js/*.js` references share one number (`?v=3` currently), `site.css` has its own
(`?v=7` currently) - bump whichever group you actually touched.


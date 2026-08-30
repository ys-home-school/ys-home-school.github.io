# Ys School Worksheet Generators

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

- `#ad-slot-top-leaderboard` on every page (728x90-ish leaderboard, full width) - **live**, running AdSense ad
  unit slot `7285905093`.
- `#ad-slot-sidebar` on `math.html`, `japanese.html`, and `results.html` (300x250 rectangle, next to the control
  panel / PDF viewer) - **still a placeholder**, waiting on a second AdSense ad unit (create one sized ~300x250,
  then swap it in the same way as the leaderboard unit below).

Both ad slots are plain `<div>`s placed as siblings of `#controls`/`#preview` (or the PDF viewer on
`results.html`) - never nested inside them - so ad content can't overlap form fields or generated worksheet
content, however the ad network chooses to render. To wire up a new/replacement ad unit, paste its snippet in
place of the existing `<ins>`/`<script>` pair, e.g.:

```html
<div id="ad-slot-top-leaderboard">
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


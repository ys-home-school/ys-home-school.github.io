// Wires up results.html: pulls the handoff record out of IndexedDB (written by
// openPdfResults() in pdf-common.js), renders it with pdf.js, and wires up
// zoom/print/download. getHandoffRecord/downloadPdfBytes come from the classic
// <script src="js/pdf-common.js"> loaded before this module script - global
// declarations there are reachable from here since both share `window`.

import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.worker.min.mjs';

let currentZoom = 1.0;
let currentBytes = null;
let currentFilename = 'worksheet.pdf';
let printUrl = null;

function showEmptyState() {
  document.getElementById('empty-state').classList.remove('hidden');
  document.getElementById('viewer-shell').classList.add('hidden');
}

function showViewer() {
  document.getElementById('empty-state').classList.add('hidden');
  document.getElementById('viewer-shell').classList.remove('hidden');
}

async function renderPdf() {
  const pagesContainer = document.getElementById('pages-container');
  const thumbsContainer = document.getElementById('thumbs-container');
  pagesContainer.innerHTML = '';
  thumbsContainer.innerHTML = '';

  // pdf.js may take ownership of the buffer passed to getDocument, so hand it
  // a fresh copy each time (zoom changes call this again).
  const loadingTask = pdfjsLib.getDocument({ data: currentBytes.slice() });
  const pdfDoc = await loadingTask.promise;
  const pageCount = pdfDoc.numPages;
  document.getElementById('page-count').textContent = `Page 1 of ${pageCount}`;

  const canvases = [];
  for (let i = 1; i <= pageCount; i++) {
    const page = await pdfDoc.getPage(i);

    const viewport = page.getViewport({ scale: currentZoom });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.className = 'shadow border-2 border-stone-800 rounded-lg bg-white mb-4 mx-auto block';
    canvas.dataset.pageNumber = String(i);
    pagesContainer.appendChild(canvas);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    canvases.push(canvas);

    const thumbViewport = page.getViewport({ scale: 0.15 });
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbViewport.width;
    thumbCanvas.height = thumbViewport.height;
    thumbCanvas.className = 'border-2 border-stone-400 hover:border-indigo-500 rounded-md cursor-pointer mb-2 mx-auto block bg-white max-w-full h-auto';
    thumbCanvas.title = `Page ${i}`;
    await page.render({ canvasContext: thumbCanvas.getContext('2d'), viewport: thumbViewport }).promise;
    thumbCanvas.addEventListener('click', () => canvas.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    thumbsContainer.appendChild(thumbCanvas);
  }

  observeCurrentPage(canvases, pageCount);
}

function observeCurrentPage(canvases, pageCount) {
  const label = document.getElementById('page-count');
  const root = document.getElementById('viewer-scroll');
  const observer = new IntersectionObserver((entries) => {
    const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visible) label.textContent = `Page ${visible.target.dataset.pageNumber} of ${pageCount}`;
  }, { root, threshold: [0.5] });
  canvases.forEach((c) => observer.observe(c));
}

async function changeZoom(delta) {
  currentZoom = Math.min(3, Math.max(0.5, currentZoom + delta));
  await renderPdf();
}

function wirePrint() {
  const iframe = document.getElementById('print-frame');
  const blob = new Blob([currentBytes.slice()], { type: 'application/pdf' });
  printUrl = URL.createObjectURL(blob);
  iframe.src = printUrl;

  document.getElementById('print-btn').addEventListener('click', () => {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
    } catch (e) {
      window.open(printUrl, '_blank');
    }
  });
}

function wireDownload() {
  document.getElementById('download-btn').addEventListener('click', () => {
    downloadPdfBytes(currentBytes.slice(), currentFilename);
  });
}

async function init() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (!id) { showEmptyState(); return; }

  let record;
  try {
    record = await getHandoffRecord(id);
  } catch (e) {
    console.error('Could not read PDF handoff record:', e);
    showEmptyState();
    return;
  }
  if (!record) { showEmptyState(); return; }

  currentBytes = record.bytes instanceof Uint8Array ? record.bytes : new Uint8Array(record.bytes);
  currentFilename = record.filename || 'worksheet.pdf';

  document.getElementById('worksheet-title').textContent = currentFilename;
  const backLink = document.getElementById('back-link');
  backLink.textContent = `← Back to ${record.toolLabel || 'generator'}`;
  backLink.href = record.toolPage || 'index.html';

  showViewer();

  try {
    await renderPdf();
    wirePrint();
    wireDownload();
    document.getElementById('zoom-in').addEventListener('click', () => changeZoom(0.15));
    document.getElementById('zoom-out').addEventListener('click', () => changeZoom(-0.15));
  } catch (e) {
    console.error('Failed to render PDF:', e);
    document.getElementById('pages-container').innerHTML = '<p class="text-sm text-red-600 p-4">Could not render this PDF.</p>';
  }
}

init();

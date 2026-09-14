/* ==========================================================================
   Rasiddoo v1.0: Product Label Generator
   For products that don't already have a printed/scannable code (manually
   added items, or an existing item you just want a fresh sticker for), this
   module generates a unique internal product code and renders it as a
   switchable QR code or barcode label — previewed on screen, saved as a
   print-ready PNG, or sent straight to the printer. Once printed and stuck
   on the item, that same code can be picked up instantly by the live
   scanner on the Billing screen, just like any other manufacturer code.
   ========================================================================== */

const Label = (() => {
  const CODE_SEQ_KEY = 'rasiddoo_label_seq';

  let currentProduct = null; // { code, name, price, photo }
  let currentMode = 'qr'; // 'qr' | 'barcode'

  // Elements (cached on first open)
  let modalEl, previewEl, codeTextEl, nameEl, priceEl;
  let tabQr, tabBarcode, saveBtn, printBtn, closeBtn, doneBtn;
  let wired = false;

  /**
   * Generates a short, unique, human-readable internal product code.
   * Format: BN + 10 digits (timestamp tail + random), e.g. "BN4821059317".
   * Digits-only after the prefix keeps it friendly to CODE128/QR alike and
   * easy to read/key in by hand if a label ever gets damaged.
   * @returns {string}
   */
  function generateProductCode() {
    let seq;
    try {
      seq = parseInt(localStorage.getItem(CODE_SEQ_KEY) || '0', 10) + 1;
      localStorage.setItem(CODE_SEQ_KEY, String(seq));
    } catch (e) {
      seq = Math.floor(Math.random() * 999999);
    }
    const timePart = Date.now().toString().slice(-7);
    const seqPart = String(seq).padStart(4, '0').slice(-4);
    return `BN${timePart}${seqPart}`;
  }

  function cacheElements() {
    if (wired) return;
    modalEl = document.getElementById('label-modal');
    previewEl = document.getElementById('label-preview');
    codeTextEl = document.getElementById('label-code-text');
    nameEl = document.getElementById('label-product-name');
    priceEl = document.getElementById('label-product-price');
    tabQr = document.getElementById('label-tab-qr');
    tabBarcode = document.getElementById('label-tab-barcode');
    saveBtn = document.getElementById('label-save-btn');
    printBtn = document.getElementById('label-print-btn');
    closeBtn = document.getElementById('label-close');
    doneBtn = document.getElementById('label-done-btn');

    if (!modalEl) return;

    tabQr.addEventListener('click', () => setMode('qr'));
    tabBarcode.addEventListener('click', () => setMode('barcode'));
    saveBtn.addEventListener('click', handleSavePng);
    printBtn.addEventListener('click', handlePrint);
    closeBtn.addEventListener('click', () => ModalManager.close('label-modal'));
    doneBtn.addEventListener('click', () => ModalManager.close('label-modal'));

    wired = true;
  }

  /**
   * Opens the label modal for a given product, pre-rendering the current mode.
   * @param {{code: string, name: string, price: number, photo?: string|null}} product
   * @param {{mode?: 'qr'|'barcode'}} [options]
   */
  function open(product, options = {}) {
    cacheElements();
    if (!modalEl) return;

    currentProduct = product;
    currentMode = options.mode || 'qr';

    nameEl.textContent = product.name;
    priceEl.textContent = Utils.formatCurrency(product.price, Profile.get().currencySymbol);
    codeTextEl.textContent = product.code;

    setMode(currentMode);
    ModalManager.open('label-modal');
  }

  /**
   * Switches the preview between QR and Barcode rendering.
   * @param {'qr'|'barcode'} mode
   */
  function setMode(mode) {
    currentMode = mode;
    tabQr.classList.toggle('active', mode === 'qr');
    tabQr.setAttribute('aria-selected', String(mode === 'qr'));
    tabBarcode.classList.toggle('active', mode === 'barcode');
    tabBarcode.setAttribute('aria-selected', String(mode === 'barcode'));
    renderPreview();
  }

  /**
   * Renders the on-screen preview (QR via qrcode.js into a div, or a
   * barcode via JsBarcode onto a canvas) for the current product/mode.
   */
  function renderPreview() {
    if (!currentProduct) return;
    previewEl.innerHTML = '';

    if (currentMode === 'qr') {
      const qrTarget = document.createElement('div');
      qrTarget.className = 'label-qr-canvas';
      previewEl.appendChild(qrTarget);
      // eslint-disable-next-line no-new
      new QRCode(qrTarget, {
        text: currentProduct.code,
        width: 200,
        height: 200,
        colorDark: '#101513',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
    } else {
      const canvas = document.createElement('canvas');
      previewEl.appendChild(canvas);
      try {
        JsBarcode(canvas, currentProduct.code, {
          format: 'CODE128',
          lineColor: '#101513',
          width: 2.4,
          height: 90,
          displayValue: true,
          fontSize: 16,
          margin: 10,
          background: '#ffffff',
        });
      } catch (err) {
        console.error('[Label] Barcode render failed', err);
        previewEl.innerHTML = '<div class="label-render-error"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i> Could not render barcode for this code.</div>';
      }
    }
  }

  /**
   * Builds a full, off-screen, print-ready label card (logo-free, high
   * contrast, code printed as readable text alongside the symbol) sized
   * for a small sticker, and rasterizes it via html2canvas.
   * Used by both "Save as PNG" and "Print".
   * @returns {Promise<HTMLCanvasElement>}
   */
  async function renderLabelCardToCanvas() {
    const card = document.createElement('div');
    card.className = 'label-print-card';

    const symbolWrap = document.createElement('div');
    symbolWrap.className = 'label-print-symbol';

    if (currentMode === 'qr') {
      const qrTarget = document.createElement('div');
      symbolWrap.appendChild(qrTarget);
      card.appendChild(buildLabelCardText('top'));
      card.appendChild(symbolWrap);
      document.body.appendChild(wrapOffscreen(card));
      // eslint-disable-next-line no-new
      new QRCode(qrTarget, {
        text: currentProduct.code,
        width: 260,
        height: 260,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
      card.appendChild(buildLabelCodeCaption());
    } else {
      const canvas = document.createElement('canvas');
      symbolWrap.appendChild(canvas);
      card.appendChild(buildLabelCardText('top'));
      card.appendChild(symbolWrap);
      document.body.appendChild(wrapOffscreen(card));
      JsBarcode(canvas, currentProduct.code, {
        format: 'CODE128',
        lineColor: '#000000',
        width: 3,
        height: 110,
        displayValue: true,
        fontSize: 20,
        margin: 8,
        background: '#ffffff',
      });
    }

    // Let the just-inserted QR/barcode canvas paint before rasterizing.
    await new Promise((resolve) => window.setTimeout(resolve, 60));

    const offscreenWrap = card.parentElement;
    try {
      const canvas = await html2canvas(card, {
        scale: 3,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });
      return canvas;
    } finally {
      offscreenWrap.remove();
    }
  }

  function wrapOffscreen(card) {
    const wrap = document.createElement('div');
    wrap.className = 'label-offscreen';
    wrap.appendChild(card);
    return wrap;
  }

  function buildLabelCardText() {
    const wrap = document.createElement('div');
    wrap.className = 'label-print-text';
    wrap.innerHTML = `
      <div class="label-print-name">${Utils.escapeHtml(currentProduct.name)}</div>
      <div class="label-print-price">${Utils.escapeHtml(Utils.formatCurrency(currentProduct.price, Profile.get().currencySymbol))}</div>
    `;
    return wrap;
  }

  function buildLabelCodeCaption() {
    const wrap = document.createElement('div');
    wrap.className = 'label-print-code';
    wrap.textContent = currentProduct.code;
    return wrap;
  }

  /**
   * Rasterizes the current label and triggers a PNG download, so it can be
   * printed on a label/sticker printer and stuck on the item for future
   * quick scanning.
   */
  async function handleSavePng() {
    if (!currentProduct) return;
    Loading.show('Preparing label…');
    try {
      const canvas = await renderLabelCardToCanvas();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 1));
      const safeName = currentProduct.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'product';
      const fileName = `label-${safeName}-${currentProduct.code}.png`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      Toast.success('Label saved as PNG');
    } catch (err) {
      console.error('[Label] PNG export failed', err);
      Toast.error('Could not save label image');
    } finally {
      Loading.hide();
    }
  }

  /**
   * Opens the browser print dialog with just the label card on the page.
   */
  function handlePrint() {
    if (!currentProduct) return;
    const printContainer = document.getElementById('label-print-container');
    printContainer.innerHTML = '';

    const card = document.createElement('div');
    card.className = 'label-print-card';
    card.appendChild(buildLabelCardText());

    const symbolWrap = document.createElement('div');
    symbolWrap.className = 'label-print-symbol';
    card.appendChild(symbolWrap);
    printContainer.appendChild(card);

    if (currentMode === 'qr') {
      const qrTarget = document.createElement('div');
      symbolWrap.appendChild(qrTarget);
      // eslint-disable-next-line no-new
      new QRCode(qrTarget, {
        text: currentProduct.code,
        width: 260,
        height: 260,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M,
      });
      card.appendChild(buildLabelCodeCaption());
    } else {
      const canvas = document.createElement('canvas');
      symbolWrap.appendChild(canvas);
      JsBarcode(canvas, currentProduct.code, {
        format: 'CODE128',
        lineColor: '#000000',
        width: 3,
        height: 110,
        displayValue: true,
        fontSize: 20,
        margin: 8,
        background: '#ffffff',
      });
    }

    window.setTimeout(() => window.print(), 80);
  }

  return {
    generateProductCode,
    open,
  };
})();

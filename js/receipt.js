/* ==========================================================================
   BillNova India: Receipt Generator
   Builds a professional Indian thermal-style tall receipt for a completed
   bill, and exports it as PDF (html2canvas + jsPDF), print, or WhatsApp share.
   ========================================================================== */

const Receipt = (() => {
  const INVOICE_SEQ_KEY = 'billnova_invoice_seq';

  /**
   * Generates the next sequential invoice number, e.g. BN-2026-000123
   * @returns {string}
   */
  function nextInvoiceNumber() {
    const year = new Date().getFullYear();
    const seqKey = `${INVOICE_SEQ_KEY}_${year}`;
    let seq;
    try {
      seq = parseInt(localStorage.getItem(seqKey) || '0', 10);
      seq += 1;
      localStorage.setItem(seqKey, String(seq));
    } catch (e) {
      console.warn('[Receipt] Failed to persist invoice sequence, using timestamp fallback', e);
      seq = Number(String(Date.now()).slice(-6));
    }
    return `BN-${year}-${String(seq).padStart(6, '0')}`;
  }

  /**
   * Formats a Date as a readable date + time string, e.g. "12 Sep 2026, 06:45 PM"
   * @param {Date} date
   */
  function formatDateTime(date) {
    const datePart = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const timePart = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    return `${datePart}, ${timePart}`;
  }

  /**
   * Builds the printable/exportable receipt HTML string for a bill object.
   * @param {Object} bill - full bill record (see Billing.buildBillRecord)
   * @returns {string}
   */
  function buildReceiptHTML(bill) {
    const currency = bill.currencySymbol || '₹';
    const fmt = (n) => currency + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const itemsRows = bill.items.map((item) => `
      <tr>
        <td class="r-item-name">
          ${Utils.escapeHtml(item.name)}
          <div class="r-item-sub">${fmt(item.price)} × ${item.qty}</div>
        </td>
        <td class="r-item-qty">${item.qty}</td>
        <td class="r-item-amt">${fmt(item.price * item.qty)}</td>
      </tr>
    `).join('');

    const customerBlock = (bill.customerName || bill.customerContact) ? `
      <div class="r-block">
        <div class="r-block-title">Bill To</div>
        ${bill.customerName ? `<div class="r-line">${Utils.escapeHtml(bill.customerName)}</div>` : ''}
        ${bill.customerContact ? `<div class="r-line">${Utils.escapeHtml(bill.customerContact)}</div>` : ''}
      </div>
    ` : '';

    const paymentBlock = `
      <div class="r-block">
        <div class="r-block-title">Payment</div>
        <div class="r-row"><span>Method</span><span>${bill.paymentMethod === 'upi' ? 'UPI' : 'Cash'}</span></div>
        ${bill.paymentMethod === 'upi' && bill.upiId ? `<div class="r-row"><span>UPI ID</span><span>${Utils.escapeHtml(bill.upiId)}</span></div>` : ''}
      </div>
    `;

    const discountRow = bill.discountAmount > 0 ? `<div class="r-row"><span>Discount (${bill.discountPercent}%)</span><span>- ${fmt(bill.discountAmount)}</span></div>` : '';
    const gstRow = bill.gstAmount > 0 ? `<div class="r-row"><span>GST (${bill.gstPercent}%)</span><span>${fmt(bill.gstAmount)}</span></div>` : '';

    return `
      <div class="receipt" id="receipt-render-target">
        <div class="r-header">
          <img src="assets/icons/icon-192.png" alt="" class="r-logo" crossorigin="anonymous">
          <div class="r-shop-name">${Utils.escapeHtml(bill.shopName || 'BillNova India')}</div>
          ${bill.shopContact ? `<div class="r-shop-contact">${Utils.escapeHtml(bill.shopContact)}</div>` : ''}
        </div>

        <div class="r-divider"></div>

        <div class="r-meta">
          <div class="r-row"><span>Invoice No.</span><span>${bill.invoiceNumber}</span></div>
          <div class="r-row"><span>Date &amp; Time</span><span>${formatDateTime(new Date(bill.createdAt))}</span></div>
        </div>

        ${customerBlock}

        <div class="r-divider"></div>

        <table class="r-items-table">
          <thead>
            <tr><th class="r-item-name">Item</th><th class="r-item-qty">Qty</th><th class="r-item-amt">Amount</th></tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>

        <div class="r-divider"></div>

        <div class="r-totals">
          <div class="r-row"><span>Subtotal</span><span>${fmt(bill.subtotal)}</span></div>
          ${discountRow}
          ${gstRow}
          <div class="r-grand-row"><span>Grand Total</span><span>${fmt(bill.grandTotal)}</span></div>
        </div>

        <div class="r-divider"></div>

        ${paymentBlock}

        <div class="r-divider r-dashed"></div>

        <div class="r-footer">
          <div class="r-thankyou">${Utils.escapeHtml(bill.footerMessage || 'Thank you for shopping with us!')}</div>
          <div class="r-powered">Billed with BillNova India</div>
        </div>
      </div>
    `;
  }

  /**
   * Renders the receipt into the hidden print/export container.
   * @param {Object} bill
   * @returns {HTMLElement} the receipt root element
   */
  function renderInto(bill, containerEl) {
    containerEl.innerHTML = buildReceiptHTML(bill);
    return containerEl.querySelector('.receipt');
  }

  /**
   * Opens the browser print dialog for a given bill using a dedicated print container.
   * @param {Object} bill
   */
  function printReceipt(bill) {
    const printContainer = document.getElementById('receipt-print-container');
    renderInto(bill, printContainer);
    window.setTimeout(() => window.print(), 80);
  }

  /**
   * Renders a bill to an off-screen container, rasterizes with html2canvas,
   * and returns a canvas. Used for both PDF export and image-based sharing.
   * @param {Object} bill
   * @returns {Promise<HTMLCanvasElement>}
   */
  async function renderToCanvas(bill) {
    const exportContainer = document.getElementById('receipt-export-container');
    const receiptEl = renderInto(bill, exportContainer);

    // Ensure logo image is loaded before rasterizing
    const img = receiptEl.querySelector('.r-logo');
    if (img && !img.complete) {
      await new Promise((resolve) => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }

    const canvas = await html2canvas(receiptEl, {
      scale: 2.5,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });
    return canvas;
  }

  /**
   * Exports the bill as a high-quality PDF using jsPDF, sized to the receipt content.
   * @param {Object} bill
   */
  async function saveAsPDF(bill) {
    Loading.show('Preparing PDF…');
    try {
      const canvas = await renderToCanvas(bill);
      const imgData = canvas.toDataURL('image/png');

      const pdfWidthMM = 80; // standard thermal receipt width
      const pdfHeightMM = (canvas.height * pdfWidthMM) / canvas.width;

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: [pdfWidthMM, pdfHeightMM],
      });

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidthMM, pdfHeightMM);
      pdf.save(`${bill.invoiceNumber}.pdf`);
      Toast.success('Receipt saved as PDF');
    } catch (err) {
      console.error('[Receipt] PDF export failed', err);
      Toast.error('Could not generate PDF');
    } finally {
      Loading.hide();
    }
  }

  /**
   * Shares the receipt on WhatsApp. Uses the Web Share API with an image file
   * when supported (mobile), otherwise falls back to a wa.me text link.
   * @param {Object} bill
   */
  async function shareOnWhatsApp(bill) {
    Loading.show('Preparing receipt…');
    try {
      const canvas = await renderToCanvas(bill);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
      const fileName = `${bill.invoiceNumber}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      const shareText = `Receipt from ${bill.shopName || 'BillNova India'}, ${bill.invoiceNumber}, Total ${bill.currencySymbol || '₹'}${bill.grandTotal.toFixed(2)}`;

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'BillNova India Receipt',
          text: shareText,
        });
        Toast.success('Shared successfully');
      } else {
        // Fallback: open WhatsApp with prefilled text (image not attachable via URL scheme)
        const phone = (bill.customerContact || '').replace(/\D/g, '');
        const waUrl = phone
          ? `https://wa.me/${phone.length === 10 ? '91' + phone : phone}?text=${encodeURIComponent(shareText)}`
          : `https://wa.me/?text=${encodeURIComponent(shareText)}`;
        window.open(waUrl, '_blank');
        Toast.info('Opened WhatsApp. Attach the downloaded receipt image if needed.');
        // Also trigger a download so the user has the image to attach manually
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        // user cancelled share sheet, no toast needed
      } else {
        console.error('[Receipt] WhatsApp share failed', err);
        Toast.error('Could not share receipt');
      }
    } finally {
      Loading.hide();
    }
  }

  return {
    nextInvoiceNumber,
    formatDateTime,
    buildReceiptHTML,
    renderInto,
    printReceipt,
    saveAsPDF,
    shareOnWhatsApp,
  };
})();

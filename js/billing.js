/* ==========================================================================
   BillNova India: Billing Flow
   Confirm Bill -> Payment (Cash/UPI with QR) -> Success animation -> Actions
   ========================================================================== */

const Billing = (() => {
  let pendingBillDraft = null; // { customerName, customerContact, shopName, shopContact }
  let currentBill = null;

  // Confirm Bill modal elements
  let confirmBillForm, cbShopName, cbShopContact, cbCustomerName, cbCustomerContact, cbWhatsappSame;

  // Payment modal elements
  let paymentTabCash, paymentTabUpi, paymentCashPanel, paymentUpiPanel;
  let upiQrContainer, upiShopNameEl, upiIdEl, upiPhoneEl, upiCopyBtn, upiAmountEl;
  let paymentConfirmBtn;

  // Success screen elements
  let successOverlay, successActionsEl;

  function cacheElements() {
    confirmBillForm = document.getElementById('confirm-bill-form');
    cbShopName = document.getElementById('cb-shop-name');
    cbShopContact = document.getElementById('cb-shop-contact');
    cbCustomerName = document.getElementById('cb-customer-name');
    cbCustomerContact = document.getElementById('cb-customer-contact');
    cbWhatsappSame = document.getElementById('cb-whatsapp-same');

    paymentTabCash = document.getElementById('payment-tab-cash');
    paymentTabUpi = document.getElementById('payment-tab-upi');
    paymentCashPanel = document.getElementById('payment-panel-cash');
    paymentUpiPanel = document.getElementById('payment-panel-upi');
    upiQrContainer = document.getElementById('upi-qr-container');
    upiShopNameEl = document.getElementById('upi-detail-shop');
    upiIdEl = document.getElementById('upi-detail-id');
    upiPhoneEl = document.getElementById('upi-detail-phone');
    upiCopyBtn = document.getElementById('upi-copy-btn');
    upiAmountEl = document.getElementById('upi-detail-amount');
    paymentConfirmBtn = document.getElementById('payment-confirm-btn');

    successOverlay = document.getElementById('success-overlay');
    successActionsEl = document.getElementById('success-actions');
  }

  function init() {
    cacheElements();

    document.getElementById('confirm-bill-btn')?.addEventListener('click', openConfirmBill);
    document.getElementById('confirm-bill-close')?.addEventListener('click', () => ModalManager.close('confirm-bill-modal'));
    document.getElementById('confirm-bill-cancel')?.addEventListener('click', () => ModalManager.close('confirm-bill-modal'));

    cbWhatsappSame.addEventListener('change', () => {
      if (cbWhatsappSame.checked) {
        cbCustomerContact.value = cbCustomerContact.value; // keep as-is; copy handled below
        syncWhatsappNumber();
      }
    });
    cbCustomerContact.addEventListener('input', () => {
      if (cbWhatsappSame.checked) syncWhatsappNumber();
    });

    confirmBillForm.addEventListener('submit', handleConfirmBillSubmit);

    document.getElementById('payment-close')?.addEventListener('click', () => ModalManager.close('payment-modal'));
    document.getElementById('payment-back')?.addEventListener('click', () => {
      ModalManager.close('payment-modal');
      ModalManager.open('confirm-bill-modal');
    });

    paymentTabCash.addEventListener('click', () => switchPaymentTab('cash'));
    paymentTabUpi.addEventListener('click', () => switchPaymentTab('upi'));
    upiCopyBtn.addEventListener('click', handleCopyUpi);
    paymentConfirmBtn.addEventListener('click', handlePaymentConfirm);

    document.getElementById('success-done-btn')?.addEventListener('click', closeSuccessScreen);
  }

  function syncWhatsappNumber() {
    // "WhatsApp same as contact" simply mirrors the customer contact number;
    // no separate field is needed since WhatsApp sharing reuses customerContact.
  }

  function openConfirmBill() {
    const totals = Cart.computeTotals();
    if (totals.totalItems === 0) {
      Toast.error('Add at least one item before generating a bill.');
      return;
    }

    const profile = Profile.get();
    confirmBillForm.reset();
    cbShopName.value = profile.shopName || '';
    cbShopContact.value = profile.contactNumber || '';
    cbWhatsappSame.checked = false;

    ModalManager.open('confirm-bill-modal');
  }

  function handleConfirmBillSubmit(e) {
    e.preventDefault();

    pendingBillDraft = {
      shopName: cbShopName.value.trim(),
      shopContact: cbShopContact.value.trim(),
      customerName: cbCustomerName.value.trim(),
      customerContact: cbCustomerContact.value.trim(),
      whatsappSameAsContact: cbWhatsappSame.checked,
    };

    ModalManager.close('confirm-bill-modal');
    openPaymentModal();
  }

  function openPaymentModal() {
    switchPaymentTab('cash');
    ModalManager.open('payment-modal');
  }

  function switchPaymentTab(mode) {
    const isCash = mode === 'cash';
    paymentTabCash.classList.toggle('active', isCash);
    paymentTabUpi.classList.toggle('active', !isCash);
    paymentTabCash.setAttribute('aria-selected', String(isCash));
    paymentTabUpi.setAttribute('aria-selected', String(!isCash));
    paymentCashPanel.hidden = !isCash;
    paymentUpiPanel.hidden = isCash;

    paymentConfirmBtn.dataset.method = mode;
    paymentConfirmBtn.innerHTML = isCash
      ? '<i class="fa-solid fa-check" aria-hidden="true"></i> Confirm Cash Payment'
      : '<i class="fa-solid fa-check" aria-hidden="true"></i> Confirm UPI Payment';

    if (!isCash) renderUpiQr();
  }

  /**
   * Builds the standard UPI deep link with the bill amount prefilled.
   * @returns {string}
   */
  function buildUpiLink() {
    const profile = Profile.get();
    const totals = Cart.computeTotals();
    const payeeName = (pendingBillDraft?.shopName || profile.shopName || 'BillNova Merchant').trim();
    const upiId = (profile.upiId || '').trim();
    const amount = totals.grandTotal.toFixed(2);
    const note = `Invoice ${document.getElementById('cb-customer-name') ? '' : ''}Payment to ${payeeName}`;

    const params = new URLSearchParams({
      pa: upiId,
      pn: payeeName,
      am: amount,
      cu: 'INR',
      tn: `Payment to ${payeeName}`,
    });
    return `upi://pay?${params.toString()}`;
  }

  function renderUpiQr() {
    const profile = Profile.get();
    const totals = Cart.computeTotals();

    upiShopNameEl.textContent = pendingBillDraft?.shopName || profile.shopName || 'Your Shop';
    upiIdEl.textContent = profile.upiId || 'Not set. Add it in Profile';
    upiPhoneEl.textContent = pendingBillDraft?.shopContact || profile.contactNumber || '-';
    upiAmountEl.textContent = (profile.currencySymbol || '₹') + totals.grandTotal.toFixed(2);

    upiQrContainer.innerHTML = '';

    if (!profile.upiId) {
      upiQrContainer.innerHTML = '<div class="upi-qr-missing"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i><span>Set your UPI ID in Profile to generate a scannable QR code.</span></div>';
      return;
    }

    const upiLink = buildUpiLink();
    const qrWrap = document.createElement('div');
    qrWrap.className = 'upi-qr-wrap';
    const qrTarget = document.createElement('div');
    qrTarget.className = 'upi-qr-canvas';
    qrWrap.appendChild(qrTarget);
    upiQrContainer.appendChild(qrWrap);

    // eslint-disable-next-line no-new
    new QRCode(qrTarget, {
      text: upiLink,
      width: 220,
      height: 220,
      colorDark: '#071A3D',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H, // high error correction so the center logo doesn't break scanning
    });

    // Overlay the transparent app logo centered on top of the generated QR
    window.setTimeout(() => {
      const canvasOrImg = qrTarget.querySelector('canvas') || qrTarget.querySelector('img');
      if (!canvasOrImg) return;
      const logoWrap = document.createElement('div');
      logoWrap.className = 'upi-qr-logo';
      logoWrap.innerHTML = '<img src="assets/icons/icon-96.png" alt="">';
      qrWrap.appendChild(logoWrap);
    }, 50);

    upiQrContainer.dataset.upiLink = upiLink;
  }

  function handleCopyUpi() {
    const profile = Profile.get();
    const text = profile.upiId || '';
    if (!text) {
      Toast.error('No UPI ID set yet');
      return;
    }
    navigator.clipboard?.writeText(text).then(() => {
      Toast.success('UPI ID copied');
    }).catch(() => {
      Toast.error('Could not copy UPI ID');
    });
  }

  function handlePaymentConfirm() {
    const method = paymentConfirmBtn.dataset.method || 'cash';
    finalizeBill(method);
  }

  /**
   * Builds the full bill record combining cart, draft customer info, profile and payment method.
   * @param {string} paymentMethod
   * @returns {Object}
   */
  function buildBillRecord(paymentMethod) {
    const totals = Cart.computeTotals();
    const profile = Profile.get();
    const cartData = Cart.getExportData();

    return {
      id: Utils.generateId(),
      invoiceNumber: Receipt.nextInvoiceNumber(),
      createdAt: new Date().toISOString(),
      shopName: pendingBillDraft?.shopName || profile.shopName || '',
      shopContact: pendingBillDraft?.shopContact || profile.contactNumber || '',
      customerName: pendingBillDraft?.customerName || '',
      customerContact: pendingBillDraft?.customerContact || '',
      items: cartData.items,
      notes: cartData.notes,
      discountPercent: cartData.discountPercent,
      gstPercent: cartData.gstPercent,
      subtotal: totals.subtotal,
      discountAmount: totals.discountAmount,
      gstAmount: totals.gstAmount,
      grandTotal: totals.grandTotal,
      paymentMethod,
      upiId: paymentMethod === 'upi' ? (profile.upiId || '') : '',
      footerMessage: profile.footerMessage,
      currencySymbol: profile.currencySymbol || '₹',
    };
  }

  async function finalizeBill(paymentMethod) {
    const bill = buildBillRecord(paymentMethod);

    try {
      await BillNovaDB.saveBill(bill);
    } catch (err) {
      console.error('[Billing] Failed to save bill', err);
      Toast.error('Could not save bill, please try again.');
      return;
    }

    currentBill = bill;
    ModalManager.close('payment-modal');
    showSuccessScreen(bill);

    Cart.reset();
    pendingBillDraft = null;

    if (window.Recent && Recent.refresh) Recent.refresh();
  }

  function showSuccessScreen(bill) {
    const amountEl = document.getElementById('success-amount');
    const invoiceEl = document.getElementById('success-invoice');
    if (amountEl) amountEl.textContent = (bill.currencySymbol || '₹') + bill.grandTotal.toFixed(2);
    if (invoiceEl) invoiceEl.textContent = bill.invoiceNumber;

    successOverlay.hidden = false;
    // Force reflow to restart the tick animation reliably
    void successOverlay.offsetWidth;
    successOverlay.classList.add('show');

    wireSuccessActions(bill);
  }

  function wireSuccessActions(bill) {
    const printBtn = document.getElementById('action-print-btn');
    const whatsappBtn = document.getElementById('action-whatsapp-btn');
    const pdfBtn = document.getElementById('action-pdf-btn');

    printBtn.onclick = () => Receipt.printReceipt(bill);
    whatsappBtn.onclick = () => Receipt.shareOnWhatsApp(bill);
    pdfBtn.onclick = () => Receipt.saveAsPDF(bill);
  }

  function closeSuccessScreen() {
    successOverlay.classList.remove('show');
    window.setTimeout(() => {
      successOverlay.hidden = true;
    }, 320);
    Navigation.goToPage('home');
  }

  /**
   * Opens the success/actions screen for a bill re-opened from Recent Bills
   * (skips saving since it already exists).
   * @param {Object} bill
   */
  function openActionsForExistingBill(bill) {
    currentBill = bill;
    showSuccessScreen(bill);
    document.getElementById('success-title').textContent = 'Bill Ready';
    document.getElementById('success-subtitle').textContent = `Invoice ${bill.invoiceNumber}`;
  }

  return { init, openActionsForExistingBill, buildUpiLink };
})();

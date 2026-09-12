/* ==========================================================================
   BillNova India: Scan Button Quick Actions (long-press)
   Press-and-hold the center Scan button in the bottom nav to open a bottom
   sheet with shortcuts, without changing its normal single-tap behavior
   (which still navigates to the Billing screen via Navigation).
   ========================================================================== */

const QuickActions = (() => {
  const LONG_PRESS_MS = 500;

  let scanBtn = null;
  let backdropEl = null;
  let sheetEl = null;
  let pressTimer = null;
  let longPressTriggered = false;

  function init() {
    scanBtn = document.getElementById('nav-scan-btn');
    backdropEl = document.getElementById('quick-actions-backdrop');
    sheetEl = document.getElementById('quick-actions-sheet');

    // Pointer events cover mouse, touch, and pen in one listener set.
    scanBtn.addEventListener('pointerdown', onPressStart);
    scanBtn.addEventListener('pointerup', onPressEnd);
    scanBtn.addEventListener('pointerleave', cancelPress);
    scanBtn.addEventListener('pointercancel', cancelPress);

    // Suppress the normal click-to-navigate only when a long-press just fired.
    scanBtn.addEventListener('click', onClickCapture, true);

    backdropEl.addEventListener('click', (e) => {
      if (e.target === backdropEl) close();
    });

    sheetEl.querySelectorAll('.quick-action-item').forEach((item) => {
      item.addEventListener('click', () => handleAction(item.dataset.quickAction));
    });
  }

  function onPressStart() {
    longPressTriggered = false;
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      longPressTriggered = true;
      Utils.vibrate([20]);
      open();
    }, LONG_PRESS_MS);
    scanBtn.classList.add('holding');
  }

  function onPressEnd() {
    clearTimeout(pressTimer);
    scanBtn.classList.remove('holding');
  }

  function cancelPress() {
    clearTimeout(pressTimer);
    scanBtn.classList.remove('holding');
  }

  function onClickCapture(e) {
    if (longPressTriggered) {
      // The long-press already handled this interaction; don't also navigate.
      e.preventDefault();
      e.stopPropagation();
      longPressTriggered = false;
    }
  }

  function open() {
    refreshLabels();
    backdropEl.hidden = false;
    // Force reflow so the open transition plays instead of snapping instantly.
    void backdropEl.offsetWidth;
    backdropEl.classList.add('open');
  }

  function close() {
    backdropEl.classList.remove('open');
    setTimeout(() => {
      backdropEl.hidden = true;
    }, 160);
  }

  /**
   * Updates the "Switch to Barcode/QR" and "Turn Camera Off/On" labels to
   * reflect current Scanner state each time the sheet opens.
   */
  function refreshLabels() {
    const modeItem = sheetEl.querySelector('[data-quick-action="toggle-mode"]');
    const cameraItem = sheetEl.querySelector('[data-quick-action="toggle-camera"]');

    if (modeItem && window.Scanner) {
      const mode = Scanner.getMode();
      modeItem.querySelector('.quick-action-title').textContent =
        mode === 'qr' ? 'Switch to Barcode' : 'Switch to QR';
    }

    if (cameraItem && window.Scanner) {
      const on = Scanner.isCameraOn();
      cameraItem.querySelector('.quick-action-title').textContent =
        on ? 'Turn Camera Off' : 'Turn Camera On';
      cameraItem.querySelector('.quick-action-icon i').className =
        on ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    }
  }

  /**
   * Routes each quick action to the real button it mirrors, so the
   * underlying logic (mode switch, camera toggle, cart clear) lives in
   * exactly one place rather than being duplicated here.
   * @param {string} action
   */
  function handleAction(action) {
    close();

    // Navigate to the Billing screen first for actions that need the
    // scanner/cart visible, matching what a normal tap on Scan would do.
    if (window.Navigation) Navigation.goToPage('home');

    switch (action) {
      case 'toggle-mode': {
        const modeBtn = Scanner.getMode() === 'qr'
          ? document.getElementById('mode-barcode-btn')
          : document.getElementById('mode-qr-btn');
        modeBtn?.click();
        break;
      }
      case 'toggle-camera': {
        document.getElementById('camera-toggle-btn')?.click();
        break;
      }
      case 'manual-add': {
        document.getElementById('manual-add-fab')?.click();
        break;
      }
      case 'clear-cart': {
        document.getElementById('clear-cart-btn')?.click();
        break;
      }
      default:
        break;
    }
  }

  return { init };
})();

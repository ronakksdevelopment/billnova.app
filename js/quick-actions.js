/* ==========================================================================
   BillNova India: Scan Button Quick Actions (long-press)
   Press-and-hold the center Scan button in the bottom nav to open a bottom
   sheet with shortcuts, without changing its normal single-tap behavior
   (which still navigates to the Billing screen via Navigation).
   ========================================================================== */

const QuickActions = (() => {
  const LONG_PRESS_MS = 500;

  let scanBtn = null;
  let scanLabelEl = null;
  let backdropEl = null;
  let sheetEl = null;
  let pressTimer = null;
  let longPressTriggered = false;
  let defaultLabelText = 'Scan';

  function init() {
    scanBtn = document.getElementById('nav-scan-btn');
    scanLabelEl = document.querySelector('.nav-scan-label');
    backdropEl = document.getElementById('quick-actions-backdrop');
    sheetEl = document.getElementById('quick-actions-sheet');
    if (scanLabelEl) defaultLabelText = scanLabelEl.textContent;

    // Pointer events cover mouse, touch, and pen in one listener set. Needs
    // touch-action: none (set in CSS) on the button itself, or mobile
    // browsers intercept the gesture for scrolling/panning before our JS
    // ever sees pointerdown, which is what made long-press unreliable on
    // touch devices specifically.
    scanBtn.addEventListener('pointerdown', onPressStart);
    scanBtn.addEventListener('pointerup', onPressEnd);
    scanBtn.addEventListener('pointerleave', cancelPress);
    scanBtn.addEventListener('pointercancel', cancelPress);

    // Belt-and-braces for older/quirkier mobile browsers that don't fire
    // pointer events consistently for long-press: mirror the same
    // start/end logic on touch events directly. preventDefault on
    // touchstart stops the browser's own long-press context menu / text
    // selection from stealing the gesture.
    scanBtn.addEventListener('touchstart', (e) => { e.preventDefault(); onPressStart(); }, { passive: false });
    scanBtn.addEventListener('touchend', onPressEnd);
    scanBtn.addEventListener('touchcancel', cancelPress);

    // Block the native long-press context menu (e.g. "Open link", image
    // save sheet) from appearing over the scan button on mobile.
    scanBtn.addEventListener('contextmenu', (e) => e.preventDefault());

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
    setHoldingLabel();
  }

  function onPressEnd() {
    clearTimeout(pressTimer);
    scanBtn.classList.remove('holding');
    restoreDefaultLabel();
  }

  function cancelPress() {
    clearTimeout(pressTimer);
    scanBtn.classList.remove('holding');
    restoreDefaultLabel();
  }

  /**
   * While the button is being held (before the sheet opens), swap the
   * "Scan" label under the button for a live preview of what releasing
   * into the sheet's camera toggle would currently do — checked fresh off
   * Scanner.isCameraOn() every press, so it always matches the camera's
   * actual current state rather than a guess.
   */
  function setHoldingLabel() {
    if (!scanLabelEl) return;
    if (window.Scanner && Scanner.isPermissionRevoked && Scanner.isPermissionRevoked()) {
      scanLabelEl.textContent = 'Enable Camera';
      return;
    }
    scanLabelEl.textContent = 'Toggle Camera';
  }

  function restoreDefaultLabel() {
    if (!scanLabelEl) return;
    scanLabelEl.textContent = defaultLabelText;
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
    restoreDefaultLabel();
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
   * Updates the "Switch to Barcode/QR" label and the camera row's icon to
   * reflect current Scanner state each time the sheet opens. The camera
   * row's title stays a static "Toggle Camera" regardless of state — only
   * its icon (eye / eye-slash) reflects on/off.
   */
  function refreshLabels() {
    const modeItem = sheetEl.querySelector('[data-quick-action="toggle-mode"]');
    const cameraItem = sheetEl.querySelector('[data-quick-action="toggle-camera"]');
    const reenableItem = document.getElementById('quick-action-reenable-camera');

    if (modeItem && window.Scanner) {
      const mode = Scanner.getMode();
      modeItem.querySelector('.quick-action-title').textContent =
        mode === 'qr' ? 'Switch to Barcode' : 'Switch to QR';
    }

    if (cameraItem && window.Scanner) {
      const on = Scanner.isCameraOn();
      cameraItem.querySelector('.quick-action-icon i').className =
        on ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
    }

    // "Re-enable Camera Access" only surfaces once permission has actually
    // been revoked mid-session (see Scanner.isPermissionRevoked). Hiding it
    // otherwise keeps the sheet from being cluttered with an action that
    // wouldn't do anything different from the normal camera toggle.
    if (reenableItem && window.Scanner) {
      const revoked = Scanner.isPermissionRevoked();
      reenableItem.hidden = !revoked;
      if (cameraItem) cameraItem.hidden = revoked;
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
      case 'reenable-camera': {
        if (window.Scanner) Scanner.requestPermissionAndRestart();
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

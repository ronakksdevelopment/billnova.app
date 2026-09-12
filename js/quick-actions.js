/* ==========================================================================
   BillNova India: Scan Button (tap-to-switch + long-press quick actions)
   Owns 100% of the interaction on the center Scan button:
     - Short tap  -> Navigation.goToPage('home')   (normal nav behavior)
     - Hold 1s    -> opens the quick actions bottom sheet
   Everything lives in ONE pointer-event based state machine. Earlier builds
   split this across Navigation's own click listener AND this module's
   listeners on the same button, which raced against each other (whichever
   fired first won) and made the button unreliable, especially when
   navigating in from Recent/Profile. Now Navigation has no listener on this
   button at all - this is the single source of truth.
   ========================================================================== */

const QuickActions = (() => {
  const LONG_PRESS_MS = 1000; // press-and-hold duration required to open quick actions
  const MOVE_CANCEL_PX = 12; // finger/mouse drift beyond this cancels the press (avoids accidental triggers while scrolling)

  let scanBtn = null;
  let scanLabelEl = null;
  let backdropEl = null;
  let sheetEl = null;
  let pressTimer = null;
  let longPressTriggered = false;
  let pressActive = false;
  let startX = 0;
  let startY = 0;
  let defaultLabelText = 'Scan';

  function init() {
    scanBtn = document.getElementById('nav-scan-btn');
    scanLabelEl = document.querySelector('.nav-scan-label');
    backdropEl = document.getElementById('quick-actions-backdrop');
    sheetEl = document.getElementById('quick-actions-sheet');
    if (!scanBtn || !backdropEl || !sheetEl) return;
    if (scanLabelEl) defaultLabelText = scanLabelEl.textContent;

    // Pointer events alone cover mouse, touch, and pen consistently in a
    // single listener set. Mixing pointer AND touch listeners on the same
    // element (as before) caused each gesture to be handled twice on real
    // touchscreens, which is a common source of "sometimes works, sometimes
    // doesn't" bugs. touch-action: none in CSS keeps the browser from
    // hijacking the gesture for scrolling before pointerdown fires.
    scanBtn.addEventListener('pointerdown', onPressStart);
    scanBtn.addEventListener('pointermove', onPressMove);
    scanBtn.addEventListener('pointerup', onPressEnd);
    scanBtn.addEventListener('pointerleave', onPressCancel);
    scanBtn.addEventListener('pointercancel', onPressCancel);

    // Block the native long-press context menu (e.g. "Open link", image
    // save sheet) from appearing over the scan button on mobile.
    scanBtn.addEventListener('contextmenu', (e) => e.preventDefault());

    backdropEl.addEventListener('click', (e) => {
      if (e.target === backdropEl) close();
    });

    sheetEl.querySelectorAll('.quick-action-item').forEach((item) => {
      item.addEventListener('click', () => handleAction(item.dataset.quickAction));
    });
  }

  function onPressStart(e) {
    // Only respond to the primary button/touch/pen contact.
    if (e.button !== undefined && e.button !== 0) return;

    pressActive = true;
    longPressTriggered = false;
    startX = e.clientX;
    startY = e.clientY;

    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      if (!pressActive) return;
      longPressTriggered = true;
      pressActive = false;
      Utils.vibrate([20]);
      scanBtn.classList.remove('holding');
      restoreDefaultLabel();
      open();
    }, LONG_PRESS_MS);

    scanBtn.classList.add('holding');
    setHoldingLabel();
  }

  function onPressMove(e) {
    if (!pressActive) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_PX) {
      onPressCancel();
    }
  }

  function onPressEnd() {
    const wasLongPress = longPressTriggered;
    clearTimeout(pressTimer);
    pressActive = false;
    scanBtn.classList.remove('holding');
    restoreDefaultLabel();

    // A short tap (press ended before the long-press timer fired) switches
    // to the Billing screen, same as any other bottom-nav item. If the
    // long-press already opened the sheet, the release shouldn't also
    // navigate.
    if (!wasLongPress) {
      Navigation.goToPage('home');
    }
    longPressTriggered = false;
  }

  function onPressCancel() {
    clearTimeout(pressTimer);
    pressActive = false;
    longPressTriggered = false;
    scanBtn.classList.remove('holding');
    restoreDefaultLabel();
  }

  /**
   * While the button is being held (before the sheet opens), swap the
   * "Scan" label under the button for a live hint that a menu is coming,
   * so the interaction reads as "keep holding" rather than looking broken.
   */
  function setHoldingLabel() {
    if (!scanLabelEl) return;
    scanLabelEl.textContent = 'Hold for Menu';
  }

  function restoreDefaultLabel() {
    if (!scanLabelEl) return;
    scanLabelEl.textContent = defaultLabelText;
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
   * Updates action labels/icons to reflect current Scanner state each time
   * the sheet opens: the "Switch to Barcode/QR" label, the camera row's
   * icon (eye / eye-slash), the flashlight row's icon/label, and whether
   * "Re-enable Camera Access" needs to replace the normal camera toggle.
   */
  function refreshLabels() {
    const modeItem = sheetEl.querySelector('[data-quick-action="toggle-mode"]');
    const cameraItem = sheetEl.querySelector('[data-quick-action="toggle-camera"]');
    const flashItem = sheetEl.querySelector('[data-quick-action="toggle-flashlight"]');
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

    if (flashItem && window.Scanner) {
      const camOn = Scanner.isCameraOn && Scanner.isCameraOn();
      const torchOn = Scanner.isTorchOn && Scanner.isTorchOn();
      flashItem.querySelector('.quick-action-icon i').className =
        torchOn ? 'fa-solid fa-bolt' : 'fa-solid fa-bolt-lightning';
      flashItem.querySelector('.quick-action-title').textContent =
        torchOn ? 'Turn Off Flashlight' : 'Turn On Flashlight';
      // Flashlight needs the camera actively running to do anything useful.
      flashItem.classList.toggle('quick-action-item--disabled', !camOn);
    }

    // "Re-enable Camera Access" only surfaces once permission has actually
    // been revoked mid-session (see Scanner.isPermissionRevoked). Hiding it
    // otherwise keeps the sheet from being cluttered with an action that
    // wouldn't do anything different from the normal camera toggle.
    if (reenableItem && window.Scanner) {
      const revoked = Scanner.isPermissionRevoked();
      reenableItem.hidden = !revoked;
      if (cameraItem) cameraItem.hidden = revoked;
      if (flashItem) flashItem.hidden = revoked;
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
    const wasOnHome = document.getElementById('page-home')?.classList.contains('active');
    Navigation.goToPage('home');

    // Navigating home may trigger Scanner.resume(), which is async and
    // sets an internal isStarting/isStopping guard. Actions that click a
    // scanner control (toggle-camera, toggle-mode, toggle-flashlight) must
    // wait for that to settle first, or the click silently no-ops while the
    // guard is up - this was why the quick-action camera toggle appeared
    // "broken" when triggered from the Profile/Recent screens.
    const scannerActions = ['toggle-camera', 'toggle-mode', 'toggle-flashlight'];
    const runAction = () => runQuickAction(action);
    if (!wasOnHome && scannerActions.includes(action)) {
      waitForScannerIdle(runAction);
    } else {
      runAction();
    }
  }

  /**
   * Polls until the scanner is no longer mid start/stop (or times out),
   * then runs the callback. Keeps quick actions reliable right after a
   * page switch triggers Scanner.resume() in the background.
   * @param {Function} cb
   */
  function waitForScannerIdle(cb) {
    const deadline = Date.now() + 2000;
    const check = () => {
      const busy = window.Scanner && Scanner.isBusy && Scanner.isBusy();
      if (!busy || Date.now() > deadline) {
        cb();
      } else {
        setTimeout(check, 50);
      }
    };
    setTimeout(check, 50);
  }

  function runQuickAction(action) {
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
      case 'toggle-flashlight': {
        if (window.Scanner && Scanner.isCameraOn && !Scanner.isCameraOn()) break;
        document.getElementById('flashlight-btn')?.click();
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

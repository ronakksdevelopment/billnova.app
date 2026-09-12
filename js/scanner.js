/* ==========================================================================
   BillNova India: Live Scanner
   Opens instantly when the Billing screen loads, no start button and no
   loading screens. Rear/front camera switch, flashlight, manual on/off
   toggle, QR + Barcode modes with an adaptive scan frame, and a
   duplicate-scan guard.
   ========================================================================== */

const Scanner = (() => {
  const READER_ELEMENT_ID = 'scanner-reader';
  const DUPLICATE_COOLDOWN_MS = 2000; // prevents rapid re-scans of the same code

  let html5QrCode = null;
  let currentCameraId = null;
  let availableCameras = [];
  let currentCameraIndex = 0;
  let isRunning = false;
  let isStarting = false;
  let isTorchOn = false;
  let isManuallyDisabled = false; // true when the user turned the camera off via the eye button
  let currentMode = 'qr'; // 'qr' | 'barcode'
  let lastScannedCode = null;
  let lastScannedAt = 0;
  let onScanSuccessCallback = null;

  // Elements
  let viewportEl, placeholderEl, topbarEl, overlayEl, flashlightBtn, cameraSwitchBtn, cameraToggleBtn;
  let modeQrBtn, modeBarcodeBtn, successFlashEl, scanFrameEl, placeholderTextEl, placeholderIconEl, modeToggleEl;

  const QR_CONFIG = {
    fps: 12,
    qrbox: { width: 230, height: 230 },
    aspectRatio: 1.0,
    formatsToSupport: window.Html5QrcodeSupportedFormats
      ? [window.Html5QrcodeSupportedFormats.QR_CODE]
      : undefined,
  };

  const BARCODE_CONFIG = {
    fps: 12,
    qrbox: { width: 260, height: 160 },
    aspectRatio: 1.5,
    formatsToSupport: window.Html5QrcodeSupportedFormats
      ? [
          window.Html5QrcodeSupportedFormats.EAN_13,
          window.Html5QrcodeSupportedFormats.EAN_8,
          window.Html5QrcodeSupportedFormats.UPC_A,
          window.Html5QrcodeSupportedFormats.UPC_E,
          window.Html5QrcodeSupportedFormats.CODE_128,
          window.Html5QrcodeSupportedFormats.CODE_39,
          window.Html5QrcodeSupportedFormats.CODABAR,
          window.Html5QrcodeSupportedFormats.ITF,
        ]
      : undefined,
  };

  function cacheElements() {
    viewportEl = document.getElementById('scanner-viewport');
    placeholderEl = document.getElementById('scanner-placeholder');
    placeholderIconEl = placeholderEl.querySelector('i');
    placeholderTextEl = placeholderEl.querySelector('p');
    topbarEl = document.getElementById('scanner-topbar');
    modeToggleEl = document.querySelector('.scanner-mode-toggle');
    overlayEl = document.getElementById('scanner-overlay');
    flashlightBtn = document.getElementById('flashlight-btn');
    cameraSwitchBtn = document.getElementById('camera-switch-btn');
    cameraToggleBtn = document.getElementById('camera-toggle-btn');
    modeQrBtn = document.getElementById('mode-qr-btn');
    modeBarcodeBtn = document.getElementById('mode-barcode-btn');
    successFlashEl = document.getElementById('scan-success-flash');
    scanFrameEl = document.getElementById('scan-frame');
  }

  /**
   * Initializes event listeners and starts the camera immediately.
   * Call once on app start while the Billing screen is the active screen.
   * @param {Function} onScanSuccess - callback(code: string)
   */
  function init(onScanSuccess) {
    cacheElements();
    onScanSuccessCallback = onScanSuccess;

    flashlightBtn.addEventListener('click', toggleFlashlight);
    cameraSwitchBtn.addEventListener('click', switchCamera);
    cameraToggleBtn.addEventListener('click', toggleCameraEnabled);
    modeQrBtn.addEventListener('click', () => switchMode('qr'));
    modeBarcodeBtn.addEventListener('click', () => switchMode('barcode'));

    html5QrCode = new Html5Qrcode(READER_ELEMENT_ID, /* verbose= */ false);

    // Start the live camera immediately, no user action required.
    start();
  }

  /**
   * Requests camera access and starts scanning using the current mode.
   * Runs silently in the background with no loading overlay so the
   * scanner feels instant as soon as the Billing screen is shown.
   */
  async function start() {
    if (isRunning || isStarting) return;
    isStarting = true;
    try {
      availableCameras = await Html5Qrcode.getCameras();

      if (!availableCameras || availableCameras.length === 0) {
        Toast.error('No camera found on this device.');
        showPlaceholder();
        return;
      }

      // Prefer rear/back camera first
      currentCameraIndex = availableCameras.findIndex((cam) =>
        /back|rear|environment/i.test(cam.label)
      );
      if (currentCameraIndex === -1) currentCameraIndex = 0;
      currentCameraId = availableCameras[currentCameraIndex].id;

      await startCameraStream(currentCameraId);

      hidePlaceholder();
      cameraSwitchBtn.hidden = availableCameras.length < 2;
      isRunning = true;
    } catch (err) {
      console.error('[Scanner] Failed to start camera', err);
      Toast.error('Camera permission denied or unavailable.');
      showPlaceholder();
    } finally {
      isStarting = false;
    }
  }

  function showPlaceholder(reason) {
    placeholderEl.hidden = false;
    overlayEl.hidden = true;

    // Keep the topbar itself visible so the eye button always stays
    // reachable, but hide the mode toggle / flashlight / camera-switch
    // controls since they don't apply while the camera is off.
    topbarEl.hidden = false;
    if (modeToggleEl) modeToggleEl.hidden = true;
    if (flashlightBtn) flashlightBtn.hidden = true;
    if (cameraSwitchBtn) cameraSwitchBtn.hidden = true;

    if (reason === 'off') {
      if (placeholderIconEl) placeholderIconEl.className = 'fa-solid fa-eye-slash';
      if (placeholderTextEl) placeholderTextEl.textContent = 'Camera is turned off. Tap the eye icon to scan again.';
    } else {
      if (placeholderIconEl) placeholderIconEl.className = 'fa-solid fa-camera';
      if (placeholderTextEl) placeholderTextEl.textContent = 'Camera access is needed to scan products. Please allow camera permission and reload the app.';
    }
  }

  function hidePlaceholder() {
    placeholderEl.hidden = true;
    topbarEl.hidden = false;
    overlayEl.hidden = false;
    if (modeToggleEl) modeToggleEl.hidden = false;
    if (flashlightBtn) flashlightBtn.hidden = false;
    // camera-switch stays governed by availableCameras.length, restored in start()/switchCamera()
    if (cameraSwitchBtn) cameraSwitchBtn.hidden = availableCameras.length < 2;
  }

  function setCameraToggleUI(enabled) {
    if (!cameraToggleBtn) return;
    const icon = cameraToggleBtn.querySelector('i');
    cameraToggleBtn.setAttribute('aria-pressed', String(enabled));
    cameraToggleBtn.setAttribute('aria-label', enabled ? 'Turn camera off' : 'Turn camera on');
    cameraToggleBtn.title = enabled ? 'Turn camera off' : 'Turn camera on';
    cameraToggleBtn.classList.toggle('off', !enabled);
    if (icon) icon.className = enabled ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
  }

  /**
   * Manually turns the live camera off or back on via the eye button in the
   * scanner topbar. Independent of the navigation-driven stop()/resume():
   * once the user turns the camera off, it stays off even if they leave and
   * return to the Billing screen, until they tap the eye icon again.
   */
  async function toggleCameraEnabled() {
    if (isManuallyDisabled) {
      isManuallyDisabled = false;
      setCameraToggleUI(true);
      try {
        await resume();
      } catch (e) {
        console.error('[Scanner] Resume after toggle failed', e);
      }
    } else {
      // Flip UI + state immediately so the button always responds right
      // away, even if the underlying stream teardown is slow or rejects.
      isManuallyDisabled = true;
      setCameraToggleUI(false);
      showPlaceholder('off');
      isRunning = false;
      try {
        await stopCameraStream();
      } catch (e) {
        console.error('[Scanner] Stop after toggle failed', e);
      }
    }
  }

  /**
   * Starts the html5-qrcode camera stream with the given camera id and current mode config.
   * @param {string} cameraId
   */
  async function startCameraStream(cameraId) {
    const config = currentMode === 'qr' ? QR_CONFIG : BARCODE_CONFIG;
    await html5QrCode.start(
      cameraId,
      config,
      handleDecodedText,
      () => { /* per-frame decode failure is normal & silent */ }
    );
  }

  /**
   * Stops the current camera stream (used before switching camera/mode, or
   * when navigating away from the Billing screen).
   */
  async function stopCameraStream() {
    if (!html5QrCode) return;
    try {
      const state = typeof html5QrCode.getState === 'function' ? html5QrCode.getState() : null;
      // Only call stop() if the library thinks it's actually scanning/paused;
      // calling it from an unexpected state is what causes silent rejections.
      if (state === null || state === 2 /* SCANNING */ || state === 3 /* PAUSED */) {
        await html5QrCode.stop();
      }
    } catch (e) {
      // Already stopped or in a state that can't be stopped; ignore.
    }
  }

  /**
   * Handles a successfully decoded QR/barcode string, guarding against duplicate rapid scans.
   * @param {string} decodedText
   */
  function handleDecodedText(decodedText) {
    const now = Date.now();
    if (decodedText === lastScannedCode && (now - lastScannedAt) < DUPLICATE_COOLDOWN_MS) {
      return; // duplicate rapid scan, ignore
    }
    lastScannedCode = decodedText;
    lastScannedAt = now;

    // Feedback: vibration + beep + green flash
    Utils.vibrate([60, 40, 60]);
    Utils.playBeep();
    flashSuccess();

    if (typeof onScanSuccessCallback === 'function') {
      onScanSuccessCallback(decodedText);
    }
  }

  function flashSuccess() {
    successFlashEl.classList.remove('flash');
    // Force reflow to restart animation
    void successFlashEl.offsetWidth;
    successFlashEl.classList.add('flash');
  }

  /**
   * Switches between front and rear cameras instantly, with no loading
   * overlay or artificial delay.
   */
  async function switchCamera() {
    if (availableCameras.length < 2) return;
    currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
    currentCameraId = availableCameras[currentCameraIndex].id;

    isTorchOn = false;
    flashlightBtn.classList.remove('on');
    await stopCameraStream();
    try {
      await startCameraStream(currentCameraId);
    } catch (e) {
      console.error('[Scanner] Camera switch failed', e);
      Toast.error('Could not switch camera.');
    }
  }

  /**
   * Toggles the device flashlight/torch if supported by the active camera.
   */
  async function toggleFlashlight() {
    if (!html5QrCode || !isRunning) return;
    try {
      isTorchOn = !isTorchOn;
      await html5QrCode.applyVideoConstraints({
        advanced: [{ torch: isTorchOn }],
      });
      flashlightBtn.classList.toggle('on', isTorchOn);
    } catch (e) {
      isTorchOn = false;
      Toast.error('Flashlight not supported on this camera.');
    }
  }

  /**
   * Switches scan mode between QR and Barcode, restarting the stream with
   * the new format config and updating the scan frame proportions:
   * a square frame for QR codes, a wider rectangular frame for barcodes.
   * @param {'qr'|'barcode'} mode
   */
  async function switchMode(mode) {
    if (mode === currentMode) return;
    currentMode = mode;

    modeQrBtn.classList.toggle('active', mode === 'qr');
    modeQrBtn.setAttribute('aria-selected', String(mode === 'qr'));
    modeBarcodeBtn.classList.toggle('active', mode === 'barcode');
    modeBarcodeBtn.setAttribute('aria-selected', String(mode === 'barcode'));

    updateScanFrame(mode);

    if (isRunning) {
      await stopCameraStream();
      try {
        await startCameraStream(currentCameraId);
      } catch (e) {
        console.error('[Scanner] Mode switch failed', e);
      }
    }
  }

  /**
   * Updates the scan frame's shape to match the active mode: a square
   * frame for QR codes, a wider rectangular frame for barcodes.
   * @param {'qr'|'barcode'} mode
   */
  function updateScanFrame(mode) {
    if (!scanFrameEl) return;
    scanFrameEl.classList.toggle('mode-qr', mode === 'qr');
    scanFrameEl.classList.toggle('mode-barcode', mode === 'barcode');

    // Slide direction: QR -> Barcode enters from the left,
    // Barcode -> QR enters from the right.
    scanFrameEl.classList.remove('slide-from-left', 'slide-from-right');
    void scanFrameEl.offsetWidth; // restart animation
    scanFrameEl.classList.add(mode === 'barcode' ? 'slide-from-left' : 'slide-from-right');
  }

  /**
   * Stops the scanner entirely. Called when the user navigates away from
   * the Billing screen, and resumed via resume() when they come back.
   */
  async function stop() {
    await stopCameraStream();
    isRunning = false;
  }

  /**
   * Resumes the scanner after it was stopped by navigating away from the
   * Billing screen. Starts instantly, no loading screen. Does nothing if
   * the user manually turned the camera off via the eye button — that
   * choice persists across navigation until they turn it back on.
   */
  async function resume() {
    if (isManuallyDisabled) return;
    if (isRunning || isStarting) return;
    if (!currentCameraId) {
      await start();
      return;
    }
    isStarting = true;
    try {
      await startCameraStream(currentCameraId);
      hidePlaceholder();
      isRunning = true;
    } catch (err) {
      console.error('[Scanner] Failed to resume camera', err);
      showPlaceholder();
    } finally {
      isStarting = false;
    }
  }

  return { init, start, stop, resume };
})();

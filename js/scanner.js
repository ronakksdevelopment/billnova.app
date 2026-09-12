/* ==========================================================================
   BillNova India — Live Scanner
   Rear/front camera switch, flashlight, QR + Barcode modes, duplicate guard
   ========================================================================== */

const Scanner = (() => {
  const READER_ELEMENT_ID = 'scanner-reader';
  const DUPLICATE_COOLDOWN_MS = 2000; // prevents rapid re-scans of the same code

  let html5QrCode = null;
  let currentCameraId = null;
  let availableCameras = [];
  let currentCameraIndex = 0;
  let isRunning = false;
  let isTorchOn = false;
  let currentMode = 'qr'; // 'qr' | 'barcode'
  let lastScannedCode = null;
  let lastScannedAt = 0;
  let onScanSuccessCallback = null;

  // Elements
  let viewportEl, placeholderEl, topbarEl, overlayEl, startBtn, flashlightBtn, cameraSwitchBtn;
  let modeQrBtn, modeBarcodeBtn, successFlashEl;

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
    topbarEl = document.getElementById('scanner-topbar');
    overlayEl = document.getElementById('scanner-overlay');
    startBtn = document.getElementById('start-scanner-btn');
    flashlightBtn = document.getElementById('flashlight-btn');
    cameraSwitchBtn = document.getElementById('camera-switch-btn');
    modeQrBtn = document.getElementById('mode-qr-btn');
    modeBarcodeBtn = document.getElementById('mode-barcode-btn');
    successFlashEl = document.getElementById('scan-success-flash');
  }

  /**
   * Initializes event listeners. Call once on app start.
   * @param {Function} onScanSuccess - callback(code: string)
   */
  function init(onScanSuccess) {
    cacheElements();
    onScanSuccessCallback = onScanSuccess;

    startBtn.addEventListener('click', start);
    flashlightBtn.addEventListener('click', toggleFlashlight);
    cameraSwitchBtn.addEventListener('click', switchCamera);
    modeQrBtn.addEventListener('click', () => switchMode('qr'));
    modeBarcodeBtn.addEventListener('click', () => switchMode('barcode'));

    html5QrCode = new Html5Qrcode(READER_ELEMENT_ID, /* verbose= */ false);
  }

  /**
   * Requests camera access and starts scanning using the current mode.
   */
  async function start() {
    try {
      Loading.show('Starting camera…');
      availableCameras = await Html5Qrcode.getCameras();

      if (!availableCameras || availableCameras.length === 0) {
        Loading.hide();
        Toast.error('No camera found on this device.');
        return;
      }

      // Prefer rear/back camera first
      currentCameraIndex = availableCameras.findIndex((cam) =>
        /back|rear|environment/i.test(cam.label)
      );
      if (currentCameraIndex === -1) currentCameraIndex = 0;
      currentCameraId = availableCameras[currentCameraIndex].id;

      await startCameraStream(currentCameraId);

      placeholderEl.hidden = true;
      topbarEl.hidden = false;
      overlayEl.hidden = false;
      cameraSwitchBtn.hidden = availableCameras.length < 2;
      isRunning = true;
      Loading.hide();
    } catch (err) {
      Loading.hide();
      console.error('[Scanner] Failed to start camera', err);
      Toast.error('Camera permission denied or unavailable.');
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
   * Stops the current camera stream (used before switching camera/mode).
   */
  async function stopCameraStream() {
    if (html5QrCode && isRunning) {
      try {
        await html5QrCode.stop();
      } catch (e) {
        // Already stopped; ignore
      }
    }
  }

  /**
   * Handles a successfully decoded QR/barcode string, guarding against duplicate rapid scans.
   * @param {string} decodedText
   */
  function handleDecodedText(decodedText) {
    const now = Date.now();
    if (decodedText === lastScannedCode && (now - lastScannedAt) < DUPLICATE_COOLDOWN_MS) {
      return; // duplicate rapid scan — ignore
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
   * Switches between front and rear cameras.
   */
  async function switchCamera() {
    if (availableCameras.length < 2) return;
    currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
    currentCameraId = availableCameras[currentCameraIndex].id;

    Loading.show('Switching camera…');
    await stopCameraStream();
    isTorchOn = false;
    flashlightBtn.classList.remove('on');
    try {
      await startCameraStream(currentCameraId);
    } catch (e) {
      console.error('[Scanner] Camera switch failed', e);
      Toast.error('Could not switch camera.');
    }
    Loading.hide();
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
   * Switches scan mode between QR and Barcode, restarting the stream with new format config.
   * @param {'qr'|'barcode'} mode
   */
  async function switchMode(mode) {
    if (mode === currentMode) return;
    currentMode = mode;

    modeQrBtn.classList.toggle('active', mode === 'qr');
    modeQrBtn.setAttribute('aria-selected', String(mode === 'qr'));
    modeBarcodeBtn.classList.toggle('active', mode === 'barcode');
    modeBarcodeBtn.setAttribute('aria-selected', String(mode === 'barcode'));

    if (isRunning) {
      Loading.show('Switching mode…');
      await stopCameraStream();
      try {
        await startCameraStream(currentCameraId);
      } catch (e) {
        console.error('[Scanner] Mode switch failed', e);
      }
      Loading.hide();
    }
  }

  /**
   * Stops the scanner entirely (e.g., when navigating away). Reserved for future page changes.
   */
  async function stop() {
    await stopCameraStream();
    isRunning = false;
  }

  return { init, start, stop };
})();

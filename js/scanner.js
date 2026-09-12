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
  let isStopping = false;
  let isTorchOn = false;
  let isManuallyDisabled = false; // true when the user turned the camera off via the eye button
  let pausedTrack = null; // the video track disabled by the eye button, kept alive to avoid re-prompting for permission
  let currentMode = 'qr'; // 'qr' | 'barcode'
  let lastScannedCode = null;
  let lastScannedAt = 0;
  let onScanSuccessCallback = null;

  // Elements
  let placeholderEl, topbarEl, overlayEl, flashlightBtn, cameraSwitchBtn, cameraToggleBtn;
  let modeQrBtn, modeBarcodeBtn, modeToggleEl, successFlashEl, scanFrameEl;
  let placeholderTextEl, placeholderIconEl;

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

    // Set the initial frame color/shape before the camera even starts.
    updateScanFrame(currentMode, /* animate= */ false);

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
        showPlaceholder('unavailable');
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
      showPlaceholder('unavailable');
    } finally {
      isStarting = false;
    }
  }

  /**
   * Shows the placeholder state. The eye/toggle button in the topbar always
   * stays visible and clickable here; only the mode toggle, flashlight, and
   * camera-switch controls hide, since they don't apply while there's no
   * live stream.
   * @param {'off'|'unavailable'} reason
   */
  function showPlaceholder(reason) {
    placeholderEl.hidden = false;
    overlayEl.hidden = true;
    topbarEl.hidden = false;
    if (modeToggleEl) modeToggleEl.hidden = true;
    if (flashlightBtn) flashlightBtn.hidden = true;
    if (cameraSwitchBtn) cameraSwitchBtn.hidden = true;

    if (reason === 'off') {
      placeholderIconEl.className = 'fa-solid fa-eye-slash';
      placeholderTextEl.textContent = 'Camera is turned off. Tap the eye icon to scan again.';
    } else {
      placeholderIconEl.className = 'fa-solid fa-camera';
      placeholderTextEl.textContent = 'Camera access is needed to scan products. Please allow camera permission and reload the app.';
    }
  }

  function hidePlaceholder() {
    placeholderEl.hidden = true;
    topbarEl.hidden = false;
    overlayEl.hidden = false;
    if (modeToggleEl) modeToggleEl.hidden = false;
    if (flashlightBtn) flashlightBtn.hidden = false;
    // camera-switch stays governed by availableCameras.length
    if (cameraSwitchBtn) cameraSwitchBtn.hidden = availableCameras.length < 2;
  }

  function setCameraToggleUI(enabled) {
    const icon = cameraToggleBtn.querySelector('i');
    cameraToggleBtn.setAttribute('aria-pressed', String(enabled));
    cameraToggleBtn.setAttribute('aria-label', enabled ? 'Turn camera off' : 'Turn camera on');
    cameraToggleBtn.title = enabled ? 'Turn camera off' : 'Turn camera on';
    cameraToggleBtn.classList.toggle('off', !enabled);
    icon.className = enabled ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
  }

  /**
   * Manually turns the live camera off or back on via the eye button in the
   * scanner topbar (or the quick-actions sheet). Independent of the
   * navigation-driven stop()/resume(): once the user turns the camera off,
   * it stays off even if they leave and return to the Billing screen, until
   * they tap the eye icon again.
   *
   * Turning off pauses the video track rather than fully stopping the
   * stream/calling html5QrCode.stop(). Fully stopping releases the camera
   * device, and starting a fresh getUserMedia() afterwards can make the
   * browser re-prompt for camera permission even though it was already
   * granted. Pausing just disables the track, so the same permission grant
   * and stream stay alive and turning back on is instant with no reprompt.
   */
  async function toggleCameraEnabled() {
    if (isStopping || isStarting) return;

    if (isManuallyDisabled) {
      isManuallyDisabled = false;
      setCameraToggleUI(true);
      if (pausedTrack) {
        pausedTrack.enabled = true;
        pausedTrack = null;
        hidePlaceholder();
        isRunning = true;
      } else {
        // No track was paused (e.g. camera never started yet); fall back
        // to a normal resume, which will request the stream if needed.
        await resume();
      }
    } else {
      isManuallyDisabled = true;
      setCameraToggleUI(false);
      const track = getActiveVideoTrack();
      if (track) {
        track.enabled = false;
        pausedTrack = track;
        isRunning = false;
        showPlaceholder('off');
      } else {
        // No live track to pause; fall back to a full stop.
        isStopping = true;
        try {
          await stopCameraStream();
          isRunning = false;
          showPlaceholder('off');
        } catch (e) {
          console.error('[Scanner] Stop after toggle failed', e);
        } finally {
          isStopping = false;
        }
      }
    }
  }

  /**
   * Returns the currently active camera video track, if any, so it can be
   * enabled/disabled directly without tearing down the whole stream.
   * @returns {MediaStreamTrack|null}
   */
  function getActiveVideoTrack() {
    try {
      const videoEl = document.querySelector('#scanner-reader video');
      const stream = videoEl && videoEl.srcObject;
      if (!stream || typeof stream.getVideoTracks !== 'function') return null;
      const tracks = stream.getVideoTracks();
      return tracks && tracks.length ? tracks[0] : null;
    } catch (e) {
      return null;
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
   * Stops the current camera stream and clears the library's rendered DOM
   * (video/canvas elements) from the reader container. Skipping the clear()
   * call is what left stale elements behind and caused the visual glitch on
   * re-toggle; every stop now leaves the container clean for the next start.
   */
  async function stopCameraStream() {
    if (!html5QrCode) return;
    try {
      const state = typeof html5QrCode.getState === 'function' ? html5QrCode.getState() : null;
      if (state === null || state === 2 /* SCANNING */ || state === 3 /* PAUSED */) {
        await html5QrCode.stop();
      }
    } catch (e) {
      // Already stopped or in a state that can't be stopped; ignore.
    }
    try {
      html5QrCode.clear();
    } catch (e) {
      // Nothing rendered yet; ignore.
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
    if (availableCameras.length < 2 || isStarting || isStopping) return;
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
   * the new format config and updating the scan frame proportions/color.
   * @param {'qr'|'barcode'} mode
   */
  async function switchMode(mode) {
    if (mode === currentMode || isStarting || isStopping) return;
    currentMode = mode;

    modeQrBtn.classList.toggle('active', mode === 'qr');
    modeQrBtn.setAttribute('aria-selected', String(mode === 'qr'));
    modeBarcodeBtn.classList.toggle('active', mode === 'barcode');
    modeBarcodeBtn.setAttribute('aria-selected', String(mode === 'barcode'));

    updateScanFrame(mode, /* animate= */ true);

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
   * Updates the scan frame's shape and color to match the active mode
   * (square teal frame for QR, wide amber frame for Barcode), and — unless
   * this is the initial setup — slides the frame in from the direction
   * matching the switch: QR -> Barcode enters from the left, Barcode -> QR
   * enters from the right. The frame border itself is a permanent, static
   * outline (not a one-off flash); only its position animates on switch.
   * @param {'qr'|'barcode'} mode
   * @param {boolean} animate
   */
  function updateScanFrame(mode, animate) {
    if (!scanFrameEl) return;
    scanFrameEl.classList.toggle('mode-qr', mode === 'qr');
    scanFrameEl.classList.toggle('mode-barcode', mode === 'barcode');

    if (!animate) return;

    scanFrameEl.classList.remove('slide-from-left', 'slide-from-right');
    void scanFrameEl.offsetWidth; // restart animation
    scanFrameEl.classList.add(mode === 'barcode' ? 'slide-from-left' : 'slide-from-right');
  }

  /**
   * Stops the scanner entirely. Called when the user navigates away from
   * the Billing screen, and resumed via resume() when they come back.
   * Always fully releases the camera device (unlike the eye-button toggle,
   * which only pauses the track), since leaving the screen should free the
   * hardware regardless of the manual on/off state.
   */
  async function stop() {
    await stopCameraStream();
    isRunning = false;
    pausedTrack = null;
  }

  /**
   * Resumes the scanner after it was stopped by navigating away from the
   * Billing screen, or by the eye button. Starts instantly, no loading
   * screen. Does nothing if the user manually turned the camera off via
   * the eye button — that choice persists across navigation until they
   * turn it back on.
   */
  async function resume() {
    if (isManuallyDisabled) return;
    if (isRunning || isStarting) return;
    isStarting = true;
    try {
      if (!currentCameraId) {
        isStarting = false;
        await start();
        return;
      }
      await startCameraStream(currentCameraId);
      hidePlaceholder();
      isRunning = true;
    } catch (err) {
      console.error('[Scanner] Failed to resume camera', err);
      showPlaceholder('unavailable');
    } finally {
      isStarting = false;
    }
  }

  /**
   * Current scan mode, exposed so other UI (e.g. the scan button's
   * long-press quick actions) can label itself correctly without
   * duplicating scanner state.
   * @returns {'qr'|'barcode'}
   */
  function getMode() {
    return currentMode;
  }

  /**
   * Whether the live camera stream is currently running (not manually
   * turned off via the eye button and not in an error/no-camera state).
   * @returns {boolean}
   */
  function isCameraOn() {
    return isRunning;
  }

  return { init, start, stop, resume, getMode, isCameraOn };
})();

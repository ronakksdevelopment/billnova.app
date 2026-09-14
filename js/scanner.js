/* ==========================================================================
   Rasiddoo v1.0: Live Scanner
   Opens instantly when the Billing screen loads, no start button and no
   loading screens. Rear/front camera switch, flashlight, manual on/off
   toggle, QR + Barcode modes with an adaptive scan frame, and a
   duplicate-scan guard.
   ========================================================================== */

const Scanner = (() => {
  const READER_ELEMENT_ID = 'scanner-reader';
  // Minimum time that must pass between any two *accepted* scans (even of
  // different codes), so a jittery/duplicate frame decode can't double-fire.
  const SCAN_COOLDOWN_MS = 1000;
  // How many consecutive failed-decode frames count as "the code has left
  // the camera view". Once we hit this, the same code can be scanned again;
  // until then it's treated as still sitting under the camera and ignored,
  // instead of being silently re-added every couple of seconds. Set high
  // enough (~0.6s at 12fps) to ride out brief autofocus/motion-blur blips
  // without falsely thinking the barcode was removed.
  const FRAMES_TO_CONSIDER_CODE_GONE = 8;

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
  let lastScanAt = 0;
  let framesMissedSinceMatch = 0; // consecutive failed decodes since the last accepted scan
  let scanningPaused = false; // true while a modal is open awaiting user input (e.g. New Product)
  let onScanSuccessCallback = null;
  let permissionRevoked = false; // true when the OS/browser pulled camera access away mid-session
  let permissionStatusHandle = null; // navigator.permissions PermissionStatus, kept for its change listener
  let watchdogTimer = null; // periodic fallback check for browsers without the Permissions API

  // Elements
  let placeholderEl, topbarEl, overlayEl, flashlightBtn, cameraSwitchBtn, cameraToggleBtn;
  let modeQrBtn, modeBarcodeBtn, modeToggleEl, successFlashEl, scanFrameEl;
  let placeholderTextEl, placeholderIconEl, placeholderRetryBtn;

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
    placeholderRetryBtn = document.getElementById('scanner-placeholder-retry');
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
    if (placeholderRetryBtn) {
      placeholderRetryBtn.addEventListener('click', requestPermissionAndRestart);
    }

    html5QrCode = new Html5Qrcode(READER_ELEMENT_ID, /* verbose= */ false);

    // Set the initial frame color/shape before the camera even starts.
    updateScanFrame(currentMode, /* animate= */ false);

    watchPermissionChanges();
    watchTabVisibility();

    // Start the live camera immediately, no user action required.
    start();
  }

  /**
   * Watches the browser's camera PermissionStatus (where supported) so that
   * if the user (or the OS) revokes camera access *while the app is open* —
   * e.g. from the browser's site-settings panel — we notice immediately
   * instead of leaving a frozen/black video element on screen. Falls back
   * to a lightweight polling watchdog on browsers without the Permissions
   * API or without camera as a queryable name (older Safari/iOS).
   */
  function watchPermissionChanges() {
    if (!navigator.permissions || !navigator.permissions.query) {
      startRevocationWatchdog();
      return;
    }
    navigator.permissions
      .query({ name: 'camera' })
      .then((status) => {
        permissionStatusHandle = status;
        status.addEventListener('change', handlePermissionStatusChange);
      })
      .catch(() => {
        // 'camera' isn't a recognized permission name on this browser;
        // fall back to the polling watchdog instead.
        startRevocationWatchdog();
      });
  }

  function handlePermissionStatusChange() {
    if (!permissionStatusHandle) return;
    if (permissionStatusHandle.state === 'denied') {
      handlePermissionRevoked();
    } else if (permissionStatusHandle.state === 'granted' && permissionRevoked) {
      // Permission was re-granted from outside the app (e.g. the user
      // flipped it back on in browser settings); recover automatically.
      permissionRevoked = false;
      resume();
    }
  }

  /**
   * Fallback for browsers that can't report permission changes via events:
   * periodically checks whether the live video track died unexpectedly
   * (readyState 'ended' with the camera never intentionally turned off).
   */
  function startRevocationWatchdog() {
    clearInterval(watchdogTimer);
    watchdogTimer = setInterval(() => {
      if (!isRunning || isManuallyDisabled) return;
      const track = getActiveVideoTrack();
      if (!track || track.readyState === 'ended') {
        handlePermissionRevoked();
      }
    }, 3000);
  }

  /**
   * Also catches the common real-world case: the user backgrounds the app
   * (switches apps, locks the phone) and revokes the camera permission from
   * system settings while away, then comes back. A plain resume() would
   * otherwise just hang since the old stream is dead.
   */
  function watchTabVisibility() {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (isManuallyDisabled) return;
      const track = getActiveVideoTrack();
      if (isRunning && (!track || track.readyState === 'ended')) {
        handlePermissionRevoked();
      }
    });
  }

  /**
   * Central handler for "camera access disappeared out from under us".
   * Tears down the dead stream and shows a placeholder with a clear retry
   * action, rather than leaving a black/frozen video box on screen.
   */
  async function handlePermissionRevoked() {
    if (permissionRevoked) return;
    permissionRevoked = true;
    isRunning = false;
    pausedTrack = null;
    await stopCameraStream();
    showPlaceholder('revoked');
    Toast.error('Camera permission was turned off. Tap "Enable Camera" to reconnect.');
  }

  /**
   * Explicitly re-requests camera permission via a fresh getUserMedia call
   * (this is what actually re-triggers the browser's permission prompt if
   * it's in a re-promptable state, or recovers the stream immediately if
   * the OS-level permission was simply re-granted) and restarts the
   * scanner. Exposed for the placeholder's "Enable Camera" button and for
   * the bottom-nav long-press quick action.
   */
  async function requestPermissionAndRestart() {
    if (isStarting) return;
    isStarting = true;
    try {
      // Force a fresh permission check/prompt, independent of any stale
      // camera id or stream we were holding onto before.
      const probeStream = await navigator.mediaDevices.getUserMedia({ video: true });
      probeStream.getTracks().forEach((track) => track.stop());

      permissionRevoked = false;
      isManuallyDisabled = false;
      isStarting = false;

      availableCameras = await Html5Qrcode.getCameras();
      if (!availableCameras || availableCameras.length === 0) {
        showPlaceholder('unavailable');
        return;
      }
      if (currentCameraIndex >= availableCameras.length) currentCameraIndex = 0;
      currentCameraId = availableCameras[currentCameraIndex].id;

      await stopCameraStream();
      await start();
      Toast.success('Camera reconnected.');
    } catch (err) {
      console.error('[Scanner] Permission re-request failed', err);
      isStarting = false;
      showPlaceholder('revoked');
      Toast.error('Camera permission is still blocked. Allow it from your browser/site settings.');
    }
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
      permissionRevoked = false;
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
      if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        permissionRevoked = true;
        Toast.error('Camera permission denied.');
        showPlaceholder('revoked');
      } else {
        Toast.error('Camera unavailable on this device.');
        showPlaceholder('unavailable');
      }
    } finally {
      isStarting = false;
    }
  }

  /**
   * Shows the placeholder state. The eye/toggle button in the topbar always
   * stays visible and clickable here; only the mode toggle, flashlight, and
   * camera-switch controls hide, since they don't apply while there's no
   * live stream.
   * @param {'off'|'unavailable'|'revoked'} reason
   */
  function showPlaceholder(reason) {
    placeholderEl.hidden = false;
    placeholderEl.dataset.reason = reason;
    overlayEl.hidden = true;
    topbarEl.hidden = false;
    if (modeToggleEl) modeToggleEl.hidden = true;
    if (flashlightBtn) flashlightBtn.hidden = true;
    if (cameraSwitchBtn) cameraSwitchBtn.hidden = true;

    if (reason === 'off') {
      placeholderIconEl.className = 'fa-solid fa-eye-slash';
      placeholderTextEl.textContent = 'Camera is turned off. Tap the eye icon to scan again.';
      if (placeholderRetryBtn) placeholderRetryBtn.hidden = true;
    } else if (reason === 'revoked') {
      placeholderIconEl.className = 'fa-solid fa-camera-slash';
      placeholderTextEl.textContent = 'Camera permission was revoked. Tap below to reconnect.';
      if (placeholderRetryBtn) placeholderRetryBtn.hidden = false;
    } else {
      placeholderIconEl.className = 'fa-solid fa-camera';
      placeholderTextEl.textContent = 'Camera access is needed to scan products. Allow camera permission to continue.';
      if (placeholderRetryBtn) placeholderRetryBtn.hidden = false;
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
      handleDecodeFailure
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
   * Normalizes a decoded barcode value so the SAME physical barcode always
   * maps to the same stored product code, regardless of which symbology the
   * decoder happened to guess on a given read.
   *
   * The concrete real-world case: with both UPC_A and EAN_13 formats
   * enabled (needed since Indian retail packaging uses both), the exact
   * same barcode can decode as an 12-digit UPC-A on one scan and as its
   * 13-digit EAN-13 equivalent (UPC-A prefixed with "0") on the next. Left
   * unnormalized, the app treats these as two different products, so a
   * product that's already in the list gets prompted as "new" again a scan
   * or two later. EAN-13 is the canonical/wider form, so every UPC-A read
   * is upgraded to it before it's used as a lookup/storage key.
   * @param {string} text
   * @returns {string}
   */
  function normalizeCode(text) {
    const trimmed = (text || '').trim();
    if (/^\d{12}$/.test(trimmed)) {
      return '0' + trimmed; // UPC-A -> equivalent EAN-13
    }
    return trimmed;
  }

  /**
   * Handles a successfully decoded QR/barcode string.
   *
   * Guards against three distinct sources of duplicate/incorrect adds:
   *  1. `scanningPaused` - a modal (e.g. "New Product") is open awaiting the
   *     user's input, so every decode is ignored until it closes. Without
   *     this, a code still sitting under the camera kept re-triggering the
   *     same "unknown code" flow while the user was mid-typing.
   *  2. Same-code guard - once a code is accepted, it's ignored on every
   *     subsequent frame until it's been out of view for
   *     FRAMES_TO_CONSIDER_CODE_GONE consecutive frames (tracked via
   *     handleDecodeFailure). This stops a barcode held steady under the
   *     camera from being silently re-added every couple of seconds.
   *  3. SCAN_COOLDOWN_MS - a flat minimum gap between any two *different*
   *     accepted scans, so quick flicker/misreads can't double-fire.
   * @param {string} decodedText
   */
  function handleDecodedText(decodedText) {
    if (scanningPaused) return;

    // Only barcodes (not QR text) are subject to the UPC-A/EAN-13 mixup;
    // leave arbitrary QR payloads exactly as decoded.
    const code = currentMode === 'barcode' ? normalizeCode(decodedText) : decodedText.trim();

    framesMissedSinceMatch = 0;

    if (code === lastScannedCode) {
      // Still the same code sitting in frame - wait for it to leave view.
      return;
    }

    const now = Date.now();
    if (now - lastScanAt < SCAN_COOLDOWN_MS) {
      return;
    }

    lastScannedCode = code;
    lastScanAt = now;

    // Feedback: vibration + beep + green flash
    Utils.vibrate([60, 40, 60]);
    Utils.playBeep();
    flashSuccess();

    if (typeof onScanSuccessCallback === 'function') {
      onScanSuccessCallback(code);
    }
  }

  /**
   * Called on every camera frame that does NOT decode to a code. Used purely
   * to detect when a previously-scanned code has left the camera's view, so
   * it can be scanned again next time it's presented.
   */
  function handleDecodeFailure() {
    if (!lastScannedCode) return;
    framesMissedSinceMatch += 1;
    if (framesMissedSinceMatch >= FRAMES_TO_CONSIDER_CODE_GONE) {
      lastScannedCode = null;
      framesMissedSinceMatch = 0;
    }
  }

  /**
   * Pauses all scan detection without touching the camera stream itself.
   * Call this whenever a modal opens that needs the user's undivided
   * attention (e.g. the "New Product" name/price form), so a code still
   * sitting under the camera can't keep re-triggering while they're typing.
   */
  function pauseDetection() {
    scanningPaused = true;
  }

  /**
   * Resumes scan detection and clears the last-scanned guard, so whatever
   * is under the camera right now (even if it's the same code as before)
   * is treated as a fresh, intentional scan rather than being blocked by a
   * stale cooldown from before the pause.
   */
  function resumeDetection() {
    scanningPaused = false;
    lastScannedCode = null;
    lastScanAt = 0;
    framesMissedSinceMatch = 0;
  }

  function flashSuccess() {
    successFlashEl.classList.remove('flash');
    // Force reflow to restart animation
    void successFlashEl.offsetWidth;
    successFlashEl.classList.add('flash');
  }

  /**
   * Switches between front and rear cameras instantly, with no loading
   * overlay or artificial delay. Sets the same isStarting/isStopping guards
   * as start()/resume()/switchMode() and reflects a failed switch in
   * isRunning + a placeholder, instead of leaving a black frozen preview
   * with isRunning still (incorrectly) true.
   */
  async function switchCamera() {
    if (availableCameras.length < 2 || isStarting || isStopping) return;
    currentCameraIndex = (currentCameraIndex + 1) % availableCameras.length;
    currentCameraId = availableCameras[currentCameraIndex].id;

    isTorchOn = false;
    flashlightBtn.classList.remove('on');

    isStopping = true;
    await stopCameraStream();
    isRunning = false;
    isStopping = false;

    isStarting = true;
    try {
      await startCameraStream(currentCameraId);
      isRunning = true;
      hidePlaceholder();
    } catch (err) {
      console.error('[Scanner] Camera switch failed', err);
      if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        permissionRevoked = true;
        showPlaceholder('revoked');
        Toast.error('Camera permission was lost while switching cameras. Tap "Enable Camera" to reconnect.');
      } else {
        showPlaceholder('unavailable');
        Toast.error('Could not switch camera. Tap below to retry.');
      }
    } finally {
      isStarting = false;
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
   *
   * Sets the same isStarting/isStopping guards as start()/resume() while the
   * restart is in flight, and — critically — actually reflects failure in
   * isRunning/permissionRevoked and shows a placeholder instead of silently
   * logging it. Previously a failed restart here left isRunning stuck at its
   * old value with no guard set, so the preview went black with no way to
   * recover except leaving and re-entering the Billing screen, and
   * permission failures never flipped permissionRevoked, so the "Re-enable
   * Camera Access" quick action never appeared even though the camera was
   * genuinely dead.
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

    if (!isRunning) return;

    isStopping = true;
    await stopCameraStream();
    isRunning = false;
    isStopping = false;

    isStarting = true;
    try {
      await startCameraStream(currentCameraId);
      isRunning = true;
      hidePlaceholder();
    } catch (err) {
      console.error('[Scanner] Mode switch failed', err);
      if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        permissionRevoked = true;
        showPlaceholder('revoked');
        Toast.error('Camera permission was lost while switching modes. Tap "Enable Camera" to reconnect.');
      } else {
        showPlaceholder('unavailable');
        Toast.error('Could not switch scan mode. Tap below to retry.');
      }
    } finally {
      isStarting = false;
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
   * Fully tears down permission watchers. Not currently called (the app has
   * a single long-lived Scanner instance for its whole lifetime) but kept
   * available in case a future embeddable/teardown use case needs it.
   */
  function destroyWatchers() {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
    if (permissionStatusHandle) {
      permissionStatusHandle.removeEventListener('change', handlePermissionStatusChange);
      permissionStatusHandle = null;
    }
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
    if (permissionRevoked) {
      // Don't silently retry a dead stream; the user needs to explicitly
      // re-grant access via the placeholder's "Enable Camera" button.
      showPlaceholder('revoked');
      return;
    }
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
      if (err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        permissionRevoked = true;
        showPlaceholder('revoked');
      } else {
        showPlaceholder('unavailable');
      }
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

  /**
   * Whether the camera stream died because permission was revoked
   * mid-session (as opposed to the user manually turning it off, or it
   * simply never having started). Used by other UI (quick actions) to
   * decide whether to show a "re-enable" style action.
   * @returns {boolean}
   */
  function isPermissionRevoked() {
    return permissionRevoked;
  }

  /**
   * Whether the scanner is currently mid start/stop/switch. Other UI
   * (quick actions) should wait for this to clear before clicking a
   * scanner control, since toggleCameraEnabled()/switchMode() silently
   * no-op while a start/stop is already in flight.
   * @returns {boolean}
   */
  function isBusy() {
    return isStarting || isStopping;
  }

  function isTorchEnabled() {
    return isTorchOn;
  }

  return {
    init,
    start,
    stop,
    resume,
    getMode,
    isCameraOn,
    isTorchOn: isTorchEnabled,
    isBusy,
    isPermissionRevoked,
    requestPermissionAndRestart,
    pauseDetection,
    resumeDetection,
  };
})();

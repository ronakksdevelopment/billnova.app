/* ==========================================================================
   BillNova India: First-Run Permissions Screen
   Custom UI over the browser's native permission prompts. Camera access is
   requested via getUserMedia (immediately released after grant, since the
   Scanner module opens its own stream when the Billing screen loads).
   Storage uses the Storage API's persist() where available. Notifications
   use the standard Notification permission request. Shown once; the choice
   (or skip) is remembered via localStorage so it never reappears.
   ========================================================================== */

const Permissions = (() => {
  const STORAGE_KEY = 'billnova_permissions_seen';

  let overlayEl = null;
  let continueBtn = null;
  let skipBtn = null;
  let rows = {};

  function hasBeenShown() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch (e) {
      return true; // fail safe: don't block app boot if storage is unavailable
    }
  }

  function markShown() {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch (e) {
      console.warn('[Permissions] Failed to save permissions-seen flag', e);
    }
  }

  function init() {
    overlayEl = document.getElementById('permissions-overlay');
    continueBtn = document.getElementById('permissions-continue-btn');
    skipBtn = document.getElementById('permissions-skip-btn');

    document.querySelectorAll('.permission-row').forEach((row) => {
      const key = row.dataset.permission;
      const btn = row.querySelector('.permission-row-btn');
      rows[key] = row;
      btn.addEventListener('click', () => requestPermission(key));
    });

    continueBtn.addEventListener('click', finish);
    skipBtn.addEventListener('click', finish);
  }

  function show() {
    if (!overlayEl) return;
    overlayEl.hidden = false;
  }

  function finish() {
    markShown();
    if (overlayEl) overlayEl.hidden = true;
  }

  function setRowState(key, state) {
    const row = rows[key];
    if (!row) return;
    row.classList.remove('granted', 'denied');
    if (state === 'granted') row.classList.add('granted');
    if (state === 'denied') row.classList.add('denied');
  }

  /**
   * Requests the given permission using the appropriate real browser API,
   * then reflects the result in the custom row UI.
   * @param {'camera'|'storage'|'notifications'} key
   */
  async function requestPermission(key) {
    if (key === 'camera') {
      await requestCamera();
    } else if (key === 'storage') {
      await requestStorage();
    } else if (key === 'notifications') {
      await requestNotifications();
    }
  }

  async function requestCamera() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setRowState('camera', 'denied');
      Toast.error('Camera is not supported on this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      // Immediately stop the tracks; this was only to trigger and confirm
      // the permission prompt. The Scanner module opens its own stream
      // when the Billing screen actually loads.
      stream.getTracks().forEach((track) => track.stop());
      setRowState('camera', 'granted');
    } catch (e) {
      setRowState('camera', 'denied');
      Toast.error('Camera permission was not granted.');
    }
  }

  async function requestStorage() {
    try {
      if (navigator.storage && navigator.storage.persist) {
        const granted = await navigator.storage.persist();
        setRowState('storage', granted ? 'granted' : 'denied');
      } else {
        // Storage API not supported; IndexedDB will still work without
        // persistence guarantees, so treat as granted rather than blocking.
        setRowState('storage', 'granted');
      }
    } catch (e) {
      setRowState('storage', 'denied');
    }
  }

  async function requestNotifications() {
    if (!('Notification' in window)) {
      setRowState('notifications', 'denied');
      return;
    }
    try {
      const result = await Notification.requestPermission();
      setRowState('notifications', result === 'granted' ? 'granted' : 'denied');
    } catch (e) {
      setRowState('notifications', 'denied');
    }
  }

  return { init, show, hasBeenShown };
})();

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

    reflectCurrentStates();
  }

  /**
   * On open, reflects whatever the browser already knows (without
   * triggering a new prompt) so a returning user doesn't see every row as
   * un-granted when they in fact already allowed it previously.
   */
  function reflectCurrentStates() {
    if ('Notification' in window && Notification.permission !== 'default') {
      setRowState('notifications', Notification.permission === 'granted' ? 'granted' : 'denied');
    }
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'camera' }).then((status) => {
        if (status.state !== 'prompt') {
          setRowState('camera', status.state === 'granted' ? 'granted' : 'denied');
        }
      }).catch(() => { /* 'camera' not queryable on this browser; ignore */ });
    }
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

  /**
   * Requests the Notification permission. Two things made the original
   * version unreliable:
   *  1. Notification.requestPermission() only returns a Promise in modern
   *     browsers — older Safari/WebViews only support the legacy
   *     callback-style call, so `await`-ing it directly there resolved to
   *     undefined and the row never updated at all.
   *  2. If the user had already denied notifications previously (in a
   *     past session, or at the OS level), re-calling requestPermission()
   *     silently resolves back to 'denied' with no explanation — it looks
   *     exactly like the button "isn't working" even though the browser is
   *     behaving correctly; the choice can only be changed from the
   *     browser's own site settings once truly denied.
   */
  async function requestNotifications() {
    if (!('Notification' in window)) {
      setRowState('notifications', 'denied');
      Toast.error('Notifications are not supported on this browser.');
      return;
    }

    // Already permanently denied at the browser level — requesting again
    // will just silently re-resolve to 'denied'. Tell the user why instead
    // of letting the button appear to do nothing.
    if (Notification.permission === 'denied') {
      setRowState('notifications', 'denied');
      Toast.error('Notifications are blocked. Enable them from your browser\'s site settings.');
      return;
    }

    if (Notification.permission === 'granted') {
      setRowState('notifications', 'granted');
      return;
    }

    try {
      const result = await requestNotificationPermissionCompat();
      setRowState('notifications', result === 'granted' ? 'granted' : 'denied');
      if (result === 'denied') {
        Toast.error('Notification permission was not granted.');
      }
    } catch (e) {
      console.error('[Permissions] Notification request failed', e);
      setRowState('notifications', 'denied');
      Toast.error('Could not request notification permission.');
    }
  }

  /**
   * Wraps Notification.requestPermission() to work across both the modern
   * Promise-based signature and the legacy callback-based one.
   * @returns {Promise<'granted'|'denied'|'default'>}
   */
  function requestNotificationPermissionCompat() {
    return new Promise((resolve, reject) => {
      try {
        const maybePromise = Notification.requestPermission((result) => resolve(result));
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(resolve, reject);
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  return { init, show, hasBeenShown };
})();

/* ==========================================================================
   BillNova India: Loading Overlay Helper
   ========================================================================== */

const Loading = (() => {
  let overlayEl = null;
  let textEl = null;
  let visibleCount = 0;

  function init() {
    overlayEl = document.getElementById('loading-overlay');
    textEl = document.getElementById('loading-overlay-text');
  }

  /**
   * Shows the full-screen loading overlay with an optional message.
   * @param {string} message
   */
  function show(message = 'Loading…') {
    if (!overlayEl) init();
    if (textEl) textEl.textContent = message;
    if (overlayEl) overlayEl.hidden = false;
    visibleCount += 1;
  }

  /**
   * Hides the loading overlay.
   */
  function hide() {
    visibleCount = Math.max(0, visibleCount - 1);
    if (visibleCount === 0 && overlayEl) overlayEl.hidden = true;
  }

  return { init, show, hide };
})();

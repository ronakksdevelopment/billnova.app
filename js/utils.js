/* ==========================================================================
   BillNova India: Shared Utilities
   ========================================================================== */

const Utils = (() => {

  /**
   * Formats a number as Indian Rupee currency string, e.g. 1234.5 -> "₹1,234.50"
   * @param {number} amount
   * @returns {string}
   */
  function formatCurrency(amount) {
    const num = Number(amount) || 0;
    return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /**
   * Generates a reasonably unique id (timestamp + random suffix).
   * @returns {string}
   */
  function generateId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Debounces a function call.
   * @param {Function} fn
   * @param {number} delay
   * @returns {Function}
   */
  function debounce(fn, delay = 250) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  /**
   * Triggers a short device vibration if supported (used on successful scan).
   * @param {number|number[]} pattern
   */
  function vibrate(pattern = 80) {
    if ('vibrate' in navigator) {
      try { navigator.vibrate(pattern); } catch (e) { /* no-op */ }
    }
  }

  /**
   * Plays a short beep sound using the Web Audio API (no external audio file needed).
   */
  function playBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(1046.5, ctx.currentTime); // C6
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.18);
      oscillator.onended = () => ctx.close();
    } catch (e) {
      console.warn('[Utils] Beep playback failed', e);
    }
  }

  /**
   * Escapes HTML special characters to prevent injection when inserting user text.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  /**
   * Clamps a number between min and max.
   */
  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  return {
    formatCurrency,
    generateId,
    debounce,
    vibrate,
    playBeep,
    escapeHtml,
    clamp,
  };
})();

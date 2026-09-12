/* ==========================================================================
   BillNova India: Shared Utilities
   ========================================================================== */

const Utils = (() => {

  /**
   * Formats a number as Indian Rupee currency string, e.g. 1234.5 -> "₹1,234.50"
   * @param {number} amount
   * @returns {string}
   */
  function formatCurrency(amount, symbol) {
    const num = Number(amount) || 0;
    const currency = symbol || '₹';
    return currency + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
   * Plays a short, loud beep using the Web Audio API (no external audio
   * file needed), tuned to sound like a real handheld barcode scanner:
   * a single flat square-wave tone at ~2.7kHz (the classic laser-scanner
   * pitch) with a near-instant attack and a hard cutoff, rather than a
   * soft synth "ding". Square wave (vs. sine) is what gives it that
   * harsher, more piercing "beep" character instead of a musical note.
   */
  function playBeep() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const duration = 0.09; // real scanner beeps are short and clipped, not a ringing tone
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(2730, ctx.currentTime); // classic laser-scanner beep pitch
      // Near-instant attack to full volume (loud), then a flat hold and a
      // hard (not exponential) cutoff — that's what makes it read as a
      // sharp electronic "beep" rather than a soft fading tone.
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 0.005);
      gain.gain.setValueAtTime(0.9, ctx.currentTime + duration - 0.015);
      gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + duration);
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

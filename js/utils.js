/* ==========================================================================
   Rasiddoo v1.0: Shared Utilities
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

  /**
   * Reads an image file, downscales it to fit within maxDim x maxDim
   * (preserving aspect ratio) and re-encodes it as a compressed JPEG data
   * URL. Keeps product photos small enough to live comfortably in
   * IndexedDB/localStorage instead of storing huge original camera photos.
   * @param {File} file
   * @param {number} maxDim - max width/height in pixels
   * @param {number} quality - JPEG quality 0-1
   * @returns {Promise<string>} data URL
   */
  function resizeImageFile(file, maxDim = 480, quality = 0.75) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error('File read failed'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Invalid image'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) {
              height = Math.round(height * (maxDim / width));
              width = maxDim;
            } else {
              width = Math.round(width * (maxDim / height));
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  return {
    formatCurrency,
    generateId,
    debounce,
    vibrate,
    playBeep,
    escapeHtml,
    clamp,
    resizeImageFile,
  };
})();

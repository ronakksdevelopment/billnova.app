/* ==========================================================================
   BillNova India: Modal Manager
   Generic open/close + a Promise-based confirm dialog helper
   ========================================================================== */

const ModalManager = (() => {

  let activeModal = null;
  let lastFocusedElement = null;

  /**
   * Opens a modal by its element id, trapping focus for accessibility.
   * @param {string} modalId
   */
  function open(modalId) {
    const modalEl = document.getElementById(modalId);
    if (!modalEl) return;

    lastFocusedElement = document.activeElement;
    activeModal = modalEl;

    modalEl.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Focus the first focusable element inside for accessibility
    const focusable = modalEl.querySelector('input, button, select, textarea');
    if (focusable) setTimeout(() => focusable.focus(), 260);

    // Escape key closes modal
    document.addEventListener('keydown', handleEscape);
  }

  /**
   * Closes a modal by its element id.
   * @param {string} modalId
   */
  function close(modalId) {
    const modalEl = document.getElementById(modalId);
    if (!modalEl) return;

    modalEl.classList.remove('open');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', handleEscape);

    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
    if (activeModal === modalEl) activeModal = null;
  }

  function handleEscape(e) {
    if (e.key === 'Escape' && activeModal) {
      close(activeModal.id);
    }
  }

  /**
   * Shows a confirm dialog and resolves true/false based on user choice.
   * @param {{title: string, text: string, confirmLabel?: string}} options
   * @returns {Promise<boolean>}
   */
  function confirm(options) {
    return new Promise((resolve) => {
      const titleEl = document.getElementById('confirm-title');
      const textEl = document.getElementById('confirm-text');
      const okBtn = document.getElementById('confirm-ok-btn');
      const cancelBtn = document.getElementById('confirm-cancel-btn');

      titleEl.textContent = options.title || 'Are you sure?';
      textEl.textContent = options.text || 'This action cannot be undone.';
      okBtn.textContent = options.confirmLabel || 'Confirm';

      const cleanup = () => {
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        close('confirm-modal');
      };

      const onOk = () => { cleanup(); resolve(true); };
      const onCancel = () => { cleanup(); resolve(false); };

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);

      open('confirm-modal');
    });
  }

  // Close modal when tapping the backdrop itself (not the modal content)
  document.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('modal-backdrop') && e.target.classList.contains('open')) {
      close(e.target.id);
    }
  });

  return { open, close, confirm };
})();

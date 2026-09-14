/* ==========================================================================
   Rasiddoo v1.0: Toast Notification System
   ========================================================================== */

const Toast = (() => {
  let container = null;

  function init() {
    container = document.getElementById('toast-container');
  }

  /**
   * Shows a toast message.
   * @param {string} message
   * @param {'success'|'error'|'info'} type
   * @param {number} duration ms before auto-dismiss
   */
  function show(message, type = 'info', duration = 2800) {
    if (!container) init();
    if (!container) return;

    const icons = {
      success: 'fa-circle-check',
      error: 'fa-circle-exclamation',
      info: 'fa-circle-info',
    };

    const toastEl = document.createElement('div');
    toastEl.className = `toast toast-${type}`;
    toastEl.setAttribute('role', 'status');
    toastEl.innerHTML = `<i class="fa-solid ${icons[type] || icons.info}" aria-hidden="true"></i><span>${Utils.escapeHtml(message)}</span>`;

    container.appendChild(toastEl);

    const removeToast = () => {
      toastEl.classList.add('hide');
      setTimeout(() => toastEl.remove(), 260);
    };

    const timer = setTimeout(removeToast, duration);

    toastEl.addEventListener('click', () => {
      clearTimeout(timer);
      removeToast();
    });
  }

  function success(message) { show(message, 'success'); }
  function error(message) { show(message, 'error'); }
  function info(message) { show(message, 'info'); }

  return { init, show, success, error, info };
})();

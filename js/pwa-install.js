/* ==========================================================================
   Rasiddoo v1.0: PWA Install Button Handling
   Drives a single small download/install icon button in the header, shown
   only when the browser reports the app is installable.
   ========================================================================== */

const PwaInstall = (() => {
  let deferredPrompt = null;
  let installBtn = null;

  function init() {
    installBtn = document.getElementById('header-install-btn');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      showButton();
    });

    window.addEventListener('appinstalled', () => {
      hideButton();
      deferredPrompt = null;
      Toast.success('Rasiddoo installed successfully!');
    });

    installBtn?.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        hideButton();
      }
      deferredPrompt = null;
    });
  }

  function showButton() {
    if (installBtn) installBtn.hidden = false;
  }

  function hideButton() {
    if (installBtn) installBtn.hidden = true;
  }

  return { init };
})();

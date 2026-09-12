/* ==========================================================================
   BillNova India — PWA Install Banner Handling
   ========================================================================== */

const PwaInstall = (() => {
  const DISMISS_KEY = 'billnova_install_dismissed';
  let deferredPrompt = null;
  let bannerEl = null;

  function init() {
    bannerEl = document.getElementById('install-banner');
    const installBtn = document.getElementById('install-banner-btn');
    const closeBtn = document.getElementById('install-banner-close');

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      if (!wasDismissed()) showBanner();
    });

    window.addEventListener('appinstalled', () => {
      hideBanner();
      Toast.success('BillNova India installed successfully!');
    });

    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        hideBanner();
      }
      deferredPrompt = null;
    });

    closeBtn.addEventListener('click', () => {
      localStorage.setItem(DISMISS_KEY, 'true');
      hideBanner();
    });
  }

  function wasDismissed() {
    return localStorage.getItem(DISMISS_KEY) === 'true';
  }

  function showBanner() {
    if (bannerEl) bannerEl.classList.add('show');
  }

  function hideBanner() {
    if (bannerEl) bannerEl.classList.remove('show');
  }

  return { init };
})();

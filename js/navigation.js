/* ==========================================================================
   BillNova India: Navigation
   Handles bottom nav tab switching: Recent | Scan (Billing, default) | Profile
   Keeps the live scanner active while on the Billing screen, and pauses it
   the moment the user leaves so the camera never runs in the background.
   ========================================================================== */

const Navigation = (() => {
  const pageTitles = {
    home: 'Billing',
    recent: 'Recent Bills',
    profile: 'Profile',
  };

  let currentPage = 'home';

  function init() {
    document.getElementById('nav-recent').addEventListener('click', () => goToPage('recent'));
    document.getElementById('nav-profile').addEventListener('click', () => goToPage('profile'));
    document.getElementById('nav-scan-btn').addEventListener('click', () => goToPage('home'));
  }

  /**
   * Switches the active page and updates the bottom nav + header title.
   * Starts or stops the live scanner so it only ever runs on the Billing screen.
   * @param {'home'|'recent'|'profile'} pageName
   */
  function goToPage(pageName) {
    if (pageName === currentPage) return;
    const leavingHome = currentPage === 'home' && pageName !== 'home';
    const enteringHome = pageName === 'home' && currentPage !== 'home';
    currentPage = pageName;

    document.querySelectorAll('.page').forEach((el) => el.classList.remove('active'));
    document.getElementById(`page-${pageName}`)?.classList.add('active');

    document.querySelectorAll('.nav-item').forEach((el) => {
      const isMatch = el.dataset.page === pageName;
      el.classList.toggle('active', isMatch);
      if (isMatch) {
        el.setAttribute('aria-current', 'page');
      } else {
        el.removeAttribute('aria-current');
      }
    });

    const scanBtn = document.getElementById('nav-scan-btn');
    if (scanBtn) {
      const isMatch = pageName === 'home';
      scanBtn.classList.toggle('active', isMatch);
      if (isMatch) {
        scanBtn.setAttribute('aria-current', 'page');
      } else {
        scanBtn.removeAttribute('aria-current');
      }
    }

    const titleEl = document.getElementById('header-page-title');
    if (titleEl) titleEl.textContent = pageTitles[pageName] || 'BillNova';

    window.scrollTo({ top: 0, behavior: 'instant' });

    // Keep the camera running only while the Billing screen is visible.
    if (leavingHome && window.Scanner) Scanner.stop();
    if (enteringHome && window.Scanner) Scanner.resume();
  }

  return { init, goToPage };
})();

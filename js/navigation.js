/* ==========================================================================
   BillNova India — Navigation
   Handles bottom nav tab switching: Home | Recent | (Scan FAB) | Profile
   ========================================================================== */

const Navigation = (() => {
  const pageTitles = {
    home: 'Billing',
    recent: 'Recent Bills',
    profile: 'Profile',
  };

  function init() {
    document.getElementById('nav-home').addEventListener('click', () => goToPage('home'));
    document.getElementById('nav-recent').addEventListener('click', () => goToPage('recent'));
    document.getElementById('nav-profile').addEventListener('click', () => goToPage('profile'));

    // Center Scan button: ensures Home is active and scrolls/starts the scanner
    document.getElementById('nav-scan-btn').addEventListener('click', () => {
      goToPage('home');
      const scannerSection = document.querySelector('.scanner-section');
      if (scannerSection) scannerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Trigger scanner start via the existing start button/flow
      document.getElementById('start-scanner-btn')?.click();
    });
  }

  /**
   * Switches the active page and updates the bottom nav + header title.
   * @param {'home'|'recent'|'profile'} pageName
   */
  function goToPage(pageName) {
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

    const titleEl = document.getElementById('header-page-title');
    if (titleEl) titleEl.textContent = pageTitles[pageName] || 'BillNova';

    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  return { init, goToPage };
})();

/* ==========================================================================
   Rasiddoo v1.0: Onboarding (Scan → Add → Bill)
   Shown only on first visit; persisted via localStorage flag.
   ========================================================================== */

const Onboarding = (() => {
  const STORAGE_KEY = 'rasiddoo_onboarding_complete';

  let currentSlide = 0;
  let slides = [];
  let dots = [];
  let overlayEl = null;
  let nextBtn = null;
  let onFinishCallback = null;

  function hasCompletedOnboarding() {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'true';
    } catch (e) {
      console.warn('[Onboarding] Failed to read onboarding flag', e);
      return true; // fail safe: don't block app boot behind onboarding if storage is unavailable
    }
  }

  function markComplete() {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch (e) {
      console.warn('[Onboarding] Failed to save onboarding flag', e);
    }
  }

  function init() {
    overlayEl = document.getElementById('onboarding-overlay');
    slides = Array.from(document.querySelectorAll('.onboarding-slide'));
    dots = Array.from(document.querySelectorAll('.onboarding-dot'));
    nextBtn = document.getElementById('onboarding-next-btn');
    const skipBtn = document.getElementById('onboarding-skip-btn');

    nextBtn.addEventListener('click', goToNextSlide);
    skipBtn.addEventListener('click', finish);
  }

  /**
   * Shows the onboarding overlay.
   * @param {Function} [onFinish] - called once the user finishes or skips onboarding.
   */
  function show(onFinish) {
    if (!overlayEl) return;
    onFinishCallback = typeof onFinish === 'function' ? onFinish : null;
    overlayEl.hidden = false;
    currentSlide = 0;
    updateSlideUI();
  }

  function goToNextSlide() {
    if (currentSlide < slides.length - 1) {
      slides[currentSlide].classList.add('exit-left');
      slides[currentSlide].classList.remove('active');
      currentSlide += 1;
      updateSlideUI();
    } else {
      finish();
    }
  }

  function updateSlideUI() {
    slides.forEach((slide, idx) => {
      slide.classList.toggle('active', idx === currentSlide);
      if (idx !== currentSlide) slide.classList.remove('exit-left');
    });
    dots.forEach((dot, idx) => dot.classList.toggle('active', idx === currentSlide));
    nextBtn.textContent = currentSlide === slides.length - 1 ? 'Get Started' : 'Next';
  }

  function finish() {
    markComplete();
    if (overlayEl) overlayEl.hidden = true;
    if (onFinishCallback) {
      const cb = onFinishCallback;
      onFinishCallback = null;
      cb();
    }
  }

  return { init, show, hasCompletedOnboarding };
})();

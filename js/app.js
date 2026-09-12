/* ==========================================================================
   BillNova India — App Bootstrap
   Wires together: splash screen, onboarding, scanner -> DB lookup -> cart,
   manual add flow, and PWA install/service worker registration.
   ========================================================================== */

(() => {
  let pendingScannedCode = null; // holds code while "new product" modal is open

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    Toast.init();
    Loading.init();

    Profile.init();
    Navigation.init();
    Cart.init();
    Billing.init();
    await Recent.init();
    PwaInstall.init();
    Onboarding.init();

    setupNewProductModal();
    setupManualProductModal();
    setupManualAddFab();

    Scanner.init(handleScannedCode);

    registerServiceWorker();

    // Reveal the app, hide splash
    await new Promise((resolve) => setTimeout(resolve, 900)); // brief brand moment
    document.getElementById('splash-screen').classList.add('hidden');
    document.getElementById('app-root').hidden = false;

    if (!Onboarding.hasCompletedOnboarding()) {
      Onboarding.show();
    }
  }

  /**
   * Called by Scanner whenever a QR/barcode is successfully decoded.
   * Looks up the code in IndexedDB: if known, adds directly to cart;
   * if unknown, opens the "New Product" modal to capture name & price once.
   * @param {string} code
   */
  async function handleScannedCode(code) {
    try {
      const existingProduct = await BillNovaDB.getProductByCode(code);
      if (existingProduct) {
        Cart.addItem({
          code: existingProduct.code,
          name: existingProduct.name,
          price: existingProduct.price,
          qty: 1,
        });
      } else {
        pendingScannedCode = code;
        document.getElementById('new-product-code').textContent = code;
        document.getElementById('new-product-form').reset();
        ModalManager.open('new-product-modal');
      }
    } catch (err) {
      console.error('[App] Scan lookup failed', err);
      Toast.error('Could not read product database.');
    }
  }

  /**
   * Sets up the "New Product" modal: on submit, saves the product permanently
   * to IndexedDB (keyed by scanned code) and adds it to the current cart.
   */
  function setupNewProductModal() {
    const form = document.getElementById('new-product-form');
    const closeBtn = document.getElementById('new-product-close');
    const cancelBtn = document.getElementById('new-product-cancel');

    const closeModal = () => {
      ModalManager.close('new-product-modal');
      pendingScannedCode = null;
    };

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!pendingScannedCode) return;

      const name = document.getElementById('new-product-name').value.trim();
      const price = parseFloat(document.getElementById('new-product-price').value);

      if (!name || isNaN(price) || price < 0) {
        Toast.error('Please enter a valid name and price.');
        return;
      }

      try {
        const saved = await BillNovaDB.saveProduct({ code: pendingScannedCode, name, price });
        Cart.addItem({ code: saved.code, name: saved.name, price: saved.price, qty: 1 });
        ModalManager.close('new-product-modal');
        pendingScannedCode = null;
      } catch (err) {
        console.error('[App] Failed to save product', err);
        Toast.error('Failed to save product. Please try again.');
      }
    });
  }

  /**
   * Sets up the floating "+" manual add modal for products without a scannable code.
   */
  function setupManualProductModal() {
    const form = document.getElementById('manual-product-form');
    const closeBtn = document.getElementById('manual-product-close');
    const cancelBtn = document.getElementById('manual-product-cancel');

    const closeModal = () => ModalManager.close('manual-product-modal');

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('manual-product-name').value.trim();
      const price = parseFloat(document.getElementById('manual-product-price').value);
      const qty = parseInt(document.getElementById('manual-product-qty').value, 10) || 1;

      if (!name || isNaN(price) || price < 0) {
        Toast.error('Please enter a valid name and price.');
        return;
      }

      Cart.addItem({ code: null, name, price, qty });
      form.reset();
      document.getElementById('manual-product-qty').value = 1;
      closeModal();
    });
  }

  function setupManualAddFab() {
    document.getElementById('manual-add-fab').addEventListener('click', () => {
      document.getElementById('manual-product-form').reset();
      document.getElementById('manual-product-qty').value = 1;
      ModalManager.open('manual-product-modal');
    });
  }

  /**
   * Registers the offline-first service worker for installability and caching.
   */
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('service-worker.js')
          .catch((err) => console.error('[App] Service worker registration failed', err));
      });
    }
  }
})();

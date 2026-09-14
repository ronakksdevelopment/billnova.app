/* ==========================================================================
   Rasiddoo v1.0: App Bootstrap
   Wires together: splash screen, onboarding, scanner -> DB lookup -> cart,
   manual add flow, and PWA install/service worker registration.
   ========================================================================== */

(() => {
  let pendingScannedCode = null; // holds code while "new product" modal is open

  // Photo pickers for the New Product (scanned) and manual Add Product modals.
  let newProductPhotoPicker = null;
  let manualProductPhotoPicker = null;

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
    Permissions.init();
    QuickActions.init();

    setupNewProductModal();
    setupManualProductModal();
    setupManualAddFab();

    Scanner.init(handleScannedCode);

    registerServiceWorker();

    // Reveal the app, hide splash
    document.getElementById('splash-screen').classList.add('hidden');
    document.getElementById('app-root').hidden = false;

    // First run: show onboarding, then the permissions screen right after it.
    // Returning users skip both since each is remembered independently.
    if (!Onboarding.hasCompletedOnboarding()) {
      Onboarding.show(() => {
        if (!Permissions.hasBeenShown()) Permissions.show();
      });
    } else if (!Permissions.hasBeenShown()) {
      Permissions.show();
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
      let existingProduct = await RasiddooDB.getProductByCode(code);

      // Backwards-compatible fallback: a barcode may have been saved
      // earlier under its raw UPC-A (12-digit) form, before scans were
      // normalized to the equivalent 13-digit EAN-13 code. If the
      // normalized code isn't found, check the un-prefixed legacy form too
      // so an already-known product isn't mistaken for a brand new one.
      if (!existingProduct && /^0\d{12}$/.test(code)) {
        existingProduct = await RasiddooDB.getProductByCode(code.slice(1));
        if (existingProduct) {
          // Migrate it to live under the normalized code too, so future
          // scans find it directly without needing this fallback.
          try {
            await RasiddooDB.saveProduct({ ...existingProduct, code });
          } catch (err) {
            console.error('[App] Failed to migrate legacy product code', err);
          }
        }
      }

      if (existingProduct) {
        Cart.addItem({
          code, // always add/save under the normalized code going forward
          name: existingProduct.name,
          price: existingProduct.price,
          photo: existingProduct.photo,
          qty: 1,
        });
      } else {
        pendingScannedCode = code;
        document.getElementById('new-product-code').textContent = code;
        document.getElementById('new-product-form').reset();
        if (newProductPhotoPicker) newProductPhotoPicker.reset();
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

    if (typeof PhotoPicker !== 'undefined') {
      newProductPhotoPicker = PhotoPicker.create('new-product');
    }

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

      const photo = newProductPhotoPicker ? newProductPhotoPicker.getPhoto() : null;

      try {
        const saved = await RasiddooDB.saveProduct({ code: pendingScannedCode, name, price, photo });
        Cart.addItem({ code: saved.code, name: saved.name, price: saved.price, qty: 1, photo: saved.photo });
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

    if (typeof PhotoPicker !== 'undefined') {
      manualProductPhotoPicker = PhotoPicker.create('manual-product');
    }

    const closeModal = () => ModalManager.close('manual-product-modal');

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('manual-product-name').value.trim();
      const price = parseFloat(document.getElementById('manual-product-price').value);
      const qty = parseInt(document.getElementById('manual-product-qty').value, 10) || 1;
      const wantsLabel = document.getElementById('manual-product-generate-label')?.checked;

      if (!name || isNaN(price) || price < 0) {
        Toast.error('Please enter a valid name and price.');
        return;
      }

      const photo = manualProductPhotoPicker ? manualProductPhotoPicker.getPhoto() : null;

      // Products added without a scannable code have nothing a future scan
      // could match against. When the shopkeeper wants one, generate a
      // unique internal code now, save it as a permanent product record
      // (so the printed label is picked up instantly next time it's
      // scanned), and add this cart item under that same code.
      let code = null;
      if (wantsLabel && typeof Label !== 'undefined') {
        try {
          code = Label.generateProductCode();
          await RasiddooDB.saveProduct({ code, name, price, photo });
        } catch (err) {
          console.error('[App] Failed to save generated product code', err);
          Toast.error('Item will be added, but its label could not be generated.');
          code = null;
        }
      }

      Cart.addItem({ code, name, price, qty, photo });
      form.reset();
      document.getElementById('manual-product-qty').value = 1;
      const labelCheckbox = document.getElementById('manual-product-generate-label');
      if (labelCheckbox) labelCheckbox.checked = true;
      if (manualProductPhotoPicker) manualProductPhotoPicker.reset();
      closeModal();

      if (code && typeof Label !== 'undefined') {
        // Let the modal-close animation finish before opening the label
        // preview so the two transitions don't fight each other.
        window.setTimeout(() => {
          Label.open({ code, name, price, photo });
        }, 260);
      }
    });
  }

  function setupManualAddFab() {
    document.getElementById('manual-add-fab').addEventListener('click', () => {
      document.getElementById('manual-product-form').reset();
      document.getElementById('manual-product-qty').value = 1;
      if (manualProductPhotoPicker) manualProductPhotoPicker.reset();
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

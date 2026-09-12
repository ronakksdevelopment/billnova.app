/* ==========================================================================
   BillNova India: Profile / Business Settings
   Stores default shop info, UPI ID, GST%, receipt footer, currency & theme
   locally. Used to pre-fill Confirm Bill, Payment and Receipt screens.
   ========================================================================== */

const Profile = (() => {
  const STORAGE_KEY = 'billnova_profile';

  const DEFAULTS = {
    shopName: '',
    contactNumber: '',
    upiId: '',
    gstPercent: 0,
    footerMessage: 'Thank you for shopping with us!',
    currencySymbol: '₹',
    theme: 'default',
  };

  let data = { ...DEFAULTS };

  // Elements
  let form, shopNameInput, contactInput, upiInput, gstInput, footerInput, currencyInput;
  let themeButtons;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        data = { ...DEFAULTS, ...JSON.parse(raw) };
      }
    } catch (e) {
      console.warn('[Profile] Failed to load profile', e);
    }
    applyTheme();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[Profile] Failed to save profile', e);
    }
  }

  function get() {
    return { ...data };
  }

  function update(patch) {
    data = { ...data, ...patch };
    save();
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', data.theme || 'default');
  }

  function cacheElements() {
    form = document.getElementById('profile-form');
    shopNameInput = document.getElementById('profile-shop-name');
    contactInput = document.getElementById('profile-contact');
    upiInput = document.getElementById('profile-upi-id');
    gstInput = document.getElementById('profile-gst');
    footerInput = document.getElementById('profile-footer');
    currencyInput = document.getElementById('profile-currency');
    themeButtons = Array.from(document.querySelectorAll('.theme-swatch'));
  }

  function populateForm() {
    if (!form) return;
    shopNameInput.value = data.shopName || '';
    contactInput.value = data.contactNumber || '';
    upiInput.value = data.upiId || '';
    gstInput.value = data.gstPercent || '';
    footerInput.value = data.footerMessage || '';
    currencyInput.value = data.currencySymbol || '₹';
    themeButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.theme === data.theme));
  }

  function init() {
    load();
    cacheElements();
    populateForm();

    if (!form) return;

    form.addEventListener('input', Utils.debounce(handleFormChange, 250));
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      handleFormChange();
      Toast.success('Profile saved');
    });

    themeButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        themeButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        update({ theme: btn.dataset.theme });
        applyTheme();
        Toast.success('Theme updated');
      });
    });

    const exportBtn = document.getElementById('profile-export-btn');
    if (exportBtn) exportBtn.addEventListener('click', handleExportData);

    const resetBtn = document.getElementById('profile-reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', handleResetData);
  }

  function handleFormChange() {
    update({
      shopName: shopNameInput.value.trim(),
      contactNumber: contactInput.value.trim(),
      upiId: upiInput.value.trim(),
      gstPercent: Utils.clamp(parseFloat(gstInput.value) || 0, 0, 100),
      footerMessage: footerInput.value.trim() || DEFAULTS.footerMessage,
      currencySymbol: currencyInput.value.trim() || '₹',
    });
  }

  async function handleExportData() {
    try {
      const bills = await BillNovaDB.getAllBills();
      const products = await BillNovaDB.getAllProducts();
      const payload = { profile: data, bills, products, exportedAt: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `billnova-backup-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      Toast.success('Backup file downloaded');
    } catch (err) {
      console.error('[Profile] Export failed', err);
      Toast.error('Could not export data');
    }
  }

  async function handleResetData() {
    const confirmed = await ModalManager.confirm({
      title: 'Reset all data?',
      text: 'This permanently deletes all recent bills and saved product memory from this device. Profile settings will remain.',
      confirmLabel: 'Reset Everything',
    });
    if (!confirmed) return;

    try {
      const db = await BillNovaDB.openDB();
      await Promise.all([
        new Promise((resolve, reject) => {
          const tx = db.transaction('bills', 'readwrite');
          tx.objectStore('bills').clear();
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        }),
        new Promise((resolve, reject) => {
          const tx = db.transaction('products', 'readwrite');
          tx.objectStore('products').clear();
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
        }),
      ]);
      Toast.success('All data reset');
      if (window.Recent && Recent.refresh) Recent.refresh();
    } catch (err) {
      console.error('[Profile] Reset failed', err);
      Toast.error('Could not reset data');
    }
  }

  return { init, get, update, load };
})();

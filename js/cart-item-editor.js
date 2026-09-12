/* ==========================================================================
   BillNova India: Cart Item Editor
   Powers the pencil-icon "Edit Item" modal on each cart row, letting the
   name/price of an already-added item be corrected without removing and
   re-adding it. If the item came from a scan, the change is also saved back
   to the product database so future scans of the same code pick it up.
   ========================================================================== */

const CartItemEditor = (() => {
  let modalId = 'edit-item-modal';
  let form, nameInput, priceInput, closeBtn, cancelBtn, codeExtraEl;
  let editingItemId = null;
  let editingItemCode = null;

  function cacheElements() {
    form = document.getElementById('edit-item-form');
    nameInput = document.getElementById('edit-item-name');
    priceInput = document.getElementById('edit-item-price');
    closeBtn = document.getElementById('edit-item-close');
    cancelBtn = document.getElementById('edit-item-cancel');
    codeExtraEl = document.getElementById('edit-item-code-extra');
  }

  function init() {
    cacheElements();
    if (!form) return;

    closeBtn.addEventListener('click', closeModal);
    cancelBtn.addEventListener('click', closeModal);

    form.addEventListener('submit', handleSubmit);
  }

  /**
   * Opens the editor pre-filled with the given cart item's current name/price.
   * @param {{id: string, code: string|null, name: string, price: number}} item
   */
  function open(item) {
    if (!form) return;
    editingItemId = item.id;
    editingItemCode = item.code || null;

    nameInput.value = item.name;
    priceInput.value = item.price;
    codeExtraEl.textContent = editingItemCode
      ? ` — this will also update the saved product for future scans`
      : '';

    ModalManager.open(modalId);
  }

  function closeModal() {
    ModalManager.close(modalId);
    editingItemId = null;
    editingItemCode = null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!editingItemId) return;

    const name = nameInput.value.trim();
    const price = parseFloat(priceInput.value);

    if (!name || isNaN(price) || price < 0) {
      Toast.error('Please enter a valid name and price.');
      return;
    }

    Cart.updateItem(editingItemId, { name, price });

    // Scanned items are backed by a permanent product record keyed by their
    // code; keep that in sync too, so the next scan of the same code
    // reflects the corrected name/price instead of reverting to the old one.
    if (editingItemCode) {
      try {
        await BillNovaDB.saveProduct({ code: editingItemCode, name, price });
      } catch (err) {
        console.error('[CartItemEditor] Failed to update saved product', err);
        Toast.error('Item updated in this bill, but saving it to your product list failed.');
      }
    }

    Toast.success('Item updated');
    closeModal();
  }

  return { init, open };
})();

/* ==========================================================================
   BillNova India: Cart / Billing Logic
   Manages the in-memory cart, renders the list, computes live totals,
   and persists cart state to localStorage so it survives refreshes.
   ========================================================================== */

const Cart = (() => {
  const STORAGE_KEY = 'billnova_cart_state';

  /** @type {Array<{id:string, code:string|null, name:string, price:number, qty:number}>} */
  let items = [];
  let notes = '';
  let discountPercent = 0;
  let gstPercent = 0;

  // Elements
  let listEl, emptyStateEl, itemCountEl, extrasEl, summaryEl;
  let notesInput, discountInput, gstInput;
  let summaryTotalItems, summaryTotalQty, summaryDiscount, summaryGst, summaryGrandTotal;

  function cacheElements() {
    listEl = document.getElementById('cart-list');
    emptyStateEl = document.getElementById('cart-empty-state');
    itemCountEl = document.getElementById('cart-item-count');
    extrasEl = document.getElementById('billing-extras');
    summaryEl = document.getElementById('billing-summary');
    notesInput = document.getElementById('notes-input');
    discountInput = document.getElementById('discount-input');
    gstInput = document.getElementById('gst-input');
    summaryTotalItems = document.getElementById('summary-total-items');
    summaryTotalQty = document.getElementById('summary-total-qty');
    summaryDiscount = document.getElementById('summary-discount');
    summaryGst = document.getElementById('summary-gst');
    summaryGrandTotal = document.getElementById('summary-grand-total');
  }

  function init() {
    cacheElements();
    loadFromStorage();

    notesInput.addEventListener('input', Utils.debounce((e) => {
      notes = e.target.value;
      persistToStorage();
    }, 300));

    discountInput.addEventListener('input', (e) => {
      discountPercent = Utils.clamp(parseFloat(e.target.value) || 0, 0, 100);
      renderSummary();
      persistToStorage();
    });

    gstInput.addEventListener('input', (e) => {
      gstPercent = Utils.clamp(parseFloat(e.target.value) || 0, 0, 100);
      renderSummary();
      persistToStorage();
    });

    document.getElementById('clear-cart-btn').addEventListener('click', handleClearCart);

    render();
  }

  /**
   * Adds a scanned or manually-entered product to the cart.
   * If the item already exists (same code, or same manual name for codeless items),
   * increments its quantity instead of duplicating a row.
   * @param {{code?: string|null, name: string, price: number, qty?: number}} product
   */
  function addItem(product) {
    const qtyToAdd = product.qty || 1;
    const existing = items.find((i) =>
      (product.code && i.code === product.code) ||
      (!product.code && !i.code && i.name.toLowerCase() === product.name.toLowerCase())
    );

    if (existing) {
      existing.qty += qtyToAdd;
    } else {
      items.push({
        id: Utils.generateId(),
        code: product.code || null,
        name: product.name,
        price: Number(product.price),
        qty: qtyToAdd,
      });
    }

    render();
    persistToStorage();
    Toast.success(`${product.name} added to bill`);
  }

  /**
   * Updates the quantity of an item, removing it if quantity drops to 0.
   * @param {string} id
   * @param {number} delta
   */
  function changeQty(id, delta) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    item.qty = Math.max(0, item.qty + delta);

    if (item.qty === 0) {
      removeItem(id, true);
      return;
    }
    render();
    persistToStorage();
  }

  /**
   * Sets an exact quantity value (from the editable quantity input).
   * @param {string} id
   * @param {number} value
   */
  function setQty(id, value) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const parsed = Math.max(0, Math.floor(Number(value)) || 0);
    if (parsed === 0) {
      removeItem(id, true);
      return;
    }
    item.qty = parsed;
    render();
    persistToStorage();
  }

  /**
   * Removes a single item from the cart, with an optional skip-animation flag.
   * @param {string} id
   * @param {boolean} skipConfirm - true when called internally (qty already hit 0)
   */
  function removeItem(id, skipConfirm = false) {
    const rowEl = listEl.querySelector(`[data-item-id="${id}"]`);

    const doRemove = () => {
      items = items.filter((i) => i.id !== id);
      render();
      persistToStorage();
    };

    if (rowEl) {
      rowEl.classList.add('removing');
      setTimeout(doRemove, 220);
    } else {
      doRemove();
    }

    if (!skipConfirm) Toast.info('Item removed');
  }

  /**
   * Handles the trash icon tap. Asks for confirmation before removing.
   * @param {string} id
   */
  async function handleRemoveClick(id) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    const confirmed = await ModalManager.confirm({
      title: 'Remove item?',
      text: `Remove "${item.name}" from the bill?`,
      confirmLabel: 'Remove',
    });
    if (confirmed) removeItem(id);
  }

  /**
   * Clears the entire cart after confirmation.
   */
  async function handleClearCart() {
    if (items.length === 0) return;
    const confirmed = await ModalManager.confirm({
      title: 'Clear entire bill?',
      text: 'All items, notes, discount and GST will be reset. This cannot be undone.',
      confirmLabel: 'Clear Cart',
    });
    if (!confirmed) return;

    items = [];
    notes = '';
    discountPercent = 0;
    gstPercent = 0;
    notesInput.value = '';
    discountInput.value = '';
    gstInput.value = '';
    render();
    persistToStorage();
    Toast.info('Cart cleared');
  }

  /**
   * Computes live totals: item count, total quantity, subtotal, discount, gst, grand total.
   */
  function computeTotals() {
    const totalItems = items.length;
    const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
    const subtotal = items.reduce((sum, i) => sum + i.qty * i.price, 0);
    const discountAmount = subtotal * (discountPercent / 100);
    const afterDiscount = subtotal - discountAmount;
    const gstAmount = afterDiscount * (gstPercent / 100);
    const grandTotal = afterDiscount + gstAmount;

    return { totalItems, totalQty, subtotal, discountAmount, gstAmount, grandTotal };
  }

  /**
   * Renders the full cart list, empty state, and summary panel.
   */
  function render() {
    if (items.length === 0) {
      emptyStateEl.hidden = false;
      listEl.hidden = true;
      extrasEl.hidden = true;
      summaryEl.hidden = true;
      listEl.innerHTML = '';
      itemCountEl.textContent = '0';
      return;
    }

    emptyStateEl.hidden = true;
    listEl.hidden = false;
    extrasEl.hidden = false;
    summaryEl.hidden = false;
    itemCountEl.textContent = String(items.length);

    listEl.innerHTML = items.map(renderItemRow).join('');
    attachRowListeners();
    renderSummary();
  }

  /**
   * Builds the HTML for a single cart row.
   * @param {Object} item
   * @returns {string}
   */
  function renderItemRow(item) {
    const subtotal = item.qty * item.price;
    return `
      <li class="cart-item" data-item-id="${item.id}">
        <button class="cart-item-edit tap-sm" data-action="edit" aria-label="Edit ${Utils.escapeHtml(item.name)}" title="Edit name or price">
          <i class="fa-solid fa-pen" aria-hidden="true"></i>
        </button>
        <button class="cart-item-trash tap-sm" data-action="remove" aria-label="Remove ${Utils.escapeHtml(item.name)}">
          <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
        </button>
        <div class="cart-item-icon">
          <i class="fa-solid ${item.code ? 'fa-qrcode' : 'fa-basket-shopping'}" aria-hidden="true"></i>
        </div>
        <div class="cart-item-info">
          <div class="cart-item-name-row">
            <div class="cart-item-name">${Utils.escapeHtml(item.name)}</div>
          </div>
          <div class="cart-item-meta">${item.code ? 'Scanned' : 'Manual entry'}</div>
          <div class="cart-item-price">${Utils.formatCurrency(item.price, Profile.get().currencySymbol)} each</div>
        </div>
        <div class="cart-item-right">
          <div class="cart-item-subtotal">${Utils.formatCurrency(subtotal, Profile.get().currencySymbol)}</div>
          <div class="qty-control">
            <button class="qty-btn minus tap-sm" data-action="minus" aria-label="Decrease quantity">
              <i class="fa-solid fa-minus" aria-hidden="true"></i>
            </button>
            <span class="qty-value" data-action="qty-input" role="spinbutton" aria-valuenow="${item.qty}" aria-valuemin="0" aria-label="Quantity for ${Utils.escapeHtml(item.name)}" tabindex="0">${item.qty}</span>
            <button class="qty-btn plus tap-sm" data-action="plus" aria-label="Increase quantity">
              <i class="fa-solid fa-plus" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </li>
    `;
  }

  /**
   * Attaches event listeners to newly rendered row controls (event delegation-friendly).
   */
  function attachRowListeners() {
    listEl.querySelectorAll('[data-action="minus"]').forEach((btn) => {
      btn.addEventListener('click', () => changeQty(getRowId(btn), -1));
    });
    listEl.querySelectorAll('[data-action="plus"]').forEach((btn) => {
      btn.addEventListener('click', () => changeQty(getRowId(btn), 1));
    });
    listEl.querySelectorAll('[data-action="remove"]').forEach((btn) => {
      btn.addEventListener('click', () => handleRemoveClick(getRowId(btn)));
    });
    listEl.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => handleEditClick(getRowId(btn)));
    });
    // Tapping the quantity value turns it into an inline editable field —
    // no native browser prompt/dialog, styled to match the qty pill itself.
    listEl.querySelectorAll('[data-action="qty-input"]').forEach((el) => {
      el.addEventListener('click', () => enterQtyEditMode(el, getRowId(el)));
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          enterQtyEditMode(el, getRowId(el));
        }
      });
    });
  }

  /**
   * Swaps the static quantity <span> for a real (but custom-styled) number
   * input in place, focuses + selects it, and commits the value back on
   * blur/Enter. Avoids window.prompt() entirely so the whole cart stays
   * inside the app's own UI instead of dropping into a native OS dialog.
   * @param {HTMLElement} spanEl
   * @param {string} id
   */
  function enterQtyEditMode(spanEl, id) {
    if (spanEl.dataset.editing === 'true') return;
    const item = items.find((i) => i.id === id);
    if (!item) return;

    spanEl.dataset.editing = 'true';
    const originalText = spanEl.textContent;
    const inputEl = document.createElement('input');
    inputEl.type = 'number';
    inputEl.className = 'qty-value-input';
    inputEl.value = String(item.qty);
    inputEl.min = '0';
    inputEl.inputMode = 'numeric';
    inputEl.setAttribute('aria-label', spanEl.getAttribute('aria-label') || 'Quantity');

    spanEl.replaceWith(inputEl);
    inputEl.focus();
    inputEl.select();

    let committed = false;
    const commit = () => {
      if (committed) return;
      committed = true;
      setQty(id, inputEl.value);
      // render() (called by setQty) rebuilds the whole row, so there is no
      // stale spanEl/inputEl to restore here.
    };
    const cancel = () => {
      if (committed) return;
      committed = true;
      inputEl.replaceWith(spanEl);
      spanEl.textContent = originalText;
      delete spanEl.dataset.editing;
    };

    inputEl.addEventListener('blur', commit);
    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        inputEl.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    });
  }

  /**
   * Opens a custom in-app "Edit Item" popup (same slide-up modal style used
   * everywhere else in the app, not a native browser prompt) prefilled with
   * the item's current name/price. Confirming updates the item in place.
   * @param {string} id
   */
  function handleEditClick(id) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    openEditItemPopup(item);
  }

  /**
   * Renders and wires the Edit Item popup directly (mirrors the confirm
   * dialog's approach: grab elements fresh, prefill, attach one-shot
   * listeners, open). Self-contained here so there's no separate module
   * or init-order dependency that could silently fail to wire up.
   * @param {{id:string, code:string|null, name:string, price:number}} item
   */
  function openEditItemPopup(item) {
    const modalId = 'edit-item-modal';
    const modalEl = document.getElementById(modalId);
    const form = document.getElementById('edit-item-form');
    const nameInput = document.getElementById('edit-item-name');
    const priceInput = document.getElementById('edit-item-price');
    const closeBtn = document.getElementById('edit-item-close');
    const cancelBtn = document.getElementById('edit-item-cancel');
    const codeExtraEl = document.getElementById('edit-item-code-extra');
    if (!modalEl || !form || !nameInput || !priceInput) return;

    // Prefill with the item's current data.
    nameInput.value = item.name;
    priceInput.value = item.price;
    if (codeExtraEl) {
      codeExtraEl.textContent = item.code
        ? ' — this will also update the saved product for future scans'
        : '';
    }

    const cleanup = () => {
      form.removeEventListener('submit', onSubmit);
      closeBtn?.removeEventListener('click', onCancel);
      cancelBtn?.removeEventListener('click', onCancel);
    };

    const onCancel = () => {
      cleanup();
      ModalManager.close(modalId);
    };

    const onSubmit = async (e) => {
      e.preventDefault();
      const name = nameInput.value.trim();
      const price = parseFloat(priceInput.value);

      if (!name || isNaN(price) || price < 0) {
        Toast.error('Please enter a valid name and price.');
        return;
      }

      updateItem(item.id, { name, price });

      // Scanned items are backed by a permanent product record keyed by
      // their code; keep that in sync too, so the next scan of the same
      // code reflects the corrected name/price.
      if (item.code) {
        try {
          await BillNovaDB.saveProduct({ code: item.code, name, price });
        } catch (err) {
          console.error('[Cart] Failed to update saved product', err);
          Toast.error('Item updated in this bill, but saving it to your product list failed.');
        }
      }

      Toast.success('Item updated');
      cleanup();
      ModalManager.close(modalId);
    };

    form.addEventListener('submit', onSubmit);
    closeBtn?.addEventListener('click', onCancel);
    cancelBtn?.addEventListener('click', onCancel);

    ModalManager.open(modalId);
  }

  /**
   * Updates an item's name and/or price in place (used by the Edit Item
   * modal). Unlike changeQty/setQty this never removes the item.
   * @param {string} id
   * @param {{name: string, price: number}} updates
   */
  function updateItem(id, updates) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    if (typeof updates.name === 'string' && updates.name.trim()) {
      item.name = updates.name.trim();
    }
    if (typeof updates.price === 'number' && !isNaN(updates.price) && updates.price >= 0) {
      item.price = updates.price;
    }
    render();
    persistToStorage();
  }

  function getRowId(el) {
    const row = el.closest('.cart-item');
    return row ? row.dataset.itemId : null;
  }

  /**
   * Renders only the sticky summary panel (called on any total-affecting change).
   */
  function renderSummary() {
    if (items.length === 0) return;
    const totals = computeTotals();
    summaryTotalItems.textContent = String(totals.totalItems);
    summaryTotalQty.textContent = String(totals.totalQty);
    const currency = Profile.get().currencySymbol;
    summaryDiscount.textContent = Utils.formatCurrency(totals.discountAmount, currency);
    summaryGst.textContent = Utils.formatCurrency(totals.gstAmount, currency);
    summaryGrandTotal.textContent = Utils.formatCurrency(totals.grandTotal, currency);
  }

  /**
   * Persists the full cart state to localStorage.
   */
  function persistToStorage() {
    const state = { items, notes, discountPercent, gstPercent };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('[Cart] Failed to persist cart state', e);
    }
  }

  /**
   * Restores cart state from localStorage on app load.
   */
  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const defaultGst = (window.Profile && Profile.get().gstPercent) || 0;
      if (!raw) {
        gstPercent = defaultGst;
        gstInput.value = gstPercent || '';
        return;
      }
      const state = JSON.parse(raw);
      items = Array.isArray(state.items) ? state.items : [];
      notes = state.notes || '';
      discountPercent = state.discountPercent || 0;
      gstPercent = (typeof state.gstPercent === 'number') ? state.gstPercent : defaultGst;

      notesInput.value = notes;
      discountInput.value = discountPercent || '';
      gstInput.value = gstPercent || '';
    } catch (e) {
      console.warn('[Cart] Failed to load cart state', e);
    }
  }

  function getItemCount() {
    return items.length;
  }

  /**
   * Returns a single cart item by id, or null.
   * @param {string} id
   * @returns {Object|null}
   */
  function getItem(id) {
    return items.find((i) => i.id === id) || null;
  }

  /**
   * Returns a plain snapshot of cart contents for building a bill record.
   */
  function getExportData() {
    return {
      items: items.map((i) => ({ code: i.code, name: i.name, price: i.price, qty: i.qty })),
      notes,
      discountPercent,
      gstPercent,
    };
  }

  /**
   * Resets the cart to empty after a bill has been finalized.
   */
  function reset() {
    items = [];
    notes = '';
    discountPercent = 0;
    gstPercent = 0;
    notesInput.value = '';
    discountInput.value = '';
    gstInput.value = '';
    render();
    persistToStorage();
  }

  return {
    init,
    addItem,
    changeQty,
    setQty,
    updateItem,
    removeItem,
    computeTotals,
    getItemCount,
    getItem,
    getExportData,
    reset,
  };
})();

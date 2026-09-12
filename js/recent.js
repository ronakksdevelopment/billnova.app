/* ==========================================================================
   BillNova India: Recent Bills
   Lists saved invoices with search + date filter, and lets the user reopen
   (view actions), duplicate into a new cart, or delete a bill.
   ========================================================================== */

const Recent = (() => {
  let allBills = [];
  let searchTerm = '';
  let dateFilter = 'all';

  let listEl, emptyStateEl, searchInput, dateFilterSelect;

  function cacheElements() {
    listEl = document.getElementById('recent-list');
    emptyStateEl = document.getElementById('recent-empty-state');
    searchInput = document.getElementById('recent-search-input');
    dateFilterSelect = document.getElementById('recent-date-filter');
  }

  async function init() {
    cacheElements();

    searchInput.addEventListener('input', Utils.debounce((e) => {
      searchTerm = e.target.value.trim().toLowerCase();
      renderList();
    }, 250));

    dateFilterSelect.addEventListener('change', (e) => {
      dateFilter = e.target.value;
      renderList();
    });

    await refresh();
  }

  async function refresh() {
    try {
      allBills = await BillNovaDB.getAllBills();
    } catch (err) {
      console.error('[Recent] Failed to load bills', err);
      allBills = [];
    }
    renderList();
  }

  function matchesSearch(bill) {
    if (!searchTerm) return true;
    const haystack = [
      bill.invoiceNumber,
      bill.customerName,
      bill.customerContact,
      bill.shopName,
      ...(bill.items || []).map((i) => i.name),
    ].join(' ').toLowerCase();
    return haystack.includes(searchTerm);
  }

  function matchesDateFilter(bill) {
    if (dateFilter === 'all') return true;
    const created = new Date(bill.createdAt);
    const now = new Date();
    const diffMs = now - created;
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (dateFilter === 'today') {
      return created.toDateString() === now.toDateString();
    }
    if (dateFilter === 'week') return diffDays <= 7;
    if (dateFilter === 'month') return diffDays <= 30;
    return true;
  }

  function getFilteredBills() {
    return allBills.filter((b) => matchesSearch(b) && matchesDateFilter(b));
  }

  function renderList() {
    const filtered = getFilteredBills();

    if (filtered.length === 0) {
      listEl.hidden = true;
      emptyStateEl.hidden = false;
      listEl.innerHTML = '';
      const heading = emptyStateEl.querySelector('h3');
      const desc = emptyStateEl.querySelector('p');
      if (allBills.length === 0) {
        if (heading) heading.textContent = 'No recent bills yet';
        if (desc) desc.textContent = 'Bills you complete will show up here.';
      } else {
        if (heading) heading.textContent = 'No matching bills';
        if (desc) desc.textContent = 'Try a different search term or date range.';
      }
      return;
    }

    emptyStateEl.hidden = true;
    listEl.hidden = false;
    listEl.innerHTML = filtered.map(renderBillRow).join('');
    attachRowListeners();
  }

  function renderBillRow(bill) {
    const currency = bill.currencySymbol || '₹';
    const itemCount = (bill.items || []).length;
    const methodIcon = bill.paymentMethod === 'upi' ? 'fa-qrcode' : 'fa-money-bill-wave';
    const methodLabel = bill.paymentMethod === 'upi' ? 'UPI' : 'Cash';
    const dateLabel = Receipt.formatDateTime(new Date(bill.createdAt));
    const customerLabel = bill.customerName ? Utils.escapeHtml(bill.customerName) : 'Walk-in customer';

    return `
      <li class="recent-item" data-bill-id="${bill.id}">
        <div class="recent-item-main" data-action="open">
          <div class="recent-item-icon"><i class="fa-solid ${methodIcon}" aria-hidden="true"></i></div>
          <div class="recent-item-info">
            <div class="recent-item-top">
              <span class="recent-item-invoice">${bill.invoiceNumber}</span>
              <span class="recent-item-amount">${currency}${Number(bill.grandTotal).toFixed(2)}</span>
            </div>
            <div class="recent-item-meta">${customerLabel} · ${itemCount} item${itemCount !== 1 ? 's' : ''} · ${methodLabel}</div>
            <div class="recent-item-date">${dateLabel}</div>
          </div>
        </div>
        <div class="recent-item-actions">
          <button class="icon-btn tap-sm" data-action="duplicate" aria-label="Duplicate bill" title="Duplicate">
            <i class="fa-regular fa-copy" aria-hidden="true"></i>
          </button>
          <button class="icon-btn tap-sm" data-action="delete" aria-label="Delete bill" title="Delete">
            <i class="fa-solid fa-trash-can" aria-hidden="true"></i>
          </button>
        </div>
      </li>
    `;
  }

  function attachRowListeners() {
    listEl.querySelectorAll('[data-action="open"]').forEach((el) => {
      el.addEventListener('click', () => handleOpen(getRowId(el)));
    });
    listEl.querySelectorAll('[data-action="duplicate"]').forEach((el) => {
      el.addEventListener('click', (e) => { e.stopPropagation(); handleDuplicate(getRowId(el)); });
    });
    listEl.querySelectorAll('[data-action="delete"]').forEach((el) => {
      el.addEventListener('click', (e) => { e.stopPropagation(); handleDelete(getRowId(el)); });
    });
  }

  function getRowId(el) {
    const row = el.closest('.recent-item');
    return row ? row.dataset.billId : null;
  }

  async function handleOpen(id) {
    const bill = allBills.find((b) => b.id === id);
    if (!bill) return;
    Billing.openActionsForExistingBill(bill);
  }

  async function handleDuplicate(id) {
    const bill = allBills.find((b) => b.id === id);
    if (!bill) return;

    const confirmed = await ModalManager.confirm({
      title: 'Duplicate this bill?',
      text: 'All items will be added to your current cart on the Home page.',
      confirmLabel: 'Duplicate',
    });
    if (!confirmed) return;

    (bill.items || []).forEach((item) => {
      Cart.addItem({ code: item.code, name: item.name, price: item.price, qty: item.qty });
    });

    Toast.success('Items added to a new bill');
    Navigation.goToPage('home');
  }

  async function handleDelete(id) {
    const bill = allBills.find((b) => b.id === id);
    if (!bill) return;

    const confirmed = await ModalManager.confirm({
      title: 'Delete this bill?',
      text: `Invoice ${bill.invoiceNumber} will be permanently removed from Recent Bills.`,
      confirmLabel: 'Delete',
    });
    if (!confirmed) return;

    try {
      await BillNovaDB.deleteBill(id);
      Toast.info('Bill deleted');
      await refresh();
    } catch (err) {
      console.error('[Recent] Failed to delete bill', err);
      Toast.error('Could not delete bill');
    }
  }

  return { init, refresh };
})();

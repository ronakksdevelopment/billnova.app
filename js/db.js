/* ==========================================================================
   BillNova India — IndexedDB Layer
   Stores: products (scanned code -> name/price), bills (Part 1.0 placeholder)
   ========================================================================== */

const BillNovaDB = (() => {
  const DB_NAME = 'billnova_db';
  const DB_VERSION = 1;
  const STORE_PRODUCTS = 'products';
  const STORE_BILLS = 'bills';

  let dbInstance = null;

  /**
   * Opens (or creates) the IndexedDB database and its object stores.
   * @returns {Promise<IDBDatabase>}
   */
  function openDB() {
    if (dbInstance) return Promise.resolve(dbInstance);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Products store: keyed by scanned code (QR/barcode string)
        if (!db.objectStoreNames.contains(STORE_PRODUCTS)) {
          const productStore = db.createObjectStore(STORE_PRODUCTS, { keyPath: 'code' });
          productStore.createIndex('name', 'name', { unique: false });
          productStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // Bills store: full invoice history (Recent Bills)
        if (!db.objectStoreNames.contains(STORE_BILLS)) {
          const billStore = db.createObjectStore(STORE_BILLS, { keyPath: 'id' });
          billStore.createIndex('createdAt', 'createdAt', { unique: false });
          billStore.createIndex('invoiceNumber', 'invoiceNumber', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        resolve(dbInstance);
      };

      request.onerror = (event) => {
        console.error('[BillNovaDB] Failed to open database', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Saves (creates or updates) a completed bill/invoice record.
   * @param {Object} bill
   * @returns {Promise<Object>}
   */
  async function saveBill(bill) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BILLS, 'readwrite');
      const store = tx.objectStore(STORE_BILLS);
      const req = store.put(bill);
      req.onsuccess = () => resolve(bill);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Returns all saved bills, most recent first.
   * @returns {Promise<Array>}
   */
  async function getAllBills() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BILLS, 'readonly');
      const store = tx.objectStore(STORE_BILLS);
      const req = store.getAll();
      req.onsuccess = () => {
        const bills = (req.result || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        resolve(bills);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Fetches a single bill by id.
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  async function getBillById(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BILLS, 'readonly');
      const store = tx.objectStore(STORE_BILLS);
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Deletes a bill by id.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async function deleteBill(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BILLS, 'readwrite');
      const store = tx.objectStore(STORE_BILLS);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Looks up a product by its scanned code.
   * @param {string} code
   * @returns {Promise<Object|null>}
   */
  async function getProductByCode(code) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PRODUCTS, 'readonly');
      const store = tx.objectStore(STORE_PRODUCTS);
      const req = store.get(code);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Saves (creates or updates) a product record permanently.
   * @param {{code: string, name: string, price: number}} product
   * @returns {Promise<void>}
   */
  async function saveProduct(product) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PRODUCTS, 'readwrite');
      const store = tx.objectStore(STORE_PRODUCTS);
      const record = {
        code: product.code,
        name: product.name,
        price: Number(product.price),
        createdAt: product.createdAt || new Date().toISOString(),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(record);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * Returns all saved products (used later in Part 1.0 for product management).
   * @returns {Promise<Array>}
   */
  async function getAllProducts() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PRODUCTS, 'readonly');
      const store = tx.objectStore(STORE_PRODUCTS);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  return {
    openDB,
    getProductByCode,
    saveProduct,
    getAllProducts,
    saveBill,
    getAllBills,
    getBillById,
    deleteBill,
  };
})();

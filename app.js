/**
 * Smart Grocery & Budget Safety Tracker (PWA)
 * Designed for one-handed mobile supermarket shopping by anak kos (Rian)
 */

// ==========================================
// 1. DATA MODELS & CONSTANTS
// ==========================================
const STORAGE_KEYS = {
  CART: 'grocery_safe_cart_v1',
  HISTORY: 'grocery_safe_history_v1',
  PRICE_LOOKUP: 'grocery_safe_lookup_v1',
  BUDGET: 'grocery_safe_budget_v1',
  INITIALIZED: 'grocery_safe_init_v1'
};

const CATEGORIES = [
  { id: 'all', name: 'Semua', icon: 'layout-grid', color: 'bg-slate-700 text-slate-200' },
  { id: 'makanan', name: 'Makanan & Minuman', icon: 'coffee', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  { id: 'sembako', name: 'Bumbu & Sembako', icon: 'wheat', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  { id: 'kebersihan', name: 'Kebersihan & Mandi', icon: 'sparkles', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  { id: 'peralatan', name: 'Peralatan', icon: 'wrench', color: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  { id: 'lainnya', name: 'Lainnya', icon: 'tag', color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' }
];

const UNITS = ['pcs', 'kg', 'liter', 'pack', 'botol', 'kaleng'];

// Default initial mock items
const MOCK_ITEMS = [
  {
    id: 'mock-1',
    name: 'Beras Pulen Super 5kg',
    category: 'sembako',
    unit: 'pack',
    qty: 1,
    unitPrice: 72000,
    lastMonthPrice: 68000,
    discountRaw: '0',
    createdAt: Date.now() - 300000
  },
  {
    id: 'mock-2',
    name: 'Minyak Goreng Sawit 2L',
    category: 'sembako',
    unit: 'liter',
    qty: 2,
    unitPrice: 38000,
    lastMonthPrice: 42000,
    discountRaw: '10%',
    createdAt: Date.now() - 200000
  },
  {
    id: 'mock-3',
    name: 'Sabun Mandi Cair Refill 450ml',
    category: 'kebersihan',
    unit: 'pack',
    qty: 1,
    unitPrice: 24000,
    lastMonthPrice: 24000,
    discountRaw: '50%+20%',
    createdAt: Date.now() - 100000
  }
];

const MOCK_LOOKUP = {
  'beras pulen super 5kg': { price: 68000, unit: 'pack', category: 'sembako' },
  'minyak goreng sawit 2l': { price: 42000, unit: 'liter', category: 'sembako' },
  'sabun mandi cair refill 450ml': { price: 24000, unit: 'pack', category: 'kebersihan' },
  'mie instan goreng (dus)': { price: 115000, unit: 'pack', category: 'makanan' },
  'telur ayam 1kg': { price: 28000, unit: 'kg', category: 'sembako' },
  'deterjen bubuk 800g': { price: 195000, unit: 'pack', category: 'kebersihan' },
  'kecap manis 550ml': { price: 21000, unit: 'botol', category: 'sembako' },
  'susu uht full cream 1l': { price: 18500, unit: 'liter', category: 'makanan' }
};

// ==========================================
// 2. AUDIO & HAPTIC SYSTEM (Zero external dependency)
// ==========================================
class FeedbackEngine {
  constructor() {
    this.audioCtx = null;
  }

  initAudio() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  vibrate(pattern = 15) {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Ignored on unsupported desktop/browser
      }
    }
  }

  playBeep(freq = 440, type = 'sine', duration = 0.08, volume = 0.05) {
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);
      gain.gain.setValueAtTime(volume, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + duration);
    } catch (e) {
      // Audio autoplay policy fallback
    }
  }

  tap() {
    this.vibrate(12);
    this.playBeep(520, 'sine', 0.04, 0.03);
  }

  increment() {
    this.vibrate(18);
    this.playBeep(680, 'sine', 0.05, 0.04);
  }

  decrement() {
    this.vibrate(18);
    this.playBeep(420, 'triangle', 0.05, 0.04);
  }

  success() {
    this.vibrate([25, 40, 35]);
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      [523, 659, 784, 1046].forEach((f, i) => {
        setTimeout(() => this.playBeep(f, 'sine', 0.09, 0.05), i * 65);
      });
    } catch (e) {}
  }

  dangerAlert() {
    this.vibrate([80, 50, 100, 50, 120]);
    try {
      this.initAudio();
      if (!this.audioCtx) return;
      this.playBeep(320, 'sawtooth', 0.15, 0.08);
      setTimeout(() => this.playBeep(260, 'sawtooth', 0.25, 0.09), 140);
    } catch (e) {}
  }
}

const feedback = new FeedbackEngine();

// ==========================================
// 3. DISCOUNT & CALCULATION ENGINE [F-03]
// ==========================================
const Calculator = {
  /**
   * Evaluates promo discount:
   * 1. Multi-tier stacked: "50%+20%"
   * 2. Single percent: "25" or "25%"
   * 3. Nominal rupiah: "15000" (> 100 without %)
   */
  calculateDiscount(unitPrice, discountRaw) {
    if (!discountRaw || String(discountRaw).trim() === '') {
      return {
        finalUnitPrice: unitPrice,
        savingPerUnit: 0,
        discountText: null,
        isDiscounted: false
      };
    }

    const str = String(discountRaw).trim();
    let finalUnitPrice = unitPrice;
    let discountText = '';

    // Case 1: Multi-tiered percentage e.g. "50%+20%" or "30%+10%+5%"
    if (str.includes('+')) {
      const parts = str.split('+').map(p => p.trim());
      let current = unitPrice;
      let validParts = [];

      parts.forEach(p => {
        const num = parseFloat(p.replace(/[^0-9.]/g, ''));
        if (!isNaN(num) && num > 0) {
          validParts.push(`${num}%`);
          current = current * (1 - num / 100);
        }
      });

      if (validParts.length > 0) {
        finalUnitPrice = Math.max(0, Math.round(current));
        discountText = validParts.join('+');
      }
    }
    // Case 2: Contains '%' symbol explicitly e.g. "25%" or "15.5%"
    else if (str.includes('%')) {
      const pct = parseFloat(str.replace(/[^0-9.]/g, ''));
      if (!isNaN(pct) && pct > 0) {
        finalUnitPrice = Math.max(0, Math.round(unitPrice * (1 - Math.min(100, pct) / 100)));
        discountText = `${pct}%`;
      }
    }
    // Case 3: Pure number without %
    else {
      const num = parseFloat(str.replace(/[^0-9.]/g, ''));
      if (!isNaN(num) && num > 0) {
        if (num <= 100) {
          // Rule: <= 100 treated as percentage discount
          finalUnitPrice = Math.max(0, Math.round(unitPrice * (1 - num / 100)));
          discountText = `${num}%`;
        } else {
          // Rule: > 100 treated as flat nominal Rupiah discount per unit
          finalUnitPrice = Math.max(0, Math.round(unitPrice - num));
          discountText = `-Rp ${formatRupiahNumber(num)}`;
        }
      }
    }

    const savingPerUnit = Math.max(0, unitPrice - finalUnitPrice);
    const isDiscounted = savingPerUnit > 0;

    return {
      finalUnitPrice,
      savingPerUnit,
      discountText: isDiscounted ? discountText : null,
      isDiscounted
    };
  },

  /**
   * Calculate single item subtotal & savings
   */
  getItemTotals(item) {
    const discountInfo = this.calculateDiscount(item.unitPrice, item.discountRaw);
    const finalUnit = discountInfo.finalUnitPrice;
    const subtotal = finalUnit * (item.qty || 1);
    const totalSaving = discountInfo.savingPerUnit * (item.qty || 1);

    return {
      finalUnitPrice: finalUnit,
      savingPerUnit: discountInfo.savingPerUnit,
      discountText: discountInfo.discountText,
      isDiscounted: discountInfo.isDiscounted,
      subtotal,
      totalSaving
    };
  }
};

// ==========================================
// 4. UTILITIES & FORMATTERS
// ==========================================
function formatRupiah(num) {
  const n = Math.round(Number(num) || 0);
  return 'Rp ' + n.toLocaleString('id-ID');
}

function formatRupiahNumber(num) {
  const n = Math.round(Number(num) || 0);
  return n.toLocaleString('id-ID');
}

function parseRupiahInput(val) {
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9]/g, '');
  return parseInt(cleaned, 10) || 0;
}

function formatDateIndo(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ==========================================
// 4.5. FIREBASE INTEGRATION & REALTIME CLOUD SYNC
// ==========================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBS7_CTSFuh8VWypwaJdjMoYogDFd6R9MI",
  authDomain: "groceryapp-f2201.firebaseapp.com",
  projectId: "groceryapp-f2201",
  storageBucket: "groceryapp-f2201.firebasestorage.app",
  messagingSenderId: "1036185409893",
  appId: "1:1036185409893:web:a9b36e78e420fed382698c"
};

class FirebaseSyncService {
  constructor() {
    this.db = null;
    this.sessionDocRef = null;
    this.store = null;
    this.debounceTimer = null;
    this.isApplyingCloudUpdate = false;
    this.status = 'initializing';
  }

  init(store) {
    this.store = store;

    // Check if Firebase Compat SDK is present
    if (typeof firebase === 'undefined') {
      console.warn('[Firebase] SDK is not loaded. Operating in Offline LocalStorage mode.');
      this.updateStatus('offline', 'Mode Lokal (Offline)');
      return;
    }

    try {
      // Initialize Firebase App
      const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(FIREBASE_CONFIG);
      this.db = firebase.firestore(app);

      // Enable offline IndexedDb persistence if supported
      try {
        this.db.enablePersistence({ synchronizeTabs: true }).catch(err => {
          if (err.code === 'failed-precondition') {
            console.info('[Firebase] Persistence enabled in another tab.');
          } else if (err.code === 'unimplemented') {
            console.info('[Firebase] Persistence not supported by current browser.');
          }
        });
      } catch (e) {
        // Ignored
      }

      // Target document for active session sync
      this.sessionDocRef = this.db.collection('grocery_sessions').doc('active_trip');

      this.updateStatus('connecting', 'Menghubungkan Cloud...');

      // Listen to online / offline events
      window.addEventListener('online', () => {
        this.updateStatus('connecting', 'Online, Menyinkronkan...');
        this.syncNow();
      });
      window.addEventListener('offline', () => {
        this.updateStatus('offline', 'Offline (Tersimpan Lokal)');
      });

      // Attach click on status pill to force sync
      const syncPill = document.getElementById('cloud-sync-pill');
      if (syncPill) {
        syncPill.style.cursor = 'pointer';
        syncPill.addEventListener('click', () => {
          feedback.tap();
          this.syncNow();
        });
      }

      // Start Realtime Firestore Listener
      this.listenToCloud();

    } catch (err) {
      console.error('[Firebase] Initialization error:', err);
      this.updateStatus('error', 'Error Firebase');
    }
  }

  listenToCloud() {
    if (!this.sessionDocRef) return;

    this.sessionDocRef.onSnapshot(
      { includeMetadataChanges: true },
      (snapshot) => {
        if (this.isApplyingCloudUpdate) return;

        if (snapshot.exists) {
          const cloudData = snapshot.data();
          const fromCache = snapshot.metadata.fromCache;
          const hasPendingWrites = snapshot.metadata.hasPendingWrites;

          this.applyCloudData(cloudData);

          if (hasPendingWrites) {
            this.updateStatus('syncing', 'Menyimpan ke Cloud...');
          } else if (fromCache) {
            this.updateStatus('synced', 'Tersinkron (Cache)');
          } else {
            this.updateStatus('synced', 'Tersinkron Cloud');
          }
        } else {
          // Document does not exist yet on cloud, seed with current local state
          this.syncNow();
        }
      },
      (error) => {
        console.warn('[Firebase] Firestore snapshot listener notice:', error.code, error.message);
        if (error.code === 'permission-denied') {
          this.updateStatus('offline', 'DB Perlu Rules Firestore');
        } else {
          this.updateStatus('offline', 'Mode Offline');
        }
      }
    );
  }

  applyCloudData(data) {
    if (!data || !this.store) return;
    this.isApplyingCloudUpdate = true;

    try {
      let stateChanged = false;

      // Sync Cart
      if (Array.isArray(data.cart)) {
        if (JSON.stringify(this.store.cart) !== JSON.stringify(data.cart)) {
          this.store.cart = data.cart;
          stateChanged = true;
        }
      }

      // Sync Budget Limit
      if (typeof data.budgetLimit === 'number' && this.store.budgetLimit !== data.budgetLimit) {
        this.store.budgetLimit = data.budgetLimit;
        stateChanged = true;
      }

      // Sync Price Lookup (merge to keep all past references)
      if (data.priceLookup && typeof data.priceLookup === 'object') {
        const mergedLookup = { ...this.store.priceLookup, ...data.priceLookup };
        if (JSON.stringify(this.store.priceLookup) !== JSON.stringify(mergedLookup)) {
          this.store.priceLookup = mergedLookup;
          stateChanged = true;
        }
      }

      // Sync History
      if (Array.isArray(data.history)) {
        if (JSON.stringify(this.store.history) !== JSON.stringify(data.history)) {
          this.store.history = data.history;
          stateChanged = true;
        }
      }

      if (stateChanged) {
        this.store.saveState();
        // Notify UI subscribers without triggering cloud write loop
        this.store.listeners.forEach(fn => fn(this.store));
      }
    } finally {
      this.isApplyingCloudUpdate = false;
    }
  }

  triggerDebouncedSync() {
    if (this.isApplyingCloudUpdate || !this.sessionDocRef) return;

    this.updateStatus('syncing', 'Menyimpan...');

    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.syncNow();
    }, 600); // 600ms debounce
  }

  async syncNow() {
    if (!this.sessionDocRef || !this.store) return;

    try {
      const payload = {
        cart: this.store.cart,
        budgetLimit: this.store.budgetLimit,
        priceLookup: this.store.priceLookup,
        history: this.store.history,
        updatedAt: Date.now()
      };

      await this.sessionDocRef.set(payload, { merge: true });
      this.updateStatus('synced', 'Tersinkron Cloud');
    } catch (err) {
      console.warn('[Firebase] Save error (handled gracefully):', err.code || err);
      if (err.code === 'permission-denied') {
        this.updateStatus('offline', 'DB Perlu Rules');
      } else {
        this.updateStatus('offline', 'Tersimpan Lokal');
      }
    }
  }

  updateStatus(status, label) {
    this.status = status;
    const dot = document.getElementById('cloud-sync-dot');
    const text = document.getElementById('cloud-sync-label');
    if (!dot || !text) return;

    text.textContent = label;

    dot.className = 'w-1.5 h-1.5 rounded-full';
    text.className = 'text-[9px] font-semibold';

    switch (status) {
      case 'synced':
        dot.className += ' bg-emerald-400';
        text.className += ' text-emerald-400';
        break;
      case 'syncing':
      case 'connecting':
        dot.className += ' bg-amber-400 animate-pulse';
        text.className += ' text-amber-300';
        break;
      case 'error':
        dot.className += ' bg-rose-400';
        text.className += ' text-rose-400';
        break;
      case 'offline':
      default:
        dot.className += ' bg-slate-400';
        text.className += ' text-slate-400';
        break;
    }
  }
}

// ==========================================
// 5. APPLICATION STATE STORE
// ==========================================
class GroceryStore {
  constructor() {
    this.cart = [];
    this.history = [];
    this.priceLookup = {};
    this.budgetLimit = 350000; // Default budget for Anak Kos
    this.currentTab = 'belanja'; // 'belanja' | 'riwayat' | 'anggaran'
    this.searchQuery = '';
    this.selectedCategory = 'all';
    this.listeners = [];

    this.loadState();
  }

  loadState() {
    try {
      const isInit = localStorage.getItem(STORAGE_KEYS.INITIALIZED);
      if (!isInit) {
        // First run: seed mock items & lookup
        this.cart = JSON.parse(JSON.stringify(MOCK_ITEMS));
        this.history = [
          {
            id: 'trip-prev-1',
            date: Date.now() - 30 * 24 * 3600 * 1000,
            monthName: 'Bulan Lalu (Belanja Bulanan Kos)',
            totalSpent: 312000,
            totalSaved: 42000,
            itemCount: 8,
            items: [
              { name: 'Beras Pulen Super 5kg', qty: 1, unit: 'pack', finalPrice: 68000, category: 'sembako' },
              { name: 'Minyak Goreng Sawit 2L', qty: 2, unit: 'liter', finalPrice: 42000, category: 'sembako' },
              { name: 'Sabun Mandi Cair Refill 450ml', qty: 1, unit: 'pack', finalPrice: 24000, category: 'kebersihan' },
              { name: 'Mie Instan Dus', qty: 1, unit: 'pack', finalPrice: 115000, category: 'makanan' },
              { name: 'Telur Ayam 1kg', qty: 1, unit: 'kg', finalPrice: 21000, category: 'sembako' }
            ]
          }
        ];
        this.priceLookup = JSON.parse(JSON.stringify(MOCK_LOOKUP));
        this.budgetLimit = 350000;
        this.saveState();
        localStorage.setItem(STORAGE_KEYS.INITIALIZED, 'true');
        return;
      }

      this.cart = JSON.parse(localStorage.getItem(STORAGE_KEYS.CART) || '[]');
      this.history = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '[]');
      this.priceLookup = JSON.parse(localStorage.getItem(STORAGE_KEYS.PRICE_LOOKUP) || '{}');
      this.budgetLimit = parseInt(localStorage.getItem(STORAGE_KEYS.BUDGET) || '350000', 10);
    } catch (e) {
      console.error('Error loading state from localStorage:', e);
      this.cart = JSON.parse(JSON.stringify(MOCK_ITEMS));
      this.history = [];
      this.priceLookup = JSON.parse(JSON.stringify(MOCK_LOOKUP));
      this.budgetLimit = 350000;
    }
  }

  saveState() {
    try {
      localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(this.cart));
      localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(this.history));
      localStorage.setItem(STORAGE_KEYS.PRICE_LOOKUP, JSON.stringify(this.priceLookup));
      localStorage.setItem(STORAGE_KEYS.BUDGET, this.budgetLimit.toString());
    } catch (e) {
      console.error('Error saving state:', e);
    }
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notify(syncCloud = true) {
    this.saveState();
    if (syncCloud && window.firebaseSync) {
      window.firebaseSync.triggerDebouncedSync();
    }
    this.listeners.forEach(fn => fn(this));
  }

  // --- Cart Calculations ---
  getCartSummary() {
    let totalSpent = 0;
    let totalSaved = 0;
    let totalItemsCount = 0;
    const categoryTotals = {};

    this.cart.forEach(item => {
      const { subtotal, totalSaving } = Calculator.getItemTotals(item);
      totalSpent += subtotal;
      totalSaved += totalSaving;
      totalItemsCount += (item.qty || 1);

      const cat = item.category || 'lainnya';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + subtotal;
    });

    const remainingBudget = this.budgetLimit - totalSpent;
    const budgetUsagePercent = this.budgetLimit > 0 ? (totalSpent / this.budgetLimit) * 100 : 100;

    let budgetStatus = 'safe'; // 'safe' (<80%), 'warning' (80-99%), 'danger' (>=100%)
    if (budgetUsagePercent >= 100) {
      budgetStatus = 'danger';
    } else if (budgetUsagePercent >= 80) {
      budgetStatus = 'warning';
    }

    return {
      totalSpent,
      totalSaved,
      totalItemsCount,
      remainingBudget,
      budgetUsagePercent: Math.min(100, Math.max(0, budgetUsagePercent)),
      rawPercentage: budgetUsagePercent,
      budgetStatus,
      categoryTotals
    };
  }

  // --- Auto-lookup product [F-01] ---
  lookupProduct(name) {
    if (!name || typeof name !== 'string') return null;
    const key = name.trim().toLowerCase();
    
    // Exact or normalized lookup
    if (this.priceLookup[key]) {
      return this.priceLookup[key];
    }

    // Partial prefix match
    const foundKey = Object.keys(this.priceLookup).find(k => k.includes(key) || key.includes(k));
    if (foundKey) {
      return this.priceLookup[foundKey];
    }
    return null;
  }

  // --- Cart Mutations ---
  addItem(itemData) {
    const newItem = {
      id: 'item_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      name: itemData.name.trim(),
      category: itemData.category || 'makanan',
      unit: itemData.unit || 'pcs',
      qty: Math.max(0.1, parseFloat(itemData.qty) || 1),
      unitPrice: parseRupiahInput(itemData.unitPrice),
      lastMonthPrice: itemData.lastMonthPrice ? parseRupiahInput(itemData.lastMonthPrice) : null,
      discountRaw: itemData.discountRaw ? String(itemData.discountRaw).trim() : '',
      createdAt: Date.now()
    };

    this.cart.unshift(newItem);
    this.notify();
    return newItem;
  }

  updateItem(id, updateData) {
    const idx = this.cart.findIndex(i => i.id === id);
    if (idx !== -1) {
      this.cart[idx] = {
        ...this.cart[idx],
        ...updateData,
        name: updateData.name ? updateData.name.trim() : this.cart[idx].name,
        unitPrice: updateData.unitPrice !== undefined ? parseRupiahInput(updateData.unitPrice) : this.cart[idx].unitPrice,
        lastMonthPrice: updateData.lastMonthPrice !== undefined ? (updateData.lastMonthPrice ? parseRupiahInput(updateData.lastMonthPrice) : null) : this.cart[idx].lastMonthPrice,
        discountRaw: updateData.discountRaw !== undefined ? String(updateData.discountRaw).trim() : this.cart[idx].discountRaw
      };
      this.notify();
    }
  }

  updateQty(id, delta) {
    const item = this.cart.find(i => i.id === id);
    if (!item) return;

    let newQty = item.qty + delta;
    if (item.unit === 'kg' || item.unit === 'liter') {
      newQty = Math.round(newQty * 10) / 10;
    } else {
      newQty = Math.round(newQty);
    }

    if (newQty <= 0) {
      // Trigger confirmation dialog in UI
      return { requestDelete: true, item };
    }

    item.qty = Math.max(0.1, newQty);
    this.notify();
    return { requestDelete: false, item };
  }

  deleteItem(id) {
    this.cart = this.cart.filter(i => i.id !== id);
    this.notify();
  }

  setBudget(newLimit) {
    this.budgetLimit = Math.max(0, parseRupiahInput(newLimit));
    this.notify();
  }

  /**
   * Finish and archive current shopping trip [F-06]
   */
  finishCurrentTrip() {
    if (this.cart.length === 0) return false;

    const summary = this.getCartSummary();
    const trip = {
      id: 'trip_' + Date.now(),
      date: Date.now(),
      monthName: 'Belanja Grosir ' + formatDateIndo(Date.now()),
      totalSpent: summary.totalSpent,
      totalSaved: summary.totalSaved,
      itemCount: summary.totalItemsCount,
      items: this.cart.map(item => {
        const itemTotals = Calculator.getItemTotals(item);
        return {
          name: item.name,
          category: item.category,
          unit: item.unit,
          qty: item.qty,
          originalPrice: item.unitPrice,
          finalPrice: itemTotals.finalUnitPrice,
          subtotal: itemTotals.subtotal,
          discountRaw: item.discountRaw
        };
      })
    };

    // Update historical price lookup for future auto-lookups
    this.cart.forEach(item => {
      const itemTotals = Calculator.getItemTotals(item);
      const key = item.name.trim().toLowerCase();
      this.priceLookup[key] = {
        price: itemTotals.finalUnitPrice, // Store final unit price as last month's reference
        originalPrice: item.unitPrice,
        unit: item.unit,
        category: item.category,
        lastUpdated: Date.now()
      };
    });

    // Archive trip
    this.history.unshift(trip);
    // Clear active cart
    this.cart = [];
    
    this.notify();
    return trip;
  }

  deleteTrip(tripId) {
    this.history = this.history.filter(t => t.id !== tripId);
    this.notify();
  }

  clearHistory() {
    this.history = [];
    this.notify();
  }
}

// Global store instance
const store = new GroceryStore();

// ==========================================
// 6. UI RENDERER & INTERACTION CONTROLLER
// ==========================================
class GroceryApp {
  constructor() {
    this.editingItemId = null;
    this.pendingDeleteItem = null;
    this.overbudgetWarningSuppressed = false;

    this.initElements();
    this.bindEvents();
    this.initPWA();

    // Subscribe UI to store state changes
    store.subscribe(() => {
      this.render();
    });

    // Initial render
    this.render();
  }

  initElements() {
    // Navigation tabs
    this.navBelanja = document.getElementById('nav-belanja');
    this.navRiwayat = document.getElementById('nav-riwayat');
    this.navAnggaran = document.getElementById('nav-anggaran');

    // Tab sections
    this.tabBelanja = document.getElementById('tab-belanja-content');
    this.tabRiwayat = document.getElementById('tab-riwayat-content');
    this.tabAnggaran = document.getElementById('tab-anggaran-content');

    // Sticky Header Elements
    this.headerTotalSpent = document.getElementById('header-total-spent');
    this.headerBudgetLimit = document.getElementById('header-budget-limit');
    this.headerRemaining = document.getElementById('header-remaining');
    this.headerRemainingLabel = document.getElementById('header-remaining-label');
    this.headerProgressBar = document.getElementById('header-progress-bar');
    this.headerProgressPercent = document.getElementById('header-progress-percent');
    this.headerStatusBadge = document.getElementById('header-status-badge');
    this.headerContainer = document.getElementById('sticky-header-container');

    // Cart Elements
    this.cartItemList = document.getElementById('cart-item-list');
    this.cartEmptyState = document.getElementById('cart-empty-state');
    this.categoryFiltersContainer = document.getElementById('category-filters');
    this.searchInput = document.getElementById('search-input');
    this.clearSearchBtn = document.getElementById('clear-search-btn');
    this.finishShoppingBtn = document.getElementById('btn-finish-shopping');
    this.totalSavedBadge = document.getElementById('total-saved-badge');
    this.floatingAddBtn = document.getElementById('floating-add-btn');

    // Modal Elements: Add / Edit Item
    this.modalItem = document.getElementById('modal-item');
    this.modalItemTitle = document.getElementById('modal-item-title');
    this.formItem = document.getElementById('form-item');
    this.inputItemName = document.getElementById('item-name');
    this.inputItemCategory = document.getElementById('item-category');
    this.inputItemUnit = document.getElementById('item-unit');
    this.inputItemQty = document.getElementById('item-qty');
    this.inputItemPrice = document.getElementById('item-price');
    this.inputItemLastPrice = document.getElementById('item-last-price');
    this.inputItemDiscount = document.getElementById('item-discount');
    this.autoLookupNotice = document.getElementById('auto-lookup-notice');
    this.modalPreviewSubtotal = document.getElementById('modal-preview-subtotal');
    this.modalPreviewSaving = document.getElementById('modal-preview-saving');
    this.modalCloseBtn = document.getElementById('modal-close-btn');

    // Modal: Budget Edit
    this.modalBudget = document.getElementById('modal-budget');
    this.inputBudget = document.getElementById('input-budget');
    this.formBudget = document.getElementById('form-budget');
    this.btnOpenBudgetModal = document.getElementById('btn-open-budget-modal');

    // Modal: Overbudget Danger Warning [F-05]
    this.modalDanger = document.getElementById('modal-danger');
    this.dangerSpentText = document.getElementById('danger-spent-text');
    this.dangerLimitText = document.getElementById('danger-limit-text');
    this.dangerOverAmount = document.getElementById('danger-over-amount');
    this.btnDangerProceed = document.getElementById('btn-danger-proceed');
    this.btnDangerAdjust = document.getElementById('btn-danger-adjust');

    // Modal: Confirm Delete
    this.modalConfirmDelete = document.getElementById('modal-confirm-delete');
    this.deleteItemNameText = document.getElementById('delete-item-name-text');
    this.btnConfirmDelete = document.getElementById('btn-confirm-delete');
    this.btnCancelDelete = document.getElementById('btn-cancel-delete');

    // Modal: Finish Trip Celebration
    this.modalFinishTrip = document.getElementById('modal-finish-trip');
    this.finishSummaryTotal = document.getElementById('finish-summary-total');
    this.finishSummarySaved = document.getElementById('finish-summary-saved');
    this.finishSummaryCount = document.getElementById('finish-summary-count');
    this.btnFinishDone = document.getElementById('btn-finish-done');

    // Riwayat Tab Elements
    this.historyList = document.getElementById('history-list');
    this.historyEmptyState = document.getElementById('history-empty-state');
    this.historyTotalTrips = document.getElementById('history-total-trips');
    this.historyAllSpent = document.getElementById('history-all-spent');

    // Anggaran Tab Elements
    this.budgetPageLimit = document.getElementById('budget-page-limit');
    this.budgetPageCurrent = document.getElementById('budget-page-current');
    this.budgetPageRemaining = document.getElementById('budget-page-remaining');
    this.budgetPagePercent = document.getElementById('budget-page-percent');
    this.budgetBreakdownContainer = document.getElementById('budget-breakdown-container');
    this.budgetGaugeBar = document.getElementById('budget-gauge-bar');
  }

  bindEvents() {
    // Navigation Tabs
    this.navBelanja.addEventListener('click', () => this.switchTab('belanja'));
    this.navRiwayat.addEventListener('click', () => this.switchTab('riwayat'));
    this.navAnggaran.addEventListener('click', () => this.switchTab('anggaran'));

    // Floating Add Button
    this.floatingAddBtn.addEventListener('click', () => {
      feedback.tap();
      this.openAddItemModal();
    });

    // Close Modal Button
    this.modalCloseBtn.addEventListener('click', () => {
      feedback.tap();
      this.closeItemModal();
    });

    // Modal backdrop click
    this.modalItem.addEventListener('click', (e) => {
      if (e.target === this.modalItem) this.closeItemModal();
    });
    this.modalBudget.addEventListener('click', (e) => {
      if (e.target === this.modalBudget) this.closeBudgetModal();
    });
    this.modalDanger.addEventListener('click', (e) => {
      if (e.target === this.modalDanger) this.closeDangerModal();
    });
    this.modalConfirmDelete.addEventListener('click', (e) => {
      if (e.target === this.modalConfirmDelete) this.closeConfirmDeleteModal();
    });
    this.modalFinishTrip.addEventListener('click', (e) => {
      if (e.target === this.modalFinishTrip) this.closeFinishTripModal();
    });

    // Search Input
    this.searchInput.addEventListener('input', (e) => {
      store.searchQuery = e.target.value.toLowerCase().trim();
      this.clearSearchBtn.classList.toggle('hidden', !e.target.value);
      this.renderCartList();
    });

    this.clearSearchBtn.addEventListener('click', () => {
      feedback.tap();
      this.searchInput.value = '';
      store.searchQuery = '';
      this.clearSearchBtn.classList.add('hidden');
      this.renderCartList();
    });

    // Auto-Lookup on typing product name [F-01]
    this.inputItemName.addEventListener('input', (e) => {
      this.handleProductLookup(e.target.value);
      this.updateModalCalculationPreview();
    });

    // Live preview inside Add/Edit Item modal
    [this.inputItemPrice, this.inputItemDiscount, this.inputItemQty].forEach(el => {
      el.addEventListener('input', () => {
        this.updateModalCalculationPreview();
      });
    });

    // Modal Stepper inside modal
    document.getElementById('modal-qty-minus')?.addEventListener('click', () => {
      let q = parseFloat(this.inputItemQty.value) || 1;
      if (q > 1) {
        feedback.decrement();
        this.inputItemQty.value = Math.max(1, Math.round(q - 1));
        this.updateModalCalculationPreview();
      }
    });
    document.getElementById('modal-qty-plus')?.addEventListener('click', () => {
      feedback.increment();
      let q = parseFloat(this.inputItemQty.value) || 1;
      this.inputItemQty.value = Math.round(q + 1);
      this.updateModalCalculationPreview();
    });

    // Form Submit: Add / Edit Item
    this.formItem.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleItemFormSubmit();
    });

    // Budget Header Click to Open Budget Modal
    this.btnOpenBudgetModal.addEventListener('click', () => {
      feedback.tap();
      this.openBudgetModal();
    });

    // Form Budget Submit
    this.formBudget.addEventListener('submit', (e) => {
      e.preventDefault();
      feedback.success();
      const val = parseRupiahInput(this.inputBudget.value);
      store.setBudget(val);
      this.closeBudgetModal();
    });

    // Quick Budget Preset Buttons
    document.querySelectorAll('.budget-preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        feedback.tap();
        const amt = btn.dataset.amount;
        this.inputBudget.value = formatRupiahNumber(amt);
      });
    });

    // Danger Modal Actions [F-05]
    this.btnDangerProceed.addEventListener('click', () => {
      feedback.tap();
      this.overbudgetWarningSuppressed = true;
      this.closeDangerModal();
    });

    this.btnDangerAdjust.addEventListener('click', () => {
      feedback.tap();
      this.closeDangerModal();
      // Scroll to top or highlight items
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // Confirm Delete Actions
    this.btnConfirmDelete.addEventListener('click', () => {
      if (this.pendingDeleteItem) {
        feedback.tap();
        store.deleteItem(this.pendingDeleteItem.id);
        this.pendingDeleteItem = null;
      }
      this.closeConfirmDeleteModal();
    });

    this.btnCancelDelete.addEventListener('click', () => {
      feedback.tap();
      this.pendingDeleteItem = null;
      this.closeConfirmDeleteModal();
    });

    // Finish Shopping Trip [F-06]
    this.finishShoppingBtn.addEventListener('click', () => {
      this.handleFinishShopping();
    });

    this.btnFinishDone.addEventListener('click', () => {
      feedback.tap();
      this.closeFinishTripModal();
      this.switchTab('riwayat');
    });

    // Format currency inputs on blur / input
    this.inputItemPrice.addEventListener('blur', (e) => {
      const val = parseRupiahInput(e.target.value);
      if (val > 0) e.target.value = formatRupiahNumber(val);
    });
    this.inputItemLastPrice.addEventListener('blur', (e) => {
      const val = parseRupiahInput(e.target.value);
      if (val > 0) e.target.value = formatRupiahNumber(val);
    });
    this.inputBudget.addEventListener('blur', (e) => {
      const val = parseRupiahInput(e.target.value);
      if (val > 0) e.target.value = formatRupiahNumber(val);
    });
  }

  // ==========================================
  // PWA REGISTRATION & OFFLINE READY
  // ==========================================
  initPWA() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => {
            console.log('GrocerySafe PWA Service Worker registered:', reg.scope);
          })
          .catch(err => {
            console.warn('PWA registration failed (acceptable in non-https local dev):', err);
          });
      });
    }

    // Dynamic theme-color updates
    this.updateThemeColor('#0F172A');
  }

  updateThemeColor(color) {
    let metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) {
      metaTheme = document.createElement('meta');
      metaTheme.name = 'theme-color';
      document.head.appendChild(metaTheme);
    }
    metaTheme.setAttribute('content', color);
  }

  // ==========================================
  // NAVIGATION & TAB SWITCHING
  // ==========================================
  switchTab(tab) {
    feedback.tap();
    store.currentTab = tab;

    // Reset styles
    [this.navBelanja, this.navRiwayat, this.navAnggaran].forEach(el => {
      el.classList.remove('text-emerald-400', 'font-bold');
      el.classList.add('text-slate-400');
      const icon = el.querySelector('.nav-icon-container');
      if (icon) {
        icon.classList.remove('bg-emerald-500/20', 'text-emerald-400', 'ring-2', 'ring-emerald-500/40');
      }
    });

    [this.tabBelanja, this.tabRiwayat, this.tabAnggaran].forEach(el => {
      el.classList.add('hidden');
    });

    // Activate active tab
    if (tab === 'belanja') {
      this.tabBelanja.classList.remove('hidden');
      this.navBelanja.classList.add('text-emerald-400', 'font-bold');
      this.navBelanja.classList.remove('text-slate-400');
      this.navBelanja.querySelector('.nav-icon-container')?.classList.add('bg-emerald-500/20', 'text-emerald-400', 'ring-2', 'ring-emerald-500/40');
      this.floatingAddBtn.classList.remove('hidden');
    } else if (tab === 'riwayat') {
      this.tabRiwayat.classList.remove('hidden');
      this.navRiwayat.classList.add('text-emerald-400', 'font-bold');
      this.navRiwayat.classList.remove('text-slate-400');
      this.navRiwayat.querySelector('.nav-icon-container')?.classList.add('bg-emerald-500/20', 'text-emerald-400', 'ring-2', 'ring-emerald-500/40');
      this.floatingAddBtn.classList.add('hidden');
      this.renderHistoryList();
    } else if (tab === 'anggaran') {
      this.tabAnggaran.classList.remove('hidden');
      this.navAnggaran.classList.add('text-emerald-400', 'font-bold');
      this.navAnggaran.classList.remove('text-slate-400');
      this.navAnggaran.querySelector('.nav-icon-container')?.classList.add('bg-emerald-500/20', 'text-emerald-400', 'ring-2', 'ring-emerald-500/40');
      this.floatingAddBtn.classList.add('hidden');
      this.renderAnggaranPage();
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // ==========================================
  // AUTO LOOKUP [F-01]
  // ==========================================
  handleProductLookup(typedName) {
    const found = store.lookupProduct(typedName);
    if (found && typedName.trim().length >= 3) {
      this.autoLookupNotice.innerHTML = `
        <div class="flex items-center gap-1.5 text-xs text-cyan-300 bg-cyan-950/60 border border-cyan-800/60 rounded-lg px-2.5 py-1.5 animate-fadeIn">
          <i data-lucide="sparkles" class="w-3.5 h-3.5 text-cyan-400 shrink-0"></i>
          <span>Ditemukan riwayat: <b>${formatRupiah(found.price)}</b> / ${found.unit || 'pcs'}</span>
        </div>
      `;
      this.autoLookupNotice.classList.remove('hidden');

      // Autofill lastMonthPrice if currently empty
      if (!this.inputItemLastPrice.value || this.inputItemLastPrice.value === '0') {
        this.inputItemLastPrice.value = formatRupiahNumber(found.price);
      }
      // Autofill unit and category if default
      if (found.category && this.inputItemCategory.value === 'makanan') {
        this.inputItemCategory.value = found.category;
      }
      if (found.unit) {
        this.inputItemUnit.value = found.unit;
      }
      if (window.lucide) window.lucide.createIcons();
    } else {
      this.autoLookupNotice.classList.add('hidden');
    }
  }

  updateModalCalculationPreview() {
    const unitPrice = parseRupiahInput(this.inputItemPrice.value);
    const qty = parseFloat(this.inputItemQty.value) || 1;
    const discountRaw = this.inputItemDiscount.value;

    const discountInfo = Calculator.calculateDiscount(unitPrice, discountRaw);
    const subtotal = discountInfo.finalUnitPrice * qty;
    const totalSaving = discountInfo.savingPerUnit * qty;

    this.modalPreviewSubtotal.textContent = formatRupiah(subtotal);
    if (totalSaving > 0) {
      this.modalPreviewSaving.textContent = `Hemat: ${formatRupiah(totalSaving)} (${discountInfo.discountText})`;
      this.modalPreviewSaving.classList.remove('hidden');
    } else {
      this.modalPreviewSaving.classList.add('hidden');
    }
  }

  // ==========================================
  // MODAL CONTROLS: ADD / EDIT
  // ==========================================
  openAddItemModal(itemToEdit = null) {
    this.editingItemId = itemToEdit ? itemToEdit.id : null;
    this.formItem.reset();
    this.autoLookupNotice.classList.add('hidden');

    if (itemToEdit) {
      this.modalItemTitle.textContent = 'Edit Barang Belanja';
      this.inputItemName.value = itemToEdit.name;
      this.inputItemCategory.value = itemToEdit.category;
      this.inputItemUnit.value = itemToEdit.unit;
      this.inputItemQty.value = itemToEdit.qty;
      this.inputItemPrice.value = formatRupiahNumber(itemToEdit.unitPrice);
      this.inputItemLastPrice.value = itemToEdit.lastMonthPrice ? formatRupiahNumber(itemToEdit.lastMonthPrice) : '';
      this.inputItemDiscount.value = itemToEdit.discountRaw || '';
    } else {
      this.modalItemTitle.textContent = 'Tambah Barang Baru';
      this.inputItemQty.value = '1';
      this.inputItemCategory.value = 'sembako';
      this.inputItemUnit.value = 'pcs';
      this.inputItemDiscount.value = '';
    }

    this.updateModalCalculationPreview();
    this.modalItem.classList.remove('hidden');
    
    // Quick focus
    setTimeout(() => {
      this.inputItemName.focus();
    }, 100);

    if (window.lucide) window.lucide.createIcons();
  }

  closeItemModal() {
    this.modalItem.classList.add('hidden');
    this.editingItemId = null;
  }

  handleItemFormSubmit() {
    const name = this.inputItemName.value.trim();
    if (!name) {
      alert('Nama barang wajib diisi!');
      return;
    }

    const price = parseRupiahInput(this.inputItemPrice.value);
    if (price <= 0) {
      alert('Harga satuan harus lebih dari Rp 0!');
      return;
    }

    const itemData = {
      name,
      category: this.inputItemCategory.value,
      unit: this.inputItemUnit.value,
      qty: parseFloat(this.inputItemQty.value) || 1,
      unitPrice: price,
      lastMonthPrice: this.inputItemLastPrice.value ? parseRupiahInput(this.inputItemLastPrice.value) : null,
      discountRaw: this.inputItemDiscount.value.trim()
    };

    if (this.editingItemId) {
      store.updateItem(this.editingItemId, itemData);
      feedback.tap();
    } else {
      store.addItem(itemData);
      feedback.increment();

      // Check if newly added item pushed total into overbudget [F-05]
      const summary = store.getCartSummary();
      if (summary.budgetStatus === 'danger' && !this.overbudgetWarningSuppressed) {
        this.triggerOverbudgetDanger(summary);
      }
    }

    this.closeItemModal();
  }

  // ==========================================
  // BUDGET EDIT MODAL
  // ==========================================
  openBudgetModal() {
    this.inputBudget.value = formatRupiahNumber(store.budgetLimit);
    this.modalBudget.classList.remove('hidden');
    setTimeout(() => this.inputBudget.focus(), 100);
  }

  closeBudgetModal() {
    this.modalBudget.classList.add('hidden');
  }

  // ==========================================
  // DANGER MODAL [F-05]
  // ==========================================
  triggerOverbudgetDanger(summary) {
    feedback.dangerAlert();
    this.dangerSpentText.textContent = formatRupiah(summary.totalSpent);
    this.dangerLimitText.textContent = formatRupiah(store.budgetLimit);
    const deficit = Math.abs(summary.remainingBudget);
    this.dangerOverAmount.textContent = formatRupiah(deficit);

    this.modalDanger.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  closeDangerModal() {
    this.modalDanger.classList.add('hidden');
  }

  // ==========================================
  // CONFIRM DELETE MODAL
  // ==========================================
  openConfirmDeleteModal(item) {
    this.pendingDeleteItem = item;
    this.deleteItemNameText.textContent = `"${item.name}"`;
    this.modalConfirmDelete.classList.remove('hidden');
  }

  closeConfirmDeleteModal() {
    this.modalConfirmDelete.classList.add('hidden');
    this.pendingDeleteItem = null;
  }

  // ==========================================
  // FINISH TRIP MODAL [F-06]
  // ==========================================
  handleFinishShopping() {
    if (store.cart.length === 0) {
      alert('Keranjang belanja masih kosong!');
      return;
    }

    const confirmFinish = confirm('Apakah Anda yakin ingin menyelesaikan dan menyimpan belanjaan hari ini? Seluruh item akan diarsipkan ke Tab Riwayat dan harga terbarunya akan disimpan sebagai acuan bulan depan.');
    if (!confirmFinish) return;

    feedback.success();
    const trip = store.finishCurrentTrip();

    this.finishSummaryTotal.textContent = formatRupiah(trip.totalSpent);
    this.finishSummarySaved.textContent = formatRupiah(trip.totalSaved);
    this.finishSummaryCount.textContent = `${trip.itemCount} Barang`;

    this.modalFinishTrip.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  closeFinishTripModal() {
    this.modalFinishTrip.classList.add('hidden');
  }

  // ==========================================
  // MAIN RENDER METHOD
  // ==========================================
  render() {
    this.renderHeaderBudget();
    this.renderCategoryFilters();
    this.renderCartList();

    if (store.currentTab === 'riwayat') {
      this.renderHistoryList();
    } else if (store.currentTab === 'anggaran') {
      this.renderAnggaranPage();
    }

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  // ==========================================
  // STICKY HEADER & BUDGET SAFETY [F-05]
  // ==========================================
  renderHeaderBudget() {
    const summary = store.getCartSummary();

    this.headerTotalSpent.textContent = formatRupiah(summary.totalSpent);
    this.headerBudgetLimit.textContent = formatRupiah(store.budgetLimit);

    // Remaining cash & dynamic status
    if (summary.remainingBudget >= 0) {
      this.headerRemaining.textContent = formatRupiah(summary.remainingBudget);
      this.headerRemaining.classList.remove('text-rose-400');
      this.headerRemaining.classList.add('text-emerald-400');
      this.headerRemainingLabel.textContent = 'Sisa Anggaran';
    } else {
      this.headerRemaining.textContent = `- ${formatRupiah(Math.abs(summary.remainingBudget))}`;
      this.headerRemaining.classList.remove('text-emerald-400');
      this.headerRemaining.classList.add('text-rose-400');
      this.headerRemainingLabel.textContent = 'Defisit Overbudget!';
    }

    // Progress bar width & color
    this.headerProgressBar.style.width = `${summary.budgetUsagePercent}%`;
    this.headerProgressPercent.textContent = `${Math.round(summary.rawPercentage)}%`;

    // Remove existing warning states
    this.headerContainer.classList.remove('animate-danger-pulse', 'border-rose-500/70', 'border-amber-500/50');
    this.headerProgressBar.classList.remove('bg-emerald-500', 'bg-amber-500', 'bg-rose-500');

    if (summary.budgetStatus === 'safe') {
      // HIJAU (< 80%)
      this.headerProgressBar.classList.add('bg-emerald-500');
      this.headerStatusBadge.className = 'text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1';
      this.headerStatusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Aman`;
    } else if (summary.budgetStatus === 'warning') {
      // KUNING / ORANYE (80% - 99%)
      this.headerProgressBar.classList.add('bg-amber-500');
      this.headerContainer.classList.add('border-amber-500/50');
      this.headerStatusBadge.className = 'text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1 animate-soft-pulse';
      this.headerStatusBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Waspada (${Math.round(summary.rawPercentage)}%)`;
    } else {
      // MERAH + DANGER PULSE (>= 100%)
      this.headerProgressBar.classList.add('bg-rose-500');
      this.headerContainer.classList.add('animate-danger-pulse', 'border-rose-500/70');
      this.headerStatusBadge.className = 'text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-500 text-white flex items-center gap-1';
      this.headerStatusBadge.innerHTML = `<i data-lucide="alert-triangle" class="w-3 h-3"></i> OVERBUDGET!`;
    }

    // Total saved badge
    if (summary.totalSaved > 0) {
      this.totalSavedBadge.innerHTML = `
        <div class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-semibold">
          <i data-lucide="tag" class="w-3.5 h-3.5 text-emerald-400"></i>
          <span>Total Hemat: ${formatRupiah(summary.totalSaved)}</span>
        </div>
      `;
      this.totalSavedBadge.classList.remove('hidden');
    } else {
      this.totalSavedBadge.classList.add('hidden');
    }
  }

  // ==========================================
  // CATEGORY FILTER PILLS
  // ==========================================
  renderCategoryFilters() {
    this.categoryFiltersContainer.innerHTML = '';

    CATEGORIES.forEach(cat => {
      const isSelected = store.selectedCategory === cat.id;
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 flex items-center gap-1.5 tap-effect ${
        isSelected
          ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
          : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700/80 border border-slate-700/50'
      }`;
      pill.innerHTML = `
        <i data-lucide="${cat.icon}" class="w-3.5 h-3.5"></i>
        <span>${cat.name}</span>
      `;

      pill.addEventListener('click', () => {
        feedback.tap();
        store.selectedCategory = cat.id;
        this.renderCategoryFilters();
        this.renderCartList();
      });

      this.categoryFiltersContainer.appendChild(pill);
    });
  }

  // ==========================================
  // CART LIST & ITEM CARDS [F-02, F-03, F-04]
  // ==========================================
  renderCartList() {
    // Filter by category and search query
    let filtered = store.cart;
    if (store.selectedCategory !== 'all') {
      filtered = filtered.filter(i => i.category === store.selectedCategory);
    }
    if (store.searchQuery) {
      filtered = filtered.filter(i => i.name.toLowerCase().includes(store.searchQuery));
    }

    if (store.cart.length === 0) {
      this.cartEmptyState.classList.remove('hidden');
      this.cartItemList.innerHTML = '';
      this.finishShoppingBtn.disabled = true;
      this.finishShoppingBtn.classList.add('opacity-50', 'pointer-events-none');
      return;
    }

    this.finishShoppingBtn.disabled = false;
    this.finishShoppingBtn.classList.remove('opacity-50', 'pointer-events-none');

    if (filtered.length === 0) {
      this.cartEmptyState.classList.add('hidden');
      this.cartItemList.innerHTML = `
        <div class="py-12 text-center text-slate-400">
          <i data-lucide="search-x" class="w-10 h-10 mx-auto mb-2 text-slate-500"></i>
          <p class="text-sm font-medium">Tidak ada barang yang cocok dengan "${store.searchQuery}"</p>
          <button type="button" class="mt-3 text-xs text-emerald-400 underline font-semibold" id="btn-reset-filters">Reset Pencarian & Kategori</button>
        </div>
      `;
      document.getElementById('btn-reset-filters')?.addEventListener('click', () => {
        store.searchQuery = '';
        store.selectedCategory = 'all';
        this.searchInput.value = '';
        this.clearSearchBtn.classList.add('hidden');
        this.render();
      });
      if (window.lucide) window.lucide.createIcons();
      return;
    }

    this.cartEmptyState.classList.add('hidden');
    this.cartItemList.innerHTML = '';

    filtered.forEach(item => {
      const card = this.createItemCard(item);
      this.cartItemList.appendChild(card);
    });

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  createItemCard(item) {
    const card = document.createElement('div');
    card.className = 'grocery-card relative bg-slate-900/90 border border-slate-800/90 rounded-2xl p-3.5 shadow-lg backdrop-blur-md hover:border-slate-700/80 transition-all';
    card.dataset.itemId = item.id;

    const totals = Calculator.getItemTotals(item);
    const catObj = CATEGORIES.find(c => c.id === item.category) || CATEGORIES[CATEGORIES.length - 1];

    // ==========================================
    // [F-04] Price Comparator Badge
    // ==========================================
    let priceComparatorBadge = '';
    if (item.lastMonthPrice !== null && item.lastMonthPrice !== undefined && item.lastMonthPrice > 0) {
      const diff = item.unitPrice - item.lastMonthPrice;
      if (diff > 0) {
        // Red Arrow UP: Lebih Mahal
        priceComparatorBadge = `
          <span class="inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30">
            <i data-lucide="trending-up" class="w-3 h-3 text-rose-400"></i>
            +${formatRupiah(diff)} (Naik)
          </span>
        `;
      } else if (diff < 0) {
        // Green Arrow DOWN: Lebih Murah
        priceComparatorBadge = `
          <span class="inline-flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <i data-lucide="trending-down" class="w-3 h-3 text-emerald-400"></i>
            -${formatRupiah(Math.abs(diff))} (Turun)
          </span>
        `;
      } else {
        // Gray Equal Sign: Stabil / Sama
        priceComparatorBadge = `
          <span class="inline-flex items-center gap-0.5 text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-700/40 text-slate-300 border border-slate-600/40">
            <i data-lucide="equal" class="w-3 h-3 text-slate-400"></i>
            Sama dgn bln lalu
          </span>
        `;
      }
    } else {
      // Blue Badge: Barang Baru
      priceComparatorBadge = `
        <span class="inline-flex items-center gap-0.5 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30">
          <i data-lucide="sparkle" class="w-3 h-3 text-sky-400"></i>
          Barang Baru
        </span>
      `;
    }

    // ==========================================
    // [F-03] Discount Badge & Price Display
    // ==========================================
    let discountBadgeHtml = '';
    let unitPriceHtml = '';

    if (totals.isDiscounted) {
      discountBadgeHtml = `
        <span class="inline-flex items-center gap-1 text-[11px] font-extrabold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40">
          <i data-lucide="percent" class="w-3 h-3 text-amber-400"></i>
          Diskon ${totals.discountText}
        </span>
        <span class="text-[11px] font-semibold text-emerald-400">
          Hemat ${formatRupiah(totals.totalSaving)}
        </span>
      `;
      unitPriceHtml = `
        <div class="flex items-baseline gap-1.5 flex-wrap">
          <span class="text-sm font-bold text-emerald-300 font-mono-num">${formatRupiah(totals.finalUnitPrice)}</span>
          <span class="text-xs text-slate-500 line-through font-mono-num">${formatRupiah(item.unitPrice)}</span>
          <span class="text-xs text-slate-400">/${item.unit}</span>
        </div>
      `;
    } else {
      unitPriceHtml = `
        <div class="flex items-baseline gap-1">
          <span class="text-sm font-semibold text-slate-200 font-mono-num">${formatRupiah(item.unitPrice)}</span>
          <span class="text-xs text-slate-400">/${item.unit}</span>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="flex items-start justify-between gap-2 mb-2">
        <div class="flex-1 min-w-0">
          <!-- Category & Price Comparator Badges -->
          <div class="flex items-center gap-1.5 flex-wrap mb-1">
            <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border ${catObj.color}">
              ${catObj.name}
            </span>
            ${priceComparatorBadge}
          </div>

          <!-- Product Name & Unit Price -->
          <h3 class="text-base font-bold text-slate-100 truncate pr-2 item-title cursor-pointer" title="${item.name}">
            ${item.name}
          </h3>
          ${unitPriceHtml}

          <!-- Discount Tag if applied -->
          <div class="flex items-center gap-2 mt-1 flex-wrap">
            ${discountBadgeHtml}
          </div>
        </div>

        <!-- Quick Edit & Delete Buttons -->
        <div class="flex items-center gap-1 shrink-0">
          <button type="button" class="btn-edit-item touch-target w-8 h-8 rounded-lg bg-slate-800/80 text-slate-300 hover:text-emerald-400 hover:bg-slate-700 tap-effect" title="Edit Barang">
            <i data-lucide="edit-3" class="w-4 h-4"></i>
          </button>
          <button type="button" class="btn-delete-item touch-target w-8 h-8 rounded-lg bg-slate-800/80 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 tap-effect" title="Hapus Barang">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </div>

      <!-- Bottom Card: Subtotal & Large Stepper [F-02] -->
      <div class="pt-2 mt-2 border-t border-slate-800/80 flex items-center justify-between gap-3">
        <!-- Subtotal calculation -->
        <div>
          <span class="text-[11px] text-slate-400 block font-medium">Subtotal</span>
          <span class="text-base font-extrabold text-slate-50 font-mono-num tracking-tight">${formatRupiah(totals.subtotal)}</span>
        </div>

        <!-- Thumb-Friendly Large Quantity Stepper (min 44x44px) -->
        <div class="flex items-center bg-slate-800/90 rounded-xl p-1 border border-slate-700/60 shadow-inner">
          <button type="button" class="btn-stepper-minus touch-target w-11 h-11 rounded-lg bg-slate-700/70 text-slate-200 active:bg-rose-600 active:text-white tap-effect font-black text-xl flex items-center justify-center">
            <i data-lucide="minus" class="w-5 h-5"></i>
          </button>
          <div class="w-12 text-center">
            <span class="font-extrabold text-base text-slate-100 font-mono-num">${item.qty}</span>
            <span class="text-[10px] text-slate-400 block -mt-1">${item.unit}</span>
          </div>
          <button type="button" class="btn-stepper-plus touch-target w-11 h-11 rounded-lg bg-emerald-600 text-slate-950 active:bg-emerald-400 tap-effect font-black text-xl flex items-center justify-center shadow-sm">
            <i data-lucide="plus" class="w-5 h-5"></i>
          </button>
        </div>
      </div>
    `;

    // Event Bindings for Card Actions
    const minusBtn = card.querySelector('.btn-stepper-minus');
    const plusBtn = card.querySelector('.btn-stepper-plus');
    const editBtn = card.querySelector('.btn-edit-item');
    const deleteBtn = card.querySelector('.btn-delete-item');
    const titleEl = card.querySelector('.item-title');

    minusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const res = store.updateQty(item.id, -1);
      if (res && res.requestDelete) {
        feedback.tap();
        this.openConfirmDeleteModal(item);
      } else {
        feedback.decrement();
      }
    });

    plusBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      feedback.increment();
      store.updateQty(item.id, 1);

      // Check if increment caused overbudget [F-05]
      const summary = store.getCartSummary();
      if (summary.budgetStatus === 'danger' && !this.overbudgetWarningSuppressed) {
        this.triggerOverbudgetDanger(summary);
      }
    });

    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      feedback.tap();
      this.openAddItemModal(item);
    });

    titleEl.addEventListener('click', () => {
      feedback.tap();
      this.openAddItemModal(item);
    });

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      feedback.tap();
      this.openConfirmDeleteModal(item);
    });

    return card;
  }

  // ==========================================
  // TAB [RIWAYAT] RENDERER [F-06]
  // ==========================================
  renderHistoryList() {
    const totalTrips = store.history.length;
    let allSpent = 0;
    store.history.forEach(t => allSpent += (t.totalSpent || 0));

    this.historyTotalTrips.textContent = `${totalTrips} Kali Belanja`;
    this.historyAllSpent.textContent = formatRupiah(allSpent);

    if (totalTrips === 0) {
      this.historyEmptyState.classList.remove('hidden');
      this.historyList.innerHTML = '';
      return;
    }

    this.historyEmptyState.classList.add('hidden');
    this.historyList.innerHTML = '';

    store.history.forEach((trip, index) => {
      const tripCard = document.createElement('div');
      tripCard.className = 'bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-md backdrop-blur-sm';

      let itemsHtml = '';
      if (trip.items && trip.items.length > 0) {
        itemsHtml = trip.items.map(it => `
          <div class="flex items-center justify-between text-xs py-1 border-b border-slate-800/60 last:border-0">
            <div class="truncate max-w-[200px]">
              <span class="text-slate-200 font-medium">${it.name}</span>
              <span class="text-slate-400"> (${it.qty} ${it.unit || 'pcs'})</span>
            </div>
            <span class="text-slate-300 font-mono-num font-semibold">${formatRupiah(it.subtotal || (it.finalPrice * it.qty))}</span>
          </div>
        `).join('');
      }

      tripCard.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <div>
            <span class="text-xs text-emerald-400 font-semibold block">${trip.monthName || 'Belanja Grosir'}</span>
            <span class="text-[11px] text-slate-400">${formatDateIndo(trip.date)}</span>
          </div>
          <button type="button" class="btn-delete-trip touch-target w-8 h-8 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 tap-effect" data-trip-id="${trip.id}">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>

        <div class="flex items-center justify-between bg-slate-950/60 rounded-xl p-2.5 mb-3 border border-slate-800/80">
          <div>
            <span class="text-[10px] text-slate-400 block">Total Pengeluaran</span>
            <span class="text-sm font-bold text-slate-100 font-mono-num">${formatRupiah(trip.totalSpent)}</span>
          </div>
          <div class="text-right">
            <span class="text-[10px] text-slate-400 block">Hemat Promosi</span>
            <span class="text-xs font-bold text-emerald-400 font-mono-num">${formatRupiah(trip.totalSaved || 0)}</span>
          </div>
        </div>

        <!-- Collapsible item details -->
        <details class="text-xs group">
          <summary class="cursor-pointer text-slate-400 hover:text-slate-200 flex items-center justify-between py-1 font-semibold select-none">
            <span>Rincian Barang (${trip.items?.length || 0} macam)</span>
            <i data-lucide="chevron-down" class="w-3.5 h-3.5 transition-transform group-open:rotate-180"></i>
          </summary>
          <div class="mt-2 pt-2 border-t border-slate-800/80 space-y-1">
            ${itemsHtml}
          </div>
        </details>
      `;

      tripCard.querySelector('.btn-delete-trip')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Hapus catatan belanja ini dari riwayat?')) {
          feedback.tap();
          store.deleteTrip(trip.id);
        }
      });

      this.historyList.appendChild(tripCard);
    });

    if (window.lucide) window.lucide.createIcons();
  }

  // ==========================================
  // TAB [ANGGARAN] RENDERER
  // ==========================================
  renderAnggaranPage() {
    const summary = store.getCartSummary();

    this.budgetPageLimit.textContent = formatRupiah(store.budgetLimit);
    this.budgetPageCurrent.textContent = formatRupiah(summary.totalSpent);
    this.budgetPageRemaining.textContent = formatRupiah(summary.remainingBudget);
    this.budgetPagePercent.textContent = `${Math.round(summary.rawPercentage)}% Digunakan`;

    this.budgetGaugeBar.style.width = `${summary.budgetUsagePercent}%`;
    this.budgetGaugeBar.className = `h-3 rounded-full transition-all duration-300 ${
      summary.budgetStatus === 'safe'
        ? 'bg-emerald-500'
        : summary.budgetStatus === 'warning'
        ? 'bg-amber-500'
        : 'bg-rose-500 animate-pulse'
    }`;

    // Render category breakdown with clean visual meters
    this.budgetBreakdownContainer.innerHTML = '';
    const entries = Object.entries(summary.categoryTotals);

    if (entries.length === 0) {
      this.budgetBreakdownContainer.innerHTML = `
        <p class="text-xs text-slate-400 italic">Belum ada barang di keranjang aktif untuk dianalisis.</p>
      `;
      return;
    }

    entries.forEach(([catId, amount]) => {
      const cat = CATEGORIES.find(c => c.id === catId) || { name: 'Lainnya', color: 'bg-slate-700' };
      const pct = summary.totalSpent > 0 ? (amount / summary.totalSpent) * 100 : 0;

      const itemRow = document.createElement('div');
      itemRow.className = 'space-y-1 text-xs';
      itemRow.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="text-slate-300 font-semibold flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full ${cat.color}"></span>
            ${cat.name}
          </span>
          <span class="text-slate-200 font-mono-num font-bold">${formatRupiah(amount)} (${Math.round(pct)}%)</span>
        </div>
        <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div class="bg-emerald-400 h-full rounded-full transition-all duration-300" style="width: ${pct}%"></div>
        </div>
      `;
      this.budgetBreakdownContainer.appendChild(itemRow);
    });
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.firebaseSync = new FirebaseSyncService();
  window.app = new GroceryApp();
  window.firebaseSync.init(store);
});

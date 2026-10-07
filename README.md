# 🛒 Smart Grocery & Budget Safety Tracker (PWA)

Aplikasi Web Mobile PWA (Progressive Web App) pelacak belanja grosir & keamanan anggaran cerdas satu tangan yang dirancang khusus untuk kenyamanan berbelanja di supermarket grosir tanpa rasa cemas overbudget.

🌐 **Live Demo (GitHub Pages):** [https://tupaiimantap.github.io/groceryapp/](https://tupaiimantap.github.io/groceryapp/)

---

## ✨ Fitur Utama

1. **Auto-Lookup Database Harga Historis (F-01)**:
   - Pencarian otomatis harga bulan lalu (misal: Beras Ramos, Telur 1 Tray, Susu UHT, Minyak Goreng).
   - Memasukkan data secara instan hanya dalam 1 klik.

2. **Kalkulasi Real-Time & Stepper Ramah Jempol (F-02)**:
   - Tombol kuantitas jumbo (+ / -) yang nyaman untuk kontrol satu tangan saat mendorong troli.
   - Perhitungan subtotal dan total dinamis instan tanpa delay.

3. **Multi-Tier Discount Calculator (F-03)**:
   - Persentase (% diskon reguler).
   - Potongan Nominal Langsung (Rp).
   - Promo Grosir Multi-Beli (*Buy 2 Get 1 Free*, *Buy 3 Pay Rp 50.000*).

4. **Price Comparator vs Bulan Lalu (F-04)**:
   - Indikator badge visual: 🟢 Turun, 🔴 Naik, ⚪ Tetap.
   - Peringatan inflasi belanjaan otomatis.

5. **Budget Safety Cap & Dynamic Warning (F-05)**:
   - Progress bar dinamis (Aman / Waspada / Danger).
   - Haptic Feedback & Audio Beep alarm jika belanjaan melampaui limit anggaran.
   - Rekomendasi barang yang bisa dikurangi untuk kembali ke batas aman.

6. **Offline First & PWA Ready (F-06)**:
   - Berfungsi 100% tanpa sinyal internet di dalam supermarket (Service Worker cache).
   - Data tersimpan otomatis di `localStorage`.
   - Dapat di-install langsung ke homescreen (Add to Home Screen).

---

## 🚀 Cara Menjalankan Lokal
```bash
node server.js
```
Lalu buka browser di `http://localhost:3000`.
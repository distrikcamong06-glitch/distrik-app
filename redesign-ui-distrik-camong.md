# Brief Redesign UI/UX — Distrik Camong

> **Untuk:** Codex / agen coding.
> **Tujuan:** Merombak tampilan (layout, komponen, spacing, gaya kartu) aplikasi **Distrik Camong** agar mengikuti pola visual pada gambar referensi (grocery app yang bersih & modern).
> **ATURAN UTAMA:** **Warna tema TIDAK berubah.** Gunakan kembali palet / design token / variabel warna yang SUDAH ADA di proyek ini. Jangan memakai warna hijau dari gambar referensi. Ambil hanya *struktur dan pola UX*-nya, bukan warnanya.

---

## 0. Prinsip & Batasan (WAJIB dibaca dulu)

1. **Pertahankan palet warna lama.** Deteksi variabel warna yang sudah dipakai (mis. di `tailwind.config`, `:root` CSS custom properties, tema MUI/Chakra, atau file `theme`/`colors`). Semua warna primer/aksen/background tetap pakai yang lama.
2. **Yang dirombak:** layout, hierarki, komponen kartu, bentuk rounded, bayangan (shadow), spacing, tipografi (ukuran/berat), ikon, dan bottom navigation.
3. **Jangan ubah logika bisnis.** Ini pekerjaan tampilan saja — endpoint, state, dan alur data tetap.
4. **Konteks aplikasi:** Distrik Camong adalah app **membership & loyalti poin**, BUKAN toko online. Sisi user hanya: **Profil, Barcode, Penukaran Poin**. Jadi pola dari gambar dipetakan ke fitur ini (lihat bagian 2), bukan disalin mentah sebagai aplikasi belanja.
5. **Mobile-first.** Gambar referensi adalah layar HP — utamakan tampilan mobile, lalu responsif ke desktop.

---

## 1. Pola Visual dari Gambar Referensi (yang mau ditiru)

Elemen gaya yang diadopsi:

- **Header sapaan personal** di kiri atas: "Hi, [Nama] 👋" + subteks tipis di bawahnya. Di kanan atas ada 1 ikon aksi dengan **badge angka**.
- **Search bar** full-width, rounded penuh (pill), background abu-abu muda, ikon cari di kiri + ikon aksi di kanan.
- **Banner promo** berupa kartu besar rounded, ada headline tebal, subteks, dan **tombol pill CTA** kecil.
- **Section kategori**: judul section + grid **4 tile** persegi rounded (ikon di tengah + label di bawah).
- **Section kartu horizontal**: judul section di kiri + link **"Lihat Semua ›"** di kanan, isinya kartu-kartu produk (gambar, nama, nilai, tombol aksi kecil).
- **Kartu** konsisten: sudut membulat (~16px), shadow halus, padding lega, gambar di atas.
- **Bottom navigation** tetap (fixed) berisi 4 item (ikon + label), item aktif diberi warna **primer tema** (bukan hijau gambar).
- Banyak **ruang putih**, tipografi jelas (judul tebal, harga/nilai menonjol).

---

## 2. Pemetaan ke Layar Distrik Camong

Karena app ini loyalti (bukan belanja), pola di atas dipetakan jadi:

| Elemen di gambar | Jadi di Distrik Camong |
|---|---|
| "Hi, Sarah 👋" | "Hi, [Nama Member] 👋" + subteks "Selamat datang di Distrik Camong" |
| Ikon cart + badge | **Chip Saldo Poin** di kanan atas (mis. "⭐ 350 Poin") |
| Search bar | Search untuk mencari **reward** di katalog penukaran |
| Banner promo | Banner info poin / promo ("Kumpulkan poin tiap belanja susu!") |
| Grid kategori (Fruits, dll) | **Menu cepat**: Barcode • Tukar Poin • Riwayat • Profil |
| "Popular Products" + kartu | **Katalog Reward** — kartu reward (gambar, nama, harga poin, tombol **"Tukar"**) |
| Tombol "+ Add" | Tombol **"Tukar"** (nonaktif/redup jika poin kurang) |
| Bottom nav (Home/Offers/Cart/Profile) | **Beranda • Reward • Barcode • Profil** |

---

## 3. Spesifikasi Layar

### 3.1 Beranda (User)
Urutan dari atas ke bawah:
1. **Header**: sapaan nama + subteks; kanan atas chip saldo poin.
2. **Search bar** (pill) — placeholder "Cari reward…".
3. **Banner promo** (kartu rounded besar) — headline + subteks + tombol pill (mis. "Lihat Reward ›").
4. **Menu Cepat** — judul "Menu" + grid 4 tile: `Barcode`, `Tukar Poin`, `Riwayat`, `Profil`.
5. **Reward Populer** — judul "Reward" + link "Lihat Semua ›"; daftar kartu reward (scroll horizontal di mobile / grid di desktop).
6. **Bottom nav** fixed.

### 3.2 Barcode
- Kartu besar di tengah berisi **QR/barcode member** + `member_code` di bawahnya.
- Latar kartu pakai warna primer tema, tombol "Perbesar".

### 3.3 Reward / Penukaran Poin
- Grid kartu reward konsisten dengan gaya kartu di beranda.
- Tiap kartu: gambar, nama, **harga poin** menonjol, tombol "Tukar".
- State: tombol redup + teks "Poin kurang" bila saldo < harga.

### 3.4 Profil
- Kartu profil (avatar, nama, saldo poin besar).
- List menu: Edit Profil, Ganti Password, Riwayat Poin, Keluar.

### 3.5 Sisi Admin
- Tetap pakai gaya kartu & spacing yang sama agar konsisten, tapi layout dashboard (tabel, form scan, manajemen reward/menu) tidak perlu meniru gambar — cukup ikut sistem kartu + warna tema yang sama.

---

## 4. Panduan Gaya (pakai token tema yang ADA)

- **Warna:** ambil dari token proyek. Primer = warna aksen lama (untuk tombol aktif, nav aktif, highlight). Jangan hardcode hex baru.
- **Radius:** kartu `16px`, tombol pill `9999px`, search bar `9999px`.
- **Shadow:** halus, `0 2px 8px rgba(0,0,0,0.06)`.
- **Spacing:** padding kartu 16px; jarak antar-section 24px; gutter samping 16px.
- **Tipografi:** judul section tebal ~18px; nama item ~15px; nilai poin tebal & lebih besar.
- **Ikon:** satu set konsisten (mis. Lucide / Heroicons), ukuran seragam.
- **Bottom nav:** 4 item, item aktif = warna primer tema + bold, lainnya abu-abu.

---

## 5. Definition of Done (checklist untuk Codex)

- [ ] Palet warna LAMA dipertahankan (tidak ada warna hijau baru dari gambar).
- [ ] Beranda user mengikuti struktur: header sapaan + chip poin → search → banner → menu cepat → kartu reward → bottom nav.
- [ ] Komponen kartu, radius, shadow, dan spacing seragam di semua layar.
- [ ] Bottom navigation 4 item dengan state aktif pakai warna primer tema.
- [ ] Tombol "Tukar" menggantikan pola "+ Add", lengkap dengan state poin-kurang.
- [ ] Responsif: tampil rapi di mobile (utama) dan desktop.
- [ ] Logika/data tidak berubah — hanya lapisan UI.

---

## 6. Catatan untuk Codex
- Baca dulu konfigurasi tema/warna proyek sebelum menulis CSS; reuse variabel yang ada.
- Jika ada design system / komponen reusable di repo, pakai dan perluas itu, jangan bikin komponen duplikat.
- Jika suatu warna atau token tidak ditemukan, gunakan placeholder variabel dan beri komentar, **jangan** menebak dengan warna hijau gambar.

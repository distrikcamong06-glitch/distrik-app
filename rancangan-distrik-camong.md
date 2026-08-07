# Rancangan Aplikasi Web — Distrik Camong

Sistem membership & loyalti poin untuk UMKM susu **Distrik Camong**. Konsep mirip Alfagift / PoinKu Indomaret: pelanggan jadi member, punya barcode, dapat poin saat belanja, dan bisa menukar poin dengan reward. Transaksi terjadi **offline di toko** — admin men-scan barcode member, poin bertambah otomatis.

---

## 1. Ringkasan & Tujuan

| Aspek | Keterangan |
|---|---|
| Nama | Distrik Camong |
| Jenis usaha | UMKM produk susu |
| Model | Web app membership + loyalti poin |
| Aktor | **Admin** (kasir/pengelola toko) dan **User** (member/pelanggan) |
| Inti transaksi | Offline: admin scan barcode member → poin bertambah |
| Nilai jual | Retensi pelanggan, data belanja, program reward fleksibel |

**Prinsip desain:** sisi user dibuat sangat ringan (hanya profil, barcode, dan tukar poin). Semua kompleksitas ada di sisi admin.

---

## 2. Peran & Hak Akses

### Admin
- Login ke dashboard admin.
- **Scan barcode member** (kamera/scanner) → input nominal belanja → poin otomatis dihitung & ditambahkan.
- Kelola member (lihat, cari, tambah manual, blokir).
- **Kelola menu aplikasi** (menu navigasi bisa diubah-ubah, diaktif/nonaktifkan, diurutkan).
- **Kelola katalog penukaran poin** (tambah/edit/hapus reward, atur harga poin & stok).
- Atur aturan poin (konversi rupiah → poin, poin bonus, dsb).
- Lihat riwayat transaksi & laporan.

### User (Member)
Hanya punya 3 hal:
1. **Profil** — data diri, saldo poin.
2. **Barcode** — kartu member digital untuk di-scan admin.
3. **Penukaran poin** — lihat katalog reward & ajukan penukaran.

> User **tidak** melakukan transaksi belanja sendiri di aplikasi. Poin murni ditambahkan oleh admin saat scan di toko.

---

## 3. Alur Utama

### 3.1 Registrasi Member
```
User daftar (nama, no. HP, email, password)
        ↓
Sistem generate member_code unik + barcode (mis. QR / Code128)
        ↓
Barcode tampil di halaman "Barcode" user
```

### 3.2 Penambahan Poin (offline, oleh admin)
```
Pelanggan belanja di toko → tunjukkan barcode
        ↓
Admin buka menu "Scan Poin" → scan barcode → member terdeteksi
        ↓
Admin input nominal belanja (mis. Rp 50.000)
        ↓
Sistem hitung poin = nominal ÷ rasio konversi (mis. Rp1.000 = 1 poin → 50 poin)
        ↓
Saldo poin member bertambah otomatis + tercatat di riwayat transaksi
        ↓
(opsional) Notifikasi ke user "kamu dapat 50 poin!"
```

### 3.3 Penukaran Poin (oleh user)
```
User buka katalog reward → pilih reward (mis. "Susu 1L → 100 poin")
        ↓
Sistem cek saldo cukup & stok tersedia
        ↓
User ajukan tukar → status "Menunggu diambil" + kode penukaran
        ↓
User tunjukkan kode/barcode penukaran ke admin di toko
        ↓
Admin verifikasi & konfirmasi → poin terpotong, status "Selesai"
```

---

## 4. Fitur per Modul

### Modul Admin
- **Dashboard**: ringkasan (jumlah member, poin beredar, transaksi hari ini, reward terpopuler).
- **Scan Poin**: scanner barcode + form nominal → tambah poin.
- **Manajemen Member**: tabel member, detail, saldo, riwayat, blokir/aktifkan.
- **Manajemen Menu**: CRUD item menu navigasi (label, ikon, urutan, aktif/nonaktif, target role).
- **Manajemen Reward / Penukaran**: CRUD reward (nama, deskripsi, gambar, harga poin, stok, aktif).
- **Aturan Poin**: set rasio konversi, poin registrasi/ulang tahun, kadaluarsa poin (opsional).
- **Riwayat & Laporan**: log earn/redeem, filter tanggal, export CSV.

### Modul User
- **Profil**: nama, kontak, saldo poin, edit data, ganti password.
- **Barcode**: tampil barcode/QR member (bisa di-zoom untuk di-scan).
- **Penukaran Poin**: katalog reward + status pengajuan penukaran.

---

## 5. Manajemen Menu Dinamis (admin bisa ubah-ubah)

Menu navigasi tidak di-hardcode, tapi disimpan di database sehingga admin bisa mengubah tampilan aplikasi tanpa ganti kode.

**Tabel `menus`:**

| Field | Tipe | Keterangan |
|---|---|---|
| id | PK | |
| label | text | Nama menu ("Beranda", "Reward") |
| path | text | Rute halaman ("/rewards") |
| icon | text | Nama ikon |
| order | int | Urutan tampil |
| parent_id | FK null | Untuk submenu |
| role | enum | `admin` / `user` / `all` |
| is_active | bool | Tampil atau tidak |

Frontend membaca daftar menu sesuai role login → render navigasi secara dinamis.

---

## 6. Skema Database (usulan)

```
users
  id (PK)
  member_code (unik)        -- isi barcode
  name, email, phone
  password_hash
  role                      -- 'admin' | 'user'
  points_balance (int)      -- saldo poin sekarang
  is_active (bool)
  created_at

point_rules  (setting global, 1 baris atau key-value)
  id (PK)
  rupiah_per_point          -- mis. 1000 (Rp1000 = 1 poin)
  signup_bonus
  points_expiry_days (null = tidak kadaluarsa)
  updated_at

point_transactions          -- semua penambahan/pengurangan poin
  id (PK)
  user_id (FK)
  admin_id (FK, null)       -- admin yang men-scan
  type                      -- 'earn' | 'redeem' | 'adjust'
  points (int)              -- + untuk earn, - untuk redeem
  amount_spent (int, null)  -- nominal belanja saat earn
  description
  created_at

rewards                     -- katalog penukaran (admin kelola)
  id (PK)
  name, description, image_url
  point_cost (int)
  stock (int, null = unlimited)
  is_active (bool)
  created_at, updated_at

redemptions                 -- pengajuan tukar poin
  id (PK)
  user_id (FK)
  reward_id (FK)
  points_used (int)
  redeem_code (unik)        -- kode/barcode yang ditunjukkan ke admin
  status                    -- 'pending' | 'completed' | 'cancelled'
  created_at, completed_at

menus                       -- lihat bagian 5
  ...
```

**Aturan integritas penting:**
- Penambahan poin harus atomik: update `points_balance` + insert `point_transactions` dalam satu transaksi DB.
- Saat redeem: cek `points_balance >= point_cost` dan `stock > 0` sebelum commit.

---

## 7. Contoh Endpoint API

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET  /api/auth/me`

### Admin
- `POST /api/admin/scan` → body `{ member_code, amount_spent }` → tambah poin
- `GET  /api/admin/members` → daftar & cari member
- `GET/POST/PUT/DELETE /api/admin/rewards` → kelola katalog reward
- `GET/POST/PUT/DELETE /api/admin/menus` → kelola menu
- `PUT  /api/admin/point-rules` → atur rasio konversi & bonus
- `GET  /api/admin/transactions` → riwayat & laporan
- `PUT  /api/admin/redemptions/:id/confirm` → konfirmasi penukaran

### User
- `GET  /api/me/profile` / `PUT /api/me/profile`
- `GET  /api/me/barcode` → data barcode/member_code
- `GET  /api/rewards` → katalog aktif
- `POST /api/rewards/:id/redeem` → ajukan penukaran
- `GET  /api/me/redemptions` → status penukaran

---

## 8. Barcode

- **Isi barcode** = `member_code` (string unik, mis. `CMG-2026-000123`).
- Format anjuran: **QR Code** (mudah di-scan HP) atau **Code128**.
- Sisi user: render barcode di browser (library `qrcode` / `bwip-js`).
- Sisi admin: scan pakai kamera HP/laptop lewat library seperti **html5-qrcode** / **@zxing/browser**, atau scanner barcode fisik yang bekerja seperti keyboard (auto ketik ke input).

---

## 9. Usulan Tech Stack

Disesuaikan dengan stack yang biasa kamu pakai (Flask/Python + PostgreSQL/Supabase):

| Lapisan | Pilihan |
|---|---|
| Backend | **Flask** (REST API) + JWT auth |
| Database | **PostgreSQL** (atau Supabase Postgres) |
| Frontend | React / Vue / plain JS + Tailwind (mobile-first) |
| Barcode (user) | `qrcode` / `bwip-js` |
| Scanner (admin) | `html5-qrcode` atau `@zxing/browser` |
| Hosting | VPS / Railway / Supabase + Vercel |

Alternatif lebih cepat: **Supabase** (Auth + Postgres + Row Level Security) untuk backend, frontend cukup 1 SPA. RLS bisa dipakai membatasi user hanya lihat datanya sendiri.

---

## 10. Catatan Keamanan

- User hanya boleh akses data miliknya sendiri (enforce di backend / RLS, bukan hanya di frontend).
- Endpoint `scan` dan semua aksi tambah/kurang poin **wajib** role admin + tercatat siapa adminnya.
- Poin tidak pernah dihitung di frontend → selalu server-side pakai `point_rules`.
- `redeem_code` sebaiknya random & sekali pakai untuk cegah kecurangan.

---

## 11. Saran Pengembangan Bertahap (MVP dulu)

**Tahap 1 (MVP):** register/login, barcode user, scan+tambah poin admin, saldo poin.
**Tahap 2:** katalog reward + penukaran + konfirmasi admin.
**Tahap 3:** menu dinamis, aturan poin yang bisa diatur, laporan.
**Tahap 4:** notifikasi, poin kadaluarsa, tier member (silver/gold), promo.

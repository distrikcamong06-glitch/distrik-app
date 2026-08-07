# Distrik Camong — Membership & Loyalty Points

Web app membership & loyalti poin untuk UMKM susu Distrik Camong. Admin men-scan barcode member di toko untuk menambah poin; member menukar poin dengan reward. Lihat `rancangan-distrik-camong.md` untuk rancangan lengkap.

**Stack**: React + TypeScript + Vite + Tailwind CSS, langsung terhubung ke [Supabase](https://supabase.com) (Auth + Postgres + Row Level Security) — tidak ada backend terpisah. Di-deploy sebagai static site di [Render](https://render.com).

## 1. Setup Supabase

1. Buat project baru di [supabase.com](https://supabase.com/dashboard).
2. Buka **SQL Editor** → jalankan seluruh isi [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). Ini akan membuat semua tabel, RLS policy, fungsi RPC, dan data awal (aturan poin default + menu navigasi).
3. Buka **Project Settings → API** → salin **Project URL** dan **anon public key**.
4. (Opsional tapi disarankan) Di **Authentication → Providers → Email**, matikan "Confirm email" jika ingin member langsung bisa login tanpa verifikasi email saat development.

### Menjadikan akun sebagai admin

Tidak ada pendaftaran admin publik (sesuai catatan keamanan di rancangan). Daftar dulu lewat halaman `/register` seperti member biasa, lalu jadikan admin lewat SQL Editor:

```sql
update public.profiles set role = 'admin' where id = (
  select id from auth.users where email = 'email-kamu@contoh.com'
);
```

> Catatan: fitur "tambah member manual" oleh admin sengaja tidak dibuat di versi ini — itu memerlukan Supabase service role key di server (edge function), yang di luar arsitektur SPA-langsung-ke-Supabase yang dipakai sekarang. Member selalu mendaftar sendiri lewat `/register`; admin bisa mencari, melihat riwayat, dan memblokir/mengaktifkan dari halaman **Member**.

## 2. Development lokal

```bash
npm install
cp .env.example .env   # isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY
npm run dev
```

## 3. Push ke GitHub

```bash
# dari folder project ini (sudah di-`git init` + commit pertama)
git remote add origin https://github.com/<username>/<repo>.git
git branch -M main
git push -u origin main
```

## 4. Deploy ke Render

1. Di [Render Dashboard](https://dashboard.render.com), klik **New → Blueprint**, pilih repo GitHub ini. Render akan membaca [`render.yaml`](render.yaml) secara otomatis (static site, build `npm ci && npm run build`, publish folder `dist`, dengan SPA rewrite rule untuk React Router).
   - Alternatif manual: **New → Static Site** → connect repo → Build Command `npm ci && npm run build` → Publish Directory `dist`.
2. Di tab **Environment**, isi:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Deploy. Setelah live, buka URL-nya, daftar akun, lalu jadikan admin lewat SQL seperti di atas.

## Struktur proyek

- `supabase/migrations/0001_init.sql` — schema, RLS, fungsi RPC (`admin_add_points`, `redeem_reward`, `confirm_redemption`, `cancel_redemption`), seed data.
- `src/pages/user/*` — Barcode, Profil, Katalog Reward, Riwayat Penukaran.
- `src/pages/admin/*` — Dashboard, Scan Poin, Member, Reward, Menu, Aturan Poin, Riwayat Transaksi, Konfirmasi Penukaran.
- `src/components/NavMenu.tsx` — navigasi dibaca dari tabel `menus`, bukan hardcoded (admin bisa ubah lewat halaman **Menu**).

## Sudah diimplementasikan (Tahap 1–3 dari rancangan)

Registrasi/login, barcode member (QR), scan + tambah poin oleh admin, katalog reward + penukaran + konfirmasi admin, menu dinamis, aturan poin yang bisa diatur, riwayat & export CSV.

## Belum diimplementasikan (Tahap 4 — pengembangan lanjutan)

Notifikasi otomatis, penerapan kadaluarsa poin (kolom `points_expiry_days` sudah tersedia di `point_rules` tapi belum ada job yang menjalankannya), tier member (silver/gold), promo, dan tambah member manual oleh admin.

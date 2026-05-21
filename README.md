# 🥟 Dimsum Enak - POS System

Aplikasi kasir (Point of Sale) berbasis web untuk usaha dimsum. Dibangun dengan Google Apps Script, HTML/CSS/JS, dan Google Sheets sebagai database.

## ✨ Fitur

- **Multi User** — Role owner & kasir dengan session aman
- **Multi Cabang** — Setiap kasir terhubung ke cabang tertentu
- **POS Modern** — Grid menu + keranjang, responsive untuk tablet/HP
- **Pembayaran** — Cash & QRIS dengan struk thermal 58mm
- **Dashboard Owner** — Omset harian/mingguan/bulanan + grafik Chart.js
- **Laporan** — Filter per kasir, per cabang, per periode
- **Manajemen Menu** — Tambah/edit/hapus menu dengan upload gambar
- **Manajemen User** — Tambah/hapus pengguna dari dashboard
- **Optimasi** — CacheService untuk performa cepat

## 🛠️ Setup & Deploy

### 1. Buat Google Spreadsheet Baru
- Buka [Google Sheets](https://sheets.google.com) → buat spreadsheet baru
- Beri nama: `Dimsum Enak POS`

### 2. Buka Apps Script Editor
- Di spreadsheet, klik **Extensions** → **Apps Script**
- Hapus semua kode default

### 3. Buat File-file Berikut di Apps Script Editor

| File | Tipe |
|------|------|
| `Code.gs` | Script |
| `login.html` | HTML |
| `kasir.html` | HTML |
| `owner.html` | HTML |
| `style.html` | HTML |

- Copy-paste kode dari masing-masing file di repo ini

### 4. Jalankan Setup Database
- Di editor, pilih fungsi `setupDatabase` dari dropdown
- Klik ▶️ Run
- Berikan izin yang diminta (akses Sheets & Drive)
- Ini akan membuat 3 sheet: `menu`, `transaksi`, `users`

### 5. Deploy sebagai Web App
- Klik **Deploy** → **New deployment**
- Pilih type: **Web app**
- Settings:
  - Execute as: **Me**
  - Who has access: **Anyone**
- Klik **Deploy**
- Copy URL yang diberikan

### 6. Akses Aplikasi
- Buka URL deployment di browser/HP/tablet
- Login dengan akun default:

| Username | Password | Role | Cabang |
|----------|----------|------|--------|
| `owner` | `owner123` | owner | Pusat |
| `kasir1` | `kasir123` | kasir | Pusat |
| `kasir2` | `kasir123` | kasir | Cabang 1 |

## 📱 Penggunaan

### Kasir
1. Login → otomatis masuk halaman kasir
2. Ketuk menu untuk menambah ke keranjang
3. Atur jumlah dengan tombol +/-
4. Pilih metode bayar (Cash/QRIS)
5. Cetak struk jika diperlukan

### Owner
1. Login → otomatis masuk dashboard
2. Lihat omset & grafik penjualan
3. Cek laporan per kasir/cabang
4. Kelola menu (tambah/edit/hapus)
5. Kelola pengguna

## 🗂️ Struktur Database (Google Sheets)

### Sheet: `menu`
| Kolom | Keterangan |
|-------|-----------|
| id | ID unik |
| nama | Nama menu |
| harga | Harga (angka) |
| gambar | URL gambar (Google Drive) |
| aktif | TRUE/FALSE |

### Sheet: `transaksi`
| Kolom | Keterangan |
|-------|-----------|
| waktu | Timestamp |
| total | Total pembayaran |
| metode | Cash / QRIS |
| kasir | Username kasir |
| cabang | Nama cabang |
| items | Detail item |

### Sheet: `users`
| Kolom | Keterangan |
|-------|-----------|
| username | Username login |
| password | Password |
| role | owner / kasir |
| cabang | Nama cabang |

## 🎨 Tema & Design

- Warna utama: **Merah** (`#e74c3c`)
- Warna aksen: **Kuning** (`#f1c40f`)
- Style: Card-based, shadow, rounded corners
- Responsive: Tablet & HP friendly
- Print: Optimized untuk thermal printer 58mm

## 📝 Catatan

- Ganti password default setelah setup pertama
- Upload gambar menu disimpan di Google Drive (folder `DimSum_POS_Images`)
- Session berlaku 12 jam, setelah itu perlu login ulang
- Cache menu berlaku 5 menit untuk performa optimal
- Auto-refresh dashboard setiap 10 detik

## 📄 Lisensi

Dibuat untuk keperluan internal usaha Dimsum Enak.

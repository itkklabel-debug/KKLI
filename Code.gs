/**
 * ============================================================================
 *  APLIKASI STOK BARANG - Google Apps Script (Backend)
 * ============================================================================
 *  Spreadsheet : "Database_StokBarang" (4 sheet: Master_Barang, Transaksi, User,
 *                Log_Validasi)
 *  Drive       : StokBarang/ (Foto_Barang, Bukti_Transaksi, Backup)
 *  Integrasi   : Google Drive, Gmail, Google Calendar
 *  Trigger     : Cek alert harian 08:00, backup mingguan, laporan bulanan
 *
 *  Cara pakai:
 *   1. Buka Google Sheet baru -> Extensions -> Apps Script
 *   2. Tempel Code.gs ini, lalu File -> New -> HTML -> beri nama "Index"
 *      dan tempel isi Index.html
 *   3. Jalankan fungsi initSetup() sekali untuk inisialisasi sheet/folder/admin
 *   4. Jalankan createTimeDrivenTriggers() untuk mengaktifkan trigger otomatis
 *   5. Deploy -> New deployment -> Web app -> Execute as: Me, Access: Anyone
 *      with Google account (atau sesuai kebutuhan)
 * ============================================================================
 */

// ----------------------------- KONSTANTA ------------------------------------
const SS_NAME            = 'Database_StokBarang';
const SHEET_MASTER       = 'Master_Barang';
const SHEET_TRANSAKSI    = 'Transaksi';
const SHEET_USER         = 'User';
const SHEET_LOG          = 'Log_Validasi';

const ROOT_FOLDER_NAME   = 'StokBarang';
const FOLDER_FOTO        = 'Foto_Barang';
const FOLDER_BUKTI       = 'Bukti_Transaksi';
const FOLDER_BACKUP      = 'Backup';

const HEADER_MASTER = ['ID_Barang','Nama_Barang','Kategori','Stok_Awal','Stok_Masuk',
  'Stok_Keluar','Stok_Akhir','Satuan','Harga_Beli','Harga_Jual','Min_Stok_Alert',
  'Expired_Date','Lokasi_Foto_Drive','Status','Terakhir_Update','Update_By'];

const HEADER_TRX = ['ID_Transaksi','Tanggal','Tipe','ID_Barang','Nama_Barang','Qty',
  'Stok_Sebelumnya','Stok_Sesudahnya','Keterangan','Lampiran_Drive_ID',
  'User_Email','Timestamp_Input'];

const HEADER_USER = ['Email','Nama_Lengkap','Role','Status','Terakhir_Akses','Dibuat_Pada','Password'];
const HEADER_LOG  = ['Waktu','Aksi','Lokasi','Pesan_Error','Data_Gagal','User_Email'];

const DEFAULT_SETTINGS = {
  emailAlert        : '',          // diisi via menu Pengaturan
  jamAlert          : '08:00',
  minStokGlobal     : 5,
  hariSebelumExpired: 7,
  namaPerusahaan    : 'PT Contoh Sejahtera'
};

// =============================================================================
//  ENTRY POINT WEB APP
// =============================================================================
function doGet(e) {
  try { initSetup(); } catch(_){} // pastikan struktur ada (jangan blokir UI)

  // Coba cari file HTML "Index" (juga toleran terhadap "index" / "INDEX")
  const candidates = ['Index', 'index', 'INDEX'];
  for (let i=0; i<candidates.length; i++){
    try {
      const tpl = HtmlService.createTemplateFromFile(candidates[i]);
      tpl.userEmail = Session.getActiveUser().getEmail() || '';
      return tpl.evaluate()
        .setTitle('Aplikasi Stok Barang')
        .addMetaTag('viewport','width=device-width, initial-scale=1.0')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    } catch(_){ /* coba kandidat berikutnya */ }
  }

  // File HTML belum ada → tampilkan halaman instruksi yang jelas
  return HtmlService.createHtmlOutput(
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Setup Belum Lengkap</title>' +
    '<style>body{font-family:system-ui,Segoe UI,Arial;background:#f1f5f9;margin:0;padding:40px 20px;color:#0f172a}' +
    '.card{max-width:640px;margin:0 auto;background:#fff;padding:32px;border-radius:14px;' +
    'box-shadow:0 8px 30px rgba(0,0,0,.08)}h1{margin:0 0 6px;font-size:22px}' +
    'h2{font-size:15px;color:#475569;margin:0 0 22px;font-weight:500}' +
    'ol{padding-left:20px;line-height:1.7}code{background:#f1f5f9;padding:2px 8px;border-radius:6px;' +
    'font-family:ui-monospace,monospace;font-size:13px}.tag{display:inline-block;background:#fef3c7;' +
    'color:#92400e;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600;margin-bottom:14px}' +
    '.hint{background:#eff6ff;border-left:4px solid #2563eb;padding:12px 16px;margin-top:18px;' +
    'border-radius:8px;font-size:14px;color:#1e40af}</style></head><body>' +
    '<div class="card"><span class="tag">Setup belum lengkap</span>' +
    '<h1>File HTML "Index" belum dibuat</h1>' +
    '<h2>Aplikasi Stok Barang membutuhkan satu file HTML di proyek Apps Script ini.</h2>' +
    '<ol>' +
      '<li>Di editor Apps Script (kiri), klik tombol <b>+</b> di samping "Files" → pilih <b>HTML</b>.</li>' +
      '<li>Beri nama file persis: <code>Index</code> (huruf I besar, tanpa ekstensi).</li>' +
      '<li>Hapus isi default-nya, lalu tempel seluruh isi <code>Index.html</code> dari repository.</li>' +
      '<li>Simpan (<code>Ctrl/Cmd + S</code>), lalu <b>Deploy</b> ulang web app (atau refresh halaman ini jika sedang dites lewat <i>Test deployment</i>).</li>' +
    '</ol>' +
    '<div class="hint"><b>Tips:</b> Apps Script tidak otomatis baca file dari Drive/GitHub — semua file (.gs &amp; .html) harus ditempel manual ke proyek Apps Script ini.</div>' +
    '</div></body></html>'
  ).setTitle('Setup Aplikasi Stok Barang');
}

function include(filename){
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// =============================================================================
//  INISIALISASI / SETUP
// =============================================================================
/**
 * Util perbaikan: rapikan nama sheet (trim spasi tersembunyi) dan pastikan
 * 4 sheet utama ada. Jalankan manual sekali jika `initSetup` menolak karena
 * sheet duplikat.
 */
function repairSheets(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const targets = [SHEET_MASTER, SHEET_TRANSAKSI, SHEET_USER, SHEET_LOG];
  const all = ss.getSheets();
  // Rapikan nama yang punya spasi/whitespace berlebih
  all.forEach(sh => {
    const n = sh.getName();
    const t = String(n).trim();
    if (n !== t){
      try { sh.setName(t); } catch(_){}
    }
  });
  // Pastikan 4 sheet utama ada (memakai ensureSheet_ yang sudah robust)
  const headersMap = {
    [SHEET_MASTER]:    HEADER_MASTER,
    [SHEET_TRANSAKSI]: HEADER_TRX,
    [SHEET_USER]:      HEADER_USER,
    [SHEET_LOG]:       HEADER_LOG
  };
  targets.forEach(name => ensureSheet_(ss, name, headersMap[name]));
  SpreadsheetApp.getUi().alert('Sheet sudah dirapikan.');
}

/**
 * Inisialisasi: pastikan spreadsheet, sheet, folder Drive, dan user default ada.
 * Aman dipanggil berulang.
 */
function initSetup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (ss.getName() !== SS_NAME) {
    try { ss.rename(SS_NAME); } catch(_){}
  }

  ensureSheet_(ss, SHEET_MASTER,    HEADER_MASTER);
  ensureSheet_(ss, SHEET_TRANSAKSI, HEADER_TRX);
  ensureSheet_(ss, SHEET_USER,      HEADER_USER);
  ensureSheet_(ss, SHEET_LOG,       HEADER_LOG);

  // pastikan folder ada
  const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  getOrCreateFolder_(root, FOLDER_FOTO);
  getOrCreateFolder_(root, FOLDER_BUKTI);
  getOrCreateFolder_(root, FOLDER_BACKUP);

  // default settings
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('settings')) {
    props.setProperty('settings', JSON.stringify(DEFAULT_SETTINGS));
  }

  // user default admin jika kosong
  const userSh = ss.getSheetByName(SHEET_USER);
  if (userSh.getLastRow() < 2) {
    const me = (Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || 'admin@example.com').trim();
    if (me) userSh.appendRow([me, 'Administrator', 'Admin', 'Active', '', new Date(), 'admin123']);
  }
}

function ensureSheet_(ss, name, headers){
  // 1) Cari exact match
  let sh = ss.getSheetByName(name);

  // 2) Jika tidak ketemu, cari case-insensitive / trimmed (mengatasi spasi tersembunyi)
  if (!sh){
    const all = ss.getSheets();
    for (let i=0; i<all.length; i++){
      if (String(all[i].getName()).trim().toLowerCase() === String(name).trim().toLowerCase()){
        sh = all[i];
        // Rapikan namanya agar konsisten
        try { sh.setName(name); } catch(_){}
        break;
      }
    }
  }

  // 3) Jika masih tidak ada, baru buat baru. insertSheet bisa lempar error jika
  //    spreadsheet sedang punya sheet "duplikat tersembunyi" — kita amankan.
  if (!sh){
    try {
      sh = ss.insertSheet(name);
    } catch (e){
      // fallback: buat dengan suffix lalu rename
      sh = ss.insertSheet(name + '_tmp_' + Date.now());
      try { sh.setName(name); } catch(_){}
    }
  }

  // 4) Pastikan header benar (set jika kosong, perbaiki jika beda)
  const lastCol = Math.max(sh.getLastColumn(), headers.length);
  const cur = sh.getLastRow() === 0
    ? []
    : sh.getRange(1,1,1,lastCol).getValues()[0].map(v => String(v||'').trim());

  const sama = cur.length >= headers.length &&
               headers.every((h,i) => cur[i] === h);

  if (!sama){
    sh.getRange(1,1,1,headers.length).setValues([headers]);
    sh.getRange(1,1,1,headers.length)
      .setFontWeight('bold').setBackground('#1f2937').setFontColor('#fff');
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * Membuat custom menu di Sheet ketika dibuka.
 */
function onOpen(){
  SpreadsheetApp.getUi()
    .createMenu('Stok Barang')
    .addItem('Inisialisasi Setup','initSetup')
    .addItem('Repair Sheets','repairSheets')
    .addItem('Buat Trigger Otomatis','createTimeDrivenTriggers')
    .addItem('Cek Alert Sekarang','checkAndSendAlerts')
    .addItem('Backup Manual','backupData')
    .addToUi();
}

// =============================================================================
//  USER & SESSION
// =============================================================================
/**
 * Mengembalikan info user aktif: email, nama, role, status.
 */
function getCurrentUser(){
  const email = Session.getActiveUser().getEmail();
  const info  = getUserRole(email);
  return { email: email, ...info };
}

/**
 * Cek role user dari sheet User. Return {nama, role, status, found}.
 * Pembandingan trim() + toLowerCase() agar tahan spasi tersembunyi & beda case.
 */
function getUserRole(email){
  if (!email) return { nama:'', role:'Guest', status:'Inactive', found:false };
  const target = String(email).trim().toLowerCase();
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USER);
  const data = sh.getDataRange().getValues();
  for (let i=1; i<data.length; i++){
    const cell = String(data[i][0]||'').trim().toLowerCase();
    if (cell === target){
      // bersihkan email di sheet supaya konsisten
      if (String(data[i][0]) !== cell){
        try { sh.getRange(i+1, 1).setValue(cell); } catch(_){}
      }
      // update terakhir akses
      sh.getRange(i+1, 5).setValue(new Date());
      return { nama:data[i][1], role:data[i][2], status:data[i][3], found:true };
    }
  }
  return { nama:'', role:'Guest', status:'Inactive', found:false };
}

/**
 * Debug helper: cek email apa yang dilihat Apps Script untuk user yang sedang
 * akses web app. Bisa dijalankan dari editor (Tools > Apps Script).
 */
function whoami(){
  const active    = Session.getActiveUser().getEmail();
  const effective = Session.getEffectiveUser().getEmail();
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USER);
  const data = sh ? sh.getDataRange().getValues().slice(1) : [];
  const registered = data.map(r => ({ email:String(r[0]||'').trim(), role:r[2], status:r[3] }));
  const result = {
    detected_active_user:    active    || '(kosong - Workspace privacy)',
    detected_effective_user: effective || '(kosong)',
    registered_users:        registered,
    match_check: registered.some(u => u.email.toLowerCase() === String(active||'').trim().toLowerCase())
                 ? 'COCOK ✓ — email Anda terdaftar'
                 : 'TIDAK COCOK ✗ — email Anda belum ada di sheet User'
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

/**
 * Self-register: jika belum ada Admin Aktif di sheet User, user yang sedang
 * akses bisa mendaftarkan dirinya sebagai Admin. Ini fallback aman jika baris
 * admin default di initSetup tidak terbentuk (mis. karena Session email kosong).
 */
function claimAdmin(namaLengkap){
  try {
    const email = (Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || '').trim();
    if (!email) throw new Error('Email Anda tidak terdeteksi oleh Apps Script. Pastikan Anda login dengan akun Google yang sama, dan deploy web app menggunakan "Execute as: Me".');

    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USER);
    const data = sh.getDataRange().getValues();

    // Cek apakah sudah ada Admin Aktif lain
    let hasActiveAdmin = false;
    let myRow = -1;
    for (let i=1; i<data.length; i++){
      const e = String(data[i][0]||'').trim().toLowerCase();
      const role   = String(data[i][2]||'').trim();
      const status = String(data[i][3]||'').trim();
      if (role === 'Admin' && status === 'Active' && e !== email.toLowerCase()) hasActiveAdmin = true;
      if (e === email.toLowerCase()) myRow = i+1;
    }
    if (hasActiveAdmin) throw new Error('Sudah ada Admin Aktif lain. Minta Admin tersebut untuk menambahkan akun Anda.');

    if (myRow > 0){
      // sudah ada baris saya, tinggal aktifkan & jadikan admin
      sh.getRange(myRow, 1).setValue(email);
      sh.getRange(myRow, 2).setValue(namaLengkap || sh.getRange(myRow,2).getValue() || 'Administrator');
      sh.getRange(myRow, 3).setValue('Admin');
      sh.getRange(myRow, 4).setValue('Active');
      sh.getRange(myRow, 5).setValue(new Date());
    } else {
      sh.appendRow([email, namaLengkap || 'Administrator', 'Admin', 'Active', new Date(), new Date(), 'admin123']);
    }
    return { ok:true, message:'Berhasil! Anda sekarang terdaftar sebagai Admin: ' + email };
  } catch(err){
    return logAndReturnError_('claimAdmin','User',err,{namaLengkap});
  }
}

function requireRole_(roles, _auth){
  let u = null;

  // 1) Token-based auth (utamakan ini, dipakai oleh login form)
  if (_auth && _auth.token){
    const cached = _getUserFromToken_(_auth.token);
    if (cached) u = { email: cached.email, nama: cached.nama, role: cached.role, status: 'Active', found: true };
  }

  // 2) Fallback: Session-based (jika user akses dengan akun Google yang terdaftar)
  if (!u){
    u = getCurrentUser();
  }

  if (!u.found || u.status !== 'Active') throw new Error('Akses ditolak: silakan login terlebih dahulu.');
  if (roles && roles.indexOf(u.role) === -1) throw new Error('Akses ditolak: role tidak memadai.');
  return u;
}

// =============================================================================
//  LOGIN / LOGOUT (TOKEN-BASED)
// =============================================================================
/**
 * Login dengan email & password. Mengembalikan token yang harus dikirim
 * di setiap request berikutnya sebagai _auth = {token}.
 * Token disimpan di CacheService selama 6 jam.
 */
function loginUser(email, password){
  try {
    if (!email || !password) throw new Error('Email & password wajib diisi.');
    const target = String(email).trim().toLowerCase();
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USER);
    const data = sh.getDataRange().getValues();

    for (let i=1; i<data.length; i++){
      const e = String(data[i][0]||'').trim().toLowerCase();
      if (e !== target) continue;
      const role   = String(data[i][2]||'').trim();
      const status = String(data[i][3]||'').trim();
      const stored = String(data[i][6]||'');  // kolom Password (index 6)

      if (status !== 'Active') throw new Error('Akun Anda tidak aktif. Hubungi Admin.');
      if (!stored)             throw new Error('Akun belum punya password. Minta Admin set password.');
      if (stored !== password) throw new Error('Password salah.');

      // sukses
      sh.getRange(i+1, 5).setValue(new Date()); // update Terakhir_Akses

      const token = Utilities.getUuid().replace(/-/g,'') + Date.now().toString(36);
      const userInfo = { email: e, nama: data[i][1], role: role, status: status };
      CacheService.getScriptCache().put('auth_' + token, JSON.stringify(userInfo), 21600); // 6 jam

      return { ok:true, token: token, user: userInfo, message:'Login berhasil.' };
    }
    throw new Error('Email tidak terdaftar.');
  } catch(err){
    return logAndReturnError_('loginUser','Auth',err,{email});
  }
}

/**
 * Verifikasi token. Dipanggil saat halaman dibuka untuk auto-login.
 */
function verifyToken(token){
  try {
    const u = _getUserFromToken_(token);
    if (!u) return { ok:false, message:'Sesi sudah berakhir, silakan login ulang.' };
    return { ok:true, user: u };
  } catch(err){
    return logAndReturnError_('verifyToken','Auth',err);
  }
}

/**
 * Hapus token dari cache (logout).
 */
function logoutUser(token){
  try {
    if (token) CacheService.getScriptCache().remove('auth_' + token);
    return { ok:true, message:'Logout berhasil.' };
  } catch(err){
    return logAndReturnError_('logoutUser','Auth',err);
  }
}

function _getUserFromToken_(token){
  if (!token) return null;
  const raw = CacheService.getScriptCache().get('auth_' + token);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch(_){ return null; }
}

/**
 * Ganti password sendiri. Memerlukan token + password lama untuk verifikasi.
 */
function changePassword(passwordLama, passwordBaru, _auth){
  try {
    const u = requireRole_(null, _auth);
    if (!passwordBaru || passwordBaru.length < 4) throw new Error('Password baru minimal 4 karakter.');
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USER);
    const data = sh.getDataRange().getValues();
    for (let i=1;i<data.length;i++){
      if (String(data[i][0]||'').trim().toLowerCase() === u.email.toLowerCase()){
        if (String(data[i][6]||'') !== passwordLama) throw new Error('Password lama salah.');
        sh.getRange(i+1, 7).setValue(passwordBaru);
        return { ok:true, message:'Password berhasil diubah.' };
      }
    }
    throw new Error('User tidak ditemukan.');
  } catch(err){ return logAndReturnError_('changePassword','Auth',err); }
}

// =============================================================================
//  DASHBOARD
// =============================================================================
function getDashboardData(){
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const m  = ss.getSheetByName(SHEET_MASTER).getDataRange().getValues();
    const t  = ss.getSheetByName(SHEET_TRANSAKSI).getDataRange().getValues();

    const items = m.slice(1).filter(r => r[13] === 'Active');
    const totalItem = items.length;

    let hampirHabis = 0, expired = 0;
    const today = new Date(); today.setHours(0,0,0,0);
    const stokRendah = [];
    const alertList  = [];

    items.forEach(r => {
      const stok = Number(r[6]) || 0;
      const min  = Number(r[10]) || 0;
      if (stok <= min){
        hampirHabis++;
        stokRendah.push({ id:r[0], nama:r[1], kategori:r[2], stok:stok, min:min, satuan:r[7] });
        alertList.push({ tipe:'Stok Menipis', pesan:`${r[1]} stok ${stok} ${r[7]} (min ${min})`, waktu:r[14] });
      }
      if (r[11]){
        const exp = new Date(r[11]);
        const diff = Math.floor((exp - today)/(1000*60*60*24));
        if (diff <= 7){
          expired++;
          alertList.push({ tipe:'Expired', pesan:`${r[1]} expired pada ${formatDate_(exp)} (${diff} hari)`, waktu:r[14] });
        }
      }
    });

    stokRendah.sort((a,b)=>a.stok-b.stok);

    // transaksi 7 hari terakhir
    const trxItems = t.slice(1);
    const last7 = trxItems.filter(r => r[1] && (today - new Date(r[1]))/(1000*60*60*24) <= 7);

    return {
      ok:true,
      totalItem, hampirHabis, expired,
      totalTransaksi7Hari: last7.length,
      stokRendah: stokRendah.slice(0,10),
      alerts: alertList.slice(0,10)
    };
  } catch(err){ return logAndReturnError_('getDashboardData','Dashboard',err); }
}

// =============================================================================
//  MASTER BARANG
// =============================================================================
function getMasterBarang(){
  try {
    const data = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_MASTER).getDataRange().getValues();
    const rows = data.slice(1).map(r => rowToObj_(HEADER_MASTER, r))
                              .filter(o => o.Status !== 'Deleted');
    return { ok:true, data: rows };
  } catch(err){ return logAndReturnError_('getMasterBarang','Master',err); }
}

/**
 * Simpan barang baru.
 * formData: {nama, kategori, stokAwal, satuan, hargaBeli, hargaJual,
 *            minStok, expiredDate, fileBase64, fileName, fileType}
 */
function saveBarang(formData, _auth){
  try {
    const u = requireRole_(['Admin','Staff'], _auth);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(SHEET_MASTER);

    // Validasi
    const f = formData || {};
    if (!f.nama || !String(f.nama).trim()) throw new Error('Nama barang wajib diisi.');
    if (!isNumber_(f.stokAwal) || Number(f.stokAwal) < 0) throw new Error('Stok awal harus angka >= 0.');
    if (f.hargaBeli !== '' && !isNumber_(f.hargaBeli)) throw new Error('Harga beli harus angka.');
    if (f.hargaJual !== '' && !isNumber_(f.hargaJual)) throw new Error('Harga jual harus angka.');
    if (f.minStok !== '' && !isNumber_(f.minStok)) throw new Error('Min stok harus angka.');
    if (f.expiredDate && !isValidDate_(f.expiredDate)) throw new Error('Tanggal expired tidak valid.');

    // Anti duplikat (case-insensitive, hanya untuk row Active)
    const data = sh.getDataRange().getValues();
    for (let i=1;i<data.length;i++){
      if (String(data[i][1]).toLowerCase().trim() === String(f.nama).toLowerCase().trim()
          && data[i][13] === 'Active'){
        throw new Error('Nama barang sudah ada: ' + f.nama);
      }
    }

    const id  = generateIdBarang_();
    const now = new Date();

    // Upload foto jika ada
    let fotoUrl = '';
    if (f.fileBase64 && f.fileName){
      fotoUrl = uploadToDrive_(f.fileBase64, f.fileName, f.fileType, FOLDER_FOTO);
    }

    const stokAwal = Number(f.stokAwal) || 0;
    sh.appendRow([
      id,
      String(f.nama).trim(),
      f.kategori || '',
      stokAwal, 0, 0, stokAwal,
      f.satuan || 'pcs',
      Number(f.hargaBeli)||0,
      Number(f.hargaJual)||0,
      Number(f.minStok)||0,
      f.expiredDate ? new Date(f.expiredDate) : '',
      fotoUrl,
      'Active',
      now,
      u.email
    ]);

    // Buat event kalender jika expired
    if (f.expiredDate) createOrUpdateExpiryEvent_(id, f.nama, f.expiredDate);

    return { ok:true, id:id, message:'Barang berhasil ditambahkan.' };
  } catch(err){
    sendErrorEmail_('Validasi Master Barang gagal', err.message, formData);
    return logAndReturnError_('saveBarang','Master',err,formData);
  }
}

function updateBarang(formData, _auth){
  try {
    const u = requireRole_(['Admin','Staff'], _auth);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(SHEET_MASTER);
    const data = sh.getDataRange().getValues();
    const f = formData || {};

    if (!f.id) throw new Error('ID barang tidak boleh kosong.');
    let rowIdx = -1;
    for (let i=1;i<data.length;i++){
      if (data[i][0] === f.id){ rowIdx = i+1; break; }
    }
    if (rowIdx === -1) throw new Error('Barang tidak ditemukan: ' + f.id);

    // Cek duplikat nama (selain row sendiri)
    if (f.nama){
      for (let i=1;i<data.length;i++){
        if (i+1 !== rowIdx
            && String(data[i][1]).toLowerCase().trim() === String(f.nama).toLowerCase().trim()
            && data[i][13] === 'Active'){
          throw new Error('Nama barang sudah dipakai: ' + f.nama);
        }
      }
    }

    let fotoUrl = data[rowIdx-1][12];
    if (f.fileBase64 && f.fileName){
      fotoUrl = uploadToDrive_(f.fileBase64, f.fileName, f.fileType, FOLDER_FOTO);
    }

    const stokMasuk  = Number(data[rowIdx-1][4]) || 0;
    const stokKeluar = Number(data[rowIdx-1][5]) || 0;
    const stokAwal   = isNumber_(f.stokAwal) ? Number(f.stokAwal) : Number(data[rowIdx-1][3]);
    const stokAkhir  = stokAwal + stokMasuk - stokKeluar;

    sh.getRange(rowIdx,1,1,HEADER_MASTER.length).setValues([[
      f.id,
      f.nama || data[rowIdx-1][1],
      f.kategori !== undefined ? f.kategori : data[rowIdx-1][2],
      stokAwal,
      stokMasuk,
      stokKeluar,
      stokAkhir,
      f.satuan || data[rowIdx-1][7],
      isNumber_(f.hargaBeli) ? Number(f.hargaBeli) : data[rowIdx-1][8],
      isNumber_(f.hargaJual) ? Number(f.hargaJual) : data[rowIdx-1][9],
      isNumber_(f.minStok)   ? Number(f.minStok)   : data[rowIdx-1][10],
      f.expiredDate ? new Date(f.expiredDate) : (f.expiredDate === '' ? '' : data[rowIdx-1][11]),
      fotoUrl,
      data[rowIdx-1][13],
      new Date(),
      u.email
    ]]);

    if (f.expiredDate) createOrUpdateExpiryEvent_(f.id, f.nama || data[rowIdx-1][1], f.expiredDate);
    else if (f.expiredDate === '') deleteExpiryEvent_(f.id);

    return { ok:true, message:'Barang berhasil diupdate.' };
  } catch(err){
    sendErrorEmail_('Update Master Barang gagal', err.message, formData);
    return logAndReturnError_('updateBarang','Master',err,formData);
  }
}

/**
 * Soft delete: ubah Status menjadi Inactive.
 */
function deleteBarang(idBarang, _auth){
  try {
    const u = requireRole_(['Admin'], _auth);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = ss.getSheetByName(SHEET_MASTER);
    const data = sh.getDataRange().getValues();
    for (let i=1;i<data.length;i++){
      if (data[i][0] === idBarang){
        sh.getRange(i+1, 14).setValue('Inactive');
        sh.getRange(i+1, 15).setValue(new Date());
        sh.getRange(i+1, 16).setValue(u.email);
        deleteExpiryEvent_(idBarang);
        return { ok:true, message:'Barang dinonaktifkan.' };
      }
    }
    throw new Error('Barang tidak ditemukan.');
  } catch(err){ return logAndReturnError_('deleteBarang','Master',err,{idBarang}); }
}

// =============================================================================
//  TRANSAKSI
// =============================================================================
/**
 * formData: {tipe:'Masuk'|'Keluar', idBarang, qty, tanggal, keterangan,
 *            fileBase64, fileName, fileType}
 */
function saveTransaksi(formData, _auth){
  try {
    const u = requireRole_(['Admin','Staff'], _auth);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const shM = ss.getSheetByName(SHEET_MASTER);
    const shT = ss.getSheetByName(SHEET_TRANSAKSI);
    const f = formData || {};

    if (['Masuk','Keluar'].indexOf(f.tipe) === -1) throw new Error('Tipe transaksi harus Masuk/Keluar.');
    if (!f.idBarang) throw new Error('ID barang wajib diisi.');
    if (!isNumber_(f.qty) || Number(f.qty) <= 0) throw new Error('Qty harus angka > 0.');
    if (f.tanggal && !isValidDate_(f.tanggal)) throw new Error('Tanggal tidak valid.');

    // Cari barang
    const data = shM.getDataRange().getValues();
    let rowIdx = -1;
    for (let i=1;i<data.length;i++){
      if (data[i][0] === f.idBarang && data[i][13] === 'Active'){ rowIdx = i+1; break; }
    }
    if (rowIdx === -1) throw new Error('Barang tidak ditemukan/aktif: ' + f.idBarang);

    const namaBarang = data[rowIdx-1][1];
    const stokSebelum = Number(data[rowIdx-1][6]) || 0;
    const qty = Number(f.qty);

    if (f.tipe === 'Keluar' && qty > stokSebelum)
      throw new Error(`Stok tidak cukup. Stok saat ini: ${stokSebelum}, diminta: ${qty}.`);

    // Upload bukti
    let buktiUrl = '';
    if (f.fileBase64 && f.fileName){
      buktiUrl = uploadToDrive_(f.fileBase64, f.fileName, f.fileType, FOLDER_BUKTI);
    }

    // Hitung stok baru
    const stokMasuk  = Number(data[rowIdx-1][4]) || 0;
    const stokKeluar = Number(data[rowIdx-1][5]) || 0;
    let newMasuk  = stokMasuk;
    let newKeluar = stokKeluar;
    if (f.tipe === 'Masuk') newMasuk += qty; else newKeluar += qty;
    const stokSesudah = (Number(data[rowIdx-1][3])||0) + newMasuk - newKeluar;

    // Update master
    shM.getRange(rowIdx, 5).setValue(newMasuk);
    shM.getRange(rowIdx, 6).setValue(newKeluar);
    shM.getRange(rowIdx, 7).setValue(stokSesudah);
    shM.getRange(rowIdx,15).setValue(new Date());
    shM.getRange(rowIdx,16).setValue(u.email);

    // Insert transaksi
    const idTrx = generateIdTransaksi_();
    shT.appendRow([
      idTrx,
      f.tanggal ? new Date(f.tanggal) : new Date(),
      f.tipe,
      f.idBarang,
      namaBarang,
      qty,
      stokSebelum,
      stokSesudah,
      f.keterangan || '',
      buktiUrl,
      u.email,
      new Date()
    ]);

    return { ok:true, id:idTrx, message:'Transaksi tersimpan.', stokSesudah:stokSesudah };
  } catch(err){
    sendErrorEmail_('Validasi Transaksi gagal', err.message, formData);
    return logAndReturnError_('saveTransaksi','Transaksi',err,formData);
  }
}

/**
 * filter: { tanggalDari, tanggalSampai, tipe, idBarang }
 */
function getTransaksi(filter){
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_TRANSAKSI);
    const rows = sh.getDataRange().getValues().slice(1).map(r => rowToObj_(HEADER_TRX, r));
    let result = rows;
    if (filter){
      if (filter.tanggalDari){
        const d = new Date(filter.tanggalDari);
        result = result.filter(r => new Date(r.Tanggal) >= d);
      }
      if (filter.tanggalSampai){
        const d = new Date(filter.tanggalSampai); d.setHours(23,59,59);
        result = result.filter(r => new Date(r.Tanggal) <= d);
      }
      if (filter.tipe)     result = result.filter(r => r.Tipe === filter.tipe);
      if (filter.idBarang) result = result.filter(r => r.ID_Barang === filter.idBarang);
    }
    result.sort((a,b) => new Date(b.Timestamp_Input) - new Date(a.Timestamp_Input));
    return { ok:true, data: result };
  } catch(err){ return logAndReturnError_('getTransaksi','Transaksi',err); }
}

// =============================================================================
//  USER MANAGEMENT
// =============================================================================
function getUsers(_auth){
  try {
    requireRole_(['Admin'], _auth);
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USER);
    const rows = sh.getDataRange().getValues().slice(1).map(r => rowToObj_(HEADER_USER, r));
    return { ok:true, data: rows };
  } catch(err){ return logAndReturnError_('getUsers','User',err); }
}

function saveUser(formData, _auth){
  try {
    requireRole_(['Admin'], _auth);
    const f = formData || {};
    const email = String(f.email||'').trim();
    if (!isValidEmail_(email)) throw new Error('Format email tidak valid.');
    if (!f.nama) throw new Error('Nama wajib diisi.');
    if (['Admin','Staff','Viewer'].indexOf(f.role) === -1) throw new Error('Role harus Admin/Staff/Viewer.');

    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USER);
    const data = sh.getDataRange().getValues();
    for (let i=1;i<data.length;i++){
      if (String(data[i][0]||'').trim().toLowerCase() === email.toLowerCase()){
        throw new Error('Email sudah terdaftar: ' + email);
      }
    }
    sh.appendRow([email, String(f.nama).trim(), f.role, f.status || 'Active', '', new Date(), f.password || 'changeme123']);
    return { ok:true, message:'User berhasil ditambahkan. Password default: ' + (f.password || 'changeme123') };
  } catch(err){
    sendErrorEmail_('Tambah User gagal', err.message, formData);
    return logAndReturnError_('saveUser','User',err,formData);
  }
}

function updateUserRole(email, role, status, _auth){
  try {
    requireRole_(['Admin'], _auth);
    const target = String(email||'').trim();
    if (!isValidEmail_(target)) throw new Error('Email tidak valid.');
    if (['Admin','Staff','Viewer'].indexOf(role) === -1) throw new Error('Role tidak valid.');
    if (['Active','Inactive'].indexOf(status) === -1) throw new Error('Status tidak valid.');

    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_USER);
    const data = sh.getDataRange().getValues();
    for (let i=1;i<data.length;i++){
      if (String(data[i][0]||'').trim().toLowerCase() === target.toLowerCase()){
        sh.getRange(i+1, 1).setValue(target);
        sh.getRange(i+1, 3).setValue(role);
        sh.getRange(i+1, 4).setValue(status);
        return { ok:true, message:'User diupdate.' };
      }
    }
    throw new Error('User tidak ditemukan.');
  } catch(err){ return logAndReturnError_('updateUserRole','User',err,{email,role,status}); }
}

// =============================================================================
//  LOG VALIDASI
// =============================================================================
function getLogValidasi(filter, _auth){
  try {
    requireRole_(['Admin'], _auth);
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LOG);
    let rows = sh.getDataRange().getValues().slice(1).map(r => rowToObj_(HEADER_LOG, r));
    if (filter){
      if (filter.tanggalDari) rows = rows.filter(r => new Date(r.Waktu) >= new Date(filter.tanggalDari));
      if (filter.tanggalSampai){
        const d = new Date(filter.tanggalSampai); d.setHours(23,59,59);
        rows = rows.filter(r => new Date(r.Waktu) <= d);
      }
      if (filter.userEmail) rows = rows.filter(r => String(r.User_Email).toLowerCase().indexOf(filter.userEmail.toLowerCase()) > -1);
    }
    rows.sort((a,b) => new Date(b.Waktu) - new Date(a.Waktu));
    return { ok:true, data: rows };
  } catch(err){ return logAndReturnError_('getLogValidasi','Log',err); }
}

function clearOldLogs(daysOld, _auth){
  try {
    requireRole_(['Admin'], _auth);
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LOG);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - (Number(daysOld)||30));
    const data = sh.getDataRange().getValues();
    for (let i=data.length-1; i>=1; i--){
      if (new Date(data[i][0]) < cutoff) sh.deleteRow(i+1);
    }
    return { ok:true, message:'Log lama dibersihkan.' };
  } catch(err){ return logAndReturnError_('clearOldLogs','Log',err); }
}

// =============================================================================
//  SETTINGS
// =============================================================================
function getSettings(){
  try {
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty('settings');
    const cur = raw ? JSON.parse(raw) : DEFAULT_SETTINGS;
    return { ok:true, data: Object.assign({}, DEFAULT_SETTINGS, cur) };
  } catch(err){ return logAndReturnError_('getSettings','Settings',err); }
}

function updateSettings(settings, _auth){
  try {
    requireRole_(['Admin'], _auth);
    const cur = (getSettings().data) || DEFAULT_SETTINGS;
    const merged = Object.assign({}, cur, settings || {});
    if (merged.emailAlert && !isValidEmail_(merged.emailAlert)) throw new Error('Email alert tidak valid.');
    PropertiesService.getScriptProperties().setProperty('settings', JSON.stringify(merged));
    return { ok:true, message:'Pengaturan disimpan.', data:merged };
  } catch(err){ return logAndReturnError_('updateSettings','Settings',err,settings); }
}

// =============================================================================
//  EMAIL ALERT (STOK & EXPIRED)
// =============================================================================
function checkAndSendAlerts(){
  try {
    const settings = getSettings().data;
    const target = settings.emailAlert || Session.getActiveUser().getEmail();
    if (!target) return { ok:false, message:'Tidak ada email tujuan.' };

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = ss.getSheetByName(SHEET_MASTER).getDataRange().getValues();

    const today = new Date(); today.setHours(0,0,0,0);
    const hari = Number(settings.hariSebelumExpired) || 7;
    const stokRendah = [];
    const expSoon    = [];

    for (let i=1;i<data.length;i++){
      const r = data[i];
      if (r[13] !== 'Active') continue;
      const stok = Number(r[6])||0, min = Number(r[10])||0;
      if (stok <= min) stokRendah.push({id:r[0], nama:r[1], stok:stok, min:min, satuan:r[7]});
      if (r[11]){
        const exp = new Date(r[11]);
        const diff = Math.floor((exp - today)/(1000*60*60*24));
        if (diff <= hari) expSoon.push({id:r[0], nama:r[1], expired:formatDate_(exp), sisaHari:diff});
      }
    }

    if (stokRendah.length === 0 && expSoon.length === 0)
      return { ok:true, message:'Tidak ada alert.' };

    let html = `<div style="font-family:Arial;max-width:600px">
      <h2 style="color:#dc2626;margin:0 0 10px">⚠ Alert Stok Barang</h2>
      <p>Halo, berikut ringkasan alert dari <b>${escapeHtml_(settings.namaPerusahaan)}</b> per ${formatDate_(new Date())}:</p>`;

    if (stokRendah.length){
      html += `<h3 style="background:#fef3c7;padding:8px;margin-top:14px">📉 Stok Menipis (${stokRendah.length})</h3>`;
      html += `<table style="border-collapse:collapse;width:100%"><tr style="background:#f3f4f6">
        <th style="border:1px solid #ddd;padding:6px">ID</th>
        <th style="border:1px solid #ddd;padding:6px">Nama</th>
        <th style="border:1px solid #ddd;padding:6px">Stok</th>
        <th style="border:1px solid #ddd;padding:6px">Min</th></tr>`;
      stokRendah.forEach(r => {
        html += `<tr><td style="border:1px solid #ddd;padding:6px">${escapeHtml_(r.id)}</td>
        <td style="border:1px solid #ddd;padding:6px">${escapeHtml_(r.nama)}</td>
        <td style="border:1px solid #ddd;padding:6px;color:#dc2626"><b>${r.stok} ${r.satuan}</b></td>
        <td style="border:1px solid #ddd;padding:6px">${r.min}</td></tr>`;
      });
      html += '</table>';
    }

    if (expSoon.length){
      html += `<h3 style="background:#fee2e2;padding:8px;margin-top:14px">⏰ Akan/Sudah Expired (${expSoon.length})</h3>`;
      html += `<table style="border-collapse:collapse;width:100%"><tr style="background:#f3f4f6">
        <th style="border:1px solid #ddd;padding:6px">ID</th>
        <th style="border:1px solid #ddd;padding:6px">Nama</th>
        <th style="border:1px solid #ddd;padding:6px">Tgl Expired</th>
        <th style="border:1px solid #ddd;padding:6px">Sisa Hari</th></tr>`;
      expSoon.forEach(r => {
        html += `<tr><td style="border:1px solid #ddd;padding:6px">${escapeHtml_(r.id)}</td>
        <td style="border:1px solid #ddd;padding:6px">${escapeHtml_(r.nama)}</td>
        <td style="border:1px solid #ddd;padding:6px">${r.expired}</td>
        <td style="border:1px solid #ddd;padding:6px;color:${r.sisaHari<=0?'#dc2626':'#d97706'}"><b>${r.sisaHari}</b></td></tr>`;
      });
      html += '</table>';
    }

    html += `<p style="margin-top:20px;font-size:12px;color:#6b7280">Email otomatis dari Aplikasi Stok Barang.</p></div>`;

    GmailApp.sendEmail(target, '[Stok Barang] Alert Harian - ' + formatDate_(new Date()),
      'Buka email dalam mode HTML untuk melihat detail.', { htmlBody: html });

    return { ok:true, message:'Email alert dikirim.', detail:{stokRendah:stokRendah.length, expired:expSoon.length} };
  } catch(err){ return logAndReturnError_('checkAndSendAlerts','Email',err); }
}

function sendErrorEmail_(subject, message, dataGagal){
  try {
    const settings = getSettings().data;
    const target = settings.emailAlert;
    if (!target) return;
    const html = `<div style="font-family:Arial">
      <h3 style="color:#dc2626">Error Validasi</h3>
      <p><b>Pesan:</b> ${escapeHtml_(message)}</p>
      <p><b>Data:</b></p>
      <pre style="background:#f3f4f6;padding:10px;border-radius:6px">${escapeHtml_(JSON.stringify(dataGagal||{},null,2))}</pre>
      <p><b>User:</b> ${escapeHtml_(Session.getActiveUser().getEmail()||'-')}</p>
      <p><b>Waktu:</b> ${formatDate_(new Date(),true)}</p></div>`;
    GmailApp.sendEmail(target, '[Stok Barang] ' + subject, message, { htmlBody: html });
  } catch(_){}
}

function sendMonthlyReport(){
  try {
    const settings = getSettings().data;
    const target = settings.emailAlert || Session.getActiveUser().getEmail();
    if (!target) return;

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const m  = ss.getSheetByName(SHEET_MASTER).getDataRange().getValues().slice(1);
    const t  = ss.getSheetByName(SHEET_TRANSAKSI).getDataRange().getValues().slice(1);

    const today = new Date();
    const firstPrev = new Date(today.getFullYear(), today.getMonth()-1, 1);
    const lastPrev  = new Date(today.getFullYear(), today.getMonth(), 0, 23,59,59);

    const trxBulan = t.filter(r => {
      const d = new Date(r[1]); return d >= firstPrev && d <= lastPrev;
    });
    const masuk  = trxBulan.filter(r => r[2] === 'Masuk').reduce((s,r)=>s+(Number(r[5])||0),0);
    const keluar = trxBulan.filter(r => r[2] === 'Keluar').reduce((s,r)=>s+(Number(r[5])||0),0);
    const aktif  = m.filter(r => r[13] === 'Active').length;

    const html = `<div style="font-family:Arial;max-width:600px">
      <h2>📊 Laporan Bulanan - ${formatDate_(firstPrev)} s/d ${formatDate_(lastPrev)}</h2>
      <ul>
        <li>Total barang aktif: <b>${aktif}</b></li>
        <li>Total transaksi bulan ini: <b>${trxBulan.length}</b></li>
        <li>Total qty masuk: <b>${masuk}</b></li>
        <li>Total qty keluar: <b>${keluar}</b></li>
      </ul></div>`;

    GmailApp.sendEmail(target, '[Stok Barang] Laporan Bulanan ' + formatDate_(firstPrev),
      'Laporan bulanan terlampir.', { htmlBody: html });
    return { ok:true };
  } catch(err){ return logAndReturnError_('sendMonthlyReport','Email',err); }
}

// =============================================================================
//  BACKUP
// =============================================================================
function backupData(){
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const allData = {};
    [SHEET_MASTER, SHEET_TRANSAKSI, SHEET_USER, SHEET_LOG].forEach(name => {
      const sh = ss.getSheetByName(name);
      allData[name] = sh ? sh.getDataRange().getValues() : [];
    });
    const json = JSON.stringify({
      generated_at: new Date().toISOString(),
      sheets: allData
    }, null, 2);

    const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
    const folder = getOrCreateFolder_(root, FOLDER_BACKUP);
    const fname = 'backup_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss') + '.json';
    const file = folder.createFile(fname, json, 'application/json');
    return { ok:true, message:'Backup tersimpan.', url:file.getUrl(), file:fname };
  } catch(err){ return logAndReturnError_('backupData','Backup',err); }
}

// =============================================================================
//  CALENDAR (EXPIRED REMINDER)
// =============================================================================
function createOrUpdateExpiryEvent_(idBarang, namaBarang, expiredDate){
  try {
    const settings = getSettings().data;
    const days = Number(settings.hariSebelumExpired) || 7;
    const cal = CalendarApp.getDefaultCalendar();
    if (!cal) return;
    const reminderDate = new Date(expiredDate);
    reminderDate.setDate(reminderDate.getDate() - days);
    const tag = '[STOK-' + idBarang + ']';
    const title = `${tag} Reminder Expired: ${namaBarang}`;

    // hapus event lama dengan tag
    const events = cal.getEvents(new Date(reminderDate.getFullYear()-1,0,1),
                                 new Date(reminderDate.getFullYear()+2,0,1));
    events.forEach(ev => { if (ev.getTitle().indexOf(tag) > -1) ev.deleteEvent(); });

    cal.createAllDayEvent(title, reminderDate, {
      description: `Barang ${namaBarang} (${idBarang}) akan expired pada ${formatDate_(new Date(expiredDate))}.`
    });
  } catch(err){ logError_('createOrUpdateExpiryEvent','Calendar',err.message,{idBarang,expiredDate}); }
}

function deleteExpiryEvent_(idBarang){
  try {
    const cal = CalendarApp.getDefaultCalendar();
    if (!cal) return;
    const tag = '[STOK-' + idBarang + ']';
    const events = cal.getEvents(new Date(2000,0,1), new Date(2100,0,1));
    events.forEach(ev => { if (ev.getTitle().indexOf(tag) > -1) ev.deleteEvent(); });
  } catch(err){ logError_('deleteExpiryEvent','Calendar',err.message,{idBarang}); }
}

// =============================================================================
//  TRIGGER OTOMATIS
// =============================================================================
function createTimeDrivenTriggers(){
  // Hapus trigger lama agar tidak duplikat
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['checkAndSendAlerts','backupData','sendMonthlyReport'].indexOf(t.getHandlerFunction()) > -1)
      ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkAndSendAlerts').timeBased().everyDays(1).atHour(8).create();
  ScriptApp.newTrigger('backupData').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(23).create();
  ScriptApp.newTrigger('sendMonthlyReport').timeBased().onMonthDay(1).atHour(8).create();
  return { ok:true, message:'Trigger otomatis dibuat.' };
}

// =============================================================================
//  HELPER FUNCTIONS
// =============================================================================
function rowToObj_(headers, row){
  const o = {};
  headers.forEach((h,i) => { o[h] = row[i]; });
  return o;
}

function isNumber_(v){ return v !== '' && v !== null && v !== undefined && !isNaN(Number(v)); }
function isValidDate_(v){ const d = new Date(v); return d instanceof Date && !isNaN(d); }
function isValidEmail_(v){ return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v||'')); }
function escapeHtml_(s){
  return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}
function formatDate_(d, withTime){
  if (!d) return '';
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  return Utilities.formatDate(new Date(d), tz, withTime ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy');
}

function generateIdBarang_(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(SHEET_MASTER);
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd');
  const data = sh.getDataRange().getValues();
  let counter = 1;
  for (let i=1;i<data.length;i++){
    const id = String(data[i][0]||'');
    if (id.indexOf('BRG-' + today) === 0){
      const num = parseInt(id.split('-')[2],10);
      if (!isNaN(num) && num >= counter) counter = num + 1;
    }
  }
  return 'BRG-' + today + '-' + Utilities.formatString('%04d', counter);
}

function generateIdTransaksi_(){
  const stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  return 'TRX-' + stamp;
}

function getOrCreateFolder_(parent, name){
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/**
 * Upload base64 string ke Drive subfolder.
 */
function uploadToDrive_(base64Data, fileName, mimeType, subfolderName){
  // base64Data bisa berupa "data:image/png;base64,xxxx" atau "xxxx"
  const idx = String(base64Data).indexOf('base64,');
  const raw = idx > -1 ? base64Data.substring(idx+7) : base64Data;
  const blob = Utilities.newBlob(Utilities.base64Decode(raw), mimeType || 'application/octet-stream', fileName);
  const root = getOrCreateFolder_(DriveApp.getRootFolder(), ROOT_FOLDER_NAME);
  const folder = getOrCreateFolder_(root, subfolderName);
  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function logError_(aksi, lokasi, pesan, dataGagal){
  try {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_LOG);
    sh.appendRow([new Date(), aksi, lokasi, String(pesan||''),
      JSON.stringify(dataGagal||{}), Session.getActiveUser().getEmail()||'']);
  } catch(_){}
}

function logAndReturnError_(aksi, lokasi, err, dataGagal){
  logError_(aksi, lokasi, err && err.message ? err.message : err, dataGagal);
  return { ok:false, message: (err && err.message) ? err.message : String(err) };
}

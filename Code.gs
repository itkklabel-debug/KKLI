// ============================================
// DIMSUM ENAK - POS SYSTEM
// Backend (Google Apps Script)
// ============================================

// === CONFIGURATION ===
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const CACHE_DURATION = 300; // 5 minutes

function doGet(e) {
  const page = e.parameter.page;
  const token = e.parameter.token;
  
  // Public pages
  if (!page || page === 'login') {
    return HtmlService.createTemplateFromFile('login')
      .evaluate()
      .setTitle('Dimsum Enak - Login')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  
  // Protected pages - verify session
  if (!token || !verifySession(token)) {
    return HtmlService.createTemplateFromFile('login')
      .evaluate()
      .setTitle('Dimsum Enak - Login')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  
  const session = getSessionData(token);
  
  if (page === 'kasir' && (session.role === 'kasir' || session.role === 'owner')) {
    const template = HtmlService.createTemplateFromFile('kasir');
    template.token = token;
    template.username = session.username;
    template.cabang = session.cabang;
    template.role = session.role;
    return template.evaluate()
      .setTitle('Dimsum Enak - Kasir')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  
  if (page === 'owner' && session.role === 'owner') {
    const template = HtmlService.createTemplateFromFile('owner');
    template.token = token;
    template.username = session.username;
    return template.evaluate()
      .setTitle('Dimsum Enak - Dashboard Owner')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  
  // Fallback to login
  return HtmlService.createTemplateFromFile('login')
    .evaluate()
    .setTitle('Dimsum Enak - Login')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// === GET WEB APP URL ===
function getWebAppUrl() {
  return ScriptApp.getService().getUrl();
}

// === SESSION MANAGEMENT ===
function login(username, password) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('users');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username && data[i][1] === password) {
      const token = Utilities.getUuid();
      const sessionData = {
        username: data[i][0],
        role: data[i][2],
        cabang: data[i][3],
        created: new Date().getTime()
      };
      
      PropertiesService.getScriptProperties().setProperty('session_' + token, JSON.stringify(sessionData));
      
      return {
        success: true,
        token: token,
        role: data[i][2],
        username: data[i][0],
        cabang: data[i][3]
      };
    }
  }
  
  return { success: false, message: 'Username atau password salah!' };
}

function verifySession(token) {
  const prop = PropertiesService.getScriptProperties().getProperty('session_' + token);
  if (!prop) return false;
  
  const session = JSON.parse(prop);
  const now = new Date().getTime();
  const maxAge = 12 * 60 * 60 * 1000; // 12 hours
  
  if (now - session.created > maxAge) {
    PropertiesService.getScriptProperties().deleteProperty('session_' + token);
    return false;
  }
  
  return true;
}

function getSessionData(token) {
  const prop = PropertiesService.getScriptProperties().getProperty('session_' + token);
  if (!prop) return null;
  return JSON.parse(prop);
}

function logout(token) {
  PropertiesService.getScriptProperties().deleteProperty('session_' + token);
  return { success: true };
}

// === MENU MANAGEMENT ===
function getMenu() {
  const cache = CacheService.getScriptCache();
  const cached = cache.get('menu_data');
  
  if (cached) {
    return JSON.parse(cached);
  }
  
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('menu');
  const data = sheet.getDataRange().getValues();
  
  const menu = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][4] === true || data[i][4] === 'TRUE' || data[i][4] === 'aktif') {
      menu.push({
        id: data[i][0],
        nama: data[i][1],
        harga: data[i][2],
        gambar: data[i][3],
        aktif: true
      });
    }
  }
  
  cache.put('menu_data', JSON.stringify(menu), CACHE_DURATION);
  return menu;
}

function getAllMenu() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('menu');
  const data = sheet.getDataRange().getValues();
  
  const menu = [];
  for (let i = 1; i < data.length; i++) {
    menu.push({
      id: data[i][0],
      nama: data[i][1],
      harga: data[i][2],
      gambar: data[i][3],
      aktif: data[i][4]
    });
  }
  return menu;
}

function addMenu(nama, harga, gambarBase64, filename) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('menu');
  const lastRow = sheet.getLastRow();
  const newId = lastRow > 0 ? lastRow : 1;
  
  let gambarUrl = '';
  if (gambarBase64 && filename) {
    gambarUrl = uploadImage(gambarBase64, filename);
  }
  
  sheet.appendRow([newId, nama, harga, gambarUrl, true]);
  
  // Clear cache
  CacheService.getScriptCache().remove('menu_data');
  
  return { success: true, id: newId };
}

function updateMenu(id, nama, harga, gambarBase64, filename) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('menu');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      sheet.getRange(i + 1, 2).setValue(nama);
      sheet.getRange(i + 1, 3).setValue(harga);
      
      if (gambarBase64 && filename) {
        const gambarUrl = uploadImage(gambarBase64, filename);
        sheet.getRange(i + 1, 4).setValue(gambarUrl);
      }
      break;
    }
  }
  
  CacheService.getScriptCache().remove('menu_data');
  return { success: true };
}

function toggleMenu(id, aktif) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('menu');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      sheet.getRange(i + 1, 5).setValue(aktif);
      break;
    }
  }
  
  CacheService.getScriptCache().remove('menu_data');
  return { success: true };
}

function deleteMenu(id) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('menu');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] == id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  
  CacheService.getScriptCache().remove('menu_data');
  return { success: true };
}

// === IMAGE UPLOAD ===
function uploadImage(base64Data, filename) {
  try {
    const decoded = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decoded, 'image/png', filename);
    
    // Create or get folder
    const folders = DriveApp.getFoldersByName('DimSum_POS_Images');
    let folder;
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder('DimSum_POS_Images');
      folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
    
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return 'https://drive.google.com/uc?id=' + file.getId();
  } catch (e) {
    Logger.log('Upload error: ' + e.toString());
    return '';
  }
}

// === QRIS BUKTI UPLOAD ===
function uploadQrisBukti(base64Data, filename, kasir, cabang) {
  try {
    // Validate base64 data
    if (!base64Data || base64Data.length < 100) {
      return { success: false, message: 'Data gambar tidak valid' };
    }
    
    // Remove any data URL prefix if accidentally included
    let cleanBase64 = base64Data;
    if (cleanBase64.indexOf('base64,') > -1) {
      cleanBase64 = cleanBase64.split('base64,')[1];
    }
    
    // Decode base64 to byte array
    const decoded = Utilities.base64Decode(cleanBase64);
    
    // Create blob from byte array
    const blob = Utilities.newBlob(decoded);
    blob.setName(filename);
    blob.setContentType('image/jpeg');
    
    // Create or get QRIS folder
    const folderName = 'DimSum_POS_QRIS_Bukti';
    const folders = DriveApp.getFoldersByName(folderName);
    let folder;
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
      folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    }
    
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const fileUrl = 'https://drive.google.com/uc?id=' + file.getId();
    
    // Update last QRIS transaction with bukti URL
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('transaksi');
    const data = sheet.getDataRange().getValues();
    
    for (let i = data.length - 1; i >= 1; i--) {
      if (data[i][2] === 'QRIS' && data[i][3] === kasir && data[i][4] === cabang) {
        const currentItems = data[i][5] || '';
        sheet.getRange(i + 1, 6).setValue(currentItems + ' | Bukti: ' + fileUrl);
        break;
      }
    }
    
    return { success: true, url: fileUrl };
  } catch (e) {
    Logger.log('QRIS upload error: ' + e.toString());
    return { success: false, message: e.toString() };
  }
}

// === TRANSACTION DETAIL (for reports) ===
function getTransactionDetail(period, cabang) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('transaksi');
  const data = sheet.getDataRange().getValues();
  
  const now = new Date();
  let startDate;
  
  switch (period) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case '7days':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30days':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  
  const results = [];
  for (let i = 1; i < data.length; i++) {
    const waktu = new Date(data[i][0]);
    if (waktu < startDate) continue;
    if (cabang && cabang !== 'semua' && data[i][4] !== cabang) continue;
    
    results.push({
      waktu: data[i][0],
      total: Number(data[i][1]) || 0,
      metode: data[i][2],
      kasir: data[i][3],
      cabang: data[i][4],
      items: (data[i][5] || '').toString().split(' | Bukti:')[0]  // Remove bukti URL from display
    });
  }
  
  // Sort newest first
  results.sort(function(a, b) { return new Date(b.waktu) - new Date(a.waktu); });
  
  return results;
}

// === TRANSACTION MANAGEMENT ===
function saveTransaction(items, total, metode, kasir, cabang) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('transaksi');
  
  const waktu = new Date();
  const itemsStr = items.map(i => i.nama + ' x' + i.qty).join(', ');
  
  sheet.appendRow([
    Utilities.formatDate(waktu, 'Asia/Jakarta', 'yyyy-MM-dd HH:mm:ss'),
    total,
    metode,
    kasir,
    cabang,
    itemsStr
  ]);
  
  return { success: true, waktu: Utilities.formatDate(waktu, 'Asia/Jakarta', 'dd/MM/yyyy HH:mm') };
}

// === REPORTS ===
function getReportData(period, cabang) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('transaksi');
  const data = sheet.getDataRange().getValues();
  
  const now = new Date();
  let startDate;
  
  switch (period) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case '7days':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30days':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  
  let totalOmset = 0;
  let totalTransaksi = 0;
  const perKasir = {};
  const perCabang = {};
  const perHari = {};
  const perMetode = { 'Cash': 0, 'QRIS': 0 };
  
  for (let i = 1; i < data.length; i++) {
    const waktu = new Date(data[i][0]);
    if (waktu < startDate) continue;
    if (cabang && cabang !== 'semua' && data[i][4] !== cabang) continue;
    
    const amount = Number(data[i][1]);
    totalOmset += amount;
    totalTransaksi++;
    
    // Per kasir
    const kasirName = data[i][3];
    perKasir[kasirName] = (perKasir[kasirName] || 0) + amount;
    
    // Per cabang
    const cabangName = data[i][4];
    perCabang[cabangName] = (perCabang[cabangName] || 0) + amount;
    
    // Per hari
    const hari = Utilities.formatDate(waktu, 'Asia/Jakarta', 'dd/MM');
    perHari[hari] = (perHari[hari] || 0) + amount;
    
    // Per metode
    const metode = data[i][2];
    perMetode[metode] = (perMetode[metode] || 0) + amount;
  }
  
  return {
    totalOmset,
    totalTransaksi,
    perKasir,
    perCabang,
    perHari,
    perMetode
  };
}

function getDashboardSummary() {
  const today = getReportData('today', 'semua');
  const week = getReportData('7days', 'semua');
  const month = getReportData('30days', 'semua');
  
  return {
    today: today.totalOmset,
    todayTrx: today.totalTransaksi,
    week: week.totalOmset,
    weekTrx: week.totalTransaksi,
    month: month.totalOmset,
    monthTrx: month.totalTransaksi
  };
}

function getCabangList() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('users');
  const data = sheet.getDataRange().getValues();
  
  const cabangSet = new Set();
  for (let i = 1; i < data.length; i++) {
    if (data[i][3]) cabangSet.add(data[i][3]);
  }
  return Array.from(cabangSet);
}

// === USER MANAGEMENT ===
function getUsers() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('users');
  const data = sheet.getDataRange().getValues();
  
  const users = [];
  for (let i = 1; i < data.length; i++) {
    users.push({
      username: data[i][0],
      role: data[i][2],
      cabang: data[i][3]
    });
  }
  return users;
}

function addUser(username, password, role, cabang) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('users');
  
  // Check duplicate
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      return { success: false, message: 'Username sudah ada!' };
    }
  }
  
  sheet.appendRow([username, password, role, cabang]);
  return { success: true };
}

function deleteUser(username) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('users');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === username) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return { success: true };
}

// === INITIAL SETUP ===
function setupDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Create 'menu' sheet
  let menuSheet = ss.getSheetByName('menu');
  if (!menuSheet) {
    menuSheet = ss.insertSheet('menu');
    menuSheet.appendRow(['id', 'nama', 'harga', 'gambar', 'aktif']);
    // Sample data
    menuSheet.appendRow([1, 'Dimsum Ayam', 15000, '', true]);
    menuSheet.appendRow([2, 'Dimsum Udang', 18000, '', true]);
    menuSheet.appendRow([3, 'Siomay', 12000, '', true]);
    menuSheet.appendRow([4, 'Hakau', 20000, '', true]);
    menuSheet.appendRow([5, 'Lumpia Udang', 16000, '', true]);
    menuSheet.appendRow([6, 'Ceker Ayam', 14000, '', true]);
    menuSheet.appendRow([7, 'Bakpao Ayam', 10000, '', true]);
    menuSheet.appendRow([8, 'Pangsit Goreng', 13000, '', true]);
  }
  
  // Create 'transaksi' sheet
  let trxSheet = ss.getSheetByName('transaksi');
  if (!trxSheet) {
    trxSheet = ss.insertSheet('transaksi');
    trxSheet.appendRow(['waktu', 'total', 'metode', 'kasir', 'cabang', 'items']);
  }
  
  // Create 'users' sheet
  let usersSheet = ss.getSheetByName('users');
  if (!usersSheet) {
    usersSheet = ss.insertSheet('users');
    usersSheet.appendRow(['username', 'password', 'role', 'cabang']);
    usersSheet.appendRow(['owner', 'owner123', 'owner', 'Pusat']);
    usersSheet.appendRow(['kasir1', 'kasir123', 'kasir', 'Pusat']);
    usersSheet.appendRow(['kasir2', 'kasir123', 'kasir', 'Cabang 1']);
  }
  
  return 'Setup complete!';
}

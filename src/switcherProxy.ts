import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, execSync } from 'child_process';
import { getVSCDBPath } from './constants';
export interface EnvironmentCheckResult {
    success: boolean;
    nodeJs: { ok: boolean; path?: string; error?: string };
    npm: { ok: boolean; version?: string; error?: string };
    database: { ok: boolean; path?: string; error?: string };
    ide: { ok: boolean; path?: string; error?: string };
    suggestions: string[];
}

export class SwitcherProxy {
    /**
     * Pemeriksaan awal lingkungan yang diperlukan
     * @param dbPathOverride Timpa jalur basis data (opsional)
     * @param exePathOverride Timpa executable IDE (opsional)
     * @returns Hasil cek, status dan saran perbaikan
     */
    static checkEnvironment(
        dbPathOverride?: string,
        exePathOverride?: { win32?: string; darwin?: string; linux?: string }
    ): EnvironmentCheckResult {
        const platform = os.platform();
        const result: EnvironmentCheckResult = {
            success: true,
            nodeJs: { ok: false },
            npm: { ok: false },
            database: { ok: false },
            ide: { ok: false },
            suggestions: []
        };

        // 1. Cek Node.js
        let nodeExe = '';
        if (platform === 'win32') {
            const possibleNodePaths = [
                path.join(process.env.PROGRAMFILES || '', 'nodejs', 'node.exe'),
                path.join(process.env['PROGRAMFILES(X86)'] || '', 'nodejs', 'node.exe'),
                path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
                path.join(process.env.APPDATA || '', 'npm', 'node.exe'),
                'C:\\Program Files\\nodejs\\node.exe',
                'C:\\nodejs\\node.exe',
            ];

            for (const p of possibleNodePaths) {
                if (fs.existsSync(p)) {
                    nodeExe = p;
                    break;
                }
            }

            if (!nodeExe) {
                try {
                    const whereResult = execSync('where node', { encoding: 'utf-8', windowsHide: true });
                    const lines = whereResult.trim().split('\n');
                    if (lines.length > 0 && fs.existsSync(lines[0].trim())) {
                        nodeExe = lines[0].trim();
                    }
                } catch (e) {
                    // Abaikan
                }
            }
        } else {
            try {
                nodeExe = execSync('which node', { encoding: 'utf-8' }).trim();
            } catch (e) {
                if (fs.existsSync('/usr/bin/node')) {
                    nodeExe = '/usr/bin/node';
                }
            }
        }

        if (nodeExe && fs.existsSync(nodeExe)) {
            result.nodeJs = { ok: true, path: nodeExe };
        } else {
            result.nodeJs = { ok: false, error: 'Node.js tidak ada' };
            result.success = false;
            result.suggestions.push('❌ Silakan instal Node.js: https://nodejs.org/ (saran LTS)');
        }

        // 2. Cek npm (untuk cadangan instal sqlite3)
        try {
            const npmCmd = platform === 'win32' ? 'npm.cmd --version' : 'npm --version';
            const npmVersion = execSync(npmCmd, { encoding: 'utf-8', windowsHide: true }).trim();
            result.npm = { ok: true, version: npmVersion };
        } catch (e) {
            result.npm = { ok: false, error: 'npm tidak tersedia' };
            // npm tidak wajib, cuma cadangan, tidak menolak success
            result.suggestions.push('⚠️ npm tak diinstal atau tak bisa dipakai. Jika modul sqlite3 tak kompatibel, tak bisa otomatis perbaiki. Instal Node lengkap');
        }

        // 3. Cek file basis data
        const actualDbPath = dbPathOverride && dbPathOverride.trim()
            ? dbPathOverride.trim()
            : getVSCDBPath();

        if (fs.existsSync(actualDbPath)) {
            result.database = { ok: true, path: actualDbPath };
        } else {
            result.database = { ok: false, path: actualDbPath, error: 'File basis data tidak ada' };
            result.success = false;
            result.suggestions.push(`❌ Antigravity IDE Basis data tak ada: ${actualDbPath}`);
            result.suggestions.push('   Yakinkan terinstal dan setidaknya menyala sekali');
        }

        // 4. Cek executable IDE
        let idePath = '';
        if (platform === 'win32') {
            idePath = exePathOverride?.win32?.trim() ||
                path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity', 'Antigravity.exe');
        } else if (platform === 'darwin') {
            idePath = exePathOverride?.darwin?.trim() || '/Applications/Antigravity.app';
        } else {
            const possiblePaths = exePathOverride?.linux?.trim()
                ? [exePathOverride.linux.trim()]
                : ['/usr/bin/antigravity', '/opt/antigravity/antigravity',
                    path.join(process.env.HOME || '', '.local/bin/antigravity')];
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    idePath = p;
                    break;
                }
            }
        }

        if (idePath && fs.existsSync(idePath)) {
            result.ide = { ok: true, path: idePath };
        } else {
            result.ide = { ok: false, path: idePath, error: 'Executable IDE tidak ditemukan' };
            // Masalah jalur IDE bukan hal fatal, bisa start via protokol
            result.suggestions.push(`⚠️ Antigravity IDE Executable tak ketemu: ${idePath || '(Tak dikenal)'}`);
            result.suggestions.push('   Usai bergeser, mungkin lu butuh nyalain IDE manual');
        }

        return result;
    }

    /**
     * Format hasil cek lingkungan ke pesan gampang dibaca
     */
    static formatCheckResult(result: EnvironmentCheckResult): string {
        const lines: string[] = [];
        lines.push('### Laporan cek lingkungan\n');

        lines.push(`- Node.js: ${result.nodeJs.ok ? '✅ ' + result.nodeJs.path : '❌ ' + result.nodeJs.error}`);
        lines.push(`- npm: ${result.npm.ok ? '✅ v' + result.npm.version : '⚠️ ' + result.npm.error}`);
        lines.push(`- Basis data: ${result.database.ok ? '✅ Ada' : '❌ ' + result.database.error}`);
        lines.push(`- IDE: ${result.ide.ok ? '✅ Ada' : '⚠️ ' + result.ide.error}`);

        if (result.suggestions.length > 0) {
            lines.push('\n### Saran\n');
            lines.push(result.suggestions.join('\n'));
        }

        return lines.join('\n');
    }
    /**
     * Buat & eksekusi skrip otonom, urus ganti akun
     * Lintas-platform suport (Windows/Linux/macOS)
     * 
     * Proses:
     * 1. Bikin skrip Node otonom (isi logik injeksi)
     * 2. Berangkatkan proses mandiri ala platform ini
     * 3. Proses memantau tutup IDE -> nunggu -> suntik -> start
     * 
     * @param accessToken OAuth access token
     * @param refreshToken OAuth refresh token
     * @param expiry Waktu kadaluwarsa token (detik)
     * @param dbPathOverride Timpa jalur basis data (opsional)
     * @param exePathOverride Timpa executable Antigravity (opsional, via platform)
     * @param processWaitSeconds Proses Tutup/Buka Durasi (detik, default 10)
     */
    static async executeExternalSwitch(
        accessToken: string,
        refreshToken: string,
        expiry: number,
        email: string,
        dbPathOverride?: string,
        exePathOverride?: { win32?: string; darwin?: string; linux?: string },
        processWaitSeconds = 10
    ) {
        const tempDir = os.tmpdir();
        const timestamp = Date.now();
        const mainScriptPath = path.join(tempDir, `ag_switch_${timestamp}.js`);
        const logPath = path.join(tempDir, `ag_switch_${timestamp}.log`);

        // Raih jalur extension node_modules di root
        const extensionRoot = path.join(__dirname, '..');
        const nodeModulesPath = path.join(extensionRoot, 'node_modules');
        const platform = os.platform();

        // Dapat executable Node
        // process.execPath mengembalikan jalan Electron, bukan Node
        // Perlu Node di sistem
        let nodeExe = '';
        if (platform === 'win32') {
            // Windows: Coba ragam jalur Node
            const possibleNodePaths = [
                path.join(process.env.PROGRAMFILES || '', 'nodejs', 'node.exe'),
                path.join(process.env['PROGRAMFILES(X86)'] || '', 'nodejs', 'node.exe'),
                path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
                path.join(process.env.APPDATA || '', 'npm', 'node.exe'),
                'C:\\Program Files\\nodejs\\node.exe',
                'C:\\nodejs\\node.exe',
            ];

            for (const p of possibleNodePaths) {
                if (fs.existsSync(p)) {
                    nodeExe = p;
                    break;
                }
            }

            // Klo gagal temu, tes where bash
            if (!nodeExe) {
                try {
                    const result = execSync('where node', { encoding: 'utf-8', windowsHide: true });
                    const lines = result.trim().split('\n');
                    if (lines.length > 0 && fs.existsSync(lines[0].trim())) {
                        nodeExe = lines[0].trim();
                    }
                } catch (e) {
                    // Abaikan
                }
            }
        } else {
            // Linux/OSX: Tes yang mana yang kepake
            try {
                nodeExe = execSync('which node', { encoding: 'utf-8' }).trim();
            } catch (e) {
                nodeExe = '/usr/bin/node';
            }
        }

        if (!nodeExe || !fs.existsSync(nodeExe)) {
            throw new Error('Cannot find Node.js executable');
        }

        // Peroleh basis data yang dipake realita
        const actualDbPath = dbPathOverride && dbPathOverride.trim()
            ? dbPathOverride.trim()
            : getVSCDBPath();

        // Rakit skrip Node untuk lintas platform
        const mainScriptContent = `
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// === Konfigurasi pengaturan ===
const LOG_PATH = ${JSON.stringify(logPath)};
const DB_PATH = ${JSON.stringify(actualDbPath)};
const NODE_MODULES = ${JSON.stringify(nodeModulesPath)};
const ACCESS_TOKEN = ${JSON.stringify(accessToken)};
const REFRESH_TOKEN = ${JSON.stringify(refreshToken)};
const EXPIRY = ${expiry};
const EMAIL = ${JSON.stringify(email)};
const PLATFORM = ${JSON.stringify(platform)};
const EXE_PATH_OVERRIDE = ${JSON.stringify(exePathOverride || {})};
const PROCESS_WAIT_SECONDS = ${processWaitSeconds};

// === Kronik pencatatan ===
function log(msg) {
    const ts = new Date().toISOString();
    const line = \`[\${ts}] \${msg}\\n\`;
    fs.appendFileSync(LOG_PATH, line);
    // Output konsol ditebas, sisaan tergores pada dokumen log aje
}

// === Subrutin menanti ===
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// === Memburu eksistensi proses Antigravity ===
function isAntigravityRunning() {
    try {
        if (PLATFORM === 'win32') {
            const result = execSync('tasklist /FI "IMAGENAME eq Antigravity.exe" /NH 2>nul', { encoding: 'utf-8', shell: true, windowsHide: true });
            const running = result.toLowerCase().includes('antigravity.exe');
            log('Output pelacakan proses: ' + (running ? 'Tengah manggung' : 'Sudah minggat'));
            return running;
        } else {
            // Linux/macOS
            const result = execSync('pgrep -i antigravity || true', { encoding: 'utf-8' });
            return result.trim().length > 0;
        }
    } catch (e) {
        log('Ada udang di balik batu saat mendeteksi proses: ' + (e.message || e));
        return false;
    }
}

// === Cekik mati seluruh kegiatan Antigravity ===
function killAllAntigravity() {
    log('Lagi cekek mati seluruh kegiatan Antigravity');
    try {
        if (PLATFORM === 'win32') {
            // Windows: manfaatkan taskkill eks ke exe nya
            try {
                execSync('taskkill /F /IM Antigravity.exe /T 2>nul', { 
                    encoding: 'utf-8', 
                    shell: true, 
                    windowsHide: true,
                    timeout: 10000
                });
                log('taskkill Perintah operasional dikerjakan');
            } catch (e) {
                // taskkill Sewaktu gagal jumpa pasangan proses akan setor nilai tidak-sifar, ini wajar
                log('taskkill selesai (gak ada jg ga apa): ' + (e.message || ''));
            }
        } else {
            // Linux/macOS: Terapkan pkill
            try {
                execSync('pkill -9 -i antigravity || true', { encoding: 'utf-8' });
                log('pkill Perintah operasional dikerjakan');
            } catch (e) {
                log('pkill Selesai: ' + (e.message || ''));
            }
        }
    } catch (e) {
        log('Jumpa eror pas bunuh aplikasi proses: ' + (e.message || e));
    }
    log('Instruksi tutup proses udah di ketok');
}

// === Menunggu santai agar proses benar tewas total ===
async function waitForProcessExit(maxWaitSec = 30) {
    log('Menunggu kepergian Antigravity IDE...');
    // Bikin simpel: ngaso durasi mutlak, cegah execSync mogok nyangkut pada sesi VBScript
    log('Nunggu ' + maxWaitSec + ' detik buat exit paripurna...');
    await sleep(maxWaitSec * 1000);
    log('Nunggu kelar, IDE udah tewas minggat');
    return true;
}
// === Encoding/Decoding Protokol buffer ===
function encodeVarint(v) {
    const buf = [];
    while (v >= 128) {
        buf.push((v % 128) | 128);
        v = Math.floor(v / 128);
    }
    buf.push(v);
    return Buffer.from(buf);
}

function readVarint(data, offset) {
    let result = 0;
    let multiplier = 1;
    let pos = offset;
    while (true) {
        const byte = data[pos];
        result += (byte & 127) * multiplier;
        pos++;
        if (!(byte & 128)) break;
        multiplier *= 128;
    }
    return [result, pos];
}

function skipField(data, offset, wireType) {
    if (wireType === 0) return readVarint(data, offset)[1];
    if (wireType === 1) return offset + 8;
    if (wireType === 2) {
        const [len, off] = readVarint(data, offset);
        return off + len;
    }
    if (wireType === 5) return offset + 4;
    return offset;
}

function removeField(data, fieldNum) {
    let res = Buffer.alloc(0);
    let off = 0;
    while (off < data.length) {
        const start = off;
        if (off >= data.length) break;
        const [tag, tagOff] = readVarint(data, off);
        const wire = tag & 7;
        const currentField = Math.floor(tag / 8);
        if (currentField === fieldNum) {
            off = skipField(data, tagOff, wire);
        } else {
            off = skipField(data, tagOff, wire);
            res = Buffer.concat([res, data.subarray(start, off)]);
        }
    }
    return res;
}

function encodeLenDelim(fieldNum, data) {
    const tag = (fieldNum << 3) | 2;
    return Buffer.concat([encodeVarint(tag), encodeVarint(data.length), data]);
}

function encodeStringField(fieldNum, value) {
    return encodeLenDelim(fieldNum, Buffer.from(value, 'utf-8'));
}

function createOAuthInfo(at, rt, exp) {
    const f1 = encodeStringField(1, at);
    const f2 = encodeStringField(2, "Bearer");
    const f3 = encodeStringField(3, rt);
    const tsMsg = Buffer.concat([encodeVarint((1 << 3) | 0), encodeVarint(exp)]);
    const f4 = encodeLenDelim(4, tsMsg);
    return Buffer.concat([f1, f2, f3, f4]);
}

function createEmailField(email) {
    return encodeStringField(2, email);
}

function createOldFormatField(at, rt, exp) {
    const info = createOAuthInfo(at, rt, exp);
    return encodeLenDelim(6, info);
}

// === Mamuat sqlite3 secara dinamis ===
async function loadSqlite3() {
    // Metode 1: Coba gunakan modul sqlite3 bawaan plugin
    try {
        module.paths.push(NODE_MODULES);
        const sqlite3 = require('sqlite3');
        log('Menggunakan modul sqlite3 direktori plugin');
        return sqlite3;
    } catch (e) {
        log('Gagal memuat sqlite3 direktori plugin: ' + (e.message || e));
    }

    // Metode 2: Coba gunakan modul sqlite3 global sistem
    try {
        const sqlite3 = require('sqlite3');
        log('Menggunakan modul sqlite3 global sistem');
        return sqlite3;
    } catch (e) {
        log('sqlite3 global sistem tidak tersedia: ' + (e.message || e));
    }

    // Metode 3: Instal versi yang kompatibel di direktori sementara
    log('Mencoba menginstal sqlite3 di direktori sementara...');
    const tempSqliteDir = path.join(require('os').tmpdir(), 'ag_sqlite3_temp');
    
    try {
        // Memastikan direktori ada
        if (!fs.existsSync(tempSqliteDir)) {
            fs.mkdirSync(tempSqliteDir, { recursive: true });
        }
        
        // Telusuri andai sdh terpasang dulu
        const tempNodeModules = path.join(tempSqliteDir, 'node_modules');
        if (fs.existsSync(path.join(tempNodeModules, 'sqlite3'))) {
            log('Menemukan sqlite3 sementara yang telah diinstal, mencoba memuat...');
            module.paths.unshift(tempNodeModules);
            try {
                const sqlite3 = require('sqlite3');
                log('Berhasil memuat sqlite3 direktori sementara');
                return sqlite3;
            } catch (loadErr) {
                log('Gagal memuat sqlite3 direktori sementara, akan diinstal ulang: ' + loadErr.message);
                // Menghapus instalasi lama
                fs.rmSync(tempNodeModules, { recursive: true, force: true });
            }
        }
        
        // Membuat package.json
        const pkgJson = { name: 'ag-sqlite-temp', version: '1.0.0', dependencies: { sqlite3: '^5.1.6' } };
        fs.writeFileSync(path.join(tempSqliteDir, 'package.json'), JSON.stringify(pkgJson));
        
        // Menjalankan npm install
        log('Sedang menginstal sqlite3 (membutuhkan beberapa menit, harap tunggu)...');
        execSync('npm install --prefer-offline --no-audit --no-fund', {
            cwd: tempSqliteDir,
            encoding: 'utf-8',
            timeout: 300000, // 5menit timeout
            windowsHide: true
        });
        log('Instalasi sqlite3 selesai');
        
        // Memuat modul yang baru diinstal
        module.paths.unshift(tempNodeModules);
        const sqlite3 = require('sqlite3');
        log('Berhasil memuat sqlite3 yang diinstal sementara');
        return sqlite3;
    } catch (installErr) {
        log('Gagal menginstal sqlite3: ' + (installErr.message || installErr));
        throw new Error('Tidak dapat memuat modul sqlite3, pastikan npm sudah diinstal di sistem');
    }
}

// === Menginjeksikan Token ===
async function injectToken() {
    log('Mulai menyuntikkan Token ke database...');
    
    if (!fs.existsSync(DB_PATH)) {
        log('Kesalahan: File database tidak ada: ' + DB_PATH);
        return false;
    }
    
    try {
        try {
            const backupPath = DB_PATH + '.ag-backup-' + Date.now();
            fs.copyFileSync(DB_PATH, backupPath);
            log('Cadangan database telah dibuat: ' + backupPath);
        } catch (e) {
            log('Gagal membuat cadangan database (akan terus menyuntikkan): ' + (e.message || e));
        }

        // Muat sqlite secara dinamis (beserta rencana cadangan)
        const sqlite3 = await loadSqlite3();
        
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(DB_PATH);
            const KEY_OLD = 'jetskiStateSync.agentManagerInitState';
            const KEY_NEW = 'antigravityUnifiedStateSync.oauthToken';
            const KEY_ONBOARD = 'antigravityOnboarding';
            
            db.serialize(() => {
                // 1. Injeksi format baru
                try {
                    const oauthInfo = createOAuthInfo(ACCESS_TOKEN, REFRESH_TOKEN, EXPIRY);
                    const oauthInfoB64 = oauthInfo.toString('base64');
                    const inner2 = encodeStringField(1, oauthInfoB64);
                    const inner1 = encodeStringField(1, "oauthTokenInfoSentinelKey");
                    const inner = Buffer.concat([inner1, encodeLenDelim(2, inner2)]);
                    const outer = encodeLenDelim(1, inner);
                    const outerB64 = outer.toString('base64');
                    
                    db.run("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)", [KEY_NEW, outerB64], (err) => {
                        if (err) log('Injeksi format baru gagal: ' + err.message);
                        else log('Injeksi format baru berhasil');
                    });
                } catch (e) {
                    log('Pengecualian injeksi format baru: ' + e.message);
                }

                // 2. Injeksi format lama
                db.get("SELECT value FROM ItemTable WHERE key = ?", [KEY_OLD], (err, row) => {
                    if (err || !row) {
                        log('Lewati format lama: ' + (err ? err.message : 'kunci tidak ada'));
                    } else {
                        try {
                            const blob = Buffer.from(row.value, 'base64');
                            let clean = removeField(blob, 1); // UserID
                            clean = removeField(clean, 2); // Email
                            clean = removeField(clean, 6); // OAuthTokenInfo
                            
                            const emailField = createEmailField(EMAIL);
                            const tokenField = createOldFormatField(ACCESS_TOKEN, REFRESH_TOKEN, EXPIRY);
                            const finalB64 = Buffer.concat([clean, emailField, tokenField]).toString('base64');
                            
                            db.run("UPDATE ItemTable SET value = ? WHERE key = ?", [finalB64, KEY_OLD], (err) => {
                                if (err) log('Injeksi format lama gagal: ' + err.message);
                                else log('Injeksi format lama berhasil');
                            });
                        } catch (e) {
                            log('Pengecualian injeksi format lama: ' + e.message);
                        }
                    }
                });

                // 3. Tanda orientasi
                db.run("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)", [KEY_ONBOARD, "true"], (err) => {
                    db.close();
                    resolve(true);
                });
            });
        });
    } catch (e) {
        log('Pengecualian proses injeksi: ' + e.message);
        return false;
    }
}

// === Nyalakan IDE ===
function startIDE() {
    log('Menyalakan Antigravity IDE...');
    
    try {
        if (PLATFORM === 'win32') {
            // Mengutamakan konfigurasi jalur prasetel
            let exePath = EXE_PATH_OVERRIDE.win32 && EXE_PATH_OVERRIDE.win32.trim() 
                ? EXE_PATH_OVERRIDE.win32.trim() 
                : path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity', 'Antigravity.exe');
            
            log('LOCALAPPDATA: ' + (process.env.LOCALAPPDATA || ''));
            log('Jalur IDE yang digunakan: ' + exePath);
            log('Apakah jalur ada: ' + fs.existsSync(exePath));

            // Metode 1: Coba gunakan protokol (setara dengan menjalankan via explorer antigravity://)
            // Metode 1: Coba gunakan protokol (setara dengan menjalankan via explorer antigravity://)
            const release = require('os').release();
            let isWin11 = false;
            try {
                const release = require('os').release();
                const build = parseInt(release.split('.')[2] || '0');
                isWin11 = build >= 22000;
                log('Windows Versi: ' + release + (isWin11 ? ' (Win11+)' : ' (Win10 or older)'));
            } catch (verErr) {
                log('VersiGagal deteksi, anggap bukan Win11: ' + verErr.message);
                isWin11 = false;
            }

            if (isWin11) {
                log('Coba Metode 1: pake explorer panggil IDENya via URI');
                try {
                    const result1 = require('child_process').execSync(
                        'explorer antigravity://',
                        { encoding: 'utf-8', timeout: 10000 }
                    );
                    log('Metode 1 berhasil, keluaran: ' + (result1 || '(tanpa keluaran)'));
                    return true;
                } catch (e1) {
                    log('Metode 1 gagal: ' + (e1.message || e1));
                }
            } else {
                log('Mode Win10: Lewati protokol, abaikan coba Metode 2 langsung (spawn exe)');
            }

            // Metode 2: jika jalur exe diketahui, jalankan proses
            if (exePath && fs.existsSync(exePath)) {
                log('Coba Metode 2: spawn luncurkan langsung Antigravity.exe');
                
                // Perbaikan kunci: Bersihkan variabel lingkungan, cegah polusi proses baru
                // Hindari pewarisan IPC VS Code saat ini, status WebView, dll
                const cleanEnv = { ...process.env };
                Object.keys(cleanEnv).forEach(key => {
                    if (key.startsWith('VSCODE_') || key.startsWith('ELECTRON_')) {
                        delete cleanEnv[key];
                    }
                });

                const child = require('child_process').spawn(exePath, [], {
                    detached: true,
                    stdio: 'ignore',
                    env: cleanEnv // Pakai variabel lingkungan yang steril
                });
                child.unref();
                log('Spawn Metode 2 sukses, PID: ' + child.pid);
                log('Perintah mulai IDE telah dikirim');
                return true;
            } else {
                log('Metode 2 gagal: path executable tidak ditemukan');
            }

            log('Semua metode di jalankan di Windows gagal!');
            return false;
            
        } else if (PLATFORM === 'darwin') {
            // macOS: Mengutamakan konfigurasi jalur prasetel
            let appPath = EXE_PATH_OVERRIDE.darwin && EXE_PATH_OVERRIDE.darwin.trim()
                ? EXE_PATH_OVERRIDE.darwin.trim()
                : '/Applications/Antigravity.app';
            
            log('Path aplikasi macOS yang dipakai: ' + appPath);
            if (fs.existsSync(appPath)) {
                execSync(\`open "\${appPath}"\`);
                log('Mulai sukses via jalur App');
                return true;
            }
            log('Jalur App tidak ada, coba inisiasi protokol');
            execSync('open antigravity://');
            return true;
            
        } else {
            // Linux: Mengutamakan konfigurasi jalur prasetel
            const possiblePaths = [];
            if (EXE_PATH_OVERRIDE.linux && EXE_PATH_OVERRIDE.linux.trim()) {
                possiblePaths.push(EXE_PATH_OVERRIDE.linux.trim());
            }
            possiblePaths.push(
                '/usr/bin/antigravity',
                '/opt/antigravity/antigravity',
                path.join(process.env.HOME || '', '.local/bin/antigravity')
            );
            
            log('Coba jalur-jalur Linux:: ' + possiblePaths.join(', '));
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    log('Di temukan file dapat dieksekusi: ' + p);
                    spawn(p, [], { detached: true, stdio: 'ignore' }).unref();
                    return true;
                }
            }
            
            // Menerapkan xdg-open
            log('Tak dijumpai executable, coba urus via protokol');
            try {
                execSync('xdg-open antigravity://');
                return true;
            } catch (e) {
                log('Awal jalankan Linux menemui kegagalan: ' + e.message);
            }
        }
    } catch (e) {
        log('Gagal urupkan IDE: ' + e.message);
    }
    
    return false;
}

// === Proses utama ===
async function main() {
    log('========================================');
    log('Antigravity Multi-Account Cockpit Switch proksi penggantian akun aktif');
    log('Platform: ' + PLATFORM);
    log('Basis data: ' + DB_PATH);
    log('========================================');
    
    // 1. Harap menanti agar VS Code menerbitkan perintah keluar
    const initialWait = Math.max(2, Math.floor(PROCESS_WAIT_SECONDS / 5));
    log('Nunggu ' + initialWait + ' detik tuk proses main sampaikan instruksi matikan...');
    await sleep(initialWait * 1000);
    
    // 2. Inisiatif cabut paksa tiap proses dari Antigravity
    killAllAntigravity();
    
    // 3. Persiapan mengheningkan proses IDE dengan paripurna
    const exitWait = Math.max(5, Math.floor(PROCESS_WAIT_SECONDS / 2));
    await waitForProcessExit(exitWait);
    
    // 4. Sela waktu lebih buat pastikan file lock terbebaskan
    const releaseWait = Math.max(3, Math.floor(PROCESS_WAIT_SECONDS / 3));
    log('Nunggu ' + releaseWait + ' detik tuk meyakinkan pembebasan riles seutuhnya...');
    await sleep(releaseWait * 1000);
    
    // 3. Menginjeksikan Token
    const injected = await injectToken();
    if (!injected) {
        log('Injeksi gugur, urutan berhenti');
        process.exit(1);
    }
    
    // 4. Jeda singgah pastikan tuntasnya pencatatan
    await sleep(1000);
    
    // 5. Nyalakan IDE
    const started = startIDE();
    if (started) {
        log('Perintah mulai IDE telah dikirim');
    } else {
        log('IDE Kandas nyalakan, coba buka manual si Antigravity');
    }
    
    log('========================================');
    log('Rute perpindahan akun khatam');
    log('========================================');
    
    // Membenahi diri
    await sleep(2000);
    try {
        fs.unlinkSync(${JSON.stringify(mainScriptPath)});
    } catch (e) {}
    
    process.exit(0);
}

main().catch(e => {
    log('Bencana maut (Fatal Error): ' + e.message);
    process.exit(1);
});
`;

        // Mematri instruksi skrip pokok
        fs.writeFileSync(mainScriptPath, mainScriptContent, 'utf-8');

        // Sesuai dengan platform bangun proses singlenya
        if (platform === 'win32') {
            // Windows: Bungkus gunakan VBScript bagi tangguhkan otonomi penuh
            const vbsPath = path.join(tempDir, `ag_launch_${timestamp}.vbs`);
            // VBScript Gak usah lolos ganda cara JavaScript tangani alur back-slash
            const nodeExeVbs = nodeExe;
            const scriptPathVbs = mainScriptPath;
            // Aktif 0 = jendelany ghoib, singkirkan letupan panel command
            // Hint run-time: ragu program jalan? rubah nilai 0 ganti 1 buat intip isinya
            const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
WshShell.Run Chr(34) & "${nodeExeVbs}" & Chr(34) & " " & Chr(34) & "${scriptPathVbs}" & Chr(34), 0, False
`;
            fs.writeFileSync(vbsPath, vbsContent, 'utf-8');

            const child = spawn('wscript', [vbsPath], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            });
            child.unref();

        } else {
            // Linux/macOS: Pakai nohup + setsid amankan jalan mardeka
            const shellCmd = `nohup "${nodeExe}" "${mainScriptPath}" > "${logPath}" 2>&1 &`;

            spawn('sh', ['-c', shellCmd], {
                detached: true,
                stdio: 'ignore'
            }).unref();
        }
    }
}

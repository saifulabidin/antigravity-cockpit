/* eslint-disable @typescript-eslint/no-empty-function */
import * as vscode from 'vscode';
import * as http from 'http';
import * as url from 'url';
import * as crypto from 'crypto';
import * as os from 'os';
import axios from 'axios';
import { AccountTreeProvider } from './accountTreeProvider';
import { AccountManager, Account, TokenInfo } from './accountManager';
import { ProcessManager } from './processManager';
import { DBManager } from './dbManager';
import {
    AUTH_URL,
    CLIENT_ID,
    CLIENT_SECRET,
    OAUTH_SCOPES,
    TOKEN_URL,
    USERINFO_URL
} from './constants';

import { DashboardProvider } from './dashboardProvider';
import { ModelGroupManager } from './modelGroupManager';
import { SwitcherProxy } from './switcherProxy';

/**
 * [Komentar/Teks terjemahan]
 * CJK[Komentar/Teks terjemahan] Emoji [Komentar/Teks terjemahan] 2 [Komentar/Teks terjemahan], [Komentar/Teks terjemahan] ASCII [Komentar/Teks terjemahan] 1 [Komentar/Teks terjemahan]
 */
function getVisualWidth(str: string): number {
    let width = 0;
    for (const char of str) {
        const code = char.charCodeAt(0);
        // CJK [Komentar/Teks terjemahan]: 0x4E00 - 0x9FFF, [Komentar/Teks terjemahan]: 0xFF00 - 0xFFEF
        if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0xFF00 && code <= 0xFFEF)) {
            width += 2;
        } else if (char.length > 1) { // [Komentar/Teks terjemahan] surrogate pairs ([Komentar/Teks terjemahan] Emoji)
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
}

export function activate(context: vscode.ExtensionContext) {
    const accountTreeProvider = new AccountTreeProvider();
    // vscode.window.registerTreeDataProvider('antigravityAccounts', accountTreeProvider);

    // --- Welcome Message for First Install ---
    if (!context.globalState.get('hasShownWelcome')) {
        vscode.window.showInformationMessage(
            '🚀 Antigravity Multi-Account Cockpit [Komentar/Teks terjemahan]![Komentar/Teks terjemahan] UFO [Komentar/Teks terjemahan].',
            '[Komentar/Teks terjemahan]'
        ).then(selection => {
            if (selection === '[Komentar/Teks terjemahan]') {
                vscode.commands.executeCommand('antigravity-cockpit.openDashboard');
            }
        });
        context.globalState.update('hasShownWelcome', true);
    }

    // --- Status Bar Section ---
    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'antigravity-cockpit.openDashboard';
    context.subscriptions.push(statusBarItem);

    // [Komentar/Teks terjemahan]([Komentar/Teks terjemahan])
    statusBarItem.text = "$(sync~spin) [Komentar/Teks terjemahan]...";
    statusBarItem.tooltip = "Sedang dimuat Antigravity Akuninfo...";
    statusBarItem.show();

    async function updateStatusBar() {
        const index = AccountManager.loadIndex();
        if (!index.current_account_id) {
            statusBarItem.text = "$(account) [Komentar/Teks terjemahan]Akun";
            statusBarItem.tooltip = "[Komentar/Teks terjemahan]Menambah Antigravity Akun";
            statusBarItem.show();
            return;
        }

        try {
            const account = AccountManager.loadAccount(index.current_account_id);

            if (!account.token) {
                statusBarItem.text = `$(account) ${account.email.split('@')[0]}`;
                statusBarItem.tooltip = "[Komentar/Teks terjemahan]Akun[Komentar/Teks terjemahan]";
                statusBarItem.show();
                return;
            }

            let quota;
            try {
                // [Komentar/Teks terjemahan]
                quota = await AccountManager.fetchQuota(account.token.access_token);
            } catch (err: any) {
                // [Komentar/Teks terjemahan] 401 (Unauthorized), [Komentar/Teks terjemahan] Token
                if (err.response && err.response.status === 401) {
                    try {
                        console.log('Token expired (401), attempting to refresh...');
                        const refreshed = await AccountManager.refreshToken(account.token.refresh_token);

                        // [Komentar/Teks terjemahan] Token
                        account.token.access_token = refreshed.accessToken;
                        account.token.expiry_timestamp = Math.floor(Date.now() / 1000) + refreshed.expiresIn;
                        AccountManager.saveAccount(account);

                        // [Komentar/Teks terjemahan] Token [Komentar/Teks terjemahan]
                        quota = await AccountManager.fetchQuota(refreshed.accessToken);
                        console.log('Token refreshed and quota fetched successfully.');
                    } catch (refreshErr) {
                        // [Komentar/Teks terjemahan], [Komentar/Teks terjemahan]
                        console.error('Failed to refresh token:', refreshErr);
                        throw err; // [Komentar/Teks terjemahan] 401 [Komentar/Teks terjemahan], [Komentar/Teks terjemahan] catch [Komentar/Teks terjemahan]
                    }
                } else {
                    // [Komentar/Teks terjemahan] 401 [Komentar/Teks terjemahan], [Komentar/Teks terjemahan]
                    throw err;
                }
            }

            // [Komentar/Teks terjemahan]([Komentar/Teks terjemahan])
            // [Komentar/Teks terjemahan] quota.models [Komentar/Teks terjemahan] ModelInfo[] [Komentar/Teks terjemahan]
            const modelsForInit = (quota.models || []).map((m: any) => ({
                name: m.name,
                resetTime: m.reset_time || '',
                percentage: m.percentage || 0
            }));
            ModelGroupManager.initDefaultGroupIfNeeded(modelsForInit);

            // [Komentar/Teks terjemahan]Konfigurasi pengaturan
            const groupsConfig = ModelGroupManager.loadGroups();

            if (groupsConfig.groups.length === 0 || quota.is_forbidden) {
                // [Komentar/Teks terjemahan], [Komentar/Teks terjemahan]
                statusBarItem.text = `$(account) ${account.email.split('@')[0]}`;
            } else {
                // [Komentar/Teks terjemahan]
                const groupTexts: string[] = [];

                for (const group of groupsConfig.groups) {
                    // [Komentar/Teks terjemahan]Aset[Komentar/Teks terjemahan] (group.models [Komentar/Teks terjemahan])
                    const groupModels = quota.models.filter((m: any) =>
                        group.models.includes(m.name)
                    );

                    if (groupModels.length > 0) {
                        // Temukan model dengan sisa kuota terendah
                        const lowestModel = groupModels.reduce((min: any, m: any) =>
                            m.percentage < min.percentage ? m : min
                            , groupModels[0]);

                        // Pilih ikon warna berdasarkan kuota
                        const icon = lowestModel.percentage > 50 ? "🟢" : (lowestModel.percentage > 20 ? "🟡" : "🔴");
                        groupTexts.push(`${icon} ${group.name}: ${lowestModel.percentage}%`);
                    }
                }

                if (groupTexts.length > 0) {
                    statusBarItem.text = groupTexts.join(" | ");
                } else {
                    statusBarItem.text = `$(account) ${account.email.split('@')[0]}`;
                }
            }

            // Generate detailed tooltip for hover
            const tooltip = new vscode.MarkdownString();
            tooltip.isTrusted = true;
            tooltip.supportHtml = true;

            tooltip.appendMarkdown(`🛸 **Antigravity Copilot**\n\n`);

            if (!quota.is_forbidden) {
                // Dapatkan model dalam grup
                const groupedModelNames = new Set<string>();
                groupsConfig.groups.forEach(g => {
                    g.models.forEach((modelName: string) => groupedModelNames.add(modelName));
                });

                // Hanya tampilkan model dalam grup, jika tidak ada grup tampilkan semua
                const modelsToShow = groupedModelNames.size > 0
                    ? quota.models.filter((m: any) => groupedModelNames.has(m.name))
                    : quota.models;

                // Hitung lebar maksimum nama model (huruf Mandarin 2 bit, pakai regex)
                // Perhitungan presisi ekstrem dari lebar visual
                const getLen = (s: string) => {
                    let len = 0;
                    for (const char of s) {
                        const code = char.charCodeAt(0);
                        // 1. Ikon emoji -> 2 bit
                        if (char.length > 1) { len += 2; }
                        // 2. Karakter China/simbol penuh -> 2 bit
                        else if (code >= 0x4E00 && code <= 0x9FFF || code >= 0xFF00 && code <= 0xFFEF) {
                            len += 2;
                        }
                        // 3. Blok bilah angka, panah, dll -> 1 bit
                        // (Catatan: Simbol-simbol tersebut biasanya lebar 1 bit)
                        else { len += 1; }
                    }
                    return len;
                };

                const maxNameWidth = Math.max(...modelsToShow.map((m: any) => getLen(m.name)), 15);
                const lines: string[] = [];

                modelsToShow.forEach((m: any) => {
                    const icon = m.percentage > 50 ? "🟢" : (m.percentage > 20 ? "🟡" : "🔴");
                    const filledBlocks = Math.round(m.percentage / 10);
                    const emptyBlocks = 10 - filledBlocks;
                    const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

                    let timeInfo = '';
                    // Gunakan hitung mundur reset_raw (UTC asli)
                    const rawResetTime = m.reset_time_raw || m.reset_time;
                    if (rawResetTime) {
                        const resetDate = new Date(rawResetTime);
                        const now = new Date();
                        const diffMs = resetDate.getTime() - now.getTime();
                        if (diffMs > 0) {
                            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                            const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                            const resetTimeStr = resetDate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
                            timeInfo = `${diffHours}h${String(diffMins).padStart(2, '0')}m (${resetTimeStr})`;
                        } else {
                            timeInfo = 'Telah direset';
                        }
                    }

                    const pctStr = (m.percentage.toFixed(0) + '%').padStart(4, ' ');
                    const timeStr = timeInfo.padStart(13, ' ');

                    const namePadding = ' '.repeat(Math.max(0, maxNameWidth - getLen(m.name)));
                    const paddedName = m.name + namePadding;

                    // Tetap gunakan panah kanan, getLen menghitungnya 2 bit
                    lines.push(`${icon} ${paddedName} ${progressBar} ${pctStr} → ${timeStr}`);
                });

                // Pakai rumus baku total: N + 35
                const currentAccountLabel = account.name || account.email;
                const totalLineWidth = maxNameWidth + 35;
                const leftText = 'Klik untuk buka panel pengaturan';
                const rightText = `Akun terkini:${currentAccountLabel}`;

                // Spasi sisa = lebar total - kotak kiri - kotak kanan
                const spaces = Math.max(1, totalLineWidth - getLen(leftText) - getLen(rightText));
                lines.push(leftText + ' '.repeat(spaces) + rightText);

                tooltip.appendMarkdown('```\n' + lines.join('\n') + '\n```\n');
            } else {
                // Tampilan sederhana bila tiada izinAkun Saat ini
                const currentAccountLabel = account.name || account.email;
                tooltip.appendMarkdown('```\n');
                tooltip.appendMarkdown(`Kuota: Tiada izin    Akun terkini:${currentAccountLabel}\n`);
                tooltip.appendMarkdown('```\n');
            }

            statusBarItem.tooltip = tooltip;
            statusBarItem.command = 'antigravity-cockpit.openDashboard';
            statusBarItem.show();

            // Koneksi sukses, reset error
            lastConnectionError = false;
            connectionErrorCount = 0;
        } catch (e: any) {
            connectionErrorCount++;

            // Update status bar tunjukan galat, klik buat reconnect
            statusBarItem.text = "$(error) Koneksi gagal";
            // Rincian error taro d tooltip, bantu pemecahan masalah
            const errorTooltip = new vscode.MarkdownString();
            errorTooltip.appendMarkdown(`**Antigravity Copilot**\n\n`);
            errorTooltip.appendMarkdown(`❌ *Koneksi gagal*\n\n`);
            errorTooltip.appendMarkdown(`Info eror:${e.message || 'Unknown error'}\n\n`);
            if (e.response && e.response.status) {
                errorTooltip.appendMarkdown(` (Status: ${e.response.status})`);
            }
            errorTooltip.appendMarkdown(`\n\n*Klik buat coba sambung lagi*`);
            statusBarItem.tooltip = errorTooltip;

            statusBarItem.command = 'antigravity-cockpit.reconnect';
            statusBarItem.show();

            // Hindari bom notif: pakaiKonfigurasi pengaturaninterval penyegaran sbg jeda notif
            const now = Date.now();
            const notifyConfig = vscode.workspace.getConfiguration('antigravity-cockpit'); const notifyIntervalMs = (notifyConfig.get<number>('autoRefreshInterval', 5)) * 60 * 1000;
            const shouldNotify = !lastConnectionError || (now - lastNotificationTime > notifyIntervalMs);

            if (shouldNotify) {
                lastConnectionError = true;
                lastNotificationTime = now;

                const errorMessage = e.message || 'Kesalahan tidak diketahui';
                vscode.window.showWarningMessage(
                    `Antigravity [Komentar/Teks terjemahan]Koneksi gagal: ${errorMessage}`,
                    'Menghubung ulang',
                    'Tutup'
                ).then(selection => {
                    if (selection === 'Menghubung ulang') {
                        updateStatusBar();
                    }
                });
            }
        }
    }

    // Pemantauan status koneksi
    let lastConnectionError = false;
    let lastNotificationTime = 0;
    let connectionErrorCount = 0;

    // Initial update
    updateStatusBar();
    // Refresh status bar when list is refreshed
    const originalRefresh = accountTreeProvider.refresh.bind(accountTreeProvider);
    accountTreeProvider.refresh = () => {
        originalRefresh();
        updateStatusBar();
    };

    // Daftarkan perintah penyegaran status bar
    const refreshStatusBarCommand = vscode.commands.registerCommand('antigravity-cockpit.refreshStatusBar', () => {
        updateStatusBar();
    });
    context.subscriptions.push(refreshStatusBarCommand);

    // [Komentar/Teks terjemahan]Menghubung ulang[Komentar/Teks terjemahan]
    const reconnectCommand = vscode.commands.registerCommand('antigravity-cockpit.reconnect', async () => {
        vscode.window.showInformationMessage('[Komentar/Teks terjemahan]Menghubung ulang...');
        try {
            await updateStatusBar();
            if (!lastConnectionError) {
                vscode.window.showInformationMessage('Berhasil nyambung!');
            }
        } catch (e) {
            // Error dah diurus dalam updateStatusBar
        }
    });
    context.subscriptions.push(reconnectCommand);

    // --- Fitur auto refresh berkala ---
    let autoRefreshTimer: NodeJS.Timeout | undefined;

    function setupAutoRefresh() {
        // Sapu bersih pewaktu yg ada
        if (autoRefreshTimer) {
            clearInterval(autoRefreshTimer);
            autoRefreshTimer = undefined;
        }

        // MembacaKonfigurasi pengaturan
        const config = vscode.workspace.getConfiguration('antigravity-cockpit');
        const intervalMinutes = config.get<number>('autoRefreshInterval', 5);

        if (intervalMinutes > 0) {
            const intervalMs = intervalMinutes * 60 * 1000;
            autoRefreshTimer = setInterval(() => {
                updateStatusBar();
            }, intervalMs);
            console.log(`Antigravity Multi-Account Cockpit: Auto-refresh menyala, berjarak ${intervalMinutes} menit`);
        } else {
            console.log('Antigravity Multi-Account Cockpit: Auto-refresh dipadamkan');
        }
    }

    // Merintis auto refresh
    setupAutoRefresh();

    // MenyimakKonfigurasi pengaturanperubahan
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('antigravity-cockpit.autoRefreshInterval')) {
                setupAutoRefresh();
                vscode.window.showInformationMessage('Setelan auto refresh telah ditata');
            }
        })
    );

    // Garansi musnahkan pewaktu ketika plugin rehat
    context.subscriptions.push({
        dispose: () => {
            if (autoRefreshTimer) {
                clearInterval(autoRefreshTimer);
            }
        }
    });

    const refreshCommand = vscode.commands.registerCommand('antigravity-cockpit.refreshAccounts', () => {
        accountTreeProvider.refresh();
    });

    const addAccountCommand = vscode.commands.registerCommand('antigravity-cockpit.addAccount', async () => {
        try {
            const tokenInfo = await performOAuth();
            if (tokenInfo) {
                const userInfo = await getUserInfo(tokenInfo.access_token);

                const index = AccountManager.loadIndex();
                const existing = index.accounts.find(a => a.email === userInfo.email);

                let accountId: string;
                let account: Account;

                if (existing) {
                    accountId = existing.id;
                    account = AccountManager.loadAccount(accountId);
                } else {
                    accountId = (crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
                    account = {
                        id: accountId,
                        email: userInfo.email,
                        name: userInfo.name || '',
                        created_at: Date.now(),
                        last_used: Date.now(),
                        disabled: false
                    };
                    index.accounts.push({
                        id: accountId,
                        email: userInfo.email,
                        name: userInfo.name || '',
                        created_at: account.created_at,
                        last_used: account.last_used
                    });
                    if (!index.current_account_id) {
                        index.current_account_id = accountId;
                    }
                    AccountManager.saveIndex(index);
                }

                account.token = {
                    access_token: tokenInfo.access_token,
                    refresh_token: tokenInfo.refresh_token,
                    expiry_timestamp: Math.floor(Date.now() / 1000) + tokenInfo.expires_in,
                    email: userInfo.email
                };
                account.name = userInfo.name || account.name;
                account.last_used = Date.now();

                AccountManager.saveAccount(account);
                accountTreeProvider.refresh();
                DashboardProvider.refresh(); // Terobosan: segarkan panel
                vscode.window.showInformationMessage(`Akun ${userInfo.email} ditambah sukses!`);
            }
        } catch (e) {
            vscode.window.showErrorMessage(`MenambahAkungagal: ${(e as Error).message}`);
        }
    });

    const switchAccountCommand = vscode.commands.registerCommand('antigravity-cockpit.switchAccount', async (item: any) => {
        const accountId = item.accountId;
        if (!accountId) { return; }

        const config = vscode.workspace.getConfiguration('antigravity-cockpit');
        const switchMode = config.get<string>('switchMode', 'advanced');

        const message =
            switchMode === 'safe'
                ? `Ntar ganti ke akun ${item.email}\n\n(Mode Aman) cuman update lokal ekstensiAkun Saat ini, ga bakal ngerubah DB IDE ataupun ngerestart IDE.\n\nSilahkan di restart sendirian aja Antigravity IDE nya.`
                : `Ntar ganti ke akun ${item.email}\n\n⚠️ Operasi ini akan:\n• Tutup semua proses Antigravity IDE\n• Perbarui kredensial akun ke database IDE\n• Secara otomatis restart IDE setelah sekitar 10 detik\n\nSetelah Antigravity restart, tunggu beberapa detik untuk menampilkan akun baru;\n\nJika restart otomatis gagal, buka Antigravity IDE secara manual.`;

        const confirm = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Konfirmasi'
        );

        if (confirm !== 'Konfirmasi') { return; }

        if (switchMode === 'safe') {
            // Mode Aman: [Komentar/Teks terjemahan]Akun Saat iniIndex dan UI, nga ada bunuh/suntikan/restart otomatis
            const index = AccountManager.loadIndex();
            index.current_account_id = accountId;
            AccountManager.saveIndex(index);

            accountTreeProvider.refresh();
            DashboardProvider.refresh();

            vscode.window.showInformationMessage(
                `Telah bertransisi ke Akun ${item.email} (Mode Aman). Mangga restart manual Antigravity IDE supaya agen internal manggung.`
            );
            return;
        }

        // Bawah Mode Ekstra, jalanin pra-cek lingkungan
        const dbPathOverride = config.get<string>('databasePathOverride', '');
        const exePathConfig = config.get<{ win32?: string; darwin?: string; linux?: string }>('antigravityExecutablePath', {});

        const envCheck = SwitcherProxy.checkEnvironment(
            dbPathOverride || undefined,
            Object.keys(exePathConfig).length > 0 ? exePathConfig : undefined
        );

        if (!envCheck.success) {
            // Ditemukan problem fatal, ini rinciannya
            const detailMessage = envCheck.suggestions.join('\n');
            const action = await vscode.window.showErrorMessage(
                `!! Uji envi mendapati isu, kyknya ga lolosSelesaiAkunpergantian:\n\n${detailMessage}`,
                { modal: true },
                'Tetep nekat ganti',
                'Batal'
            );

            if (action !== 'Tetep nekat ganti') {
                return;
            }
        } else if (envCheck.suggestions.length > 0) {
            // Ada seruan awas, tp ga bahaya la
            const warnMessage = envCheck.suggestions.join('\n');
            const action = await vscode.window.showWarningMessage(
                `!! Uji envi menemukan peringatan:\n\n${warnMessage}\n\nMau dihajar terus lanjut gantinya?`,
                { modal: true },
                'Lanjutkan',
                'Batal'
            );

            if (action !== 'Lanjutkan') {
                return;
            }
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Tengah memindahkan rute Antigravity Akun",
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: "Sedang dimuatAkuninfo..." });
                const account = AccountManager.loadAccount(accountId);
                if (!account.token) { throw new Error("AsetAkunKaga ada Tokennya"); }

                // Check/Refresh token
                const token = account.token;
                if (Date.now() / 1000 > token.expiry_timestamp - 300) {
                    progress.report({ message: "Tengah mengusap Token..." });
                    const refreshed = await AccountManager.refreshToken(token.refresh_token);
                    token.access_token = refreshed.accessToken;
                    token.expiry_timestamp = Math.floor(Date.now() / 1000) + refreshed.expiresIn;
                    account.token = token;
                    AccountManager.saveAccount(account);
                }

                progress.report({ message: "Berkemas demi oper proksi ranah luar..." });

                // [Komentar/Teks terjemahan]Akun Saat iniIndeks (gasskeun yg ini duly, brg plugin sendiri punyaKonfigurasi pengaturanberkas)
                const index = AccountManager.loadIndex();
                index.current_account_id = accountId;
                AccountManager.saveIndex(index);

                // MembacaKonfigurasi pengaturanpunya waktu senggang rehat
                const processWaitSeconds = config.get<number>('processWaitSeconds', 10);

                // Lepas proksi dr luar buat ngambil alih Kill->Inject->Restart
                await SwitcherProxy.executeExternalSwitch(
                    token.access_token,
                    token.refresh_token,
                    token.expiry_timestamp,
                    account.email,
                    dbPathOverride || undefined,
                    Object.keys(exePathConfig).length > 0 ? exePathConfig : undefined,
                    processWaitSeconds
                );

                progress.report({ message: "Asik nodong IDE suruh cabut terus balik lg..." });

                // Tunggu sebentar untuk memastikan skrip proxy berjalan
                await new Promise(resolve => setTimeout(resolve, 800));

                // Perintahkan IDE agar keluar (asuransi ganda)
                try {
                    await vscode.commands.executeCommand('workbench.action.quit');
                } catch (e) {
                    console.log('Quit command failed, relying on hard kill.');
                }

                accountTreeProvider.refresh();
                DashboardProvider.refresh();
            } catch (e) {
                vscode.window.showErrorMessage(`Gagal beralih: ${(e as Error).message}`);
            }
        });
    });

    const openDashboardCommand = vscode.commands.registerCommand('antigravity-cockpit.openDashboard', () => {
        DashboardProvider.createOrShow(context.extensionUri);
    });

    const refreshAccountCommand = vscode.commands.registerCommand('antigravity-cockpit.refreshAccount', async (accountId: string) => {
        try {
            const account = AccountManager.loadAccount(accountId);
            if (account.token) {
                const refreshed = await AccountManager.refreshToken(account.token.refresh_token);
                account.token.access_token = refreshed.accessToken;
                account.token.expiry_timestamp = Math.floor(Date.now() / 1000) + refreshed.expiresIn;
                AccountManager.saveAccount(account);
                accountTreeProvider.refresh();
                DashboardProvider.refresh(); // Perbaiki panel pengaturan
                updateStatusBar(); // Sinkronisasi data kuota status bar
                vscode.window.showInformationMessage(`Akun telah di-refresh ${account.email}`);
            }
        } catch (e) {
            vscode.window.showErrorMessage(`Gagal refresh: ${(e as Error).message}`);
        }
    });

    const deleteAccountCommand = vscode.commands.registerCommand('antigravity-cockpit.deleteAccount', async (item: any) => {
        const accountId = item.accountId;
        const email = item.email || 'Akun Tak Bernama';

        if (!accountId) { return; }

        const confirm = await vscode.window.showWarningMessage(
            `Apakah Anda yakin ingin menghapus akun ${email} ? Operasi ini tidak dapat dibatalkan.`,
            { modal: true },
            'Konfirmasi'
        );

        if (confirm !== 'Konfirmasi') { return; }

        try {
            AccountManager.deleteAccount(accountId);

            // Jika menghapus akun saat ini, perbarui status bar
            updateStatusBar();

            accountTreeProvider.refresh();
            DashboardProvider.refresh();
            vscode.window.showInformationMessage(`Akun ${email} telah dihapus`);
        } catch (e) {
            vscode.window.showErrorMessage(`Gagal menghapus: ${(e as Error).message}`);
        }
    });

    const refreshAllAccountsCommand = vscode.commands.registerCommand('antigravity-cockpit.refreshAllAccounts', async () => {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "[Komentar/Teks terjemahan]Akuninfo...",
            cancellable: false
        }, async () => {
            const index = AccountManager.loadIndex();
            for (const accSum of index.accounts) {
                try {
                    const account = AccountManager.loadAccount(accSum.id);
                    if (account.token) {
                        const refreshed = await AccountManager.refreshToken(account.token.refresh_token);
                        account.token.access_token = refreshed.accessToken;
                        account.token.expiry_timestamp = Math.floor(Date.now() / 1000) + refreshed.expiresIn;
                        AccountManager.saveAccount(account);
                    }
                } catch (e) {
                    console.error(`Tidak dapat me-refresh ${accSum.email}`, e);
                }
            }
            accountTreeProvider.refresh();
            DashboardProvider.refresh(); // Perbaiki panel pengaturan
            updateStatusBar(); // Sinkronisasi data kuota status bar
            vscode.window.showInformationMessage('[Komentar/Teks terjemahan]Akun[Komentar/Teks terjemahan]');
        });
    });

    // Buka direktori log agen pengalih eksternal(ag_switch_*.log [Komentar/Teks terjemahan])
    const openSwitchLogsCommand = vscode.commands.registerCommand('antigravity-cockpit.openSwitchLogs', async () => {
        const tempDir = os.tmpdir();
        const uri = vscode.Uri.file(tempDir);
        await vscode.env.openExternal(uri);
        vscode.window.showInformationMessage('Direktori sementara sistem telah dibuka, silakan cari file log ag_switch_*.log terbaru.');
    });

    // Perintah diagnostik lingkungan
    const diagnoseEnvironmentCommand = vscode.commands.registerCommand('antigravity-cockpit.diagnoseEnvironment', async () => {
        const { execSync } = require('child_process');
        const fs = require('fs');
        const path = require('path');
        const platform = os.platform();
        const config = vscode.workspace.getConfiguration('antigravity-cockpit');

        const results: string[] = [];
        results.push('## Antigravity Multi-Account Cockpit Laporan Diagnostik Lingkungan\n');

        // 1. Node.js [Komentar/Teks terjemahan]
        results.push('### 1. Node.js [Komentar/Teks terjemahan]');
        let nodePath = '';
        let nodeStatus = '❌ Tidak ketemu';
        try {
            if (platform === 'win32') {
                try {
                    const result = execSync('where node', { encoding: 'utf-8', windowsHide: true });
                    const lines = result.trim().split('\n');
                    if (lines.length > 0 && fs.existsSync(lines[0].trim())) {
                        nodePath = lines[0].trim();
                        nodeStatus = '✅ Ketemu';
                    }
                } catch (e) {
                    // Abaikan
                }
            } else {
                nodePath = execSync('which node', { encoding: 'utf-8' }).trim();
                if (nodePath && fs.existsSync(nodePath)) {
                    nodeStatus = '✅ Ketemu';
                }
            }
        } catch (e) {
            nodeStatus = '❌ Gagal melacak';
        }
        results.push(`- Status: ${nodeStatus}`);
        if (nodePath) {
            results.push(`- Direktori: \`${nodePath}\``);
        }
        results.push('');

        // 2. Basis data[Komentar/Teks terjemahan]
        results.push('### 2. Antigravity IDE Basis data');
        const { getVSCDBPath } = require('./constants');
        const dbPathOverride = config.get<string>('databasePathOverride', '');
        const actualDbPath = dbPathOverride && dbPathOverride.trim() ? dbPathOverride.trim() : getVSCDBPath();
        const dbExists = fs.existsSync(actualDbPath);
        results.push(`- Direktori: \`${actualDbPath}\``);
        results.push(`- Status: ${dbExists ? '✅ [Komentar/Teks terjemahan]' : '⚠️ [Komentar/Teks terjemahan]Tersedia (mungkin ga keinstal)'}`);
        if (dbPathOverride) {
            results.push(`- Tindihan Konfigurasi Pengaturan: \`${dbPathOverride}\``);
        }
        results.push('');

        // 3. Antigravity File bs di run[Komentar/Teks terjemahan]
        results.push('### 3. Eksekutabel IDE Antigravity');
        const exePathConfig = config.get<{ win32?: string; darwin?: string; linux?: string }>('antigravityExecutablePath', {});
        let exePath = '';
        let exeStatus = '❌ Tidak ketemu';

        if (platform === 'win32') {
            exePath = exePathConfig.win32 && exePathConfig.win32.trim()
                ? exePathConfig.win32.trim()
                : path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity', 'Antigravity.exe');
            if (fs.existsSync(exePath)) {
                exeStatus = '✅ Ketemu';
            }
        } else if (platform === 'darwin') {
            exePath = exePathConfig.darwin && exePathConfig.darwin.trim()
                ? exePathConfig.darwin.trim()
                : '/Applications/Antigravity.app';
            if (fs.existsSync(exePath)) {
                exeStatus = '✅ Ketemu';
            }
        } else {
            // Linux
            const possiblePaths = exePathConfig.linux && exePathConfig.linux.trim()
                ? [exePathConfig.linux.trim()]
                : ['/usr/bin/antigravity', '/opt/antigravity/antigravity', path.join(process.env.HOME || '', '.local/bin/antigravity')];
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    exePath = p;
                    exeStatus = '✅ Ketemu';
                    break;
                }
            }
        }

        results.push(`- Status: ${exeStatus}`);
        if (exePath) {
            results.push(`- Direktori: \`${exePath}\``);
        }
        if (Object.keys(exePathConfig).length > 0) {
            results.push(`- Tindihan Konfigurasi Pengaturan: ${JSON.stringify(exePathConfig)}`);
        }
        results.push('');

        // 4. Info platform
        results.push('### 4. Info platform');
        results.push(`- OS: \`${platform}\``);
        results.push(`- Arsitektur: \`${os.arch()}\``);
        results.push('');

        // 5. Info Konfigurasi Pengaturan
        results.push('### 5. Setingan mutakhir');
        const switchMode = config.get<string>('switchMode', 'advanced');
        const autoRefreshInterval = config.get<number>('autoRefreshInterval', 5);
        results.push(`- Mode ubah: \`${switchMode}\``);
        results.push(`- Interval jeda otomatis: \`${autoRefreshInterval} menit\``);
        results.push('');

        // Tampilkan output
        const report = results.join('\n');
        const doc = await vscode.workspace.openTextDocument({
            content: report,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc);

        // Sediakan tombol copas
        const action = await vscode.window.showInformationMessage(
            'Laporan sdh terbit.',
            'Salin Laporan'
        );
        if (action === 'Salin Laporan') {
            await vscode.env.clipboard.writeText(report);
            vscode.window.showInformationMessage('Laporan telah disalin ke clipboard.');
        }
    });

    context.subscriptions.push(
        refreshCommand,
        addAccountCommand,
        switchAccountCommand,
        deleteAccountCommand,
        openDashboardCommand,
        refreshAccountCommand,
        refreshAllAccountsCommand,
        openSwitchLogsCommand,
        diagnoseEnvironmentCommand
    );

    // --- Saat menyala sinkronisasi status login orisinal IDE ---
    setTimeout(async () => {
        try {
            console.log('Sedang memeriksa status login asli di database IDE...');

            // Menambahkan mekanisme coba ulang: coba membaca database 10 kali, setiap interval 4 detik
            // Menangani situasi di mana database IDE mungkin terkunci saat baru dimulai
            let dbTokenInfo: { access_token: string; refresh_token: string; expiry: number; } | null = null;

            for (let i = 0; i < 10; i++) {
                try {
                    dbTokenInfo = await DBManager.readFullTokenInfo();
                    if (dbTokenInfo) {
                        console.log('Berhasil membaca database IDE.');
                        break;
                    }
                } catch (readErr) {
                    console.warn(`Nomer ${i + 1} Gagal baca basis data IDE:`, readErr);
                }
                if (i < 9) {
                    await new Promise(r => setTimeout(r, 4000));
                }
            }

            if (dbTokenInfo) {
                const index = AccountManager.loadIndex();
                let foundAccount: Account | undefined;
                let foundInLocal = false;

                // 1. Mencoba pencocokan Token yang presisi (cepat)
                for (const accSum of index.accounts) {
                    try {
                        const acc = AccountManager.loadAccount(accSum.id);
                        if (acc.token && acc.token.access_token === dbTokenInfo.access_token) {
                            foundAccount = acc;
                            foundInLocal = true;
                            break;
                        }
                    } catch (e) { /* ignore */ }
                }

                // 2. Jika Token tidak cocok, coba verifikasi identitas melalui API
                if (!foundAccount) {
                    try {
                        // Gunakan Token di IDE untuk meminta informasi pengguna
                        const res = await axios.get(USERINFO_URL, {
                            headers: { Authorization: `Bearer ${dbTokenInfo.access_token}` },
                            timeout: 5000
                        });
                        const userInfo = res.data;
                        const email = userInfo.email;

                        if (email) {
                            // Cari akun lokal via Email
                            for (const accSum of index.accounts) {
                                if (accSum.email === email) {
                                    foundAccount = AccountManager.loadAccount(accSum.id);
                                    foundInLocal = true;
                                    // Sekalian perbarui Token lokal
                                    if (foundAccount.token) {
                                        foundAccount.token = {
                                            access_token: dbTokenInfo.access_token,
                                            refresh_token: dbTokenInfo.refresh_token,
                                            expiry_timestamp: dbTokenInfo.expiry,
                                            email: email
                                        };
                                        AccountManager.saveAccount(foundAccount);
                                    }
                                    break;
                                }
                            }

                            // 3. Jika lokal tak ada, buat otomatis akun baru (Impor Otomoatis)
                            if (!foundAccount) {
                                console.log(`Temukan akun baru ${email}, Sedang mengimpor otoma...`);
                                const accountId = (crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
                                const newAccount: Account = {
                                    id: accountId,
                                    email: email,
                                    name: userInfo.name || '',
                                    created_at: Date.now(),
                                    last_used: Date.now(),
                                    disabled: false,
                                    token: {
                                        access_token: dbTokenInfo.access_token,
                                        refresh_token: dbTokenInfo.refresh_token,
                                        expiry_timestamp: dbTokenInfo.expiry,
                                        email: email
                                    }
                                };

                                // Save to index
                                index.accounts.push({
                                    id: accountId,
                                    email: email,
                                    name: userInfo.name || '',
                                    created_at: newAccount.created_at,
                                    last_used: newAccount.last_used
                                });
                                AccountManager.saveIndex(index);
                                AccountManager.saveAccount(newAccount);

                                foundAccount = newAccount;
                                foundInLocal = true;
                                vscode.window.showInformationMessage(`Telah impor otomatis akun IDE: ${email}`);
                            }
                        }
                    } catch (e) {
                        console.warn('Tidak dapat memverifikasi identitas Token di database IDE:', e);
                    }
                }

                if (foundAccount) {
                    if (foundAccount.id !== index.current_account_id) {
                        // Menemukan ketidaksesuaian, lakukan peralihan
                        index.current_account_id = foundAccount.id;
                        AccountManager.saveIndex(index);

                        // Perbarui UI
                        accountTreeProvider.refresh();
                        DashboardProvider.refresh();
                        updateStatusBar();

                        vscode.window.showInformationMessage(`Telah Sinkron Otomatis Akun Ke: ${foundAccount.email}`);
                    } else {
                        console.log('Status plugin sesuai dengan database IDE.');
                    }
                } else {
                    console.log('IDE akun tidak dikenal & tiada info, skip...');
                }
            } else {
                console.log('Tidak dapat membaca Token dari database IDE, lewati sinkronisasi.');
            }
        } catch (e) {
            console.error('Gagal sinkronisasi status otomatis:', e);
        }
    }, 8000); // Tunda 8 detik eksekusi, tunggu inisialisasi IDE sepenuhnya
}

async function performOAuth(): Promise<any> {
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            const parsedUrl = url.parse(req.url || '', true);
            const pathname = parsedUrl.pathname;
            const queryObject = parsedUrl.query;

            // Abaikan permintaan ikon
            if (pathname === '/favicon.ico') {
                res.writeHead(404);
                res.end();
                return;
            }

            // Hanya proses rute callback otorisasi
            if (pathname === '/oauth-callback') {
                if (queryObject.code) {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end('<h1>✅ Otorisasi Berhasil!</h1><p>Anda dapat menutup jendela ini dan kembali ke VS Code.</p><script>setTimeout(function() { window.close(); }, 2000);</script>');

                    try {
                        const response = await axios.post(TOKEN_URL, {
                            client_id: CLIENT_ID,
                            client_secret: CLIENT_SECRET,
                            code: (queryObject.code as string),
                            redirect_uri: `http://127.0.0.1:${(server.address() as any).port}/oauth-callback`,
                            grant_type: "authorization_code",
                        });
                        resolve(response.data);
                    } catch (e) {
                        reject(e);
                    } finally {
                        server.close();
                    }
                } else if (queryObject.error) {
                    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`<h1>❌ Otorisasi Gagal</h1><p>${queryObject.error}</p>`);
                    server.close();
                    reject(new Error(`Layanan otorisasi mengembalikan kesalahan: ${queryObject.error}`));
                }
            }
        });

        server.listen(0, '127.0.0.1', async () => {
            const port = (server.address() as any).port;
            const redirectUri = `http://127.0.0.1:${port}/oauth-callback`;
            const params = new URLSearchParams({
                client_id: CLIENT_ID,
                redirect_uri: redirectUri,
                response_type: 'code',
                scope: OAUTH_SCOPES.join(' '),
                access_type: 'offline',
                prompt: 'consent',
                include_granted_scopes: 'true'
            });
            const authUrl = `${AUTH_URL}?${params.toString()}`;

            const copy = 'Salin Tautan';
            const open = 'Buka di Browser Default';
            const result = await vscode.window.showInformationMessage(
                '🔐 Gassin otorisasi Google di peramban, ntar Sinkron otomatis.',
                { modal: true },
                open,
                copy
            );

            if (result === copy) {
                await vscode.env.clipboard.writeText(authUrl);
                vscode.window.showInformationMessage('✅ Tautan otorisasi telah disalin ke clipboard, silakan tempel dan kunjungi di browser.');
            } else if (result === open) {
                vscode.env.openExternal(vscode.Uri.parse(authUrl));
            } else {
                // Pengguna batal, matikan server
                server.close();
                reject(new Error('Pengguna membatalkan otorisasi'));
                return;
            }
        });

        setTimeout(() => {
            if (server.listening) {
                server.close();
                reject(new Error('Waktu otorisasi habis, silakan coba lagi.'));
            }
        }, 300000);
    });
}

async function getUserInfo(accessToken: string): Promise<any> {
    const response = await axios.get(USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
}

export function deactivate() { }

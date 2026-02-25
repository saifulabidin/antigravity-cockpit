/* eslint-disable no-case-declarations */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AccountManager, Account } from './accountManager';
import { ModelGroupManager, ModelGroup, ModelGroupsConfig, ModelInfo } from './modelGroupManager';

export class DashboardProvider {
    public static readonly viewType = 'antigravityDashboard';
    private static _currentPanel: DashboardProvider | undefined;

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (DashboardProvider._currentPanel) {
            DashboardProvider._currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            DashboardProvider.viewType,
            'Antigravity Multi-Account Cockpit',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        DashboardProvider._currentPanel = new DashboardProvider(panel, extensionUri);
    }

    public static refresh() {
        if (DashboardProvider._currentPanel) {
            DashboardProvider._currentPanel._update();
        }
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                switch (message.command) {
                    case 'switch':
                        await vscode.commands.executeCommand('antigravity-cockpit.switchAccount', { accountId: message.accountId, email: message.email });
                        this._update();
                        return;
                    case 'refresh':
                        await vscode.commands.executeCommand('antigravity-cockpit.refreshAccount', message.accountId);
                        this._update();
                        return;
                    case 'refreshAll':
                        await vscode.commands.executeCommand('antigravity-cockpit.refreshAllAccounts');
                        this._update();
                        return;
                    case 'addAccount':
                        await vscode.commands.executeCommand('antigravity-cockpit.addAccount');
                        this._update();
                        return;
                    case 'delete':
                        await vscode.commands.executeCommand('antigravity-cockpit.deleteAccount', { accountId: message.accountId, email: message.email });
                        return;

                    // === Command terkait manajemen grup ===
                    case 'getGroupsConfig':
                        // Mendapatkan konfigurasi grup saat ini
                        const config = ModelGroupManager.loadGroups();
                        this._panel.webview.postMessage({
                            command: 'groupsConfig',
                            config: config
                        });
                        return;

                    case 'autoGroup':
                        // Pengelompokan otomatis
                        const models: ModelInfo[] = message.models || [];
                        const autoGroups = ModelGroupManager.autoGroup(models);
                        const autoConfig = ModelGroupManager.loadGroups();
                        autoConfig.groups = autoGroups;
                        autoConfig.lastAutoGrouped = Date.now();
                        ModelGroupManager.saveGroups(autoConfig);
                        this._panel.webview.postMessage({
                            command: 'groupsConfig',
                            config: autoConfig
                        });
                        vscode.commands.executeCommand('antigravity-cockpit.refreshStatusBar');
                        vscode.window.showInformationMessage(`Berhasil membuat otomatis ${autoGroups.length} grup`);
                        return;

                    case 'addGroup':
                        // Tambah grup baru
                        let addConfig = ModelGroupManager.loadGroups();
                        const newGroup = ModelGroupManager.createGroup(message.groupName || 'Grup Baru');
                        addConfig = ModelGroupManager.addGroup(addConfig, newGroup);
                        ModelGroupManager.saveGroups(addConfig);
                        this._panel.webview.postMessage({
                            command: 'groupsConfig',
                            config: addConfig
                        });
                        return;

                    case 'deleteGroup':
                        // Hapus grup
                        let deleteConfig = ModelGroupManager.loadGroups();
                        deleteConfig = ModelGroupManager.deleteGroup(deleteConfig, message.groupId);
                        ModelGroupManager.saveGroups(deleteConfig);
                        this._panel.webview.postMessage({
                            command: 'groupsConfig',
                            config: deleteConfig
                        });
                        return;

                    case 'updateGroupName':
                        // Perbarui nama grup
                        let renameConfig = ModelGroupManager.loadGroups();
                        renameConfig = ModelGroupManager.updateGroup(renameConfig, message.groupId, { name: message.newName });
                        ModelGroupManager.saveGroups(renameConfig);
                        this._panel.webview.postMessage({
                            command: 'groupsConfig',
                            config: renameConfig
                        });
                        return;

                    case 'addModelToGroup':
                        // Tambahkan model ke grup
                        let addModelConfig = ModelGroupManager.loadGroups();
                        addModelConfig = ModelGroupManager.addModelToGroup(addModelConfig, message.groupId, message.modelName);
                        ModelGroupManager.saveGroups(addModelConfig);
                        this._panel.webview.postMessage({
                            command: 'groupsConfig',
                            config: addModelConfig
                        });
                        return;

                    case 'removeModelFromGroup':
                        // Hapus model dari grup
                        let removeModelConfig = ModelGroupManager.loadGroups();
                        removeModelConfig = ModelGroupManager.removeModelFromGroup(removeModelConfig, message.groupId, message.modelName);
                        ModelGroupManager.saveGroups(removeModelConfig);
                        this._panel.webview.postMessage({
                            command: 'groupsConfig',
                            config: removeModelConfig
                        });
                        return;

                    case 'saveGroups':
                        // Menyimpan langsung konfigurasi grup secara utuh
                        ModelGroupManager.saveGroups(message.config);
                        vscode.commands.executeCommand('antigravity-cockpit.refreshStatusBar');
                        vscode.window.showInformationMessage('Konfigurasi grup berhasil disimpan');
                        return;

                    case 'getRefreshInterval':
                        // Mendapatkan konfigurasi interval refresh saat ini
                        const currentConfig = vscode.workspace.getConfiguration('antigravity-cockpit');
                        const currentInterval = currentConfig.get<number>('autoRefreshInterval', 5);
                        this._panel.webview.postMessage({
                            command: 'refreshIntervalValue',
                            value: currentInterval
                        });
                        return;

                    case 'setRefreshInterval':
                        // Mengatur interval refresh
                        const newInterval = message.value;
                        vscode.workspace.getConfiguration('antigravity-cockpit').update(
                            'autoRefreshInterval',
                            newInterval,
                            vscode.ConfigurationTarget.Global
                        );
                        return;
                }
            },
            null,
            this._disposables
        );
    }

    public async refresh() {
        this._update();
    }

    public dispose() {
        DashboardProvider._currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) { (x as any).dispose(); }
        }
    }

    private async _update() {
        try {
            this._panel.webview.html = await this._getHtmlForWebview();
        } catch (e) {
            console.error('Failed to generate webview HTML:', e);
            this._panel.webview.html = `<!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Error</title>
                <style>
                    body { font-family: var(--vscode-font-family); padding: 20px; color: var(--vscode-editorError-foreground); }
                </style>
            </head>
            <body>
                <h2>An error occurred while loading the dashboard</h2>
                <pre>${(e as Error).message}</pre>
            </body>
            </html>`;
        }
    }

    private async _getHtmlForWebview() {
        const index = AccountManager.loadIndex();
        const groupsConfig = ModelGroupManager.loadGroups();
        let accountsData = await Promise.all(index.accounts.map(async acc => {
            const fullAcc = AccountManager.loadAccount(acc.id);
            if (!fullAcc) {
                console.warn(`[DashboardProvider] Account ${acc.id} returned null. Skipping...`);
                return null;
            }
            let quota = null;
            if (fullAcc.token) {
                try {
                    quota = await AccountManager.fetchQuota(fullAcc.token.access_token);
                } catch (e) { }
            }
            return {
                ...fullAcc,
                quota,
                isCurrent: acc.id === index.current_account_id
            };
        }));

        // Filter out any null accounts (those that failed to load)
        accountsData = accountsData.filter(a => a !== null);

        const accountsJson = JSON.stringify(accountsData);
        const groupsJson = JSON.stringify(groupsConfig);

        // Read the external HTML template
        const htmlPath = vscode.Uri.file(path.join(this._extensionUri.fsPath, 'media', 'dashboard.html')).fsPath;
        let html = fs.readFileSync(htmlPath, 'utf8');

        // Inject data via placeholder replacement
        html = html.replace('/*{{ACCOUNTS_JSON}}*/[]', accountsJson);
        html = html.replace('/*{{GROUPS_JSON}}*/{}', groupsJson);

        return html;
    }
}

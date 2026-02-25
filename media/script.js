// @ts-nocheck
/* eslint-disable */

const vscode = acquireVsCodeApi();
const state = vscode.getState() || {};
let currentView = state.currentView || 'tab';
const accounts = /*{{ACCOUNTS_JSON}}*/[];
let groupsConfig = /*{{GROUPS_JSON}}*/{};

// Prefer activeAccountId from state to preserve selection across refreshes
let activeAccountId = state.activeAccountId;
if (!activeAccountId || !accounts.find(a => a.id === activeAccountId)) {
    activeAccountId = accounts.find(a => a.isCurrent)?.id || accounts[0]?.id;
}

let activeDropdownId = null;

// Get all available models
function getAllModels() {
    const models = [];
    accounts.forEach(acc => {
        if (acc.quota && acc.quota.models) {
            acc.quota.models.forEach(m => {
                if (!models.find(x => x.name === m.name)) {
                    models.push({
                        name: m.name,
                        resetTime: m.reset_time || '',
                        percentage: m.percentage
                    });
                }
            });
        }
    });
    return models;
}

// Get grouped model names
function getGroupedModels() {
    const grouped = new Set();
    groupsConfig.groups.forEach(g => {
        g.models.forEach(m => grouped.add(m));
    });
    return grouped;
}

// Update refresh interval
function updateRefreshInterval() {
    const select = document.getElementById('refreshIntervalSelect');
    const value = parseInt(select.value, 10);
    vscode.postMessage({ command: 'setRefreshInterval', value: value });
}

// Listen for extension messages
window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'groupsConfig') {
        groupsConfig = message.config;
        renderGroupsList();
    } else if (message.command === 'refreshIntervalValue') {
        const select = document.getElementById('refreshIntervalSelect');
        if (select) {
            select.value = message.value.toString();
        }
    }
});

// Request current refresh interval on init
vscode.postMessage({ command: 'getRefreshInterval' });

function switchView(view) {
    currentView = view;
    vscode.setState({ ...state, currentView: view });
    updateViewUI();
}

function updateViewUI() {
    const tabContainer = document.getElementById('tabViewContainer');
    const listContainer = document.getElementById('listViewContainer');
    const btnTab = document.getElementById('btnViewTab');
    const btnList = document.getElementById('btnViewList');

    if (currentView === 'tab') {
        tabContainer.style.display = 'block';
        listContainer.classList.remove('active');
        btnTab.classList.add('active');
        btnList.classList.remove('active');
    } else {
        tabContainer.style.display = 'none';
        listContainer.classList.add('active');
        btnTab.classList.remove('active');
        btnList.classList.add('active');
        renderListView();
    }
}

function deleteAccount(id, email) {
    vscode.postMessage({
        command: 'delete',
        accountId: id,
        email: email
    });
}

function renderListView() {
    const tbody = document.getElementById('accountTableBody');
    tbody.innerHTML = '';

    if (accounts.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;font-weight:700;">Belum ada akun, silakan klik tombol di kanan atas untuk menambahkan.</td></tr>';
        return;
    }

    accounts.forEach(acc => {
        const tr = document.createElement('tr');
        if (acc.isCurrent) tr.className = 'current-account';

        const lastUsedDate = new Date(acc.last_used);
        const lastUsedStr = lastUsedDate.toLocaleString('id-ID', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

        const statusDotClass = acc.isCurrent ? 'active' : 'inactive';
        const statusTitle = acc.isCurrent ? 'Saat ini aktif' : 'Tidak aktif';

        const subTier = (acc.quota && acc.quota.tier) ? acc.quota.tier : '-';

        tr.innerHTML = `
            <td><span class="status-dot ${statusDotClass}" title="${statusTitle}"></span></td>
            <td>${acc.email}</td>
            <td>${acc.name || '-'}</td>
            <td><span class="list-tier-badge">${subTier}</span></td>
            <td style="font-size:12px;">${lastUsedStr}</td>
            <td style="text-align: right;">
                <div class="btn-group" style="justify-content: flex-end;">
                    ${!acc.isCurrent ? `<button class="teal" onclick="switchAccount('${acc.id}', '${acc.email}')"><i class="bi bi-arrow-left-right"></i> Beralih</button>` : '<span class="list-active-label"><i class="bi bi-check-circle-fill"></i> Digunakan</span>'}
                    <button class="secondary" onclick="refreshAccount('${acc.id}')"><i class="bi bi-arrow-clockwise"></i></button>
                    <button class="danger" onclick="deleteAccount('${acc.id}', '${acc.email}')"><i class="bi bi-trash3-fill"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function render() {
    const tabContainer = document.getElementById('tabContainer');
    const panelContainer = document.getElementById('panelContainer');

    tabContainer.innerHTML = '';
    panelContainer.innerHTML = '';

    // Render Tabs
    accounts.forEach(acc => {
        const tab = document.createElement('div');
        tab.className = 'tab' + (acc.id === activeAccountId ? ' active' : '');
        const shortEmail = acc.email.split('@')[0];
        tab.innerHTML = `<span>${shortEmail}</span>${acc.isCurrent ? '<span class="badge">ACTIVE</span>' : ''}`;
        tab.onclick = () => {
            activeAccountId = acc.id;
            vscode.setState({ activeAccountId: activeAccountId });
            render();
        };
        tabContainer.appendChild(tab);

        const panel = document.createElement('div');
        panel.className = 'account-panel' + (acc.id === activeAccountId ? ' active' : '');

        let quotaHtml = '';
        if (acc.quota && !acc.quota.is_forbidden) {
            quotaHtml = '<div class="quota-grid">' + acc.quota.models.map(m => {
                let color = '#39FF14'; // Green (OK)
                let bgBar = '#39FF14';
                if (m.percentage <= 20) { color = '#FF2D6F'; bgBar = '#FF2D6F'; } // Red/Pink (Critical)
                else if (m.percentage <= 50) { color = '#FFE600'; bgBar = '#FFE600'; } // Yellow (Warning)

                return `
                    <div class="quota-card">
                        <div class="quota-header">
                            <span>${m.name}</span>
                            <span style="color: ${color}; font-size:16px;">${m.percentage}%</span>
                        </div>
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${m.percentage}%; background: ${bgBar};"></div>
                        </div>
                        <div class="quota-meta">
                            <span><i class="bi bi-clock-history"></i> Waktu Reset</span>
                            <span>${m.reset_time || 'Tidak diketahui'}</span>
                        </div>
                    </div>
                `;
            }).join('') + '</div>';
        } else {
            if (acc.isCurrent) {
                quotaHtml = `
                    <div class="quota-empty-state error">
                        <div class="status-icon"><i class="bi bi-exclamation-triangle-fill"></i></div>
                        <div>Belum ada data kuota (Token mungkin sudah kedaluwarsa atau izin dibatasi)</div>
                        <div class="status-sub">Silakan klik tombol "Refresh" di atas untuk mencoba lagi</div>
                    </div>`;
            } else {
                quotaHtml = `
                    <div class="quota-empty-state waiting">
                        <div class="status-icon"><i class="bi bi-hourglass-split"></i></div>
                        <div>Data kuota menunggu penyegaran</div>
                        <div class="status-sub">Untuk mengurangi risiko batas frekuensi API, panel ini hanya merefresh otomatis akun yang diaktifkan</div>
                        <div class="status-sub">Klik tombol "Refresh" di atas untuk mendapatkan kuota secara manual</div>
                    </div>`;
            }
        }

        panel.innerHTML = `
            <div class="panel-header">
                <div class="account-info">
                    <h2>${acc.name || 'Akun Tanpa Nama'}</h2>
                    <p>${acc.email}</p>
                    ${acc.quota?.tier ? `<div><span class="tier-badge">${acc.quota.tier.toUpperCase()}</span></div>` : ''}
                </div>
                <div class="btn-group">
                    <button class="secondary" onclick="refreshAccount('${acc.id}')"><i class="bi bi-arrow-clockwise"></i> Refresh</button>
                    <button onclick="switchAccount('${acc.id}', '${acc.email}')" ${acc.isCurrent ? 'disabled' : ''}>
                        <i class="bi bi-arrow-left-right"></i> ${acc.isCurrent ? 'Akun Utama' : 'Beralih ke Akun Ini'}
                    </button>
                </div>
            </div>
            ${quotaHtml}
            <div class="panel-delete-section">
                <button class="danger" onclick="deleteAccount('${acc.id}', '${acc.email}')"><i class="bi bi-trash3-fill"></i> Hapus Akun Ini</button>
            </div>
        `;
        panelContainer.appendChild(panel);
    });
    updateViewUI();
}

// Render groups list
function renderGroupsList() {
    const container = document.getElementById('groupsList');
    const allModels = getAllModels();
    const groupedModels = getGroupedModels();

    if (groupsConfig.groups.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon"><i class="bi bi-inbox-fill"></i></div>
                <p>Belum ada grup, klik "Pengelompokan Otomatis" atau "Tambah Grup" untuk memulai</p>
            </div>
        `;
        return;
    }

    container.innerHTML = groupsConfig.groups.map((group, index) => `
        <div class="group-card" data-group-id="${group.id}">
            <div class="group-card-header">
                <div class="group-name">
                    <i class="bi bi-folder-fill"></i>
                    <input type="text" class="group-name-input" value="${group.name}"
                        onchange="updateGroupName('${group.id}', this.value)"
                        onclick="event.stopPropagation()">
                </div>
                <button class="group-danger" onclick="deleteGroup('${group.id}')"><i class="bi bi-trash3-fill"></i> Hapus</button>
            </div>
            <div class="model-tags">
                ${group.models.map(modelName => `
                    <div class="model-tag">
                        <span>${modelName}</span>
                        <span class="model-tag-remove" onclick="removeModelFromGroup('${group.id}', '${modelName}')"><i class="bi bi-x-lg"></i></span>
                    </div>
                `).join('')}
                <div class="model-dropdown">
                    <button class="add-model-btn" onclick="toggleModelDropdown('${group.id}', event)"><i class="bi bi-plus-lg"></i> Tambah Model</button>
                    <div class="model-dropdown-content" id="dropdown-${group.id}">
                        ${allModels.filter(m => !group.models.includes(m.name)).map(m => `
                            <div class="model-dropdown-item ${groupedModels.has(m.name) && !group.models.includes(m.name) ? 'disabled' : ''}"
                                onclick="${groupedModels.has(m.name) && !group.models.includes(m.name) ? '' : `addModelToGroup('${group.id}', '${m.name}')`}">
                                ${m.name}
                                ${groupedModels.has(m.name) ? ' <i class="bi bi-lock-fill"></i>' : ''}
                            </div>
                        `).join('')}
                        ${allModels.filter(m => !group.models.includes(m.name)).length === 0 ? '<div class="model-dropdown-item" style="opacity: 0.5"><i class="bi bi-emoji-frown"></i> Tidak ada model yang dapat ditambahkan</div>' : ''}
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

// Toggle model dropdown
function toggleModelDropdown(groupId, event) {
    event.stopPropagation();
    const dropdown = document.getElementById('dropdown-' + groupId);

    // Close other dropdowns
    document.querySelectorAll('.model-dropdown-content').forEach(d => {
        if (d.id !== 'dropdown-' + groupId) {
            d.classList.remove('show');
        }
    });

    dropdown.classList.toggle('show');
    activeDropdownId = dropdown.classList.contains('show') ? groupId : null;
}

// Close dropdown when clicking elsewhere
document.addEventListener('click', () => {
    document.querySelectorAll('.model-dropdown-content').forEach(d => {
        d.classList.remove('show');
    });
    activeDropdownId = null;
});

// Open group manager modal
function openGroupManager() {
    document.getElementById('groupModal').classList.add('active');
    renderGroupsList();
}

// Close group manager modal
function closeGroupManager() {
    document.getElementById('groupModal').classList.remove('active');
}

// Auto group
function autoGroup() {
    const models = getAllModels();
    vscode.postMessage({ command: 'autoGroup', models: models });
}

// Add new group
function addNewGroup() {
    vscode.postMessage({ command: 'addGroup', groupName: 'Grup Baru' });
}

// Delete group
function deleteGroup(groupId) {
    vscode.postMessage({ command: 'deleteGroup', groupId: groupId });
}

// Update group name
function updateGroupName(groupId, newName) {
    vscode.postMessage({ command: 'updateGroupName', groupId: groupId, newName: newName });
}

// Add model to group
function addModelToGroup(groupId, modelName) {
    vscode.postMessage({ command: 'addModelToGroup', groupId: groupId, modelName: modelName });
}

// Remove model from group
function removeModelFromGroup(groupId, modelName) {
    vscode.postMessage({ command: 'removeModelFromGroup', groupId: groupId, modelName: modelName });
}

// Save groups
function saveGroups() {
    vscode.postMessage({ command: 'saveGroups', config: groupsConfig });
    closeGroupManager();
}

function switchAccount(id, email) {
    vscode.postMessage({ command: 'switch', accountId: id, email: email });
}
function refreshAccount(id) {
    vscode.postMessage({ command: 'refresh', accountId: id });
}
function refreshAll() {
    vscode.postMessage({ command: 'refreshAll' });
}
function addAccount() {
    vscode.postMessage({ command: 'addAccount' });
}

render();

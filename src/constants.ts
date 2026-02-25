import * as path from 'path';
import * as os from 'os';

export const CLIENT_ID = "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
export const CLIENT_SECRET = "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";
export const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const QUOTA_API_URL = "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels";
export const LOAD_CODE_ASSIST_URL = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";

export const DATA_DIR = path.join(os.homedir(), ".antigravity_tools");
export const ACCOUNTS_INDEX_FILE = path.join(DATA_DIR, "accounts.json");
export const ACCOUNTS_DIR = path.join(DATA_DIR, "accounts");

/**
 * Mendapatkan jalur basis data status global Antigravity IDE
 * @param overridePath Jalur override dari konfigurasi (opsional)
 * @returns Jalur file basis data
 */
export function getVSCDBPath(overridePath?: string): string {
    if (overridePath && overridePath.trim()) {
        return overridePath.trim();
    }

    const platform = os.platform();

    if (platform === 'win32') {
        // Contoh: C:\Users\<user>\AppData\Roaming\Antigravity\User\globalStorage\state.vscdb
        return path.join(
            process.env.APPDATA || '',
            'Antigravity',
            'User',
            'globalStorage',
            'state.vscdb'
        );
    }

    if (platform === 'darwin') {
        // Contoh: /Users/<user>/Library/Application Support/Antigravity/User/globalStorage/state.vscdb
        return path.join(
            os.homedir(),
            'Library',
            'Application Support',
            'Antigravity',
            'User',
            'globalStorage',
            'state.vscdb'
        );
    }

    // Linux / Mirip Unix lainnya: Contoh: ~/.config/Antigravity/User/globalStorage/state.vscdb
    return path.join(
        os.homedir(),
        '.config',
        'Antigravity',
        'User',
        'globalStorage',
        'state.vscdb'
    );
}

// Kompatibel ke belakang: pertahankan ekspor konstanta (gunakan path default)
export const VSCDB_PATH = getVSCDBPath();

export const IMPORTANT_MODELS = ["gemini", "claude"];
export const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export const OAUTH_SCOPES = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cclog",
    "https://www.googleapis.com/auth/experimentsandconfigs",
];

export const DB_KEY_AGENT_STATE = "jetskiStateSync.agentManagerInitState";
export const DB_KEY_UNIFIED_STATE = "antigravityUnifiedStateSync.oauthToken";
export const DB_KEY_ONBOARDING = "antigravityOnboarding";

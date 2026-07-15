interface PreferencesV2 {
  readonly version: 2;
  readonly theme: "light" | "dark" | "system";
  readonly compact: boolean;
}

const KEY = "learning:preferences:v2";
const DEFAULTS: PreferencesV2 = { version: 2, theme: "system", compact: false };

export function loadPreferences(storage: Storage = localStorage): PreferencesV2 {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return DEFAULTS;
    const record = value as Record<string, unknown>;
    if (
      record.version !== 2 ||
      (record.theme !== "light" && record.theme !== "dark" && record.theme !== "system") ||
      typeof record.compact !== "boolean"
    ) return DEFAULTS;
    return record as unknown as PreferencesV2;
  } catch {
    return DEFAULTS;
  }
}

export function savePreferences(value: PreferencesV2, storage: Storage = localStorage): boolean {
  try {
    storage.setItem(KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}


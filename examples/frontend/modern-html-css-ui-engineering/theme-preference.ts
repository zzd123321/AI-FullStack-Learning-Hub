export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function parseThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
}

export function resolveTheme(preference: ThemePreference, systemDark: boolean): ResolvedTheme {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
}

export function saveThemePreference(storage: ThemeStorage, preference: ThemePreference): void {
  storage.setItem('theme-preference', preference);
}

export function applyTheme(root: HTMLElement, preference: ThemePreference, systemDark: boolean): void {
  if (preference === 'system') delete root.dataset.theme;
  else root.dataset.theme = preference;
  root.style.colorScheme = resolveTheme(preference, systemDark);
}

import { dto } from "@ast24/hmbt-v5-lib";

export type ThemeMode = dto.user_config.UserConfigWebUI["theme"];

const THEME_MODE_STORAGE_KEY = "hmbt_v5_web_theme_mode";
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

export function persistThemeMode(mode: ThemeMode): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(THEME_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage quota / privacy mode errors.
  }
}

export function loadPersistedThemeMode(): ThemeMode | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(THEME_MODE_STORAGE_KEY);
    return isThemeMode(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "light" || mode === "dark") {
    return mode;
  }

  if (typeof window !== "undefined") {
    return window.matchMedia(DARK_MEDIA_QUERY).matches ? "dark" : "light";
  }

  return "light";
}

export function applyThemeMode(mode: ThemeMode): void {
  if (typeof document === "undefined") {
    return;
  }

  document.documentElement.dataset.theme = resolveTheme(mode);
  persistThemeMode(mode);
}

export function applyThemeFromWebUiConfig(
  config: dto.user_config.UserConfigWebUI,
): void {
  applyThemeMode(config.theme);
}

export function createThemeBootstrapScript(): string {
  return `(() => {
  const storageKey = "${THEME_MODE_STORAGE_KEY}";
  const mediaQuery = "${DARK_MEDIA_QUERY}";
  const resolveSystemTheme = () => {
    if (typeof window.matchMedia === "function" && window.matchMedia(mediaQuery).matches) {
      return "dark";
    }
    return "light";
  };

  try {
    const stored = window.localStorage.getItem(storageKey);
    const mode = stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : null;
    const resolved = mode === "light" || mode === "dark" ? mode : resolveSystemTheme();
    document.documentElement.dataset.theme = resolved;
  } catch {
    document.documentElement.dataset.theme = resolveSystemTheme();
  }
})();`;
}

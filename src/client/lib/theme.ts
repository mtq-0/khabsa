/**
 * Day / night theme. Night (dark) is the default; the choice is kept in localStorage so it
 * works for guests and in the GitHub Pages edition too. public/theme-init.js applies the saved
 * theme before the first paint (no flash); this module keeps it in sync afterwards.
 */
import { create } from 'zustand';

export type Theme = 'dark' | 'light';
const KEY = 'khabsa:theme';
const COLORS: Record<Theme, string> = { dark: '#0c0819', light: '#f5f2ff' };

function saved(): Theme {
  try {
    return localStorage.getItem(KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', COLORS[theme]);
}

export const useTheme = create<{ theme: Theme; set: (t: Theme) => void; toggle: () => void }>((set, get) => ({
  theme: saved(),
  set: (theme) => {
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* private mode: the choice just lasts for this visit */
    }
    applyTheme(theme);
    set({ theme });
  },
  toggle: () => get().set(get().theme === 'dark' ? 'light' : 'dark'),
}));

/** Call once at startup. */
export function initTheme() {
  applyTheme(useTheme.getState().theme);
}

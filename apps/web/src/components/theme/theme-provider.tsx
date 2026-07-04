'use client';

/**
 * PAAX Workspace theme provider (redesign).
 * Themes: 'grey' (default — medium grey premium) | 'light' | 'dark'.
 * Persisted in localStorage; applied as `data-theme` on the shell wrapper.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

export type PaaxTheme = 'light' | 'dark' | 'grey';

const STORAGE_KEY = 'paax-theme';
const THEMES: PaaxTheme[] = ['light', 'dark', 'grey'];

interface ThemeContextValue {
  theme: PaaxTheme;
  setTheme: (t: PaaxTheme) => void;
  themes: PaaxTheme[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR renders the default; the stored theme is applied on mount to avoid mismatch.
  // Default 'grey' = medium grey premium (referensi desain 2026-07-03);
  // pilihan user di localStorage tetap dihormati.
  const [theme, setThemeState] = useState<PaaxTheme>('grey');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as PaaxTheme | null;
      if (saved && THEMES.includes(saved)) setThemeState(saved);
    } catch {
      /* ignore */
    }
  }, []);

  const setTheme = (t: PaaxTheme) => {
    setThemeState(t);
    try {
      window.localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

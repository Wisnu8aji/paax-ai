/**
 * Local storage utility functions to persist mock data across the interactive workspace.
 * Safe for Next.js SSR and browser environment limitations.
 */

export const STORAGE_KEYS = {
  PROJECTS: 'paax_projects',
  CURRENT_PROJECT: 'paax_current_project',
  RAB_DATA: 'paax_rab_data',
  SCHEDULE_DATA: 'paax_schedule_data',
  FILES: 'paax_files',
  CHAT_LOGS: 'paax_chat_logs',
  SITE_LOGS: 'paax_site_logs'
};

export function getLocalStorageItem<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') {
    return fallback;
  }
  try {
    const item = window.localStorage.getItem(key);
    if (item === null) {
      return fallback;
    }
    return JSON.parse(item) as T;
  } catch (error) {
    console.warn(`Error reading localStorage key "${key}":`, error);
    return fallback;
  }
}

export function setLocalStorageItem<T>(key: string, value: T): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Error setting localStorage key "${key}":`, error);
  }
}

export function removeLocalStorageItem(key: string): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Error removing localStorage key "${key}":`, error);
  }
}

export const LocalStorage = {
  get: getLocalStorageItem,
  set: setLocalStorageItem,
  remove: removeLocalStorageItem,
  clearAllPaaxData: (): void => {
    if (typeof window === 'undefined') return;
    try {
      Object.values(STORAGE_KEYS).forEach(key => removeLocalStorageItem(key));
    } catch (error) {
      console.warn('Error clearing PAAX data:', error);
    }
  }
};

"use client";

import { useSyncExternalStore } from "react";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  role: "owner" | "admin" | "accountant" | "school_user";
  schoolId?: string | null;
  preferredLanguage?: "th" | "en";
  preferredTheme?: "light" | "dark" | "system";
}

interface AuthState {
  user: AuthUser | null;
  accessToken?: string | null;
  isInitialized: boolean;
}

const AUTH_STORAGE_KEY = "solar-auth-user";
const TOKEN_STORAGE_KEY = "solar-access-token";

let currentState: AuthState = {
  user: null,
  accessToken: null,
  isInitialized: false,
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function initFromStorage() {
  if (typeof window === "undefined" || currentState.isInitialized) return;
  try {
    const storedUser = localStorage.getItem(AUTH_STORAGE_KEY);
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    currentState = {
      user: storedUser ? JSON.parse(storedUser) : null,
      accessToken: storedToken || null,
      isInitialized: true,
    };
  } catch {
    currentState = { user: null, accessToken: null, isInitialized: true };
  }
}

export const authStore = {
  getState(): AuthState {
    if (!currentState.isInitialized && typeof window !== "undefined") {
      initFromStorage();
    }
    return currentState;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  setAuth(user: AuthUser, accessToken?: string) {
    currentState = { user, accessToken: accessToken || null, isInitialized: true };
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
        if (accessToken) {
          localStorage.setItem(TOKEN_STORAGE_KEY, accessToken);
        } else {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
        }
        if (user.preferredLanguage) {
          document.cookie = `locale=${user.preferredLanguage}; path=/; max-age=31536000; SameSite=Lax`;
        }
      } catch {}
    }
    notify();
  },

  updatePreferences(prefs: { preferredLanguage?: "th" | "en"; preferredTheme?: "light" | "dark" | "system" }) {
    if (!currentState.user) return;
    const updatedUser = { ...currentState.user, ...prefs };
    currentState = { ...currentState, user: updatedUser };
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(updatedUser));
        if (prefs.preferredLanguage) {
          document.cookie = `locale=${prefs.preferredLanguage}; path=/; max-age=31536000; SameSite=Lax`;
        }
      } catch {}
    }
    notify();
  },

  clear() {
    currentState = { user: null, accessToken: null, isInitialized: true };
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      } catch {}
    }
    notify();
  },
};

const SERVER_SNAPSHOT: AuthState = {
  user: null,
  accessToken: null,
  isInitialized: false,
};

function getServerSnapshot(): AuthState {
  return SERVER_SNAPSHOT;
}

export function useAuth() {
  const state = useSyncExternalStore(
    authStore.subscribe,
    authStore.getState,
    getServerSnapshot
  );

  return {
    ...state,
    setAuth: authStore.setAuth,
    updatePreferences: authStore.updatePreferences,
    clear: authStore.clear,
    isAuthenticated: !!state.user,
  };
}

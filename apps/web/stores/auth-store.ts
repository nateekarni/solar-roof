"use client";

import { useSyncExternalStore } from "react";

export interface AuthUser {
  authorization?: import('../lib/effective-page-access').AuthorizationSnapshot;
  id: string;
  email: string;
  displayName: string;
  companyPosition?: string | null;
  phoneNumber?: string | null;
  hasSignature?: boolean;
  avatarData?: string | null;
  role: "owner" | "admin" | "operator" | "accountant" | "customer_user";
  customerId?: string | null;
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

// Auth responses and profile responses have different privacy boundaries.
// Keep only session-safe fields, even if a caller passes a full profile object.
function sessionUser(user: AuthUser): AuthUser {
  return {
    id: user.id, email: user.email, displayName: user.displayName, role: user.role,
    ...(user.avatarData !== undefined ? {avatarData: user.avatarData} : {}),
    ...(user.customerId !== undefined ? {customerId: user.customerId} : {}),
    ...(user.authorization !== undefined ? {authorization: user.authorization} : {}),
    ...(user.preferredLanguage !== undefined ? {preferredLanguage: user.preferredLanguage} : {}),
    ...(user.preferredTheme !== undefined ? {preferredTheme: user.preferredTheme} : {}),
    ...(user.companyPosition !== undefined ? {companyPosition: user.companyPosition} : {}),
    ...(user.phoneNumber !== undefined ? {phoneNumber: user.phoneNumber} : {}),
    ...(user.hasSignature !== undefined ? {hasSignature: user.hasSignature} : {}),
  };
}

function notify() {
  listeners.forEach((listener) => listener());
}

function initFromStorage() {
  if (typeof window === "undefined" || currentState.isInitialized) return;
  try {
    const storedUser = localStorage.getItem(AUTH_STORAGE_KEY);
    const storedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    const user = storedUser ? sessionUser(JSON.parse(storedUser)) : null;
    currentState = {
      user,
      accessToken: storedToken || null,
      isInitialized: true,
    };
    if (user) {
      try { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user)); } catch {}
    }
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
    user = sessionUser(user);
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

  updateDocumentIdentity(userId: string, identity: {companyPosition: string | null; hasSignature: boolean}) {
    if (currentState.user?.id !== userId) return;
    const user = sessionUser({...currentState.user, companyPosition: identity.companyPosition, hasSignature: identity.hasSignature});
    currentState = {...currentState, user};
    if (typeof window !== "undefined") {
      try { localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user)); } catch {}
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

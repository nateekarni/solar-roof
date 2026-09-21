"use client";

import { createTranslator, type Locale, type TranslationVariables } from "@solar/i18n";
import * as React from "react";
import { apiClient } from "../lib/api-client";
import { useAuth } from "../stores/auth-store";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  t: (key: string, variables?: TranslationVariables) => string;
}

const LocaleContext = React.createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale = "th",
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const { user, updatePreferences, isAuthenticated } = useAuth();
  const [locale, setLocaleState] = React.useState<Locale>(
    (user?.preferredLanguage as Locale) || initialLocale || "th"
  );

  React.useEffect(() => {
    if (user?.preferredLanguage && user.preferredLanguage !== locale) {
      setLocaleState(user.preferredLanguage);
    }
  }, [user?.preferredLanguage]);

  const setLocale = React.useCallback(
    async (nextLocale: Locale) => {
      setLocaleState(nextLocale);
      document.cookie = `locale=${nextLocale}; path=/; max-age=31536000; SameSite=Lax`;
      if (isAuthenticated) {
        updatePreferences({ preferredLanguage: nextLocale });
        apiClient
          .put("/v1/me/preferences", { preferredLanguage: nextLocale })
          .catch(() => {});
      }
    },
    [isAuthenticated, updatePreferences]
  );

  const translator = React.useMemo(() => createTranslator(locale), [locale]);

  const t = React.useCallback(
    (key: string, variables: TranslationVariables = {}) => {
      return translator(key, variables);
    },
    [translator]
  );

  const value = React.useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  const context = React.useContext(LocaleContext);
  if (!context) {
    return "th";
  }
  return context.locale;
}

export function useT() {
  const context = React.useContext(LocaleContext);
  if (!context) {
    return createTranslator("th");
  }
  return context.t;
}

export function useSetLocale() {
  const context = React.useContext(LocaleContext);
  if (!context) {
    return async () => {};
  }
  return context.setLocale;
}

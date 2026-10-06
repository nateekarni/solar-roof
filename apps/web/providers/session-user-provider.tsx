"use client";
import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";
import type { AuthUser } from "../stores/auth-store";
import { syncSessionUser } from "../lib/financial-session";
const SessionUserContext = createContext<AuthUser | null>(null);
export function SessionUserProvider({ user, children }: { user: AuthUser; children: ReactNode }) { useLayoutEffect(() => { syncSessionUser(user); }, [user]); return <SessionUserContext.Provider value={user}>{children}</SessionUserContext.Provider>; }
export function useSessionUser() { const user = useContext(SessionUserContext); if (!user) throw new Error("Verified session required"); return user; }

"use client";
import React, { createContext, useContext, useLayoutEffect, useEffect, useState, type ReactNode } from "react";
import type { AuthUser } from "../stores/auth-store";
import {useAuth} from "../stores/auth-store";
import { syncSessionUser } from "../lib/financial-session";
import {apiClient} from '../lib/api-client';
const SessionUserContext = createContext<AuthUser | null>(null);
export function SessionUserProvider({ user, children }: { user: AuthUser; children: ReactNode }) {
 const [verified,setVerified]=useState(user);
 useLayoutEffect(() => {setVerified(user);syncSessionUser(user);},[user]);
 useEffect(()=>{let active=true;let generation=0;const reload=()=>{const request=++generation;apiClient.get<AuthUser>('/v1/auth/me',{cache:'no-store'}).then(next=>{if(active&&request===generation&&next.id===user.id){setVerified(next);syncSessionUser(next);}}).catch(()=>{});};const timer=setInterval(reload,15000);window.addEventListener('operation-permission-denied',reload);window.addEventListener('permissions-updated',reload);window.addEventListener('focus',reload);return()=>{active=false;clearInterval(timer);window.removeEventListener('operation-permission-denied',reload);window.removeEventListener('permissions-updated',reload);window.removeEventListener('focus',reload);};},[user.id]);
 return <SessionUserContext.Provider value={verified}>{children}</SessionUserContext.Provider>;
}
export function useSessionUser() { const user = useContext(SessionUserContext); const {user:current}=useAuth(); if (!user) throw new Error("Verified session required"); return current?.id===user.id ? {...user,displayName:current.displayName,...(current.avatarData!==undefined?{avatarData:current.avatarData}:{})} : user; }

"use client";
import * as React from 'react';
import type { Capabilities } from '@solar/api-contracts';
import { apiClient } from './api-client';
import { useAuth } from '../stores/auth-store';
export function useFinancialCapabilities() {
 const {user}=useAuth();
 const [capabilities,setCapabilities]=React.useState<Capabilities>({actions:[],unavailable:{}});
 React.useEffect(()=>{
  let active=true;let revision=0;setCapabilities({actions:[],unavailable:{}});
  const reload=()=>{const current=++revision;setCapabilities({actions:[],unavailable:{}});if(user)apiClient.get<Capabilities>('/v1/auth/capabilities').then(value=>{if(active&&current===revision)setCapabilities(value);}).catch(()=>{});};
  reload();window.addEventListener('operation-permission-denied',reload);
  return()=>{active=false;window.removeEventListener('operation-permission-denied',reload);};
 },[user?.id,user?.role,user?.schoolId]);
 return capabilities;
}

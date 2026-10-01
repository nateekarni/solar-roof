"use client";
import * as React from 'react';
import type { Capabilities } from '@solar/api-contracts';
import { apiClient } from './api-client';
import { useAuth } from '../stores/auth-store';
export function useFinancialCapabilities() {
 const {user}=useAuth();
 const [capabilities,setCapabilities]=React.useState<Capabilities>({actions:[],unavailable:{}});
 React.useEffect(()=>{
  let active=true;setCapabilities({actions:[],unavailable:{}});
  if(user) apiClient.get<Capabilities>('/v1/auth/capabilities').then(value=>{if(active)setCapabilities(value);}).catch(()=>{});
  return()=>{active=false;};
 },[user?.id,user?.role,user?.schoolId]);
 return capabilities;
}

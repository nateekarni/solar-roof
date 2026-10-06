import {authStore,type AuthUser} from '../stores/auth-store';
import type {Capabilities} from '@solar/api-contracts';
import {apiClient} from './api-client';
/** Reconcile browser presentation state with the authenticated server identity. */
export function syncSessionUser(user:AuthUser):void {
 const current=authStore.getState();
 if(current.user===user)return;
 const token=current.user?.id===user.id ? current.accessToken || undefined : undefined;
 authStore.setAuth(user,token);
}
export async function fetchFinancialCapabilities(user:AuthUser):Promise<Capabilities>{
 syncSessionUser(user);
 return apiClient.get<Capabilities>('/v1/auth/capabilities');
}

'use client';

import {useMutation,useQuery,useQueryClient,type QueryClient} from '@tanstack/react-query';
import type {
  ConfirmGatewayRequest,
  ConfirmGatewayResponse,
  DiscoveredGatewayRow,
  GatewayConfigProposal,
  GatewaySyncState,
} from '@solar/api-contracts';
import {apiClient} from '../../lib/api-client';
import type {GatewayDiscoveryDetail} from './gateway-onboarding-draft';
import type {GatewayRow} from './gateway-index';

export const gatewayOnboardingKeys={
  all:['gateway-onboarding'] as const,
  discovery:()=>[...gatewayOnboardingKeys.all,'discovery'] as const,
  discovered:()=>[...gatewayOnboardingKeys.discovery(),'list'] as const,
  discoveredDetail:(id:string)=>[...gatewayOnboardingKeys.discovery(),'detail',id] as const,
  registered:()=>['gateways'] as const,
  sync:(id:string)=>[...gatewayOnboardingKeys.all,'gateway',id,'sync'] as const,
  proposals:(id:string)=>[...gatewayOnboardingKeys.all,'gateway',id,'proposals'] as const,
};

export function discoveredGatewaysQueryOptions(active=true){
  return {
    queryKey:gatewayOnboardingKeys.discovered(),
    queryFn:()=>apiClient.get<DiscoveredGatewayRow[]>('/v1/gateways/discovered?status=unassigned'),
    enabled:active,
    refetchInterval:active?5_000:false,
    refetchIntervalInBackground:false,
  } as const;
}

export function useDiscoveredGateways(active=true){
  return useQuery(discoveredGatewaysQueryOptions(active));
}

export function registeredGatewaysQueryOptions(){
  return {queryKey:gatewayOnboardingKeys.registered(),queryFn:()=>apiClient.get<GatewayRow[]>('/v1/gateways')} as const;
}

export function useRegisteredGateways(){
  return useQuery(registeredGatewaysQueryOptions());
}

export function useDiscoveredGateway(id:string|null|undefined,active=true){
  return useQuery({
    queryKey:gatewayOnboardingKeys.discoveredDetail(id??''),
    queryFn:()=>apiClient.get<GatewayDiscoveryDetail>(`/v1/gateways/discovered/${encodeURIComponent(id!)}`),
    enabled:active&&Boolean(id),
    refetchInterval:active&&id?5_000:false,
    refetchIntervalInBackground:false,
  });
}

export async function invalidateGatewayOnboarding(queryClient:QueryClient,discoveryId:string,gatewayId:string){
  await Promise.all([
    queryClient.invalidateQueries({queryKey:gatewayOnboardingKeys.discovery()}),
    queryClient.invalidateQueries({queryKey:gatewayOnboardingKeys.registered()}),
    queryClient.invalidateQueries({queryKey:gatewayOnboardingKeys.discoveredDetail(discoveryId)}),
    queryClient.invalidateQueries({queryKey:gatewayOnboardingKeys.sync(gatewayId)}),
    queryClient.invalidateQueries({queryKey:gatewayOnboardingKeys.proposals(gatewayId)}),
  ]);
}

export function useConfirmGateway(){
  const queryClient=useQueryClient();
  return useMutation({
    mutationFn:({discoveryId,request}:{discoveryId:string;request:ConfirmGatewayRequest})=>
      apiClient.post<ConfirmGatewayResponse>(`/v1/gateways/discovered/${encodeURIComponent(discoveryId)}/confirm`,request),
    onSuccess:async(response,variables)=>invalidateGatewayOnboarding(queryClient,variables.discoveryId,response.gatewayId),
  });
}

export function useGatewaySyncState(id:string|null|undefined,active=true){
  return useQuery({
    queryKey:gatewayOnboardingKeys.sync(id??''),
    queryFn:()=>apiClient.get<GatewaySyncState>(`/v1/gateways/${encodeURIComponent(id!)}/sync-state`),
    enabled:active&&Boolean(id),
    refetchInterval:query=>{
      if(!active||!id)return false;
      const state=query.state.data;
      return state?.configState==='applied'||state?.configState==='failed'?false:5_000;
    },
    refetchIntervalInBackground:false,
  });
}

export function useGatewayConfigProposals(id:string|null|undefined,active=true){
  return useQuery({
    queryKey:gatewayOnboardingKeys.proposals(id??''),
    queryFn:()=>apiClient.get<GatewayConfigProposal[]>(`/v1/gateways/${encodeURIComponent(id!)}/config-proposals`),
    enabled:active&&Boolean(id),
  });
}

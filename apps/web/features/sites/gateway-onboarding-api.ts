'use client';

import {useQuery,type QueryClient} from '@tanstack/react-query';
import type {
  ApproveGatewayProposalRequest,
  ConfirmGatewayRequest,
  ConfirmGatewayResponse,
  DiscoveredGatewayRow,
  GatewayConfigProposal,
  GatewaySyncState,
  CorrectInitialGatewayConfigRequest,
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

export function isGatewayTelemetryRequired(error:unknown):boolean{
  return typeof error==='object'&&error!==null&&'code' in error&&(error as {code?:unknown}).code==='GATEWAY_TELEMETRY_REQUIRED';
}

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

/**
 * Secret-returning requests deliberately bypass TanStack mutation/query state.
 * The caller owns the one-time plaintext response in component-local memory only.
 */
export async function confirmGatewayWithoutCaching(queryClient:QueryClient,discoveryId:string,request:ConfirmGatewayRequest,signal?:AbortSignal){
  const response=await apiClient.post<ConfirmGatewayResponse>(
    `/v1/gateways/discovered/${encodeURIComponent(discoveryId)}/confirm`,request,signal?{signal}:undefined,
  );
  await invalidateGatewayOnboarding(queryClient,discoveryId,response.gatewayId);
  return response;
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

async function invalidateGatewayProposalState(queryClient:QueryClient,gatewayId:string){
  await Promise.all([
    queryClient.invalidateQueries({queryKey:gatewayOnboardingKeys.proposals(gatewayId)}),
    queryClient.invalidateQueries({queryKey:gatewayOnboardingKeys.sync(gatewayId)}),
    queryClient.invalidateQueries({queryKey:gatewayOnboardingKeys.registered()}),
  ]);
}

export async function approveGatewayProposal(queryClient:QueryClient,gatewayId:string,proposalId:string,request:ApproveGatewayProposalRequest){
  const result=await apiClient.post<{configVersion:number;configHash:string}>(`/v1/gateways/${encodeURIComponent(gatewayId)}/config-proposals/${encodeURIComponent(proposalId)}/approve`,request);
  await invalidateGatewayProposalState(queryClient,gatewayId);
  return result;
}

export async function rejectGatewayProposal(queryClient:QueryClient,gatewayId:string,proposalId:string,reason:string){
  await apiClient.post(`/v1/gateways/${encodeURIComponent(gatewayId)}/config-proposals/${encodeURIComponent(proposalId)}/reject`,{reason});
  await invalidateGatewayProposalState(queryClient,gatewayId);
}

export async function correctInitialGatewayConfig(queryClient:QueryClient,gatewayId:string,request:CorrectInitialGatewayConfigRequest){
  const result=await apiClient.post<{configVersion:number;configHash:string}>(`/v1/gateways/${encodeURIComponent(gatewayId)}/configuration/correct`,request);
  await invalidateGatewayProposalState(queryClient,gatewayId);
  return result;
}

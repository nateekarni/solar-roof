import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';

interface ManagementTarget {url:string;apiKey:string;apiSecret:string}
interface RevokerOptions {env?:Record<string,string|undefined>;fetch?:typeof globalThis.fetch}
export const GATEWAY_SESSION_REVOKER_OPTIONS=Symbol('GATEWAY_SESSION_REVOKER_OPTIONS');

function targetFor(env:Record<string,string|undefined>,brokerId:string|null):ManagementTarget|null {
  let mapped:unknown;
  if(brokerId&&env.EMQX_MANAGEMENT_BROKERS_JSON){
    try{mapped=(JSON.parse(env.EMQX_MANAGEMENT_BROKERS_JSON) as Record<string,unknown>)[brokerId];}catch{return null;}
  }
  const explicitlyEquivalentToDefault=!brokerId||env.EMQX_MANAGEMENT_DEFAULT_BROKER_ID===brokerId;
  const candidate=mapped&&typeof mapped==='object'?mapped as Record<string,unknown>:explicitlyEquivalentToDefault?{
    url:env.EMQX_MANAGEMENT_URL,apiKey:env.EMQX_MANAGEMENT_API_KEY,apiSecret:env.EMQX_MANAGEMENT_API_SECRET,
  }:null;
  if(!candidate)return null;
  if(typeof candidate.url!=='string'||typeof candidate.apiKey!=='string'||typeof candidate.apiSecret!=='string'
    ||!candidate.apiKey||!candidate.apiSecret)return null;
  try{
    const url=new URL(candidate.url);
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)return null;
    return {url:url.toString().replace(/\/$/,''),apiKey:candidate.apiKey,apiSecret:candidate.apiSecret};
  }catch{return null;}
}

/** Revokes the broker session after credential state commits. Errors are
 * deliberately generic so management credentials and response bodies never
 * cross the API boundary. */
@Injectable()
export class GatewaySessionRevoker {
  private readonly env:Record<string,string|undefined>;
  private readonly request:typeof globalThis.fetch;
  constructor(@Optional() @Inject(GATEWAY_SESSION_REVOKER_OPTIONS) options?:RevokerOptions){
    this.env=options?.env??process.env;
    this.request=options?.fetch??globalThis.fetch;
  }

  async kick(brokerId:string|null,clientId:string):Promise<void>{
    const target=targetFor(this.env,brokerId);
    if(!target)throw new ServiceUnavailableException('MQTT session termination is not configured');
    try{
      const response=await this.request(`${target.url}/api/v5/clients/${encodeURIComponent(clientId)}`,{
        method:'DELETE',headers:{authorization:`Basic ${Buffer.from(`${target.apiKey}:${target.apiSecret}`).toString('base64')}`,
          accept:'application/json'},signal:AbortSignal.timeout(5000),
      });
      if(response.status!==204&&response.status!==404)throw new Error('EMQX session termination rejected');
    }catch(error){
      if(error instanceof ServiceUnavailableException)throw error;
      throw new ServiceUnavailableException('MQTT session termination could not be confirmed');
    }
  }
}

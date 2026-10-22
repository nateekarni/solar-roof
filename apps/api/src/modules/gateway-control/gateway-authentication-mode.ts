export type GatewayAuthenticationMode='credential'|'demo-anonymous';

/** Credential auth stays fail-closed unless the deliberately named demo mode is selected. */
export function gatewayAuthenticationMode(env:NodeJS.ProcessEnv=process.env):GatewayAuthenticationMode{
  return env.GATEWAY_AUTH_MODE==='demo-anonymous'?'demo-anonymous':'credential';
}

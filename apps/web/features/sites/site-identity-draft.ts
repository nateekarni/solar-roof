export interface SiteIdentityDraft {
  externalSiteId: string;
  externalGatewayId: string;
  externalDeviceId: string;
  additionalDevices: { externalDeviceId: string }[];
}

/** Resolve once before preview; final creation submits these same codes. */
export async function resolveSiteIdentityDraft(
  input: SiteIdentityDraft & { endpoint: string; protocolMode?: 'standard' | 'legacy' },
  allocate: (input: SiteIdentityDraft) => Promise<SiteIdentityDraft>,
) {
  const { endpoint, protocolMode, ...identity } = input;
  const codes = [identity.externalSiteId, identity.externalGatewayId, identity.externalDeviceId, ...identity.additionalDevices.map(device => device.externalDeviceId)];
  const resolved = codes.every(code => code.trim()) ? identity : await allocate(identity);
  return {
    ...resolved,
    endpoint: endpoint || (protocolMode === 'legacy' ? '' : `solar/v1/sites/${resolved.externalSiteId}/gateways/${resolved.externalGatewayId}/devices/+/telemetry`),
  };
}

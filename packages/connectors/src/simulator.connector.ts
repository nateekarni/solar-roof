import type { ConnectorConfig, ConnectorHealth, EnergyConnector, RegisterReadRequest, RegisterReadResult } from "./index.js";
export class SimulatorConnector implements EnergyConnector {
  private connected=false; private lastCheckedAt?: string; private tick=0;
  async connect(_config: ConnectorConfig){this.connected=true;this.lastCheckedAt=new Date().toISOString();}
  async read(requests: readonly RegisterReadRequest[]): Promise<readonly RegisterReadResult[]> { if(!this.connected) throw new Error("Connector is not connected"); this.tick++; return requests.flatMap((r)=>Array.from({ length: r.quantity }, (_, index) => ({ address: r.address + index, value: String((this.tick * 10 + r.address + index) % 100000) }))); }
  async health(): Promise<ConnectorHealth>{return {status:this.connected?"healthy":"offline",lastCheckedAt:this.lastCheckedAt};}
  async disconnect(){this.connected=false;}
}
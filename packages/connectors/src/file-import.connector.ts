import type { ConnectorConfig, ConnectorHealth, EnergyConnector, RegisterReadRequest, RegisterReadResult } from "./index.js";
export interface ImportedRegister { address: number; value: string; timestamp: string; }
export class FileImportConnector implements EnergyConnector {
 private rows: ImportedRegister[]=[]; private connected=false;
 async connect(config: ConnectorConfig & { rows?: ImportedRegister[] }){this.rows=config.rows??[];this.connected=true;}
 async read(requests: readonly RegisterReadRequest[]): Promise<readonly RegisterReadResult[]> { if(!this.connected) throw new Error("Connector is not connected"); const addresses=new Set(requests.map(r=>r.address)); return this.rows.filter(row=>addresses.has(row.address)).map(({address,value})=>({address,value})); }
 async health():Promise<ConnectorHealth>{return {status:this.connected?"healthy":"offline"};}
 async disconnect(){this.connected=false;}
 static parse(input: string): ImportedRegister[] { const value: unknown=JSON.parse(input); if(!Array.isArray(value)) throw new Error("Import must be an array"); return value.map((row)=>{if(typeof row!=="object"||row===null||typeof (row as any).address!=="number"||typeof (row as any).value!=="string"||typeof (row as any).timestamp!=="string") throw new Error("Invalid import row"); return row as ImportedRegister;}); }
}
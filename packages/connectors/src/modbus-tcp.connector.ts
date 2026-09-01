import type { ConnectorConfig, ConnectorHealth, EnergyConnector, RegisterReadRequest, RegisterReadResult } from "./index.js";
export interface ModbusTransport { readHoldingRegisters(address:number, quantity:number): Promise<number[]>; close():Promise<void>; }
export class ModbusTcpConnector implements EnergyConnector {
 private transport: ModbusTransport | undefined; private connected=false;
 constructor(private readonly factory:(config:ConnectorConfig)=>Promise<ModbusTransport>){ }
 async connect(config:ConnectorConfig){this.transport=await this.factory(config);this.connected=true;}
 async read(requests:readonly RegisterReadRequest[]):Promise<readonly RegisterReadResult[]>{if(!this.transport||!this.connected) throw new Error("Connector is not connected"); const results: RegisterReadResult[]=[]; for(const request of requests){const values=await this.transport.readHoldingRegisters(request.address,request.quantity); values.forEach((value,index)=>results.push({address:request.address+index,value:String(value)}));} return results;}
 async health():Promise<ConnectorHealth>{return {status:this.connected?"healthy":"offline"};}
 async disconnect(){await this.transport?.close();this.transport=undefined;this.connected=false;}
}
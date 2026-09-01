export interface ConnectorConfig {
  readonly id: string;
  readonly type: "simulator" | "file-import" | "modbus-tcp";
}

export interface RegisterReadRequest {
  readonly address: number;
  readonly quantity: number;
}

export interface RegisterReadResult {
  readonly address: number;
  readonly value: string;
}

export interface ConnectorHealth {
  readonly status: "healthy" | "degraded" | "offline";
  readonly lastCheckedAt?: string;
}

export interface EnergyConnector {
  connect(config: ConnectorConfig): Promise<void>;
  read(requests: readonly RegisterReadRequest[]): Promise<readonly RegisterReadResult[]>;
  health(): Promise<ConnectorHealth>;
  disconnect(): Promise<void>;
}


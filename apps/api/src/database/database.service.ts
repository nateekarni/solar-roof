import { Injectable, Logger } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from "pg";
import { observeDuration, observeValue } from '../common/observability/metrics.js';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly pool: Pool;
  private readonly metricPrefix: string;
  constructor(options: { max?: number; statementTimeout?: number; applicationName?: string; metricPrefix?: string; Client?: PoolConfig['Client'] } = {}) {
    this.metricPrefix = options.metricPrefix ?? 'read';
    const configured = (name: string, fallback: number, ceiling: number) => {
      const value = process.env[name] === undefined ? fallback : Number(process.env[name]);
      if (!Number.isSafeInteger(value) || value < 1 || value > ceiling) throw new Error(`Invalid resource budget: ${name}`);
      return value;
    };
    this.pool = new Pool({
    ...(options.Client ? { Client: options.Client } : {}),
    connectionString: process.env.DATABASE_URL,
    max: options.max ?? configured('API_READ_POOL_MAX', 12, 12),
    statement_timeout: options.statementTimeout ?? configured('API_READ_STATEMENT_TIMEOUT_MS', 1500, 1500),
    application_name: options.applicationName ?? 'solar-api-read',
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    });
    // pg removes failed idle clients before emitting this event. Handling it keeps
    // the process alive so readiness can fail and later queries can reconnect.
    this.pool.on("error", () => {
      new Logger(DatabaseService.name).warn("PostgreSQL idle connection lost; the pool will reconnect on demand");
    });
  }
  async query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
    const started = performance.now();
    const pending = this.pool.query<T>(text, values);
    observeValue('db_pool_waiting', this.pool.waitingCount);
    observeValue(`${this.metricPrefix}_db_pool_waiting`, this.pool.waitingCount);
    observeValue(`${this.metricPrefix}_db_pool_connections`, this.pool.totalCount);
    try { return await pending; }
    finally { observeDuration('query_duration', performance.now() - started, {}); }
  }
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  async onModuleDestroy() { await this.pool.end(); }
}

import { Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { budget } from './ingestion-limiter.js';
import { Client, type ClientConfig } from 'pg';

@Injectable()
export class IngestionDatabaseService extends DatabaseService implements BeforeApplicationShutdown {
  private readonly clients: Set<Client>;
  constructor() {
    const clients = new Set<Client>();
    class OwnedClient extends Client {
      constructor(config?: ClientConfig) {
        super(config); clients.add(this);
        this.connection.stream.once('close', () => clients.delete(this));
      }
    }
    // Pool's connect event occurs after authentication. The supported Client
    // factory owns every socket from construction, including pending handshakes.
    super({ Client: OwnedClient, max: budget('INGEST_DB_POOL_MAX', 8), statementTimeout: budget('INGEST_DB_STATEMENT_TIMEOUT_MS', 5000), applicationName: 'solar-api-ingestion', metricPrefix: 'ingest' });
    this.clients = clients;
  }
  // Nest destroys providers in parallel. Keep this pool open until MQTT's
  // onModuleDestroy has stopped admission and completed its bounded drain.
  override async onModuleDestroy() {}
  async beforeApplicationShutdown() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([this.pool.end(), new Promise<void>(resolve => {
      timer = setTimeout(() => {
        // Racing pool.end alone leaves checked-out query sockets alive. At this
        // point MQTT's drain/ACK deadline has expired; close only our own clients.
        const closed = [...this.clients].map(client => new Promise<void>(resolveClosed => {
          const socket = client.connection.stream;
          if (socket.closed) { resolveClosed(); return; }
          // end() marks _ending before auth finishes and pg then omits the
          // pending connect rejection. Unexpected socket close preserves that
          // driver's error path. A checked-out idle client also needs a handler.
          client.on('error', () => {});
          socket.once('close', () => resolveClosed());
          socket.destroy();
        }));
        void Promise.allSettled(closed).then(() => resolve());
      }, 1000);
    })]); }
    finally { clearTimeout(timer); }
  }
}

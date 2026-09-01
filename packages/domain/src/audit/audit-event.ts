export type AuditValue = Record<string, unknown> | null;

export interface AuditInput {
  actorId?: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: AuditValue;
  after?: AuditValue;
  reason?: string;
  correlationId: string;
}

export interface AuditEvent extends AuditInput {
  id: string;
  occurredAt: Date;
}

export interface AuditEventStore {
  append(event: AuditEvent): Promise<void>;
}

export class AppendOnlyAuditService {
  constructor(private readonly store: AuditEventStore, private readonly idFactory = () => crypto.randomUUID()) {}

  async append(input: AuditInput): Promise<AuditEvent> {
    const event: AuditEvent = { ...input, id: this.idFactory(), occurredAt: new Date() };
    await this.store.append(Object.freeze(event));
    return event;
  }
}
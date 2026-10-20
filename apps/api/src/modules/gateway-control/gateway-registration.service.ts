import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { GatewayRegisterPayload, GatewayReportedDevice, DiscoveredGatewayDetail as ContractDetail } from '@solar/api-contracts';
import { DatabaseService } from '../../database/database.service.js';
import { parseGatewayControlPayload, parseGatewayControlTopic } from './gateway-control-payload.js';

export interface RegistrationInput {
  /** Trusted transport context, never a field from the gateway payload. */
  brokerId?: string | null | undefined;
  clientId: string;
  sourceAddress?: string | null | undefined;
  payload: unknown;
  topic?: string;
}
type DiscoveryStatus = 'unassigned' | 'configuring' | 'assigned' | 'ignored';
interface DiscoveryRow extends Omit<ContractDetail, 'status' | 'snapshot'> {
  status: DiscoveryStatus;
  mqttBrokerId: string | null;
  clientId: string | null;
  firmwareVersion: string | null;
  sourceAddress: string | null;
  assignedAt: string | null;
}
export interface DiscoveredGatewayDetail extends DiscoveryRow {
  snapshot: GatewayRegisterPayload;
  draftDevices: (GatewayReportedDevice & { mappingSource: 'gateway' })[];
  presetSuggestions: { deviceId: string; suggestions: PresetSuggestion[] }[];
}
interface PresetCandidate {
  kind: 'register' | 'profile';
  id: string;
  manufacturer: string | null;
  model: string | null;
  profileId: string | null;
  version: string | null;
  deviceType: string | null;
}
export interface PresetSuggestion extends PresetCandidate {
  rank: number;
  matches: ('manufacturer' | 'model' | 'profileId')[];
  versionMatch: boolean | null;
}
type Queryable = Pick<DatabaseService, 'query'>;
const normalized = (value?: string | null) => (value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const columns = `d.id, d.external_gateway_id AS "externalGatewayId", d.mqtt_broker_id AS "mqttBrokerId",
  d.client_id AS "clientId", d.reported_site_id AS "reportedSiteId", d.reported_device_id AS "reportedDeviceId",
  d.manufacturer, d.model, d.profile_id AS "profileId", d.protocol, d.firmware_version AS "firmwareVersion",
  d.status, d.assigned_site_id AS "assignedSiteId", d.assigned_gateway_id AS "assignedGatewayId", d.assigned_at AS "assignedAt",
  d.source_address AS "sourceAddress", d.first_seen_at AS "firstSeenAt", d.last_seen_at AS "lastSeenAt",
  d.discovery_revision AS "discoveryRevision", d.raw_payload AS "rawPayload", d.devices`;
const onboardingState = `CASE WHEN d.client_id=d.external_gateway_id AND EXISTS(
    SELECT 1 FROM gateway_discovery_snapshots ready_snapshot
    WHERE ready_snapshot.discovered_gateway_id=d.id AND ready_snapshot.revision=d.discovery_revision
  ) THEN 'ready' ELSE 'registration_required' END AS "onboardingState"`;

@Injectable()
export class GatewayRegistrationService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async record(input: RegistrationInput): Promise<DiscoveredGatewayDetail> {
    const payload = parseGatewayControlPayload('register', input.payload);
    if (payload.gateway.gatewayId !== input.clientId) throw new Error('Gateway identity mismatch');
    if (input.topic !== undefined) {
      const topic = parseGatewayControlTopic(input.topic);
      if (topic?.kind !== 'register' || topic.gatewayId !== input.clientId) throw new Error('Gateway topic identity mismatch');
    }
    const brokerId = input.brokerId ?? null;
    const sourceAddress = input.sourceAddress?.trim() || null;
    return this.db.transaction(async client => {
      // The advisory lock also covers the absent-row case. The row lock coordinates
      // existing legacy assignment writers that already use SELECT FOR UPDATE.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [JSON.stringify([brokerId ?? 'default', payload.gateway.gatewayId])]);
      let row = (await client.query<DiscoveryRow>(`SELECT ${columns} FROM discovered_gateways d
        WHERE d.mqtt_broker_id IS NOT DISTINCT FROM $1::uuid AND d.external_gateway_id=$2 FOR UPDATE`, [brokerId, payload.gateway.gatewayId])).rows[0];
      let inserted = false;
      if (!row) {
        const first = payload.devices[0];
        row = (await client.query<DiscoveryRow>(`INSERT INTO discovered_gateways AS d
          (mqtt_broker_id,external_gateway_id,client_id,reported_site_id,reported_device_id,manufacturer,model,profile_id,protocol,firmware_version,raw_payload,devices,source_address)
          VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13)
          ON CONFLICT ((coalesce(mqtt_broker_id::text, 'default')), external_gateway_id) DO NOTHING
          RETURNING ${columns}`, [brokerId, payload.gateway.gatewayId, input.clientId, payload.reportedSiteId ?? null,
          first?.deviceId ?? null, first?.manufacturer ?? null, payload.gateway.model, first?.profileId ?? null,
          first?.protocol ?? null, payload.gateway.firmwareVersion, JSON.stringify(payload), JSON.stringify(payload.devices), sourceAddress])).rows[0];
        inserted = !!row;
        // A legacy telemetry insert does not take our advisory lock. Its unique
        // index conflict waits for its transaction; then lock the committed row.
        if (!row) row = (await client.query<DiscoveryRow>(`SELECT ${columns} FROM discovered_gateways d
          WHERE d.mqtt_broker_id IS NOT DISTINCT FROM $1::uuid AND d.external_gateway_id=$2 FOR UPDATE`, [brokerId, payload.gateway.gatewayId])).rows[0];
      }
      if (!row) throw new Error('Discovery identity changed; retry registration');
      const duplicate = (await client.query<{ revision: number }>('SELECT revision FROM gateway_discovery_snapshots WHERE discovered_gateway_id=$1 AND message_id=$2 LIMIT 1', [row.id, payload.messageId])).rows[0];
      if (duplicate) return this.loadDetail(client, row.id, duplicate.revision);
      if (row.status !== 'unassigned') throw new ConflictException('Only an unassigned pre-approval draft accepts registration');
      const recent = await client.query(`SELECT id FROM gateway_discovery_snapshots
        WHERE discovered_gateway_id=$1 AND nullif(btrim(source_address),'') IS NOT DISTINCT FROM $2::text
          AND received_at > clock_timestamp() - interval '1 minute' ORDER BY received_at DESC LIMIT 12`, [row.id, sourceAddress]);
      if (recent.rows.length >= 12) throw new Error('Registration rate limit: maximum 12 registrations per minute per gateway/source');
      if (!inserted) {
        const first = payload.devices[0];
        row = (await client.query<DiscoveryRow>(`UPDATE discovered_gateways AS d SET
          raw_payload=$2::jsonb,devices=$3::jsonb,source_address=$4,client_id=$5,reported_site_id=$6,
          reported_device_id=$7,manufacturer=$8,model=$9,profile_id=$10,protocol=$11,firmware_version=$12,
          discovery_revision=discovery_revision+1,last_seen_at=clock_timestamp()
          WHERE id=$1 AND status='unassigned' RETURNING ${columns}`,
        [row.id, JSON.stringify(payload), JSON.stringify(payload.devices), sourceAddress, input.clientId,
          payload.reportedSiteId ?? null, first?.deviceId ?? null, first?.manufacturer ?? null,
          payload.gateway.model, first?.profileId ?? null, first?.protocol ?? null, payload.gateway.firmwareVersion])).rows[0];
        if (!row) throw new ConflictException('Discovery is no longer an unassigned pre-approval draft');
      }
      await client.query(`INSERT INTO gateway_discovery_snapshots(discovered_gateway_id,revision,message_id,payload,source_address,received_at)
        VALUES($1,$2,$3,$4::jsonb,$5,clock_timestamp())`, [row.id, row.discoveryRevision, payload.messageId, JSON.stringify(payload), sourceAddress]);
      return this.loadDetail(client, row.id);
    });
  }

  async detail(id: string): Promise<DiscoveredGatewayDetail> {
    return this.loadDetail(this.db, id);
  }

  async list(status?: string | null): Promise<DiscoveryRow[]> {
    if (status !== undefined && status !== null && !['unassigned', 'configuring', 'assigned', 'ignored'].includes(status)) {
      throw new Error('Invalid discovery status');
    }
    return (await this.db.query<DiscoveryRow>(`SELECT ${columns}, ${onboardingState} FROM discovered_gateways d
      WHERE ($1::text IS NULL OR d.status=$1) ORDER BY d.last_seen_at DESC,d.id LIMIT 200`, [status ?? null])).rows;
  }

  private async loadDetail(client: Queryable, id: string, revision: number | null = null): Promise<DiscoveredGatewayDetail> {
    const row = (await client.query<DiscoveryRow & { snapshot: GatewayRegisterPayload | null }>(`SELECT ${columns}, ${onboardingState}, s.payload AS snapshot,
      s.revision AS "discoveryRevision",s.payload AS "rawPayload",s.source_address AS "sourceAddress",s.received_at AS "lastSeenAt"
      FROM discovered_gateways d LEFT JOIN gateway_discovery_snapshots s ON s.discovered_gateway_id=d.id AND s.revision=coalesce($2::integer,d.discovery_revision)
      WHERE d.id=$1 LIMIT 1`, [id, revision])).rows[0];
    if (!row) throw new NotFoundException('Discovered gateway not found');
    if (!row.snapshot || row.clientId !== row.externalGatewayId) throw new ConflictException({
      statusCode: 409,
      code: 'GATEWAY_REGISTRATION_REQUIRED',
      message: 'Gateway must publish a current schema 1.1 registration before pairing',
    });
    const snapshot=row.snapshot;
    const presetSuggestions: DiscoveredGatewayDetail['presetSuggestions'] = [];
    for (const device of snapshot.devices) {
      const manufacturer = normalized(device.manufacturer);
      const model = normalized(device.model);
      const profileId = normalized(device.profileId);
      const candidates = (await client.query<PresetCandidate>(`WITH candidates AS (
        SELECT 'register'::text AS kind,id::text,brand AS manufacturer,model,NULL::text AS "profileId",NULL::text AS version,device_type AS "deviceType"
          FROM meter_presets
        UNION ALL
        SELECT 'profile'::text,p.id::text,NULL::text,NULL::text,p.profile_id,p.version,p.config->>'deviceType'
          FROM payload_profile_revisions p WHERE p.owner_device_id IS NULL
            AND NOT EXISTS(SELECT 1 FROM payload_preset_archives a WHERE a.profile_id=p.profile_id)
      ), ranked AS (
        SELECT *,
          CASE WHEN $1<>'' AND regexp_replace(lower(coalesce(manufacturer,'')),'[^a-z0-9]','','g')=$1 THEN 40 ELSE 0 END +
          CASE WHEN $2<>'' AND regexp_replace(lower(coalesce(model,'')),'[^a-z0-9]','','g')=$2 THEN 40 ELSE 0 END +
          CASE WHEN $3<>'' AND regexp_replace(lower(coalesce("profileId",'')),'[^a-z0-9]','','g')=$3
            THEN 100 + CASE WHEN version=$4 THEN 10 ELSE 0 END ELSE 0 END AS rank
        FROM candidates
      ) SELECT * FROM ranked WHERE rank>0 ORDER BY rank DESC,kind,id LIMIT 50`,
      [manufacturer, model, profileId, device.profileVersion?.trim() ?? null])).rows;
      const suggestions = candidates.map(candidate => {
        const matches: PresetSuggestion['matches'] = [];
        if (manufacturer && manufacturer === normalized(candidate.manufacturer)) matches.push('manufacturer');
        if (model && model === normalized(candidate.model)) matches.push('model');
        if (profileId && profileId === normalized(candidate.profileId)) matches.push('profileId');
        const versionMatch = candidate.kind === 'profile' && device.profileVersion !== undefined
          ? candidate.version === device.profileVersion.trim() : null;
        const rank = (matches.includes('manufacturer') ? 40 : 0) + (matches.includes('model') ? 40 : 0)
          + (matches.includes('profileId') ? 100 + (versionMatch ? 10 : 0) : 0);
        return { ...candidate, rank, matches, versionMatch };
      }).filter(suggestion => suggestion.rank > 0)
        .sort((a, b) => b.rank - a.rank || a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id));
      presetSuggestions.push({ deviceId: device.deviceId, suggestions });
    }
    const first = snapshot.devices[0];
    return { ...row, snapshot, model: snapshot.gateway.model, firmwareVersion: snapshot.gateway.firmwareVersion,
      reportedSiteId: snapshot.reportedSiteId ?? null, reportedDeviceId: first?.deviceId ?? null,
      manufacturer: first?.manufacturer ?? null, profileId: first?.profileId ?? null, protocol: first?.protocol ?? null,
      devices: snapshot.devices,
      draftDevices: snapshot.devices.map(device => ({ ...device, mappingSource: 'gateway' })), presetSuggestions };
  }
}

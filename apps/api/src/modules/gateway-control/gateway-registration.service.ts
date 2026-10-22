import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { isDeepStrictEqual } from 'node:util';
import type { GatewayRegisterPayload, GatewayReportedDevice,TelemetryDiscoveryEnvelope, DiscoveredGatewayDetail as ContractDetail } from '@solar/api-contracts';
import { DatabaseService } from '../../database/database.service.js';
import { parseGatewayControlPayload, parseGatewayControlTopic } from './gateway-control-payload.js';
import { parseTelemetryDiscoveryEnvelope } from '../telemetry/payload-profile.js';

export interface RegistrationInput {
  /** Trusted transport context, never a field from the gateway payload. */
  brokerId?: string | null | undefined;
  clientId: string;
  sourceAddress?: string | null | undefined;
  payload: unknown;
  topic?: string;
}
export interface TelemetryObservationInput {
  brokerId?:string|null|undefined;
  sourceAddress?:string|null|undefined;
  topic:string;
  payload:unknown;
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
  snapshot: GatewayRegisterPayload|TelemetryDiscoveryEnvelope;
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
  d.gateway_serial AS "gatewaySerial",
  d.client_id AS "clientId", d.reported_site_id AS "reportedSiteId", d.reported_device_id AS "reportedDeviceId",
  d.manufacturer, d.model, d.profile_id AS "profileId", d.protocol, d.firmware_version AS "firmwareVersion",
  d.status, d.assigned_site_id AS "assignedSiteId", d.assigned_gateway_id AS "assignedGatewayId", d.assigned_at AS "assignedAt",
  d.source_address AS "sourceAddress", d.first_seen_at AS "firstSeenAt", d.last_seen_at AS "lastSeenAt",
  d.discovery_revision AS "discoveryRevision", d.raw_payload AS "rawPayload", d.devices`;
const onboardingState = `CASE WHEN ((d.gateway_serial IS NOT NULL AND d.client_id=d.gateway_serial)
    OR (d.gateway_serial IS NULL AND d.client_id=d.external_gateway_id)) AND EXISTS(
    SELECT 1 FROM gateway_discovery_snapshots ready_snapshot
    WHERE ready_snapshot.discovered_gateway_id=d.id AND ready_snapshot.revision=d.discovery_revision
  ) THEN 'ready' ELSE 'telemetry_required' END AS "onboardingState",
  EXISTS(SELECT 1 FROM gateways claimed_gateway WHERE claimed_gateway.external_gateway_id=d.external_gateway_id
    AND claimed_gateway.retired_at IS NULL AND claimed_gateway.gateway_serial IS DISTINCT FROM d.gateway_serial) AS "identityConflict"`;

@Injectable()
export class GatewayRegistrationService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}
  async observeTelemetry(input:TelemetryObservationInput):Promise<{id:string;discoveryRevision:number;changed:boolean}> {
    const evidence=parseTelemetryDiscoveryEnvelope(input.payload,input.topic);
    const brokerId=input.brokerId??null;
    const sourceAddress=input.sourceAddress?.trim()||null;
    const reported=this.reportedDevice(evidence);
    const gatewaySerial=evidence.gatewaySerial??null;
    const identity=gatewaySerial??evidence.gatewayId;
    const identityPredicate=gatewaySerial?'d.gateway_serial=$2':"d.gateway_serial IS NULL AND d.external_gateway_id=$2";
    const conflictTarget=gatewaySerial
      ?"((coalesce(mqtt_broker_id::text, 'default')),gateway_serial) WHERE gateway_serial IS NOT NULL AND status='unassigned'"
      :"((coalesce(mqtt_broker_id::text, 'default')),external_gateway_id) WHERE gateway_serial IS NULL";
    return this.db.transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',[JSON.stringify([brokerId??'default',gatewaySerial?`serial:${identity}`:`claimed:${identity}`])]);
      let row=(await client.query<DiscoveryRow>(`SELECT ${columns} FROM discovered_gateways d
        WHERE d.mqtt_broker_id IS NOT DISTINCT FROM $1::uuid AND ${identityPredicate} AND d.status='unassigned' FOR UPDATE`,
      [brokerId,identity])).rows[0];
      let inserted=false;
      if(!row){
        row=(await client.query<DiscoveryRow>(`INSERT INTO discovered_gateways AS d
          (mqtt_broker_id,external_gateway_id,client_id,reported_site_id,reported_device_id,manufacturer,model,profile_id,protocol,
           firmware_version,raw_payload,devices,source_address,gateway_serial)
          VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14)
          ON CONFLICT ${conflictTarget}
          DO NOTHING RETURNING ${columns}`,
        [brokerId,evidence.gatewayId,identity,evidence.siteId,evidence.device.deviceId,evidence.device.manufacturer??null,
          evidence.device.model??null,evidence.device.profileId??null,evidence.device.protocol??null,null,JSON.stringify(evidence.raw),
          JSON.stringify([reported]),sourceAddress,gatewaySerial])).rows[0];
        inserted=!!row;
        if(!row)row=(await client.query<DiscoveryRow>(`SELECT ${columns} FROM discovered_gateways d
          WHERE d.mqtt_broker_id IS NOT DISTINCT FROM $1::uuid AND ${identityPredicate} AND d.status='unassigned' FOR UPDATE`,
        [brokerId,identity])).rows[0];
      }
      if(!row)throw new ConflictException('Discovery serial changed; retry telemetry');
      if(inserted){
        await this.insertEvidence(client,row.id,row.discoveryRevision,evidence.messageId,evidence.raw,sourceAddress);
        return {id:row.id,discoveryRevision:row.discoveryRevision,changed:true};
      }
      const devices=this.mergeReportedDevices(row.devices,reported);
      const changed=row.externalGatewayId!==evidence.gatewayId||row.reportedSiteId!==evidence.siteId
        ||!isDeepStrictEqual(row.devices,devices);
      if(!changed){
        await client.query(`UPDATE discovered_gateways SET raw_payload=$2::jsonb,client_id=$3,source_address=$4,last_seen_at=clock_timestamp()
          WHERE id=$1 AND status='unassigned'`,[row.id,JSON.stringify(evidence.raw),identity,sourceAddress]);
        return {id:row.id,discoveryRevision:row.discoveryRevision,changed:false};
      }
      const first=devices[0];
      row=(await client.query<DiscoveryRow>(`UPDATE discovered_gateways AS d SET external_gateway_id=$2,client_id=$3,reported_site_id=$4,
        reported_device_id=$5,manufacturer=$6,model=$7,profile_id=$8,protocol=$9,raw_payload=$10::jsonb,devices=$11::jsonb,
        source_address=$12,discovery_revision=discovery_revision+1,last_seen_at=clock_timestamp()
        WHERE id=$1 AND status='unassigned' RETURNING ${columns}`,
      [row.id,evidence.gatewayId,identity,evidence.siteId,evidence.device.deviceId,first?.manufacturer??null,first?.model??null,
        first?.profileId??null,first?.protocol??null,JSON.stringify(evidence.raw),JSON.stringify(devices),sourceAddress])).rows[0];
      if(!row)throw new ConflictException('Discovery is no longer available');
      await this.insertEvidence(client,row.id,row.discoveryRevision,evidence.messageId,evidence.raw,sourceAddress);
      return {id:row.id,discoveryRevision:row.discoveryRevision,changed:true};
    });
  }

  private reportedDevice(evidence:ReturnType<typeof parseTelemetryDiscoveryEnvelope>):GatewayReportedDevice {
    const raw=evidence.raw;
    const values=raw.data.values,units=raw.data.units;
    const mappings=Object.keys(values).sort().map(tag=>({tag,displayName:tag,pollGroup:raw.pollGroup,sourceUnit:units[tag]!,targetUnit:units[tag]!,conversion:'identity' as const}));
    return {deviceId:evidence.device.deviceId,...(evidence.device.deviceSerial?{serialNumber:evidence.device.deviceSerial}:{}),deviceType:evidence.device.deviceType,
      ...(evidence.device.manufacturer?{manufacturer:evidence.device.manufacturer}:{}),...(evidence.device.model?{model:evidence.device.model}:{}),
      ...(evidence.device.profileId?{profileId:evidence.device.profileId}:{}),...(evidence.device.profileVersion?{profileVersion:evidence.device.profileVersion}:{}),
      ...(evidence.device.protocol?{protocol:evidence.device.protocol}:{}),pollGroups:[raw.pollGroup],mappings};
  }

  private mergeReportedDevices(current:GatewayReportedDevice[],next:GatewayReportedDevice):GatewayReportedDevice[] {
    const devices=current.map(device=>structuredClone(device));
    const index=devices.findIndex(device=>next.serialNumber?device.serialNumber===next.serialNumber:!device.serialNumber&&device.deviceId===next.deviceId);
    if(index<0){
      if(devices.length>=128)throw new Error('Telemetry discovery device limit: maximum 128 serials per gateway');
      devices.push(next);
    }
    else {
      const previous=devices[index]!;
      const mappings=new Map((previous.mappings??[]).map(mapping=>[`${mapping.pollGroup}:${mapping.tag}`,mapping]));
      for(const mapping of next.mappings??[])mappings.set(`${mapping.pollGroup}:${mapping.tag}`,mapping);
      devices[index]={...previous,...next,pollGroups:[...new Set([...(previous.pollGroups??[]),...(next.pollGroups??[])])].sort(),mappings:[...mappings.values()].sort((a,b)=>a.tag.localeCompare(b.tag))};
    }
    return devices.sort((a,b)=>(a.serialNumber??a.deviceId).localeCompare(b.serialNumber??b.deviceId));
  }

  private async insertEvidence(client:Queryable,id:string,revision:number,messageId:string,payload:unknown,sourceAddress:string|null):Promise<void>{
    const recent=await client.query(`SELECT id FROM gateway_discovery_snapshots
      WHERE discovered_gateway_id=$1 AND nullif(btrim(source_address),'') IS NOT DISTINCT FROM $2::text
        AND received_at > clock_timestamp() - interval '1 minute' ORDER BY received_at DESC LIMIT 12`,[id,sourceAddress]);
    if(recent.rows.length>=12)throw new Error('Telemetry discovery rate limit: maximum 12 evidence changes per minute per gateway/source');
    await client.query(`INSERT INTO gateway_discovery_snapshots(discovered_gateway_id,revision,message_id,payload,source_address,received_at)
      VALUES($1,$2,$3,$4::jsonb,$5,clock_timestamp())`,[id,revision,messageId,JSON.stringify(payload),sourceAddress]);
    await client.query(`DELETE FROM gateway_discovery_snapshots WHERE discovered_gateway_id=$1 AND id NOT IN
      (SELECT id FROM gateway_discovery_snapshots WHERE discovered_gateway_id=$1 ORDER BY received_at DESC,id DESC LIMIT 100)`,[id]);
  }
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
    const row = (await client.query<DiscoveryRow & { snapshot: GatewayRegisterPayload|TelemetryDiscoveryEnvelope|null }>(`SELECT ${columns}, ${onboardingState}, s.payload AS snapshot,
      s.revision AS "discoveryRevision",s.payload AS "rawPayload",s.source_address AS "sourceAddress",s.received_at AS "lastSeenAt"
      FROM discovered_gateways d LEFT JOIN gateway_discovery_snapshots s ON s.discovered_gateway_id=d.id AND s.revision=coalesce($2::integer,d.discovery_revision)
      WHERE d.id=$1 LIMIT 1`, [id, revision])).rows[0];
    if (!row) throw new NotFoundException('Discovered gateway not found');
    if (!row.snapshot || (row.gatewaySerial?row.clientId!==row.gatewaySerial:row.clientId!==row.externalGatewayId)) throw new ConflictException({
      statusCode: 409,
      code: 'GATEWAY_TELEMETRY_REQUIRED',
      message: 'Gateway must publish a valid telemetry snapshot before pairing',
    });
    const snapshot=row.snapshot;
    const devices=snapshot.messageType==='register'?snapshot.devices:row.devices;
    const presetSuggestions: DiscoveredGatewayDetail['presetSuggestions'] = [];
    for (const device of devices) {
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
    const first = devices[0];
    return { ...row, snapshot, model: snapshot.messageType==='register'?snapshot.gateway.model:row.model??null,
      firmwareVersion:snapshot.messageType==='register'?snapshot.gateway.firmwareVersion:row.firmwareVersion??null,
      reportedSiteId: snapshot.messageType==='register'?snapshot.reportedSiteId??null:snapshot.siteId, reportedDeviceId: first?.deviceId ?? null,
      manufacturer: first?.manufacturer ?? null, profileId: first?.profileId ?? null, protocol: first?.protocol ?? null,
      devices,
      draftDevices: devices.map(device => ({ ...device, mappingSource: 'gateway' })), presetSuggestions };
  }
}

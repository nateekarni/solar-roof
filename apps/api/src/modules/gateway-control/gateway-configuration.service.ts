import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import type { ConfirmGatewayRequest, ConfirmGatewayResponse, GatewayConfigPayload, GatewayDeviceConfig, GatewaySyncState,
  GatewayConfigProposal, GatewayControlKind, GatewayControlPayloads } from '@solar/api-contracts';
import { DatabaseService } from '../../database/database.service.js';
import { GatewayCredentialService } from './gateway-credential.service.js';
import { gatewayConfigHash, parseGatewayControlPayload } from './gateway-control-payload.js';
import { validatePayloadProfile, type PayloadProfile } from '../telemetry/payload-profile.js';
import { reserveGatewayIdentity } from '../assets/gateway-lifecycle.js';

const uuid = z.uuid();
const slaveId = z.number().int().min(1).max(247);
const serialConnection = z.object({ serialPort:z.string().trim().min(1).max(256), baudRate:z.number().int().min(50).max(4000000),
  dataBits:z.union([z.literal(5),z.literal(6),z.literal(7),z.literal(8)]), parity:z.enum(['none','even','odd','mark','space']),
  stopBits:z.union([z.literal(1),z.literal(1.5),z.literal(2)]), slaveId }).strict();
const tcpConnection = z.object({ host:z.string().trim().min(1).max(253).refine(host=>isIP(host)!==0 ||
  !/^[\d.]+$/.test(host)&&host.split('.').every(label=>/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))),
  port:z.number().int().min(1).max(65535), slaveId }).strict();
interface PreparedDevice { device: GatewayDeviceConfig; id: string; profileId: string;
  profile: PayloadProfile; sourcePresetId: string | null }
interface ExistingDevice {
  id:string;external_device_id:string;payload_profile_revision_id:string|null;device_type:string;
  model:string;serial_number:string;slave_id:number|null;profile_config:PayloadProfile|null;
  registers:GatewayDeviceConfig['mappings'];billing:boolean;billing_bound:boolean;
}
interface GatewayRow {id:string;site_id:string;external_site_id:string;external_gateway_id:string;applied_config_version:number;
  desired_config_version:number;desired_config_hash:string|null;active_config_hash:string|null;lifecycle_state:string;mqtt_broker_id:string|null;config_publication_epoch:string}
function deviceClassification(type:string) { return type==='energy-meter'?'meter':type==='solar-logger'?'logger':type; }
function validateRegisterStorage(mapping:GatewayDeviceConfig['mappings'][number]) {
  // pg serializes JS numbers using their decimal string. Validate that exact
  // decimal, including exponent notation, rather than rounding via float math.
  if(mapping.scale!==undefined) {
    const [coefficient,exponent='0']=mapping.scale.toString().toLowerCase().split('e');
    const decimals=Math.max(0,(coefficient!.split('.')[1]?.length??0)-Number(exponent));
    if(!Number.isFinite(mapping.scale)||Math.abs(mapping.scale)>=1e12||decimals>8)throw new BadRequestException('Register scale must be exactly representable as numeric(20,8)');
  }
  if(mapping.registerCount!==undefined&&(!Number.isInteger(mapping.registerCount)||mapping.registerCount<1||mapping.registerCount>2147483647)) {
    throw new BadRequestException('Register count exceeds PostgreSQL integer storage');
  }
  // Offset is JSONB numeric with no typmod, not numeric(20,8). The payload parser
  // already requires finite values; all finite JS decimal exponents fit JSONB.
}
export interface GatewayControlInput { brokerId?: string | null | undefined; gatewayId: string; payload: unknown }

function badInput<T>(work: () => T): T {
  try { return work(); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Invalid configuration'); }
}
export function validateConfirmation(input: unknown): ConfirmGatewayRequest {
  return badInput(() => {
    const body = z.object({ discoveryRevision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), siteId: uuid,
      devices: z.array(z.unknown()).max(32) }).strict().parse(input);
    const config = parseGatewayControlPayload('config', { schemaVersion: '1.1', messageType: 'config', messageId: 'validation',
      gatewayId: 'validation', siteId: 'validation', configVersion: 1, configHash: '0'.repeat(64),
      issuedAt: new Date().toISOString(), approvedBy: 'validation', devices: body.devices });
    return { ...body, devices: config.devices };
  });
}

@Injectable()
export class GatewayConfigurationService {
  private readonly desiredListeners = new Set<(gatewayId:string,version:number)=>Promise<unknown>>();
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(GatewayCredentialService) private readonly credentials: GatewayCredentialService) {}

  onDesiredConfig(listener:(gatewayId:string,version:number)=>Promise<unknown>):()=>void {
    this.desiredListeners.add(listener);
    return ()=>{this.desiredListeners.delete(listener);};
  }

  private async desiredCommitted(gatewayId:string,version:number):Promise<void> {
    // Notification is a latency optimization. A failed listener must never turn
    // an already committed approval (or issued credential) into an HTTP failure.
    // The immutable unpublished revision is the durable retry source.
    await Promise.allSettled([...this.desiredListeners].map(listener=>Promise.resolve().then(()=>listener(gatewayId,version))));
  }

  async pendingForPublish(brokerId:string|null,afterGatewayId:string|null=null):Promise<{gatewayId:string;version:number}[]> {
    return (await this.db.query<{gatewayId:string;version:number}>(`SELECT g.id AS "gatewayId",g.desired_config_version AS version
      FROM gateways g JOIN sites s ON s.id=g.site_id
      JOIN gateway_configuration_revisions r ON r.gateway_id=g.id AND r.version=g.desired_config_version
      WHERE g.mqtt_broker_id IS NOT DISTINCT FROM $1::uuid AND g.retired_at IS NULL AND g.protocol='mqtt'
        AND g.lifecycle_state IN ('active','configuring') AND s.status<>'archived'
        AND r.config->>'messageType'='config' AND (r.published_at IS NULL
          OR r.published_mqtt_broker_id IS DISTINCT FROM g.mqtt_broker_id
          OR EXISTS(SELECT 1 FROM gateway_configuration_publications p WHERE p.gateway_id=g.id))
        AND ($2::uuid IS NULL OR g.id>$2::uuid) ORDER BY g.id LIMIT 100`,[brokerId,afterGatewayId])).rows;
  }

  async desiredForPublish(id:string,version:number):Promise<{brokerId:string|null;payload:GatewayConfigPayload;epoch:string}> {
    badInput(()=>{uuid.parse(id);z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(version);});
    return this.db.transaction(async client=>{
      const gateway=await this.mutationGateway(client,id);
      const payload=await this.publishRevision(client,gateway,version);
      return {brokerId:gateway.mqtt_broker_id,payload,epoch:gateway.config_publication_epoch};
    });
  }

  async beginPublication(id:string,version:number,hash:string,brokerId:string|null,epoch:string):Promise<string> {
    badInput(()=>{uuid.parse(id);z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(version);});
    return this.db.transaction(async client=>{
      const gateway=await this.mutationGateway(client,id);
      const payload=await this.publishRevision(client,gateway,version);
      if(payload.configHash!==hash||gateway.mqtt_broker_id!==brokerId||gateway.config_publication_epoch!==epoch)throw new ConflictException('Desired publication changed');
      const attemptId=randomUUID();
      await client.query(`INSERT INTO gateway_configuration_publications(id,gateway_id,version,config_hash,mqtt_broker_id,publication_epoch)
        VALUES($1,$2,$3,$4,$5,$6)`,[attemptId,id,version,hash,brokerId,epoch]);
      return attemptId;
    });
  }

  async recordPublished(id:string,attemptId:string,delivered=true):Promise<{delivery:'published'|'pending';retryVersion?:number}> {
    badInput(()=>{uuid.parse(id);uuid.parse(attemptId);});
    return this.db.transaction(async client=>{
      // The existing site -> gateway order is unchanged. No locks span MQTT I/O.
      const gateway=await this.mutationGateway(client,id);
      const attempt=(await client.query(`SELECT * FROM gateway_configuration_publications WHERE gateway_id=$1 AND id=$2 FOR UPDATE`,[id,attemptId])).rows[0];
      if(!attempt)return {delivery:'pending'}; // Duplicate callback is harmless.
      const version=gateway.desired_config_version;
      const payload=await this.publishRevision(client,gateway,version);
      await client.query('DELETE FROM gateway_configuration_publications WHERE gateway_id=$1 AND id=$2',[id,attemptId]);
      if(attempt.version!==version||attempt.config_hash!==payload.configHash||attempt.mqtt_broker_id!==gateway.mqtt_broker_id) {
        // A stale packet may now be the retained value, even if a newer send was
        // already acknowledged. Invalidation and attempt retirement are atomic.
        await client.query('UPDATE gateways SET config_publication_epoch=config_publication_epoch+1 WHERE id=$1',[id]);
        await client.query('UPDATE gateway_configuration_revisions SET published_at=NULL WHERE gateway_id=$1 AND version=$2',[id,version]);
        return {delivery:'pending',retryVersion:version};
      }
      if(attempt.publication_epoch!==gateway.config_publication_epoch)return {delivery:'pending',retryVersion:version};
      if(!delivered)return {delivery:'pending'};
      await client.query(`UPDATE gateway_configuration_revisions SET published_at=coalesce(published_at,now()),published_mqtt_broker_id=$3 WHERE gateway_id=$1 AND version=$2`,[id,version,gateway.mqtt_broker_id]);
      await client.query(`UPDATE gateways SET published_config_version=GREATEST(published_config_version,$2) WHERE id=$1`,[id,version]);
      return {delivery:'published'};
    });
  }

  private async publishRevision(client:PoolClient,gateway:GatewayRow,version:number):Promise<GatewayConfigPayload> {
    if(gateway.desired_config_version!==version||!['active','configuring'].includes(gateway.lifecycle_state)) {
      throw new ConflictException('Requested version is not eligible desired configuration');
    }
    const revision=(await client.query('SELECT config,config_hash FROM gateway_configuration_revisions WHERE gateway_id=$1 AND version=$2',[gateway.id,version])).rows[0];
    if(!revision)throw new NotFoundException('Desired configuration not found');
    const payload=badInput(()=>parseGatewayControlPayload('config',revision.config));
    if(payload.gatewayId!==gateway.external_gateway_id||payload.siteId!==gateway.external_site_id||payload.configVersion!==version
      ||payload.configHash!==revision.config_hash||payload.configHash!==gateway.desired_config_hash||gatewayConfigHash(payload)!==payload.configHash) {
      throw new ConflictException('Stored desired configuration identity or hash mismatch');
    }
    return payload;
  }

  async recordProposal(input: GatewayControlInput): Promise<void> {
    const payload = this.controlPayload('configUpdate', input);
    await this.db.transaction(async client => {
      const gateway = await this.mutationGateway(client, input);
      if (payload.siteId !== gateway.external_site_id) throw new BadRequestException('Proposal site identity mismatch');
      if (gateway.lifecycle_state !== 'active') throw new ConflictException('Only an active gateway can propose updates');
      await client.query(`INSERT INTO gateway_config_proposals(gateway_id,proposal_id,message_id,base_config_version,payload)
        VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING RETURNING id`,
      [gateway.id, payload.proposalId, payload.messageId, payload.baseConfigVersion, JSON.stringify(payload)]);
    });
  }

  async approveProposal(id: string, proposalId: string, actor: string): Promise<{ configVersion: number; configHash: string }> {
    badInput(() => { uuid.parse(id); uuid.parse(proposalId); uuid.parse(actor); });
    const result=await this.conflicts(() => this.db.transaction(async client => {
      const gateway = await this.mutationGateway(client, id);
      const proposal = await this.proposal(client, id, proposalId);
      if (gateway.lifecycle_state !== 'active' || proposal.status !== 'pending'
        || proposal.base_config_version !== gateway.applied_config_version) throw new ConflictException('Proposal is stale or no longer pending');
      const payload = badInput(() => parseGatewayControlPayload('configUpdate', proposal.payload));
      if (payload.gatewayId !== gateway.external_gateway_id || payload.siteId !== gateway.external_site_id
        || payload.baseConfigVersion !== proposal.base_config_version) throw new BadRequestException('Proposal identity mismatch');
      const existing = await this.existingDevices(client,id);
      const prepared = await this.prepare(client, this.inheritSenderIdentity(payload.devices,existing));
      await this.validateExistingPlan(client,gateway,existing,prepared);
      const config = this.config(gateway.external_gateway_id, gateway.external_site_id, Number(gateway.desired_config_version) + 1,
        actor, payload.devices.map(d => prepared.find(p => p.device.deviceId === d.deviceId)?.device ?? d));
      // Only the immutable desired snapshot changes. Apply materializes its exact
      // mappings later; no mutable preset is consulted during activation.
      await this.saveRevision(client, id, config, actor);
      await client.query(`UPDATE gateway_config_proposals SET status='approved',reviewed_at=now(),reviewed_by=$3,approved_config_version=$4
        WHERE id=$1 AND gateway_id=$2`, [proposalId, id, actor, config.configVersion]);
      await this.audit(client, actor, 'gateway.proposal.approved', id, { proposalId, configVersion: config.configVersion, configHash: config.configHash });
      return { configVersion: config.configVersion, configHash: config.configHash };
    }));
    await this.desiredCommitted(id,result.configVersion);
    return result;
  }

  async rejectProposal(id: string, proposalId: string, reason: string, actor: string): Promise<void> {
    const text = badInput(() => { uuid.parse(id); uuid.parse(proposalId); uuid.parse(actor); return z.string().trim().min(1).max(2048).parse(reason); });
    await this.db.transaction(async client => {
      await this.mutationGateway(client, id);
      const proposal = await this.proposal(client, id, proposalId);
      if (proposal.status !== 'pending') throw new ConflictException('Proposal is no longer pending');
      await client.query(`UPDATE gateway_config_proposals SET status='rejected',reviewed_at=now(),reviewed_by=$3,rejection_reason=$4
        WHERE id=$1 AND gateway_id=$2`, [proposalId, id, actor, text]);
      await this.audit(client, actor, 'gateway.proposal.rejected', id, { proposalId, reason: text });
    });
  }

  async recordConfigStatus(input: GatewayControlInput): Promise<{ activated: boolean }> {
    const payload = this.controlPayload('configStatus', input);
    return this.conflicts(() => this.db.transaction(async client => {
      const gateway = await this.mutationGateway(client, input);
      const inserted = (await client.query(`INSERT INTO gateway_config_status_events(gateway_id,message_id,config_version,config_hash,status,reported_at,error,payload)
        VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) ON CONFLICT DO NOTHING RETURNING id`,
      [gateway.id, payload.messageId, payload.configVersion, payload.configHash, payload.status, payload.reportedAt,
        payload.error ? JSON.stringify(payload.error) : null, JSON.stringify(payload)])).rows[0];
      if (!inserted) return { activated: false };
      const revision = (await client.query(`SELECT config,config_hash FROM gateway_configuration_revisions WHERE gateway_id=$1 AND version=$2`,
        [gateway.id, payload.configVersion])).rows[0];
      const matching = revision && revision.config_hash === payload.configHash
        && gateway.desired_config_version === payload.configVersion && gateway.desired_config_hash === payload.configHash;
      if (!matching) {
        await client.query(`UPDATE gateways SET config_state='drifted',last_status_at=now() WHERE id=$1`, [gateway.id]);
        return { activated: false };
      }
      if (payload.status === 'failed') {
        if (gateway.applied_config_version < payload.configVersion) await client.query(`UPDATE gateways SET config_state='failed',last_status_at=now() WHERE id=$1`, [gateway.id]);
        return { activated: false };
      }
      await client.query(`UPDATE gateway_configuration_revisions SET acknowledged_at=coalesce(acknowledged_at,now()) WHERE gateway_id=$1 AND version=$2`, [gateway.id, payload.configVersion]);
      await client.query(`UPDATE gateways SET acknowledged_config_version=GREATEST(acknowledged_config_version,$2),last_status_at=now() WHERE id=$1`, [gateway.id, payload.configVersion]);
      if (payload.status !== 'applied' || !['active', 'configuring'].includes(gateway.lifecycle_state)) return { activated: false };
      if (gateway.applied_config_version >= payload.configVersion) {
        if (gateway.applied_config_version === payload.configVersion && gateway.active_config_hash === payload.configHash) {
          await client.query(`UPDATE gateways SET config_state='applied',last_status_at=now() WHERE id=$1`, [gateway.id]);
        }
        return { activated: false };
      }
      const config = badInput(() => parseGatewayControlPayload('config', revision.config));
      if (config.gatewayId !== input.gatewayId || config.siteId !== gateway.external_site_id
        || config.configVersion !== payload.configVersion || config.configHash !== payload.configHash) throw new BadRequestException('Stored configuration identity mismatch');
      await this.applyDevices(client, gateway, config.devices);
      await client.query(`UPDATE gateway_configuration_revisions SET applied_at=coalesce(applied_at,now()) WHERE gateway_id=$1 AND version=$2`, [gateway.id, payload.configVersion]);
      await client.query(`UPDATE gateways SET applied_config_version=$2,active_config_hash=$3,lifecycle_state='active',config_state='applied',last_status_at=now() WHERE id=$1`,
        [gateway.id, payload.configVersion, payload.configHash]);
      await client.query(`UPDATE discovered_gateways SET status='assigned' WHERE assigned_gateway_id=$1 AND status='configuring'`, [gateway.id]);
      return { activated: true };
    }));
  }

  async recordConnectionStatus(input: GatewayControlInput): Promise<void> {
    const payload = this.controlPayload('status', input);
    if ((payload.appliedConfigVersion === null) !== (payload.appliedConfigHash === null)) throw new BadRequestException('Applied identity must contain both version and hash');
    await this.db.transaction(async client => {
      const gateway = await this.mutationGateway(client, input);
      const inserted = (await client.query(`INSERT INTO gateway_connection_events(gateway_id,message_id,session_id,firmware_version,status,applied_config_version,applied_config_hash,reported_at,payload)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ON CONFLICT DO NOTHING RETURNING id`,
      [gateway.id, payload.messageId, payload.sessionId, payload.firmwareVersion, payload.status,
        payload.appliedConfigVersion, payload.appliedConfigHash, payload.reportedAt ?? null, JSON.stringify(payload)])).rows[0];
      if (!inserted) return;
      await client.query(`UPDATE gateways SET status=$2,last_status_at=now(),last_seen_at=CASE WHEN $2='online' THEN now() ELSE last_seen_at END,
        config_state=CASE WHEN applied_config_version>0 AND (applied_config_version IS DISTINCT FROM $3::integer OR active_config_hash IS DISTINCT FROM $4::text) THEN 'drifted' ELSE config_state END WHERE id=$1`,
      [gateway.id, payload.status, payload.appliedConfigVersion, payload.appliedConfigHash]);
    });
  }

  async syncState(id: string): Promise<GatewaySyncState> {
    badInput(() => uuid.parse(id));
    const row = (await this.db.query(`SELECT g.*,
      (SELECT status FROM gateway_connection_events WHERE gateway_id=g.id ORDER BY received_at DESC,id DESC LIMIT 1) AS connection_state,
      (SELECT received_at FROM gateway_config_status_events WHERE gateway_id=g.id ORDER BY received_at DESC,id DESC LIMIT 1) AS last_received_at,
      (SELECT error FROM gateway_config_status_events WHERE gateway_id=g.id AND config_version=g.desired_config_version
        AND config_hash=g.desired_config_hash ORDER BY received_at DESC,id DESC LIMIT 1) AS last_error
      FROM gateways g WHERE g.id=$1 AND g.retired_at IS NULL`, [id])).rows[0];
    if (!row) throw new NotFoundException('Gateway not found');
    const configState = ['failed', 'drifted'].includes(row.config_state) ? row.config_state
      : row.desired_config_version > row.applied_config_version ? 'pending_sync' : row.config_state;
    return { gatewayId: id, lifecycleState: row.lifecycle_state, configState, connectionState: row.connection_state ?? 'unknown',
      desiredConfigVersion: row.desired_config_version, desiredConfigHash: row.desired_config_hash,
      activeConfigVersion: row.applied_config_version, activeConfigHash: row.active_config_hash,
      lastReceivedAt: row.last_received_at ?? null, lastError: row.last_error ?? null };
  }

  async proposals(id: string): Promise<GatewayConfigProposal[]> {
    badInput(() => uuid.parse(id));
    await this.gateway(this.db, id);
    const rows = (await this.db.query(`SELECT p.*,g.applied_config_version FROM gateway_config_proposals p JOIN gateways g ON g.id=p.gateway_id
      WHERE p.gateway_id=$1 ORDER BY p.received_at DESC,p.id DESC LIMIT 100`, [id])).rows;
    return rows.map(row => ({ id: row.id, gatewayId: row.gateway_id, proposalId: row.proposal_id,
      baseConfigVersion: row.base_config_version, status: row.status === 'pending' && row.base_config_version !== row.applied_config_version ? 'stale' : row.status,
      approvalMode: 'manual', snapshot: row.payload, receivedAt: row.received_at, reviewedAt: row.reviewed_at ?? null, reviewedBy: row.reviewed_by ?? null }));
  }

  async rotateCredential(id: string, actor: string): Promise<{ username: string; password: string }> {
    badInput(() => { uuid.parse(id); uuid.parse(actor); });
    return this.conflicts(() => this.db.transaction(async client => {
      await this.mutationGateway(client, id);
      const credential = await this.credentials.rotate(client, id, actor);
      await this.audit(client, actor, 'gateway.credential.rotated', id, { username: credential.username });
      return credential;
    }));
  }

  private controlPayload<K extends Exclude<GatewayControlKind, 'register' | 'config'>>(kind: K, input: GatewayControlInput): GatewayControlPayloads[K] {
    const payload = badInput(() => { if (input.brokerId != null) uuid.parse(input.brokerId); return parseGatewayControlPayload(kind, input.payload); });
    if (payload.gatewayId !== input.gatewayId) throw new BadRequestException('Gateway identity mismatch');
    return payload;
  }

  private async mutationGateway(client: PoolClient, identity: string | GatewayControlInput): Promise<GatewayRow> {
    const values: unknown[] = typeof identity === 'string' ? [identity] : [identity.gatewayId, identity.brokerId ?? null];
    const lookup = typeof identity === 'string' ? 'g.id=$1'
      : 'g.external_gateway_id=$1 AND g.mqtt_broker_id IS NOT DISTINCT FROM $2::uuid';
    const select = `SELECT g.*,s.external_site_id FROM gateways g JOIN sites s ON s.id=g.site_id
      WHERE ${lookup} AND g.retired_at IS NULL AND s.status<>'archived'`;
    // Identify without locking the gateway: archive/ownership paths lock site
    // first. KEY SHARE also permits the site FK check when adding a device.
    const candidate = (await client.query<GatewayRow>(select, values)).rows[0];
    if (!candidate) throw new NotFoundException('Gateway not found');
    const site = (await client.query("SELECT id FROM sites WHERE id=$1 AND status<>'archived' FOR KEY SHARE", [candidate.site_id])).rows[0];
    if (!site) throw new NotFoundException('Gateway site not found');
    // A move, retirement or broker/identity change may have committed between
    // identification and this lock. Revalidate all predicates under the exact
    // site we hold; never follow a moved gateway into an unlocked site.
    const lockedValues = [...values, candidate.id, candidate.site_id];
    const row = (await client.query<GatewayRow>(`${select} AND g.id=$${lockedValues.length - 1} AND g.site_id=$${lockedValues.length} FOR UPDATE OF g`, lockedValues)).rows[0];
    if (!row) throw new NotFoundException('Gateway changed; reload configuration');
    return row;
  }

  private async gateway(client: Pick<DatabaseService, 'query'>, id: string) {
    const row = (await client.query<GatewayRow>(`SELECT g.*,s.external_site_id FROM gateways g JOIN sites s ON s.id=g.site_id
      WHERE g.id=$1 AND g.retired_at IS NULL AND s.status<>'archived'`, [id])).rows[0];
    if (!row) throw new NotFoundException('Gateway not found');
    return row;
  }

  private async proposal(client: PoolClient, gatewayId: string, id: string) {
    const row = (await client.query(`SELECT * FROM gateway_config_proposals WHERE id=$1 AND gateway_id=$2 FOR UPDATE`, [id, gatewayId])).rows[0];
    if (!row) throw new NotFoundException('Proposal not found');
    return row;
  }

  private async applyDevices(client: PoolClient, gateway: GatewayRow, devices: GatewayDeviceConfig[]) {
    const gatewayId = gateway.id, siteId = gateway.site_id;
    const existing = await this.existingDevices(client,gatewayId);
    const prepared = await this.prepare(client, this.inheritSenderIdentity(devices,existing), false);
    await this.validateExistingPlan(client,gateway,existing,prepared);
    const enabled = prepared.map(p => p.device.deviceId);
    await client.query(`UPDATE devices SET status='disabled',payload_profile_revision_id=NULL WHERE gateway_id=$1 AND NOT(external_device_id=ANY($2::text[]))`, [gatewayId, enabled]);
    for (const entry of prepared) {
      const previous = existing.find(d => d.external_device_id === entry.device.deviceId);
      if (!previous) { await this.materialize(client, gatewayId, siteId, entry); continue; }
      entry.id = previous.id;
      if(this.sameDecoder(previous,entry)) {
        // Keep the exact pinned immutable profile and physical mapping versions.
        // Billing source bindings refer to this ID, even for unrelated config updates.
        if(previous.model!==entry.device.model||previous.serial_number!==entry.device.serialNumber||previous.slave_id!==entry.device.connection?.slaveId) {
          await client.query('UPDATE devices SET model=$2,serial_number=$3,slave_id=$4 WHERE id=$1 AND gateway_id=$5 AND site_id=$6',
            [previous.id,entry.device.model,entry.device.serialNumber,entry.device.connection?.slaveId??null,gatewayId,siteId]);
        }
        continue;
      }
      await client.query(`INSERT INTO payload_profile_revisions(id,profile_id,version,config,owner_device_id,source_preset_revision_id)
        VALUES($1,$2,$3,$4::jsonb,$5,$6)`, [entry.profileId, entry.profile.id, entry.profile.version, JSON.stringify(entry.profile), entry.id, entry.sourcePresetId]);
      await client.query(`UPDATE devices SET payload_profile_revision_id=$2,model=$3,serial_number=$4,status='offline',slave_id=$5
        WHERE id=$1 AND gateway_id=$6 AND site_id=$7`, [entry.id, entry.profileId, entry.device.model, entry.device.serialNumber,
        entry.device.connection?.slaveId ?? null, gatewayId, siteId]);
      await client.query('UPDATE register_mapping_versions SET effective_to=now() WHERE device_id=$1 AND effective_to IS NULL', [entry.id]);
      await this.registers(client, entry.id, entry.device);
    }
  }

  private async existingDevices(client:PoolClient,id:string):Promise<ExistingDevice[]> {
    // A SELECT containing FOR UPDATE can wait after its statement snapshot and
    // correlated billing reads have started. Acquire device locks first, then
    // use a new READ COMMITTED statement snapshot to observe the winner's commit.
    await client.query('SELECT id FROM devices WHERE gateway_id=$1 ORDER BY id FOR UPDATE',[id]);
    return (await client.query<ExistingDevice>(`SELECT d.*,p.config AS profile_config,
      EXISTS(SELECT 1 FROM billing_meters b WHERE b.device_id=d.id AND b.site_id=d.site_id AND b.active) AS billing,
      EXISTS(SELECT 1 FROM billing_meters b WHERE b.device_id=d.id AND b.site_id=d.site_id AND b.active AND b.billing_source_binding_id IS NOT NULL) AS billing_bound,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('tag',r.semantic_field,'registerAddress',r.register_address,'dataType',r.data_type,
        'registerCount',r.register_count,'byteOrder',r.byte_order,'wordOrder',r.word_order,'scale',r.scale,'sourceUnit',r.unit,
        'offset',coalesce((r.quality_rule->>'offset')::numeric,0),'pollGroup',r.quality_rule->>'pollGroup') ORDER BY r.semantic_field),'[]'::jsonb)
        FROM register_mapping_versions r WHERE r.device_id=d.id AND r.effective_to IS NULL) AS registers
      FROM devices d LEFT JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id
      WHERE d.gateway_id=$1 ORDER BY d.id`,[id])).rows;
  }

  private inheritSenderIdentity(devices:GatewayDeviceConfig[],existing:ExistingDevice[]):GatewayDeviceConfig[] {
    return devices.map(device=>{
      const profile=existing.find(row=>row.external_device_id===device.deviceId)?.profile_config;
      const identity=profile?.sourceProfile??(profile?{id:profile.id,version:profile.version}:undefined);
      return identity&&device.profileId===undefined&&device.profileVersion===undefined
        ?{...device,profileId:identity.id,profileVersion:identity.version}:device;
    });
  }

  private sameDecoder(previous:ExistingDevice,next:PreparedDevice):boolean {
    if(!previous.payload_profile_revision_id||!previous.profile_config)return false;
    const semanticProfile=(profile:PayloadProfile)=>({deviceType:profile.deviceType,
      source:profile.sourceProfile??{id:profile.id,version:profile.version},pollGroups:[...profile.pollGroups].sort(),
      fields:profile.fields.map(({displayName:_name,...field})=>({...field,sourceTag:field.sourceTag??field.tag,
        required:field.required??false,role:field.role??'none'})).sort((a,b)=>a.tag<b.tag?-1:a.tag>b.tag?1:0)});
    const physical=(mappings:GatewayDeviceConfig['mappings'])=>mappings.filter(m=>m.registerAddress!==undefined).map(m=>({tag:m.tag,
      registerAddress:m.registerAddress,registerCount:m.registerCount,dataType:m.dataType,byteOrder:m.byteOrder,wordOrder:m.wordOrder,
      scale:m.scale,sourceUnit:m.sourceUnit,pollGroup:m.pollGroup,offset:m.offset??0})).sort((a,b)=>a.tag<b.tag?-1:a.tag>b.tag?1:0);
    return gatewayConfigHash(semanticProfile(previous.profile_config))===gatewayConfigHash(semanticProfile(next.profile))
      &&gatewayConfigHash(physical(previous.registers??[]))===gatewayConfigHash(physical(next.device.mappings));
  }

  private async validateExistingPlan(client:PoolClient,gateway:{id:string;applied_config_version:number},existing:ExistingDevice[],prepared:PreparedDevice[]) {
    let activeDevices:GatewayDeviceConfig[]=[];
    if(existing.some(row=>row.billing_bound)) {
      const active=(await client.query('SELECT config FROM gateway_configuration_revisions WHERE gateway_id=$1 AND version=$2',
        [gateway.id,gateway.applied_config_version])).rows[0];
      activeDevices=active?.config?.devices??[];
    }
    for(const previous of existing) {
      const next=prepared.find(p=>p.device.deviceId===previous.external_device_id);
      if(!next) {
        if(previous.billing)throw new ConflictException('Active billing device removal requires explicit billing source review');
        continue;
      }
      const deployedType=previous.profile_config?.deviceType;
      if(deployedType&&deployedType!==next.device.deviceType || !deployedType&&previous.device_type&&
        previous.device_type!==deviceClassification(next.device.deviceType!)) {
        throw new BadRequestException('Existing device profile type cannot change');
      }
      if(previous.billing&&!next.profile.fields.some(field=>field.role==='billing-import'))throw new BadRequestException('Billing device requires a cumulative billing-import field');
      if(previous.billing_bound) {
        const active=activeDevices.find(d=>d.deviceId===previous.external_device_id);
        const connectionUnchanged=active&&gatewayConfigHash({protocol:active.protocol,connection:active.connection,serialNumber:active.serialNumber})
          ===gatewayConfigHash({protocol:next.device.protocol,connection:next.device.connection,serialNumber:next.device.serialNumber});
        if(!this.sameDecoder(previous,next)||!connectionUnchanged)throw new ConflictException('Billing source change requires explicit billing continuity review and rebind');
      }
    }
  }

  async confirm(id: string, input: ConfirmGatewayRequest, actor: string): Promise<ConfirmGatewayResponse> {
    badInput(() => { uuid.parse(id); uuid.parse(actor); });
    const body = validateConfirmation(input);
    const result=await this.conflicts<ConfirmGatewayResponse>(() => this.db.transaction(async client => {
      const discovery = (await client.query(`SELECT * FROM discovered_gateways WHERE id=$1 FOR UPDATE`, [id])).rows[0];
      if (!discovery) throw new NotFoundException('Discovered gateway not found');
      if (discovery.discovery_revision !== body.discoveryRevision || discovery.status !== 'unassigned') {
        throw new ConflictException('Discovery changed; reload before confirming');
      }
      if (discovery.client_id !== discovery.external_gateway_id) throw new BadRequestException('Discovery client identity mismatch');
      const site = (await client.query(`SELECT id,external_site_id FROM sites WHERE id=$1 AND status<>'archived' FOR UPDATE`, [body.siteId])).rows[0];
      if (!site) throw new NotFoundException('Active site not found');
      if (!site.external_site_id) throw new BadRequestException('Site requires an external identity');
      // All onboarding writers serialize external identities, including across broker scopes:
      // MQTT credentials/authentication intentionally require a globally unambiguous username.
      await reserveGatewayIdentity(client, discovery.external_gateway_id);
      if ((await client.query('SELECT id FROM gateways WHERE site_id=$1 AND retired_at IS NULL', [site.id])).rows.length) {
        throw new ConflictException('Site already has an active gateway');
      }
      const prepared = await this.prepare(client, body.devices);
      const gatewayId = randomUUID();
      await client.query(`INSERT INTO gateways(id,site_id,name,endpoint,external_gateway_id,mqtt_broker_id,protocol,status,lifecycle_state,config_state,polling_interval_seconds)
        VALUES($1,$2,$3,$4,$5,$6,'mqtt','offline','configuring','pending_sync',60)`,
      [gatewayId, site.id, 'Gateway ' + discovery.external_gateway_id,
        `solar/v1/sites/${site.external_site_id}/gateways/${discovery.external_gateway_id}/devices/+/telemetry`, discovery.external_gateway_id, discovery.mqtt_broker_id]);
      for (const entry of prepared) await this.materialize(client, gatewayId, site.id, entry);
      const config = this.config(discovery.external_gateway_id, site.external_site_id, 1, actor,
        body.devices.map(d => prepared.find(p => p.device.deviceId === d.deviceId)?.device ?? d));
      await this.saveRevision(client, gatewayId, config, actor);
      const credential = await this.credentials.issue(client, gatewayId, actor);
      await client.query(`UPDATE discovered_gateways SET status='configuring',assigned_site_id=$2,assigned_gateway_id=$3,assigned_at=now() WHERE id=$1`, [id, site.id, gatewayId]);
      await this.audit(client, actor, 'gateway.onboarding.confirmed', gatewayId,
        { discoveryId: id, discoveryRevision: body.discoveryRevision, siteId: site.id, reportedSiteId: discovery.reported_site_id,
          configVersion: 1, configHash: config.configHash });
      return { gatewayId, configVersion: 1, configHash: config.configHash, credential,
        syncState: { gatewayId, lifecycleState: 'configuring', configState: 'pending_sync', connectionState: 'unknown',
          desiredConfigVersion: 1, desiredConfigHash: config.configHash, activeConfigVersion: 0, activeConfigHash: null } };
    }));
    await this.desiredCommitted(result.gatewayId,result.configVersion);
    return result;
  }

  private async prepare(client: PoolClient, devices: GatewayDeviceConfig[], resolvePresets = true): Promise<PreparedDevice[]> {
    const prepared: PreparedDevice[] = [];
    for (const input of devices.filter(d => d.enabled)) {
      const device = structuredClone(input);
      let source: { id: string; config: PayloadProfile } | undefined;
      if (device.mappingSource === 'preset' && resolvePresets) {
        if (!device.presetId) throw new BadRequestException('Select a preset explicitly');
        const sourceId = badInput(() => uuid.parse(device.presetId));
        source = (await client.query(`SELECT p.id,p.config FROM payload_profile_revisions p WHERE p.id=$1 AND p.owner_device_id IS NULL
          AND NOT EXISTS(SELECT 1 FROM payload_preset_archives a WHERE a.profile_id=p.profile_id)`, [sourceId])).rows[0];
        if (!source) {
          const registerPreset = (await client.query('SELECT id,registers FROM meter_presets WHERE id=$1 FOR SHARE', [sourceId])).rows[0];
          if (!registerPreset) throw new BadRequestException('Preset not found');
          // A register preset alone cannot supply semantic tags/units/poll groups.
          // Resolve only decoder details for addresses explicitly selected by the admin.
          for (const mapping of device.mappings) {
            const register = registerPreset.registers.find((r: { registerAddress?: string }) => r.registerAddress === mapping.registerAddress);
            if (!register) throw new BadRequestException('Mapping address is absent from selected preset');
            for (const key of ['registerCount', 'dataType', 'byteOrder', 'wordOrder', 'scale'] as const) {
              if (mapping[key] === undefined && register[key] !== undefined) Object.assign(mapping, { [key]: register[key] });
            }
          }
        } else {
          const profile = badInput(() => validatePayloadProfile(source!.config));
          if (device.deviceType && profile.deviceType !== device.deviceType) throw new BadRequestException('Preset device type mismatch');
          device.deviceType ??= profile.deviceType;
          if (device.pollGroups.length === 0) device.pollGroups = profile.pollGroups;
          if (device.mappings.length === 0) device.mappings = profile.fields.map(field => ({ tag: field.tag, displayName: field.displayName,
            pollGroup: field.pollGroup, sourceUnit: field.sourceUnit, targetUnit: field.targetUnit, conversion: field.conversion,
            ...(field.sourceTag !== undefined ? { sourceTag: field.sourceTag } : {}),
            ...(field.required !== undefined ? { required: field.required } : {}),
            ...(field.registerAddress !== undefined ? { registerAddress: field.registerAddress } : {}),
            ...(field.role !== undefined ? { role: field.role } : {}) }));
          device.profileId = profile.sourceProfile?.id ?? profile.id;
          device.profileVersion = profile.sourceProfile?.version ?? profile.version;
        }
      }
      if (!device.deviceType || !device.model?.trim() || !device.serialNumber?.trim() || !device.protocol?.trim()
        || !device.connection || Object.keys(device.connection).length === 0 || device.pollGroups.length === 0 || device.mappings.length === 0) {
        throw new BadRequestException('Enabled devices require type, model, serial, protocol, connection, groups and mappings');
      }
      if(device.protocol==='modbus-tcp')device.connection=badInput(()=>tcpConnection.parse(device.connection));
      else if(device.protocol==='modbus-rtu')device.connection=badInput(()=>serialConnection.parse(device.connection));
      else throw new BadRequestException('Supported device protocols are modbus-tcp and modbus-rtu');
      for (const mapping of device.mappings) {
        if (/^modbus/i.test(device.protocol) && !mapping.registerAddress) throw new BadRequestException('Modbus mapping requires a register address');
        if (mapping.registerAddress !== undefined && [mapping.registerCount, mapping.dataType, mapping.byteOrder, mapping.wordOrder, mapping.scale].some(v => v === undefined)) {
          throw new BadRequestException('Physical mappings require explicit decoder details');
        }
        validateRegisterStorage(mapping);
      }
      const id = randomUUID(), profileId = randomUUID();
      const fields = device.mappings.map(({ registerCount: _count, dataType: _type, byteOrder: _byte, wordOrder: _word, scale: _scale, offset: _offset, ...field }) => field);
      const profile = badInput(() => validatePayloadProfile({ id: 'local-' + profileId, version: '1.0.0', schemaVersion: '1.1',
        displayName: device.model, deviceType: device.deviceType, pollGroups: device.pollGroups, fields,
        ...(device.profileId || device.profileVersion ? { sourceProfile: { id: device.profileId, version: device.profileVersion } } : {}) }));
      device.profileId ??= profile.id; device.profileVersion ??= profile.version;
      prepared.push({ device, id, profileId, profile, sourcePresetId: source?.id ?? null });
    }
    return prepared;
  }

  private async materialize(client: PoolClient, gatewayId: string, siteId: string, entry: PreparedDevice) {
    const { device, id, profileId, profile, sourcePresetId } = entry;
    // owner_device_id is DEFERRABLE INITIALLY DEFERRED (migration 034).
    await client.query(`INSERT INTO payload_profile_revisions(id,profile_id,version,config,owner_device_id,source_preset_revision_id)
      VALUES($1,$2,$3,$4::jsonb,$5,$6)`, [profileId, profile.id, profile.version, JSON.stringify(profile), id, sourcePresetId]);
    await client.query(`INSERT INTO devices(id,gateway_id,site_id,name,model,serial_number,device_type,external_device_id,payload_profile_revision_id,slave_id,status,poll_group_cadence)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'offline',$11::jsonb)`,
    [id, gatewayId, siteId, device.model + ' (' + device.deviceId + ')', device.model, device.serialNumber,
      deviceClassification(device.deviceType!), device.deviceId, profileId, device.connection?.slaveId ?? null, JSON.stringify({})]);
    await this.registers(client, id, device);
  }

  private async registers(client: PoolClient, id: string, device: GatewayDeviceConfig) {
    for (const mapping of device.mappings.filter(m => m.registerAddress !== undefined)) {
      await client.query(`INSERT INTO register_mapping_versions(id,device_id,semantic_field,register_address,data_type,byte_order,word_order,register_count,scale,unit,quality_rule,effective_from,signed)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,now(),$12)`, [randomUUID(), id, mapping.tag,
        mapping.registerAddress, mapping.dataType, mapping.byteOrder, mapping.wordOrder, mapping.registerCount, mapping.scale,
        mapping.sourceUnit, JSON.stringify({ ...(mapping.offset !== undefined ? { offset: mapping.offset } : {}), pollGroup: mapping.pollGroup }),
        mapping.dataType === 'int16' || mapping.dataType === 'int32']);
    }
  }

  private config(gatewayId: string, siteId: string, version: number, actor: string, devices: GatewayDeviceConfig[]): GatewayConfigPayload {
    const config = badInput(() => parseGatewayControlPayload('config', { schemaVersion: '1.1', messageType: 'config',
      messageId: randomUUID(), gatewayId, siteId, configVersion: version, configHash: '0'.repeat(64),
      issuedAt: new Date().toISOString(), approvedBy: actor, devices }));
    return { ...config, configHash: gatewayConfigHash(config) };
  }

  private async saveRevision(client: PoolClient, gatewayId: string, config: GatewayConfigPayload, actor: string) {
    await client.query(`INSERT INTO gateway_configuration_revisions(id,gateway_id,version,config,config_hash,approved_by)
      VALUES($1,$2,$3,$4::jsonb,$5,$6)`, [randomUUID(), gatewayId, config.configVersion, JSON.stringify(config), config.configHash, actor]);
    await client.query(`UPDATE gateways SET desired_config_version=$2,desired_config_hash=$3,config_state='pending_sync' WHERE id=$1`, [gatewayId, config.configVersion, config.configHash]);
  }

  private async audit(client: PoolClient, actor: string, action: string, id: string, evidence: unknown) {
    await client.query(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,after_json,correlation_id)
      VALUES($1,$2,$3,'gateway',$4,$5::jsonb,$6)`, [randomUUID(), actor, action, id, JSON.stringify(evidence), randomUUID()]);
  }

  private async conflicts<T>(work: () => Promise<T>): Promise<T> {
    try { return await work(); } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new ConflictException('Gateway configuration conflicts with an existing resource');
      throw error;
    }
  }
}

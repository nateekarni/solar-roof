import { ConflictException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { DatabaseService } from "../../database/database.service.js";

export interface CustomerRecord {
  id: string;
  name: string;
  status: "active" | "inactive";
}

export interface SiteRecord {
  id: string;
  customerId: string;
  name: string;
  timezone: string;
  status: "active" | "inactive";
}

export interface GatewayRecord {
  id: string;
  siteId: string;
  name: string;
  protocol: string;
  endpoint?: string;
  credentialRef?: string;
  status: "online" | "degraded" | "offline";
}

export interface DeviceRecord {
  id: string;
  gatewayId: string;
  name?: string;
  model?: string;
  serialNumber?: string;
  slaveId?: number;
}

export interface BillingMeterRecord {
  id: string;
  siteId: string;
  deviceId: string;
  semanticField: "total_energy";
  active: boolean;
}

@Injectable()
export class AssetsService {
  private readonly customers = new Map<string, CustomerRecord>();
  private readonly sites = new Map<string, SiteRecord>();
  private readonly gateways = new Map<string, GatewayRecord>();
  private readonly devices = new Map<string, DeviceRecord>();
  private readonly meters = new Map<string, BillingMeterRecord>();

  constructor(@Optional() @Inject(DatabaseService) private readonly db?: DatabaseService) {}

  createCustomer(input: { id: string; name: string }): CustomerRecord {
    if (this.customers.has(input.id)) throw new ConflictException("Customer already exists");
    const name = input.name.trim();
    if (!name) throw new ConflictException("Customer name is required");
    const r = { id: input.id, name, status: "active" as const };
    this.customers.set(r.id, r);

    if (this.db) {
      this.db.query(
        "INSERT INTO customers (id, name, code, region, status) VALUES ($1, $2, $3, 'ภาคกลาง', 'active') ON CONFLICT (id) DO NOTHING",
        [input.id, name, `SCH-${input.id.slice(0, 4)}`]
      ).catch(() => {});
    }

    return r;
  }

  createSite(input: { id: string; customerId: string; name: string; timezone?: string }): SiteRecord {
    if (!this.customers.has(input.customerId)) throw new NotFoundException("Customer not found");
    if (this.sites.has(input.id)) throw new ConflictException("Site already exists");
    const r = {
      id: input.id,
      customerId: input.customerId,
      name: input.name.trim(),
      timezone: input.timezone ?? "Asia/Bangkok",
      status: "active" as const,
    };
    this.sites.set(r.id, r);

    if (this.db) {
      this.db.query(
        "INSERT INTO sites (id, customer_id, name, capacity_mwp, timezone, status) VALUES ($1, $2, $3, 0.5, $4, 'online') ON CONFLICT (id) DO NOTHING",
        [input.id, input.customerId, r.name, r.timezone]
      ).catch(() => {});
    }

    return r;
  }

  registerGateway(input: {
    id: string;
    siteId: string;
    name: string;
    protocol: string;
    endpoint?: string;
    credentialRef?: string;
  }): GatewayRecord {
    if (!this.sites.has(input.siteId)) throw new NotFoundException("Site not found");
    if (this.gateways.has(input.id)) throw new ConflictException("Gateway already exists");
    const r = { ...input, status: "offline" as const };
    this.gateways.set(r.id, r);

    if (this.db) {
      this.db.query(
        "INSERT INTO gateways (id, site_id, name, protocol, endpoint, status) VALUES ($1, $2, $3, $4, $5, 'offline') ON CONFLICT (id) DO NOTHING",
        [input.id, input.siteId, input.name, input.protocol, input.endpoint ?? ""]
      ).catch(() => {});
    }

    return r;
  }

  registerDevice(input: DeviceRecord): DeviceRecord {
    const gateway = this.gateways.get(input.gatewayId);
    if (!gateway) throw new NotFoundException("Gateway not found");
    if (this.devices.has(input.id)) throw new ConflictException("Device already exists");
    if (input.serialNumber && [...this.devices.values()].some((d) => d.serialNumber === input.serialNumber)) {
      throw new ConflictException("Device serial number already exists");
    }
    this.devices.set(input.id, input);

    if (this.db) {
      this.db.query(
        `INSERT INTO devices (id, gateway_id, site_id, name, device_type, model, serial_number, slave_id, status)
         VALUES ($1, $2, $3, $4, 'meter', $5, $6, $7, 'online') ON CONFLICT (id) DO NOTHING`,
        [
          input.id,
          input.gatewayId,
          gateway.siteId,
          input.name ?? "Device",
          input.model ?? "Generic",
          input.serialNumber ?? `SN-${input.id.slice(0, 8)}`,
          input.slaveId ?? 1,
        ]
      ).catch(() => {});
    }

    return input;
  }

  assignBillingMeter(input: { id: string; siteId: string; deviceId: string }): BillingMeterRecord {
    const site = this.sites.get(input.siteId);
    const device = this.devices.get(input.deviceId);
    const gateway = device && this.gateways.get(device.gatewayId);
    if (!site || !device) throw new NotFoundException("Site or device not found");
    if (!gateway || gateway.siteId !== site.id) throw new ConflictException("Device is outside site");
    if ([...this.meters.values()].some((m) => m.siteId === site.id && m.active)) {
      throw new ConflictException("Site already has an active Billing Meter");
    }
    const r = { ...input, semanticField: "total_energy" as const, active: true };
    this.meters.set(r.id, r);

    if (this.db) {
      this.db.query(
        "INSERT INTO billing_meters (id, site_id, device_id, semantic_field, active) VALUES ($1, $2, $3, 'total_energy', true) ON CONFLICT DO NOTHING",
        [input.id, input.siteId, input.deviceId]
      ).catch(() => {});
    }

    return r;
  }

  listCustomers(): CustomerRecord[] {
    return [...this.customers.values()];
  }

  async listGateways(scopes: string[] | null) {
    if (!this.db) return [];
    return (await this.db.query(`SELECT g.id,g.site_id AS "siteId",s.name AS "siteName",s.external_site_id AS "siteCode",g.name,g.external_gateway_id AS "externalGatewayId",g.endpoint AS "subscriptionTopic",g.last_seen_at AS "lastSeenAt",g.polling_interval_seconds AS "pollingIntervalSeconds",
      CASE WHEN g.last_seen_at BETWEEN now()-make_interval(secs=>greatest(120,g.polling_interval_seconds*2)) AND now() THEN 'online' ELSE 'offline' END AS status,
      g.desired_config_version AS "desiredVersion",g.published_config_version AS "publishedVersion",g.acknowledged_config_version AS "acknowledgedVersion",g.applied_config_version AS "appliedVersion",g.lifecycle_state AS "lifecycleState",g.config_state AS "configState",g.status AS "connectionState",
      (SELECT count(*)::int FROM devices WHERE gateway_id=g.id) AS "deviceCount",latest.measured AS "lastMeasuredAt",latest.received AS "lastReceivedAt",pv.kw AS "currentProductionKw",billing.energy_kwh AS "billingEnergyKwh"
      FROM gateways g JOIN sites s ON s.id=g.site_id LEFT JOIN LATERAL (
        SELECT max(sample.measured) AS measured,max(sample.received) AS received FROM devices d
        LEFT JOIN LATERAL (SELECT coalesce(ps.measured_at,ps.polled_at) AS measured,ps.received_at AS received FROM payload_samples ps WHERE ps.device_id=d.id ORDER BY coalesce(ps.measured_at,ps.polled_at) DESC,ps.received_at DESC,ps.id DESC LIMIT 1) sample ON true
        WHERE d.gateway_id=g.id
      ) latest ON true
      LEFT JOIN LATERAL (SELECT CASE WHEN count(*)=1 THEN max(reading.value_kwh) ELSE NULL END AS energy_kwh
        FROM billing_meters meter JOIN billing_source_bindings binding ON binding.id=meter.billing_source_binding_id
        JOIN LATERAL (SELECT tr.total_energy_kwh AS value_kwh FROM telemetry_raw tr WHERE tr.site_id=g.site_id AND tr.device_id=binding.device_id
          AND tr.payload_profile_revision_id=binding.profile_revision_id AND tr.billing_source_binding_id=binding.id AND tr.quality='complete' AND tr.total_energy_kwh IS NOT NULL AND tr.total_energy_kwh>=0
          ORDER BY tr.source_time DESC,tr.received_time DESC,tr.id DESC LIMIT 1) reading ON true
        WHERE meter.site_id=g.site_id AND meter.active=true) billing ON true
      LEFT JOIN LATERAL (SELECT CASE WHEN count(*)=1 AND bool_and(ps.quality='good' AND ps.communication='online' AND ps.unit IN('W','kW') AND ps.value>=0 AND ps.value<'Infinity'::float8
        AND coalesce(ps.measured_at,ps.polled_at) BETWEEN now()-make_interval(secs=>greatest(120,d.expected_interval_seconds*2)) AND now() AND ps.received_at BETWEEN now()-make_interval(secs=>greatest(120,d.expected_interval_seconds*2)) AND now()) THEN max(CASE WHEN ps.unit='W' THEN ps.value/1000 ELSE ps.value END) ELSE NULL END AS kw
        FROM devices d JOIN payload_profile_revisions p ON p.id=d.payload_profile_revision_id LEFT JOIN LATERAL (SELECT * FROM payload_samples WHERE device_id=d.id AND profile_revision_id=d.payload_profile_revision_id AND tag='solar.active_power' ORDER BY coalesce(measured_at,polled_at) DESC,received_at DESC,id DESC LIMIT 1) ps ON true
        WHERE d.gateway_id=g.id AND (EXISTS(SELECT 1 FROM gateway_dashboard_sources chosen WHERE chosen.gateway_id=g.id AND chosen.metric='power' AND chosen.device_id=d.id AND chosen.tag='solar.active_power') OR (NOT EXISTS(SELECT 1 FROM gateway_dashboard_sources chosen WHERE chosen.gateway_id=g.id AND chosen.metric='power') AND p.config->>'deviceType'='solar-logger'))) pv ON true
      WHERE s.status<>'archived' AND g.retired_at IS NULL AND ($1::uuid[] IS NULL OR g.site_id=ANY($1::uuid[])) ORDER BY g.name,g.id`,[scopes] )).rows;
  }

  async getGatewaySiteOptions(gatewayId: string | null, scopes: string[] | null, includeAssigned: boolean) {
    if (!this.db) return [];
    return (await this.db.query(`SELECT s.id,s.name,s.external_site_id AS code,true AS active,g.id AS "assignedGatewayId" FROM sites s LEFT JOIN gateways g ON g.site_id=s.id AND g.retired_at IS NULL WHERE s.status<>'archived' AND ($3 OR g.id IS NULL OR g.id::text=$1) AND ($2::uuid[] IS NULL OR s.id=ANY($2::uuid[])) ORDER BY s.name,s.id`,[gatewayId??null,scopes,includeAssigned])).rows;
  }
}

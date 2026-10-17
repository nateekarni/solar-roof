import { createRequire } from 'node:module';
import { randomBytes, scryptSync, randomUUID } from 'node:crypto';
import { sites, reading, topic, envelope } from './local-system/telemetry-fixture.mjs';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://solar:solar@localhost:5432/solar_platform';
const pool = new Pool({ connectionString });

const PASSWORD = 'SolarLocal2026!';
const salt = randomBytes(16).toString('hex');
const passwordHash = `scrypt:${salt}:${scryptSync(PASSWORD, salt, 64).toString('hex')}`;

const staffAccounts = [
  { email: 'owner@solar.local', name: 'Platform Owner', role: 'owner' },
  { email: 'admin@solar.local', name: 'Platform Administrator', role: 'admin' },
  { email: 'owner@demo.solar.test', name: 'ธนกฤต วัฒนาภิรมย์', role: 'owner' },
  { email: 'owner.backup@demo.solar.test', name: 'พิมพ์ชนก ศรีวัฒน์', role: 'owner' },
  { email: 'admin@demo.solar.test', name: 'กิตติศักดิ์ จันทร์ประเสริฐ', role: 'admin' },
  { email: 'admin.backup@demo.solar.test', name: 'อรทัย สุขเกษม', role: 'admin' },
  { email: 'operator@demo.solar.test', name: 'ภาคภูมิ อินทร์แก้ว', role: 'operator' },
  { email: 'operator.backup@demo.solar.test', name: 'ณัฐชา พงศ์ไพบูลย์', role: 'operator' },
  { email: 'accountant@demo.solar.test', name: 'ชนาภา รัตนวาณิช', role: 'accountant' },
  { email: 'accountant.backup@demo.solar.test', name: 'วรพล ตั้งสุวรรณ', role: 'accountant' },
];

const customerContacts: Record<string, string> = {
  'BKK-LKB-001': 'สิริพร วัฒนกิจ',
  'SPK-BPL-002': 'ธนพงศ์ เกียรติไพบูลย์',
  'PTT-KLG-003': 'วรัญญา สุขประเสริฐ',
  'AYA-BPI-004': 'กฤตภาส นาคะวัฒน์',
  'CBI-SRC-005': 'พรทิพย์ จิรเมธากุล',
  'RYG-PLD-006': 'อภิชาติ แสงสุวรรณ',
  'NPT-SMP-007': 'ชลธิชา วัฒนวงศ์',
  'NMA-MUE-008': 'พีรณัฐ ตั้งเจริญ',
  'CMI-SKP-009': 'ณิชาภัทร อินทนนท์',
  'SKA-HDY-010': 'ศุภชัย มณีรัตน์',
};

async function seed() {
  console.log(`Connecting to database: ${connectionString}...`);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Company Profile
    console.log('Seeding company profile & bank accounts...');
    await client.query(`
      UPDATE company_profile SET
        company_name = 'บริษัท โซลาร์ รูฟ จำกัด',
        tax_id = '0105554059286',
        branch = '00000',
        address = '68/184 ซอยรามคำแหง 164 แขวงมีนบุรี เขตมีนบุรี กรุงเทพมหานคร 10510',
        phone = '02-000-0000',
        email = 'billing@solar-roof.test',
        is_configured = true
    `);

    // 2. Customers and Sites
    console.log('Seeding customers, sites, gateways and devices...');
    const siteIds: string[] = [];
    for (const site of sites) {
      siteIds.push(site.siteId);
      // Customer
      await client.query(`
        INSERT INTO customers (id, name, code, region, status, document_email)
        VALUES ($1, $2, $3, $4, 'active', $5)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          code = EXCLUDED.code,
          document_email = EXCLUDED.document_email
      `, [site.customerId, site.customer, site.code, 'Central', `billing.${site.code.toLowerCase()}@customer.solar.test`]);

      // Site
      const isHdy = site.code === 'SKA-HDY-010';
      await client.query(`
        INSERT INTO sites (id, customer_id, name, capacity_mwp, timezone, status, latitude, longitude, external_site_id)
        VALUES ($1, $2, $3, $4, 'Asia/Bangkok', $5, $6, $7, $8)
        ON CONFLICT (id) DO UPDATE SET
          customer_id = EXCLUDED.customer_id,
          name = EXCLUDED.name,
          capacity_mwp = EXCLUDED.capacity_mwp,
          status = EXCLUDED.status,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          external_site_id = EXCLUDED.external_site_id
      `, [site.siteId, site.customerId, site.name, site.capacity, isHdy ? 'offline' : 'online', site.latitude, site.longitude, site.code]);

      // Gateway
      await client.query(`
        INSERT INTO gateways (id, site_id, name, protocol, endpoint, status, external_gateway_id, last_seen_at)
        VALUES ($1, $2, $3, 'mqtt', $4, $5, $6, $7)
        ON CONFLICT (id) DO UPDATE SET
          site_id = EXCLUDED.site_id,
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          last_seen_at = EXCLUDED.last_seen_at
      `, [
        site.gatewayId,
        site.siteId,
        site.gatewayCode,
        `solar/v1/sites/${site.code}/gateways/${site.gatewayCode}/devices/+/telemetry`,
        isHdy ? 'offline' : 'online',
        site.gatewayCode,
        isHdy ? new Date(Date.now() - 3600000 * 24).toISOString() : new Date().toISOString(),
      ]);

      // Devices: Meter & Logger
      const meterId = `${site.siteId.slice(0, -1)}1`;
      const loggerId = `${site.siteId.slice(0, -1)}2`;

      // Meter (Schneider PM2230)
      await client.query(`
        INSERT INTO devices (id, gateway_id, site_id, name, device_type, model, serial_number, slave_id, status, external_device_id, payload_profile_revision_id)
        VALUES ($1, $2, $3, $4, 'meter', 'Schneider PM2230', $5, 1, $6, $7, '00000000-0000-4000-8000-000000000001')
        ON CONFLICT (id) DO UPDATE SET
          gateway_id = EXCLUDED.gateway_id,
          status = EXCLUDED.status,
          name = EXCLUDED.name
      `, [meterId, site.gatewayId, site.siteId, `มิเตอร์หลัก · ${site.code}`, `MTR-${site.code}`, isHdy ? 'offline' : 'online', `MTR-${site.code}`]);

      // Logger (Huawei SmartLogger3000A)
      await client.query(`
        INSERT INTO devices (id, gateway_id, site_id, name, device_type, model, serial_number, slave_id, status, external_device_id, payload_profile_revision_id)
        VALUES ($1, $2, $3, $4, 'logger', 'Huawei SmartLogger3000A', $5, 2, $6, $7, '00000000-0000-4000-8000-000000000002')
        ON CONFLICT (id) DO UPDATE SET
          gateway_id = EXCLUDED.gateway_id,
          status = EXCLUDED.status,
          name = EXCLUDED.name
      `, [loggerId, site.gatewayId, site.siteId, `SmartLogger · ${site.code}`, `SLG-${site.code}`, isHdy ? 'offline' : 'online', `SLG-${site.code}`]);

      // Billing Meter binding
      await client.query(`
        INSERT INTO billing_meters (id, site_id, device_id, semantic_field, active)
        VALUES ($1, $2, $3, 'total_energy', true)
        ON CONFLICT (site_id, device_id, semantic_field) DO NOTHING
      `, [randomUUID(), site.siteId, meterId]);

      // Site Billing Settings (Direct Site Activation)
      await client.query(`
        INSERT INTO site_billing_settings (
          site_id, version, service_start_date, payment_term_days, tax_rate,
          prices_include_tax, tax_confirmed, reminders_enabled, reminder_start_days, reminder_interval_days
        ) VALUES ($1, 1, '2026-01-01', 30, 7.0000, false, true, true, 7, 7)
        ON CONFLICT (site_id) DO UPDATE SET
          service_start_date = EXCLUDED.service_start_date,
          payment_term_days = EXCLUDED.payment_term_days,
          tax_rate = EXCLUDED.tax_rate,
          prices_include_tax = EXCLUDED.prices_include_tax,
          tax_confirmed = EXCLUDED.tax_confirmed,
          reminders_enabled = EXCLUDED.reminders_enabled,
          reminder_start_days = EXCLUDED.reminder_start_days,
          reminder_interval_days = EXCLUDED.reminder_interval_days
      `, [site.siteId]);

      // Rate version
      await client.query(`
        INSERT INTO rate_versions (id, site_id, effective_from, rate_type, rate, currency, change_reason)
        VALUES ($1, $2, '2026-01-01', 'fixed_kwh', $3, 'THB', 'Initial site tariff')
        ON CONFLICT (id) DO NOTHING
      `, [randomUUID(), site.siteId, site.rate]);
    }

    // 3. Seed Users
    console.log('Seeding staff and customer user accounts with password SolarLocal2026! ...');
    for (const staff of staffAccounts) {
      await client.query(`
        INSERT INTO users (id, email, display_name, role, status, password_hash, preferred_language, preferred_theme)
        VALUES ($1, $2, $3, $4, 'active', $5, 'th', 'light')
        ON CONFLICT (email) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          role = EXCLUDED.role,
          status = 'active',
          password_hash = $5
      `, [randomUUID(), staff.email, staff.name, staff.role, passwordHash]);
    }

    // Customer Users
    for (const site of sites) {
      const email = `billing.${site.code.toLowerCase()}@customer.solar.test`;
      const contactName = customerContacts[site.code] || 'ผู้จัดการการเงิน';
      const displayName = `${contactName} · ${site.customer}`;
      const customerUserRes = await client.query(`
        INSERT INTO users (id, email, display_name, role, status, customer_id, password_hash, preferred_language, preferred_theme)
        VALUES ($1, $2, $3, 'customer_user', 'active', $4, $5, 'th', 'light')
        ON CONFLICT (email) DO UPDATE SET
          display_name = EXCLUDED.display_name,
          customer_id = EXCLUDED.customer_id,
          status = 'active',
          password_hash = $5
        RETURNING id
      `, [randomUUID(), email, displayName, site.customerId, passwordHash]);

      const userId = customerUserRes.rows[0].id;
      // Assign site account
      await client.query(`
        INSERT INTO site_account_assignments (id, site_id, user_id, assigned_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (user_id) WHERE revoked_at IS NULL DO NOTHING
      `, [randomUUID(), site.siteId, userId]);

      // Set as recipient in site billing settings
      await client.query(`
        UPDATE site_billing_settings
        SET recipient_user_ids = array_append(recipient_user_ids, $2)
        WHERE site_id = $1 AND NOT ($2 = ANY(recipient_user_ids))
      `, [site.siteId, userId]);
    }

    // 4. Employee Positions & Domain Grants
    console.log('Setting up staff permissions and domain grants...');
    const adminUser = (await client.query("SELECT id FROM users WHERE email='admin@demo.solar.test'")).rows[0]?.id;
    const operator1 = (await client.query("SELECT id FROM users WHERE email='operator@demo.solar.test'")).rows[0]?.id;
    const operator2 = (await client.query("SELECT id FROM users WHERE email='operator.backup@demo.solar.test'")).rows[0]?.id;
    const accountant1 = (await client.query("SELECT id FROM users WHERE email='accountant@demo.solar.test'")).rows[0]?.id;
    const accountant2 = (await client.query("SELECT id FROM users WHERE email='accountant.backup@demo.solar.test'")).rows[0]?.id;

    // Operator 1: All sites in Technical Domain
    if (operator1) {
      await client.query(`
        INSERT INTO employee_domain_grants (user_id, domain, overrides, scope_mode, site_ids)
        VALUES ($1, 'technical', '{"technical.gateways.view": true, "technical.devices.view": true, "technical.alerts.manage": true}'::jsonb, 'all', '{}')
        ON CONFLICT (user_id, domain) DO UPDATE SET
          scope_mode = 'all',
          site_ids = '{}',
          overrides = EXCLUDED.overrides
      `, [operator1]);
    }

    // Operator 2: Selected sites in Technical Domain (first 3 sites)
    if (operator2) {
      const selectedSites = [sites[0].siteId, sites[1].siteId, sites[2].siteId];
      await client.query(`
        INSERT INTO employee_domain_grants (user_id, domain, overrides, scope_mode, site_ids)
        VALUES ($1, 'technical', '{"technical.gateways.view": true, "technical.devices.view": true}'::jsonb, 'selected', $2)
        ON CONFLICT (user_id, domain) DO UPDATE SET
          scope_mode = 'selected',
          site_ids = $2,
          overrides = EXCLUDED.overrides
      `, [operator2, selectedSites]);
    }

    // Accountant 1: All sites in Business Domain
    if (accountant1) {
      await client.query(`
        INSERT INTO employee_domain_grants (user_id, domain, overrides, scope_mode, site_ids)
        VALUES ($1, 'business', '{"business.sites.view": true, "business.billing.view": true, "business.billing.manage": true}'::jsonb, 'all', '{}')
        ON CONFLICT (user_id, domain) DO UPDATE SET
          scope_mode = 'all',
          site_ids = '{}',
          overrides = EXCLUDED.overrides
      `, [accountant1]);
    }

    // Accountant 2: Selected sites in Business Domain (first 5 sites)
    if (accountant2) {
      const selectedSites = [sites[0].siteId, sites[1].siteId, sites[2].siteId, sites[3].siteId, sites[4].siteId];
      await client.query(`
        INSERT INTO employee_domain_grants (user_id, domain, overrides, scope_mode, site_ids)
        VALUES ($1, 'business', '{"business.sites.view": true, "business.billing.view": true}'::jsonb, 'selected', $2)
        ON CONFLICT (user_id, domain) DO UPDATE SET
          scope_mode = 'selected',
          site_ids = $2,
          overrides = EXCLUDED.overrides
      `, [accountant2, selectedSites]);
    }

    // 5. Alert Rules & Incidents
    console.log('Seeding alert rules & incidents...');
    const ownerUser = (await client.query("SELECT id FROM users WHERE email='owner@demo.solar.test'")).rows[0]?.id || adminUser;
    for (const site of sites) {
      // Offline Alert Rule
      await client.query(`
        INSERT INTO operational_alert_rules (id, site_id, kind, duration_seconds, cooldown_seconds, recovery, recipient_user_ids, channels, enabled, created_by)
        VALUES ($1, $2, 'offline', 300, 3600, true, $3, ARRAY['in_app', 'email'], true, $4)
        ON CONFLICT (id) DO NOTHING
      `, [randomUUID(), site.siteId, [adminUser, ownerUser].filter(Boolean), adminUser]);

      // Overheat threshold rule (65°C)
      await client.query(`
        INSERT INTO operational_alert_rules (id, site_id, kind, semantic_field, operator, threshold, duration_seconds, cooldown_seconds, recovery, recipient_user_ids, channels, enabled, created_by)
        VALUES ($1, $2, 'threshold', 'temperature', 'gt', 65.0, 180, 1800, true, $3, ARRAY['in_app'], true, $4)
        ON CONFLICT (id) DO NOTHING
      `, [randomUUID(), site.siteId, [adminUser].filter(Boolean), adminUser]);
    }

    // Actual Offline Alert for SKA-HDY-010
    const hdySite = sites.find(s => s.code === 'SKA-HDY-010');
    if (hdySite) {
      await client.query(`
        INSERT INTO alerts (id, site_id, gateway_id, severity, title, detail, status, occurred_at)
        VALUES ($1, $2, $3, 'critical', 'เกตเวย์ขาดการติดต่อ (Offline)', 'เกตเวย์ GW-SKA-HDY-010 ขาดการส่งข้อมูลโทรมาตรเกินกว่า 5 นาที', 'open', now() - interval '4 hours')
        ON CONFLICT (id) DO NOTHING
      `, [randomUUID(), hdySite.siteId, hdySite.gatewayId]);
    }

    // 6. Historical Telemetry Aggregates (Daily readings for last 30 days)
    console.log('Generating historical energy aggregates for dashboards...');
    const now = Date.now();
    for (const site of sites) {
      const meterId = `${site.siteId.slice(0, -1)}1`;
      for (let dayOffset = 30; dayOffset >= 0; dayOffset--) {
        const time = now - dayOffset * 86400000;
        const d = new Date(time);
        d.setUTCHours(0, 0, 0, 0);
        const bucketStart = d.toISOString();
        const r = reading(site, 'meter', time);
        const dailyEnergy = Number((site.capacity * 1000 * 4.2).toFixed(2));

        await client.query(`
          INSERT INTO telemetry_aggregate (id, site_id, device_id, semantic_field, bucket, bucket_start, value, sample_count, quality)
          VALUES ($1, $2, $3, 'total_energy', 'day', $4, $5, 288, 'complete')
          ON CONFLICT (device_id, semantic_field, bucket, bucket_start) DO UPDATE SET
            value = EXCLUDED.value
        `, [randomUUID(), site.siteId, meterId, bucketStart, dailyEnergy]);
      }
    }

    await client.query('COMMIT');
    console.log('✅ Seeding completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seeding failed:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();

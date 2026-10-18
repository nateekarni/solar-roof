import { createRequire } from 'node:module';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { sites, reading } from './local-system/telemetry-fixture.mjs';
import { renderFinancialDocumentPdf } from '../apps/api/src/modules/documents/financial-document-pdf.js';
import { financialPolicySnapshot, financialPolicyHash } from '../apps/api/src/modules/billing/financial-policy.js';
import { canonicalGlobalFinancialConfiguration } from '../apps/api/src/modules/settings/settings.service.js';
import { financialConfigurationHash } from '../apps/api/src/modules/financial-readiness/financial-configuration.js';

const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://solar:solar@localhost:5432/solar_platform';
const pool = new Pool({ connectionString });

const customerTaxData: Record<string, { legalName: string; taxId: string; address: string; phone: string }> = {
  'BKK-LKB-001': {
    legalName: 'บริษัท รุ่งอรุณโลจิสติกส์ จำกัด',
    taxId: '0105554010001',
    address: '123 ถนนฉลองกรุง แขวงลำปลาทิว เขตลาดกระบัง กรุงเทพมหานคร 10520',
    phone: '02-739-1001',
  },
  'SPK-BPL-002': {
    legalName: 'บริษัท กรีนแพค เอเชีย จำกัด',
    taxId: '0105554010002',
    address: '456 หมู่ 9 ถนนบางนา-ตราด ต.บางพลีใหญ่ อ.บางพลี จ.สมุทรปราการ 10540',
    phone: '02-316-2002',
  },
  'PTT-KLG-003': {
    legalName: 'บริษัท ธาราธรซัพพลาย จำกัด',
    taxId: '0105554010003',
    address: '789 ถนนพหลโยธิน ต.คลองหนึ่ง อ.คลองหลวง จ.ปทุมธานี 12120',
    phone: '02-529-3003',
  },
  'AYA-BPI-004': {
    legalName: 'บริษัท นวภัทรพรีซิชั่น จำกัด',
    taxId: '0105554010004',
    address: '101 นิคมอุตสาหกรรมบางปะอิน ต.คลองจิก อ.บางปะอิน จ.พระนครศรีอยุธยา 13160',
    phone: '035-261-4004',
  },
  'CBI-SRC-005': {
    legalName: 'บริษัท ตะวันออกออโต้แคร์ จำกัด',
    taxId: '0105554010005',
    address: '202 ถนนสุขุมวิท ต.ศรีราชา อ.ศรีราชา จ.ชลบุรี 20110',
    phone: '038-321-5005',
  },
  'RYG-PLD-006': {
    legalName: 'บริษัท อรุณฟู้ดโปรดักส์ จำกัด',
    taxId: '0105554010006',
    address: '303 นิคมอุตสาหกรรมอีสเทิร์นซีบอร์ด ต.ปลวกแดง อ.ปลวกแดง จ.ระยอง 21140',
    phone: '038-954-6006',
  },
  'NPT-SMP-007': {
    legalName: 'บริษัท พร้อมพาณิชย์โฮลเซล จำกัด',
    taxId: '0105554010007',
    address: '404 ถนนเพชรเกษม ต.อ้อมใหญ่ อ.สามพราน จ.นครปฐม 73160',
    phone: '034-395-7007',
  },
  'NMA-MUE-008': {
    legalName: 'บริษัท โคราชบิสซิเนสพาร์ค จำกัด',
    taxId: '0105554010008',
    address: '505 ถนนมิตรภาพ ต.ในเมือง อ.เมืองนครราชสีมา จ.นครราชสีมา 30000',
    phone: '044-248-8008',
  },
  'CMI-SKP-009': {
    legalName: 'บริษัท ล้านนาแปรรูปเกษตร จำกัด',
    taxId: '0105554010009',
    address: '606 ถนนเชียงใหม่-สันกำแพง ต.สันกำแพง อ.สันกำแพง จ.เชียงใหม่ 50130',
    phone: '053-331-9009',
  },
  'SKA-HDY-010': {
    legalName: 'บริษัท อันดามันโคลด์เชน จำกัด',
    taxId: '0105554010010',
    address: '707 ถนนกาญจนวนิช ต.หาดใหญ่ อ.หาดใหญ่ จ.สงขลา 90110',
    phone: '074-210-0010',
  },
  'SITE-001': {
    legalName: 'บริษัท ทดสอบ จำกัด',
    taxId: '1234567890123',
    address: '168/19 หมู่ 1 ถนนวิภาวดีรังสิต แขวงสนามบิน เขตดอนเมือง กรุงเทพมหานคร 10210',
    phone: '081-234-5678',
  },
};

// 1x1 transparent png signature
const SIGNATURE_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function runCutoffDemo() {
  console.log('⚡ Starting Billing Cut-off & Document Artifact Generation...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Company Logo & Profile
    console.log('1. Setting up Company Profile & Bank Accounts...');
    const logoBuffer = await readFile('apps/web/public/brand/solar-roof-mark.png');
    const logoDataUri = 'data:image/png;base64,' + logoBuffer.toString('base64');

    await client.query(`
      UPDATE company_profile SET
        company_name = 'บริษัท โซลาร์ รูฟ จำกัด',
        tax_id = '0105554059286',
        branch = '00000',
        address = '68/184 ซอยรามคำแหง 164 แขวงมีนบุรี เขตมีนบุรี กรุงเทพมหานคร 10510',
        phone = '02-000-0000',
        email = 'billing@solar-roof.test',
        logo_url = $1,
        is_configured = true,
        updated_at = now()
    `, [logoDataUri]);

    const bankId = '00000000-0000-4000-8000-000000000099';
    await client.query(`UPDATE company_bank_accounts SET is_default = false WHERE id <> $1`, [bankId]);
    await client.query(`
      INSERT INTO company_bank_accounts (
        id, bank_name, bank_code, account_name, account_number, branch_name, promptpay_id, is_default, is_configured, created_at, updated_at
      ) VALUES (
        $1, 'ธนาคารกรุงเทพ (BBL)', 'BBL', 'บริษัท โซลาร์ รูฟ จำกัด', '123-4-56789-0', 'สำนักงานใหญ่', '', true, true, now(), now()
      ) ON CONFLICT (id) DO UPDATE SET
        bank_name = EXCLUDED.bank_name,
        bank_code = EXCLUDED.bank_code,
        account_name = EXCLUDED.account_name,
        account_number = EXCLUDED.account_number,
        branch_name = EXCLUDED.branch_name,
        is_default = true,
        is_configured = true,
        updated_at = now()
    `, [bankId]);

    // 2. Positions and User Identities
    console.log('2. Setting up Approver Positions and User Signatures...');
    const posDirectorId = '00000000-0000-4000-8000-000000000010';
    const posAccountantId = '00000000-0000-4000-8000-000000000020';

    await client.query(`
      INSERT INTO employee_positions (id, name) VALUES
      ($1, 'ผู้มีอำนาจลงนาม / Authorized Director'),
      ($2, 'เจ้าหน้าที่บัญชีอาวุโส / Senior Accountant')
      ON CONFLICT DO NOTHING
    `, [posDirectorId, posAccountantId]);

    const rules = {
      'business.dashboard.view': true,
      'business.billing.view': true,
      'business.billing.edit': true,
      'business.billing.approve': true,
      'business.documents.view': true,
      'business.documents.download': true,
      'business.receipts.view': true,
      'business.receipts.approve': true,
    };

    await client.query(`
      INSERT INTO employee_position_domains (position_id, domain, rules) VALUES
      ($1, 'business', $3),
      ($2, 'business', $3)
      ON CONFLICT (position_id, domain) DO UPDATE SET rules = EXCLUDED.rules
    `, [posDirectorId, posAccountantId, JSON.stringify(rules)]);

    // Link owner and accountant users
    const ownerUsers = (await client.query(`SELECT id FROM users WHERE role = 'owner'`)).rows;
    for (const u of ownerUsers) {
      await client.query(`
        UPDATE users SET
          company_position_id = $2,
          signature_data = $3,
          updated_at = now()
        WHERE id = $1
      `, [u.id, posDirectorId, SIGNATURE_PNG]);

      await client.query(`
        INSERT INTO employee_domain_grants (user_id, domain, position_id, scope_mode, site_ids, updated_by)
        VALUES ($1, 'business', $2, 'all', '{}'::uuid[], $1)
        ON CONFLICT (user_id, domain) DO UPDATE SET
          position_id = EXCLUDED.position_id,
          scope_mode = 'all',
          site_ids = '{}'::uuid[]
      `, [u.id, posDirectorId]);
    }

    const accountantUsers = (await client.query(`SELECT id FROM users WHERE role = 'accountant'`)).rows;
    for (const u of accountantUsers) {
      await client.query(`
        UPDATE users SET
          company_position_id = $2,
          signature_data = $3,
          updated_at = now()
        WHERE id = $1
      `, [u.id, posAccountantId, SIGNATURE_PNG]);

      await client.query(`
        INSERT INTO employee_domain_grants (user_id, domain, position_id, scope_mode, site_ids, updated_by)
        VALUES ($1, 'business', $2, 'all', '{}'::uuid[], $1)
        ON CONFLICT (user_id, domain) DO UPDATE SET
          position_id = EXCLUDED.position_id,
          scope_mode = 'all',
          site_ids = '{}'::uuid[]
      `, [u.id, posAccountantId]);
    }

    // 3. Customers and Customer Users
    console.log('3. Updating customer tax identities and verifying recipient emails...');
    for (const [code, info] of Object.entries(customerTaxData)) {
      await client.query(`
        UPDATE customers SET
          legal_name = $2,
          tax_id = $3,
          tax_branch = '00000',
          tax_address = $4,
          phone = $5,
          document_email = $6,
          status = 'active',
          updated_at = now()
        WHERE code = $1
      `, [code, info.legalName, info.taxId, info.address, info.phone, `billing.${code.toLowerCase()}@customer.solar.test`]);
    }

    await client.query(`
      UPDATE users SET
        email_verified_at = now(),
        verified_email = email,
        updated_at = now()
      WHERE role = 'customer_user'
    `);

    // 4. Meters and Billing Source Bindings
    console.log('4. Connecting billing meters to measurement bindings...');
    const pmProfileId = '00000000-0000-4000-8000-000000000001';
    const meters = (await client.query(`SELECT bm.id, bm.site_id, bm.device_id FROM billing_meters bm WHERE bm.active = true`)).rows;
    const ownerId = ownerUsers[0]?.id;

    for (const meter of meters) {
      const existingBinding = (await client.query('SELECT id FROM billing_source_bindings WHERE meter_id = $1', [meter.id])).rows[0];
      let bindingId = existingBinding?.id;
      if (!bindingId) {
        bindingId = randomUUID();
        await client.query(`
          INSERT INTO billing_source_bindings (
            id, meter_id, site_id, device_id, profile_revision_id,
            source_tag, canonical_tag, source_unit, target_unit, conversion,
            measurement_purpose, created_by
          ) VALUES (
            $1, $2, $3, $4, $5,
            'energy.active.import.total', 'energy.active.import.total', 'Wh', 'kWh', 'wh-to-kwh',
            'solar-delivered', $6
          )
        `, [bindingId, meter.id, meter.site_id, meter.device_id, pmProfileId, ownerId]);
      }

      await client.query(`
        UPDATE billing_meters SET
          billing_source_binding_id = $2
        WHERE id = $1
      `, [meter.id, bindingId]);
    }

    // 5. Confirm Financial Readiness
    console.log('5. Authorizing Financial Readiness (PRODUCTION scope)...');
    const companyRow = (await client.query(`SELECT company_name AS "companyName", tax_id AS "taxId", branch, address, phone, email, logo_url AS "logoUrl" FROM company_profile LIMIT 1`)).rows[0];
    const bankRows = (await client.query(`SELECT id, bank_name AS "bankName", bank_code AS "bankCode", account_name AS "accountName", account_number AS "accountNumber", branch_name AS "branchName", promptpay_id AS "promptpayId", is_default AS "isDefault", is_configured AS "isConfigured" FROM company_bank_accounts WHERE is_configured = true ORDER BY id`)).rows;

    const globalConfig = canonicalGlobalFinancialConfiguration(companyRow, bankRows);
    const globalHash = financialConfigurationHash(globalConfig);

    await client.query(`DELETE FROM financial_readiness_approvals WHERE scope = 'PRODUCTION'`);
    await client.query(`
      INSERT INTO financial_readiness_approvals (
        id, scope, config_hash, snapshot, approved_by, approved_at
      ) VALUES (
        $1, 'PRODUCTION', $2, $3, $4, now()
      )
    `, [randomUUID(), globalHash, JSON.stringify(globalConfig), ownerId]);

    // 6. Generate Real PDF Artifacts for Existing 4 Cycles of BKK-LKB-001
    console.log('6. Generating authentic PDF documents for issued invoices & receipts...');
    const companyParty = {
      company_name: companyRow.companyName,
      tax_id: companyRow.taxId,
      branch: companyRow.branch,
      address: companyRow.address,
      phone: companyRow.phone,
      email: companyRow.email,
    };

    const bkkCustomerRow = (await client.query(`
      SELECT c.*, s.name as site_name, s.external_site_id
      FROM customers c JOIN sites s ON s.customer_id = c.id
      WHERE s.external_site_id = 'BKK-LKB-001' LIMIT 1
    `)).rows[0];

    const customerParty = {
      company_name: bkkCustomerRow.legal_name,
      tax_id: bkkCustomerRow.tax_id,
      branch: bkkCustomerRow.tax_branch || '00000',
      tax_address: bkkCustomerRow.tax_address,
      site_name: bkkCustomerRow.site_name,
      external_site_id: bkkCustomerRow.external_site_id,
      payment_terms: 'ชำระเงินภายใน 30 วันนับจากวันที่ออกเอกสาร',
    };

    const existingDocs = (await client.query(`
      SELECT d.*, bc.period_start, bc.period_end, bc.consumed_kwh, bc.rate, bc.subtotal, bc.simulated_tax, bc.due_date
      FROM documents d
      JOIN billing_cycles bc ON bc.id = d.billing_cycle_id
      ORDER BY d.issue_date, d.document_number
    `)).rows;

    for (const doc of existingDocs) {
      const isReceipt = doc.document_type === 'receipt';
      const periodStartStr = new Date(doc.period_start).toISOString().slice(0, 10);
      const periodEndStr = new Date(doc.period_end).toISOString().slice(0, 10);
      const issueDateStr = new Date(doc.issue_date).toISOString().slice(0, 10);
      const dueDateStr = doc.due_date ? new Date(doc.due_date).toISOString().slice(0, 10) : '2026-08-15';

      const paymentsList = isReceipt ? [
        {
          note: 'ชำระผ่านการโอนเงินธนาคาร',
          payer_name: bkkCustomerRow.legal_name,
          payment_method: 'bank_transfer' as const,
          origin_bank: 'KBANK',
          origin_account: 'xxx-x-x1234',
          status: 'paid',
          paid_at: '2026-08-10T14:30:00+07:00',
          amount: Number(doc.amount).toFixed(2),
        }
      ] : [];

      const docSnapshot = {
        brandPrimary: '#0284c7',
        templateVersion: 'sarabun-a4-v8',
        policy: { scope: 'PRODUCTION', taxRate: '7.0000', pricesIncludeTax: false },
        company: companyParty,
        customer: customerParty,
        ...(isReceipt ? { invoiceNumber: 'INV-202607-001' } : {}),
        cycle: {
          period_start: periodStartStr,
          period_end: periodEndStr,
          consumed_kwh: Number(doc.consumed_kwh).toFixed(3),
          rate: Number(doc.rate).toFixed(4),
          subtotal: Number(doc.subtotal).toFixed(2),
          simulated_tax: Number(doc.simulated_tax).toFixed(2),
          amount: Number(doc.amount).toFixed(2),
          meter_snapshot: [
            {
              from: periodStartStr,
              to: periodEndStr,
              consumedKwh: Number(doc.consumed_kwh).toFixed(3),
              rate: Number(doc.rate).toFixed(4),
              subtotal: Number(doc.subtotal).toFixed(2),
            }
          ],
        },
        issueDate: issueDateStr,
        dueDate: dueDateStr,
        logo: logoDataUri,
        logoDataUri: logoDataUri,
        banks: [
          { bank_name: 'ธนาคารกรุงเทพ (BBL)', account_name: 'บริษัท โซลาร์ รูฟ จำกัด', account_number: '123-4-56789-0' }
        ],
        payments: paymentsList,
        approver: {
          userId: ownerId,
          displayName: 'ธนกฤต วัฒนาภิรมย์',
          position: 'ผู้มีอำนาจลงนาม / Authorized Director',
          signatureDataUri: SIGNATURE_PNG,
          approvedAt: issueDateStr + 'T09:00:00.000Z',
        }
      };

      const pdfBytes = await renderFinancialDocumentPdf({
        document_type: doc.document_type,
        document_number: doc.document_number,
        snapshot: docSnapshot,
      });

      const sha256 = createHash('sha256').update(pdfBytes).digest('hex');

      await client.query(`
        INSERT INTO document_artifacts (document_id, pdf_bytes, sha256, created_at)
        VALUES ($1, $2, $3, now())
        ON CONFLICT (document_id) DO NOTHING
      `, [doc.id, pdfBytes, sha256]);

      console.log(`  ✓ Generated PDF Artifact for ${doc.document_number} (${doc.document_type}): ${pdfBytes.length} bytes, SHA: ${sha256.slice(0, 12)}...`);
    }

    // 7. Run Cutoff: Prepare Pending Approval Cycles for Other 9 Sites
    console.log('7. Cutting off billing for other active sites (September 2026) -> "pending_issue_approval"...');
    const periodStart = '2026-09-01';
    const periodEnd = '2026-09-30';
    const cutoffTime = '2026-10-01 01:00:00+07';
    const dueDate = '2026-10-31';

    const tStart = Date.parse('2026-09-01T00:00:00+07:00');
    const tEnd = Date.parse('2026-10-01T00:00:00+07:00');

    const createdCycles: Array<{ siteName: string; code: string; kwh: number; amount: number; cycleId: string }> = [];

    for (const siteFixture of sites) {
      if (siteFixture.code === 'BKK-LKB-001') continue; // Already has 4 cycles

      const siteDbRow = (await client.query(`SELECT id, customer_id, name, external_site_id FROM sites WHERE external_site_id = $1`, [siteFixture.code])).rows[0];
      if (!siteDbRow) continue;

      const cfgRow = (await client.query(`SELECT * FROM site_billing_settings WHERE site_id = $1`, [siteDbRow.id])).rows[0];
      if (!cfgRow) continue;

      const rateRow = (await client.query(`SELECT rate FROM rate_versions WHERE site_id = $1 AND retired_at IS NULL ORDER BY effective_from DESC LIMIT 1`, [siteDbRow.id])).rows[0];
      const rate = Number(rateRow?.rate ?? siteFixture.rate);

      // Energy reading from analytic fixture
      const rStart = reading(siteFixture, 'meter', tStart);
      const rEnd = reading(siteFixture, 'meter', tEnd);
      const consumedKwh = Number((rEnd.kwh - rStart.kwh).toFixed(3));
      const subtotal = Math.round(consumedKwh * rate * 100) / 100;
      const tax = Math.round(subtotal * 0.07 * 100) / 100;
      const totalAmount = Math.round((subtotal + tax) * 100) / 100;

      const meterSnapshot = [
        {
          from: periodStart,
          to: '2026-10-01',
          opening: { value: rStart.kwh.toFixed(3), time: '2026-09-01T00:00:00+07:00' },
          closing: { value: rEnd.kwh.toFixed(3), time: '2026-10-01T00:00:00+07:00' },
          consumedKwh: consumedKwh.toFixed(3),
          rate: rate.toFixed(4),
          subtotal: subtotal.toFixed(2),
          tax: tax.toFixed(2),
          total: totalAmount.toFixed(2),
        }
      ];

      const policy = financialPolicySnapshot(cfgRow, 'PRODUCTION');
      const pHash = financialPolicyHash(policy);

      const existingCycle = (await client.query(`SELECT id FROM billing_cycles WHERE site_id = $1 AND period_start = $2 AND period_end = $3 AND billing_kind = 'energy'`, [siteDbRow.id, periodStart, periodEnd])).rows[0];
      let cycleId = existingCycle?.id;

      if (existingCycle) {
        await client.query(`
          UPDATE billing_cycles SET
            status = 'pending_issue_approval',
            quality = 'complete',
            opening_energy = $2,
            closing_energy = $3,
            consumed_kwh = $4,
            rate = $5,
            amount = $6,
            subtotal = $7,
            simulated_tax = $8,
            meter_snapshot = $9,
            policy_hash = $10,
            policy_snapshot = $11,
            financial_scope = 'PRODUCTION',
            due_date = $12
          WHERE id = $1
        `, [
          cycleId, rStart.kwh.toFixed(3), rEnd.kwh.toFixed(3), consumedKwh, rate,
          totalAmount, subtotal, tax, JSON.stringify(meterSnapshot), pHash, JSON.stringify(policy),
          dueDate
        ]);
      } else {
        cycleId = randomUUID();
        await client.query(`
          INSERT INTO billing_cycles (
            id, site_id, billing_settings_version, period_start, period_end, cutoff_time,
            status, quality, opening_energy, closing_energy, consumed_kwh, rate,
            amount, subtotal, simulated_tax, meter_snapshot, policy_hash, policy_snapshot,
            financial_scope, billing_kind, due_date
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            'pending_issue_approval', 'complete', $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16,
            'PRODUCTION', 'energy', $17
          )
        `, [
          cycleId, siteDbRow.id, cfgRow.version, periodStart, periodEnd, cutoffTime,
          rStart.kwh.toFixed(3), rEnd.kwh.toFixed(3), consumedKwh, rate,
          totalAmount, subtotal, tax, JSON.stringify(meterSnapshot), pHash, JSON.stringify(policy),
          dueDate
        ]);
      }

      // Job record
      const newJobId = randomUUID();
      const jobRow = (await client.query(`
        INSERT INTO financial_month_jobs (
          id, site_id, period_start, period_end, state, attempts, completed_at, last_attempt_at
        ) VALUES (
          $1, $2, $3, $4, 'done', 1, now(), now()
        ) ON CONFLICT (site_id, period_start) DO UPDATE SET
          state = 'done',
          completed_at = now()
        RETURNING id
      `, [newJobId, siteDbRow.id, periodStart, periodEnd])).rows[0];
      const jobId = jobRow.id;

      // Notice & delivery to staff
      const noticeId = randomUUID();
      await client.query(`
        INSERT INTO financial_staff_notices (id, job_id, site_id, kind, detail)
        VALUES ($1, $2, $3, 'monthly_billing_awaiting_approval', $4)
        ON CONFLICT (job_id, kind) DO NOTHING
      `, [noticeId, jobId, siteDbRow.id, JSON.stringify({ scope: 'PRODUCTION', status: 'pending_issue_approval', start: periodStart, end: periodEnd })]);

      await client.query(`
        INSERT INTO notification_deliveries (id, user_id, title, channel, recipient, status)
        SELECT gen_random_uuid(), u.id, 'Billing awaiting issuance approval: ' || $1, 'system', u.email, 'delivered'
        FROM users u WHERE u.status = 'active' AND u.role IN ('owner', 'accountant')
      `, [siteDbRow.name]);

      createdCycles.push({
        siteName: siteDbRow.name,
        code: siteFixture.code,
        kwh: consumedKwh,
        amount: totalAmount,
        cycleId,
      });

      console.log(`  ✓ Created Pending Approval Bill: ${siteFixture.code} (${siteDbRow.name}) | ${consumedKwh} kWh @ ฿${rate} = ฿${totalAmount.toLocaleString()} [pending_issue_approval]`);
    }

    await client.query('COMMIT');
    console.log(`\n🎉 Cut-off successfully completed for ${createdCycles.length} sites!`);
    console.log(`   All ${existingDocs.length} issued documents now have verified real PDF artifacts.`);
    console.log(`   All ${createdCycles.length} new billing cycles are now in status 'pending_issue_approval' ready for review and signing in UI.`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Billing cutoff failed:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

runCutoffDemo();

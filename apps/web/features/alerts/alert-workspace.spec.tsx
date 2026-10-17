import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AlertWorkspaceTabs } from './alert-workspace-tabs';
import { AlertRuleDialog } from './alert-rules-editor';
import { AlertRuleSiteScopeBadge } from './alert-rules-table';
import { DataTable } from '../../components/ui/data-table';
import { Empty, EmptyTitle } from '../../components/ui/empty';
import { ShieldAlert } from 'lucide-react';
import { LocaleProvider } from '../../providers/locale-provider';
import { SessionUserProvider } from '../../providers/session-user-provider';
import type { AlertRule } from './alert-rules-model';

const sampleUser = {
  id: 'u-1',
  email: 'operator@example.test',
  displayName: 'Operator User',
  role: 'operator' as const,
  authorization: {
    revision: 1,
    permissions: ['technical.alerts.view', 'technical.alerts.edit'],
    scopes: {
      business: { mode: 'all' as const, siteIds: [] },
      technical: { mode: 'all' as const, siteIds: [] },
    },
  },
};

const sampleRule: AlertRule = {
  id: 'rule-test-1',
  site_id: 'site-test-1',
  site_ids: ['site-test-1', 'site-test-2'],
  kind: 'threshold',
  semantic_field: 'active_power',
  operator: 'gt',
  threshold: 50000,
  duration_seconds: 120,
  cooldown_seconds: 300,
  recovery: true,
  recipient_user_ids: ['u-1'],
  channels: ['in_app', 'email'],
  enabled: true,
};

test('AlertWorkspaceTabs renders segmented tab buttons for incidents and rules', () => {
  const html = renderToStaticMarkup(
    <LocaleProvider initialLocale="th">
      <AlertWorkspaceTabs value="rules" />
    </LocaleProvider>
  );

  assert.ok(html.includes('รายการแจ้งเตือน'));
  assert.ok(html.includes('รายการกฎการแจ้งเตือน'));
  assert.ok(html.includes('data-state="active"'));
});

test('AlertRuleSiteScopeBadge renders numeric count badge and employee-style popover tooltip even for 1 site', () => {
  const singleSiteHtml = renderToStaticMarkup(
    <AlertRuleSiteScopeBadge
      siteNames={['โรงงานบรรจุภัณฑ์ บางพลี']}
      th={true}
      inline={true}
      open={true}
    />
  );

  // Pure numeric badge in cell
  assert.match(singleSiteHtml, />1<\/span>/);
  // Popover tooltip matching EmployeeScopeBadgeList
  assert.match(singleSiteHtml, /data-variant="popover"/);
  assert.match(singleSiteHtml, /ขอบเขตไซต์งาน/);
  assert.match(singleSiteHtml, /1 ไซต์/);
  assert.match(singleSiteHtml, /โรงงานบรรจุภัณฑ์ บางพลี/);

  const multiSiteHtml = renderToStaticMarkup(
    <AlertRuleSiteScopeBadge
      siteNames={[
        'ศูนย์กระจายสินค้า ลาดกระบัง',
        'โรงงานบรรจุภัณฑ์ บางพลี',
        'คลังสินค้า คลองหลวง',
      ]}
      th={true}
      inline={true}
      open={true}
    />
  );

  assert.match(multiSiteHtml, />3<\/span>/);
  assert.match(multiSiteHtml, /data-variant="popover"/);
  assert.match(multiSiteHtml, /ขอบเขตไซต์งาน/);
  assert.match(multiSiteHtml, /3 ไซต์/);
  assert.match(multiSiteHtml, /ศูนย์กระจายสินค้า ลาดกระบัง/);
  assert.match(multiSiteHtml, /โรงงานบรรจุภัณฑ์ บางพลี/);
  assert.match(multiSiteHtml, /คลังสินค้า คลองหลวง/);
});

test('AlertRuleDialog renders create mode with unlocked site selector', () => {
  const html = renderToStaticMarkup(
    <SessionUserProvider user={sampleUser}>
      <LocaleProvider initialLocale="th">
        <AlertRuleDialog inline open={true} onOpenChange={() => {}} />
      </LocaleProvider>
    </SessionUserProvider>
  );

  assert.ok(html.includes('เพิ่มกฎการแจ้งเตือน'));
  assert.ok(html.includes('ไซต์งาน'));
  assert.ok(html.includes('เงื่อนไข'));
  assert.ok(html.includes('ยกเลิก'));
  assert.ok(html.includes('บันทึกกฎ'));
  // Site select is not disabled in create mode
  assert.ok(!html.includes('disabled="" id="rule-site"'));
});

test('AlertRuleDialog renders edit mode with locked site selector and multi-site badge', () => {
  const html = renderToStaticMarkup(
    <SessionUserProvider user={sampleUser}>
      <LocaleProvider initialLocale="th">
        <AlertRuleDialog inline open={true} onOpenChange={() => {}} initialRule={sampleRule} />
      </LocaleProvider>
    </SessionUserProvider>
  );

  assert.ok(html.includes('แก้ไขกฎการแจ้งเตือน'));
  assert.ok(html.includes('ไม่สามารถเปลี่ยนไซต์งานได้เนื่องจากผู้รับถูกผูกกับสิทธิ์ไซต์'));
  assert.ok(html.includes('2 ไซต์'));
  // Site select is disabled in edit mode
  assert.ok(html.includes('disabled=""') || html.includes('disabled'));
  assert.ok(html.includes('50000'));
  assert.ok(html.includes('120'));
  assert.ok(html.includes('300'));
});

test('DataTable embeds custom emptyContent and hides pagination when rows are empty', () => {
  const html = renderToStaticMarkup(
    <LocaleProvider initialLocale="th">
      <DataTable
        columns={[{ id: 'name', header: 'Name' }]}
        data={[]}
        emptyContent={
          <Empty className="border-0 bg-transparent py-8">
            <ShieldAlert className="size-6" />
            <EmptyTitle>ยังไม่มีการตั้งค่ากฎแจ้งเตือน</EmptyTitle>
          </Empty>
        }
      />
    </LocaleProvider>
  );

  assert.ok(html.includes('ยังไม่มีการตั้งค่ากฎแจ้งเตือน'));
  assert.ok(!html.includes('data-slot="table-pagination"'));
  assert.ok(!html.includes('แสดง 0 จากทั้งหมด 0 รายการ'));
});



import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DataTable } from '../../components/ui/data-table';
import { operationKeys } from './operation-columns';

test('empty resource tables retain their named headers and an empty body row', () => {
  for (const resource of ['sites', 'schools', 'billing', 'contracts', 'documents', 'receipts', 'alerts', 'notifications', 'reports', 'users', 'audit']) {
    const keys = operationKeys(resource, {});
    const html = renderToStaticMarkup(<DataTable columns={keys.map(key => ({ accessorKey: key, header: key }))} data={[]} serverManaged />);
    assert.match(html, /<thead/);
    for (const key of keys) assert.ok(html.includes(`>${key}</th>`), `${resource}: ${key}`);
    assert.match(html, /ไม่พบข้อมูล/);
    assert.ok(!html.includes("แสดง/ซ่อนคอลัมน์"));
  }
});

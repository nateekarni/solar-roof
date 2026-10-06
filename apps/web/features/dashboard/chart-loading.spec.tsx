import React from 'react';
import assert from 'node:assert/strict';
import test from 'node:test';
import {renderToStaticMarkup} from 'react-dom/server';
import {LocaleProvider} from '../../providers/locale-provider';
import {MeasuredChart} from './measured-chart';
import {CollectionChart} from './collection-chart';

const render = (element: React.ReactNode) => renderToStaticMarkup(<LocaleProvider initialLocale="en">{element}</LocaleProvider>);

test('empty measured chart renders useful range and empty state without a renderer loading state', () => {
  const html = render(<MeasuredChart startDate="2026-10-01" endDate="2026-10-06" />);
  assert.match(html, /Metered energy \(kWh\)/);
  assert.match(html, /2026-10-01/);
  assert.match(html, /2026-10-06/);
  assert.match(html, /No data in this date range/);
  assert.doesNotMatch(html, /aria-busy="true"|recharts/);
});

test('measured data retains range and quality warning while interactive renderer loads on client', () => {
  const html = render(<MeasuredChart initialData={[{date:'2026-10-01',value:12}]} startDate="2026-10-01" endDate="2026-10-06" />);
  assert.match(html, /Metered energy \(kWh\)/);
  assert.match(html, /Gaps may make totals partial/);
  assert.match(html, /aria-busy="true"/);
  assert.doesNotMatch(html, /No data in this date range/);
});

test('a padded range without measurements renders the empty state without loading chart code', () => {
  // This is the real API shape for a date range with no readings.
  const points = [{date:'2099-01-01',value:null},{date:'2099-01-02',value:null}];
  const html = render(<MeasuredChart initialData={points} />);
  assert.match(html, /No data in this date range/);
  assert.doesNotMatch(html, /aria-busy="true"|Gaps may make totals partial/);
});

test('a genuine measured zero amid missing readings still loads the chart and preserves its quality warning', () => {
  const points = [{date:'2026-10-01',value:null},{date:'2026-10-02',value:0}];
  const html = render(<MeasuredChart initialData={points} />);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Gaps may make totals partial/);
  assert.doesNotMatch(html, /No data in this date range/);
});

test('collection without billed amounts renders the empty state and billing link without renderer loading', () => {
  const html = render(<CollectionChart collection={{total:0,paid:0,pending:0,paidPercent:0}} />);
  assert.match(html, /Collection for selected range/);
  assert.match(html, /No billed amounts in this date range/);
  assert.match(html, /href="\/billing"/);
  assert.doesNotMatch(html, /aria-busy="true"|recharts/);
});

test('collection keeps actual billed amounts server visible while pie renderer loads on client', () => {
  const html = render(<CollectionChart collection={{total:1200,paid:700,pending:500,paidPercent:58.33}} />);
  assert.match(html, /Paid/);
  assert.match(html, /700 THB/);
  assert.match(html, /Pending/);
  assert.match(html, /500 THB/);
  assert.match(html, /aria-busy="true"/);
  assert.doesNotMatch(html, /No billed amounts/);
});

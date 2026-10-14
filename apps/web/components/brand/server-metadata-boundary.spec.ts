import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('server layout metadata does not import branding constants from a client module', async () => {
  const layout = await readFile(new URL('../../app/layout.tsx', import.meta.url), 'utf8');
  const clientBrandModule = await readFile(new URL('./brand-mark.tsx', import.meta.url), 'utf8');

  assert.match(clientBrandModule, /^['"]use client['"];?/);
  assert.doesNotMatch(
    layout,
    /from\s+['"]\.\.\/components\/brand\/brand-mark['"]/,
    'Next server metadata must not import BRAND_NAME through the client BrandMark boundary',
  );
});

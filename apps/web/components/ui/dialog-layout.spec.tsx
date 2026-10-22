import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';

test('scrollable dialogs constrain their body and reserve focus-ring space on every edge',()=>{
  const source=readFileSync(new URL('./dialog.tsx',import.meta.url),'utf8');
  assert.match(source,/\[&:has\(\[data-slot=dialog-body\]\)\]:flex/);
  assert.match(source,/\[&:has\(\[data-slot=dialog-body\]\)\]:flex-col/);
  assert.match(source,/function DialogBody/);
  assert.match(source,/overflow-y-auto[^"']*p-1/);
});

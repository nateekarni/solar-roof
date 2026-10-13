import assert from 'node:assert/strict';
import {test} from 'node:test';
import {pageSelection, togglePageSelection, pruneSelection, hiddenSelectionCount} from './rate-selection';
test('page selection preserves other pages and reports partial state', () => {
 assert.equal(pageSelection(['a','outside'], ['a','b']), 'indeterminate');
 assert.deepEqual(togglePageSelection(['a','outside'], ['a','b'], true), ['a','outside','b']);
 assert.deepEqual(togglePageSelection(['a','outside','b'], ['a','b'], false), ['outside']);
 assert.equal(pageSelection(['outside'], []), false);
});
test('hidden selections count filters, not pagination, and reload prunes removed IDs', () => {
 assert.equal(hiddenSelectionCount(['a','b','c'], ['a','b']), 1);
 assert.deepEqual(pruneSelection(['a','b','c'], ['b','a']), ['a','b']);
 assert.deepEqual(togglePageSelection(['a'], ['a'], true), ['a']);
});

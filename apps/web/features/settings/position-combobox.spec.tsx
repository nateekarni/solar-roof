import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {PositionCombobox} from './position-combobox';

test('the position trigger is named, keyboard accessible, and displays labels instead of identifiers',()=>{
 const html=renderToStaticMarkup(<PositionCombobox value={null} positions={[]} onChange={()=>{}}/>);
 assert.match(html,/role="combobox"/);
 assert.match(html,/aria-expanded="false"/);
 assert.match(html,/ค้นหาหรือพิมพ์ตำแหน่ง/);
 const selected=renderToStaticMarkup(<PositionCombobox id="staff-position" value={{kind:'existing',id:'secret-position-id',name:'กรรมการบริษัท'}} positions={[]} onChange={()=>{}} disabled/>);
 assert.match(selected,/กรรมการบริษัท/);
 assert.doesNotMatch(selected,/secret-position-id/);
 assert.match(selected,/disabled=""/);
});

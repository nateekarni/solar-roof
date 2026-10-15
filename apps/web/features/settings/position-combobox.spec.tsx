import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {renderToStaticMarkup} from 'react-dom/server';
import {PositionCombobox, FreeformPositionCombobox} from './position-combobox';

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

test('FreeformPositionCombobox renders input and dropdown trigger with matching presets',()=>{
 assert.equal(typeof FreeformPositionCombobox, 'function');
 const html=renderToStaticMarkup(
  <FreeformPositionCombobox
   id="freeform-position"
   value="วิศวกรไฟฟ้า"
   positions={[{id:'p1',name:'วิศวกรไฟฟ้า'},{id:'p2',name:'ผู้จัดการฝ่ายการเงิน'}]}
   onChange={()=>{}}
   placeholder="พิมพ์หรือเลือกตำแหน่ง"
   className="custom-class"
  />
 );
 assert.match(html, /id="freeform-position"/);
 assert.match(html, /value="วิศวกรไฟฟ้า"/);
 assert.match(html, /placeholder="พิมพ์หรือเลือกตำแหน่ง"/);
 assert.match(html, /aria-haspopup="listbox"/);
 assert.match(html, /custom-class/);
});

test('FreeformPositionCombobox handles disabled state and default placeholder',()=>{
 const html=renderToStaticMarkup(
  <FreeformPositionCombobox
   value=""
   positions={[]}
   onChange={()=>{}}
   disabled
  />
 );
 assert.match(html, /disabled=""/);
 assert.match(html, /ค้นหาหรือพิมพ์ตำแหน่ง/);
});

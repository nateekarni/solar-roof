import test from 'node:test';
import assert from 'node:assert/strict';
import * as cursors from './operation-cursor-history';

test('returning to a saved page restores its previous cursors without mixing filter or resource histories',()=>{
 assert.equal(typeof cursors.saveCursorHistory,'function');
 const values=new Map<string,string>();
 const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value);}};
 cursors.saveCursorHistory(storage,'billing','status=pending_verification&cursor=page3',['','page2']);
 cursors.saveCursorHistory(storage,'billing','cursor=page2&status=pending_verification',['']);
 assert.deepEqual(cursors.readCursorHistory(storage,'billing','cursor=page3&status=pending_verification'),['','page2']);
 assert.deepEqual(cursors.readCursorHistory(storage,'billing','cursor=page2&status=pending_verification'),['']);
 assert.deepEqual(cursors.readCursorHistory(storage,'receipts','cursor=page3&status=pending_verification'),[]);
 assert.deepEqual(cursors.readCursorHistory(storage,'billing','cursor=page3&status=paid'),[]);
});

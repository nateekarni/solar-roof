import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import {AvatarController} from './avatar.controller.js';
import type {DatabaseService} from '../../database/database.service.js';
test('avatar can update only the authenticated user and rejects extra identity fields',async()=>{
 const calls:{sql:string;values:unknown[]}[]=[];
 const controller=new AvatarController({query:async(sql:string,values:unknown[])=>{calls.push({sql,values});return {rows:[{id:'current'}]};}} as unknown as DatabaseService);
 const bytes=await sharp({create:{width:256,height:256,channels:3,background:'blue'}}).jpeg().toBuffer(),image=`data:image/jpeg;base64,${bytes.toString('base64')}`;
 await assert.rejects(()=>controller.save({} as never,{image}),/Not authenticated/);
 await assert.rejects(()=>controller.save({user:{id:'current'}} as never,{image,userId:'other'}),/Invalid avatar fields/);
 const result=await controller.save({user:{id:'current'}} as never,{image});
 assert.match(result.avatarData,/^data:image\/jpeg;base64,/);assert.equal(calls.length,1);assert.match(calls[0]!.sql,/WHERE id=\$2/);assert.equal(calls[0]!.values[1],'current');
});

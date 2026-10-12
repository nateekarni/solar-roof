import assert from 'node:assert/strict';
import test from 'node:test';
import {JwtAuthGuard} from './jwt.guard.js';
test('open sessions get current site assignments on every authenticated request',async()=>{
 let assigned=['site-a'];const request:any={headers:{authorization:'Bearer token'}};
 const context:any={getHandler:()=>()=>{},getClass:()=>class{},switchToHttp:()=>({getRequest:()=>request,getResponse:()=>({setHeader(){}})})};
 const guard=new JwtAuthGuard({verifyAccessToken:()=>({id:'user',sessionId:'session',role:'customer_user',customerId:'customer',assignedSiteIds:['stale-site']})} as any,{getAllAndOverride:()=>false} as any,{query:async()=>({rows:[{id:'user',role:'customer_user',customer_id:'customer',status:'active',assigned_site_ids:assigned}]})} as any,{isActive:async()=>true} as any,{load:async()=>({revision:0,permissions:[],scopes:{business:{mode:'selected',siteIds:[]},technical:{mode:'selected',siteIds:[]}}})} as any);
 await guard.canActivate(context);assert.deepEqual(request.user.assignedSiteIds,['site-a']);
 assigned=[];await guard.canActivate(context);assert.deepEqual(request.user.assignedSiteIds,[]);
});

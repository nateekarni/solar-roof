import assert from 'node:assert/strict';
import {randomUUID,randomBytes,scryptSync,createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
const {Pool}=createRequire(new URL('../../../api/package.json',import.meta.url))('pg');
const web=process.env.READINESS_WEB_URL;assert.equal(web,'http://localhost:13000');
assert.equal(process.env.READINESS_DATABASE_URL,'postgresql://solar:ci-only-password@127.0.0.1:15432/solar_readiness');
const db=new Pool({connectionString:process.env.READINESS_DATABASE_URL});
const id=randomUUID(),email=`csrf-browser-${id}@example.test`,password='Csrf-browser-password-123!';
const salt=randomBytes(16).toString('hex'),hash=`scrypt:${salt}:${scryptSync(password,salt,64).toString('hex')}`;
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
try {
 await db.query("INSERT INTO users(id,email,display_name,role,status,password_hash) VALUES($1,$2,'CSRF Browser','owner','active',$3)",[id,email,hash]);
 const page=await browser.newPage();
 const login=await fetch(web+'/v1/auth/login',{method:'POST',headers:{Origin:web,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(login.status,200);const tokens=await login.json();
 await page.context().addCookies([{name:'access_token',value:tokens.accessToken,domain:'localhost',path:'/',httpOnly:true},{name:'refresh_token',value:tokens.refreshToken,domain:'localhost',path:'/',httpOnly:true}]);
 // Route only attacker document locally. The form POST itself reaches the real web/API.
 assert.equal((await page.request.get(web+'/v1/auth/me')).status(),200,'Cookie-authenticated session is valid before attack');
 for(const origin of ['http://localhost:13004','http://127.0.0.1:13000']) {
  await page.route(origin+'/attack',route=>route.fulfill({contentType:'text/html',body:`<form method="POST" action="${web}/v1/auth/logout"><button>Attack</button></form>`}));
  await page.goto(origin+'/attack');
  const before=JSON.stringify((await db.query('SELECT refresh_hash,revoked_at FROM auth_sessions WHERE user_id=$1',[id])).rows);
  const responsePromise=page.waitForResponse(web+'/v1/auth/logout');await page.getByRole('button',{name:'Attack'}).click();const response=await responsePromise;
  const headers=await response.request().allHeaders();assert.equal(headers.origin,origin);
  const wire=await (await fetch(web+'/__fixture/request')).json();assert.equal(wire.origin,origin);
  if(origin.includes('localhost:13004')) {assert.equal(wire.site,'same-site');assert.ok(wire.cookies.includes('access_token'));assert.ok(wire.cookies.includes('refresh_token'));}
  else assert.equal(wire.site,'cross-site');
  assert.equal(response.status(),403);
  const after=JSON.stringify((await db.query('SELECT refresh_hash,revoked_at FROM auth_sessions WHERE user_id=$1',[id])).rows);assert.equal(after,before);
 }
 await page.goto(web+'/login');
 assert.equal(await page.evaluate(async()=> (await fetch('/v1/auth/logout',{method:'POST'})).status),200);
 assert.ok((await db.query('SELECT revoked_at FROM auth_sessions WHERE user_id=$1',[id])).rows[0].revoked_at);
 const freshLogin=await fetch(web+'/v1/auth/login',{method:'POST',headers:{Origin:web,'Content-Type':'application/json'},body:JSON.stringify({email,password})});assert.equal(freshLogin.status,200);const fresh=await freshLogin.json();
 const expiredContext=await browser.newContext({timezoneId:'UTC'});
 const [tokenPayload]=fresh.accessToken.split('.');
 const expiredSigningInput=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(tokenPayload,'base64url').toString()),exp:Math.floor(Date.now()/1000)-60})).toString('base64url');
 const expiredAccess=expiredSigningInput+'.'+createHmac('sha256','readiness-test-access-secret-000000000000').update(expiredSigningInput).digest('base64url');
 await expiredContext.addCookies([{name:'refresh_token',value:fresh.refreshToken,domain:'localhost',path:'/',httpOnly:true},{name:'access_token',value:expiredAccess,domain:'localhost',path:'/',httpOnly:true}]);
 const beforeGet=JSON.stringify((await db.query('SELECT sid,refresh_hash,revoked_at FROM auth_sessions WHERE user_id=$1 ORDER BY sid',[id])).rows);
 const navigation=await expiredContext.request.get(web+'/sites?resume=1',{maxRedirects:0});
 const afterGet=JSON.stringify((await db.query('SELECT sid,refresh_hash,revoked_at FROM auth_sessions WHERE user_id=$1 ORDER BY sid',[id])).rows);assert.equal(afterGet,beforeGet,'GET navigation alone cannot rotate credentials');
 assert.match(navigation.headers().location,/\/session\/refresh\?returnTo=/,'Expired access navigates to browser refresh bridge');
 const expiredPage=await expiredContext.newPage();expiredPage.on('pageerror',error=>console.error('Bridge page error:',error.message));expiredPage.on('console',message=>{if(message.type()==='error')console.error('Bridge console error:',message.text());});
 expiredPage.on('response',response=>{if(response.status()>=400&&response.url().includes('/_next/'))console.error('Bridge asset status:',response.status(),new URL(response.url()).pathname);});
 expiredPage.on('requestfailed',request=>console.error('Bridge failed resource:',new URL(request.url()).pathname,request.failure()?.errorText));
 const refreshResponse=expiredPage.waitForResponse(web+'/v1/auth/refresh');
 await expiredPage.goto(web+'/sites?resume=1');
 assert.equal((await refreshResponse.catch(async error=>{console.error('Bridge diagnostic URL:',expiredPage.url());console.error('Bridge diagnostic document:',await expiredPage.locator('body').innerText());console.error('Bridge diagnostic scripts:',await expiredPage.locator('script[src]').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('src'))));throw error;})).status(),200);await expiredPage.waitForURL(web+'/sites?resume=1');
 const wire=await (await fetch(web+'/__fixture/request')).json();assert.equal(wire.origin,web);
 assert.equal((await expiredContext.request.get(web+'/v1/auth/me')).status(),200);
 const afterBrowser=JSON.stringify((await db.query('SELECT sid,refresh_hash,revoked_at FROM auth_sessions WHERE user_id=$1 ORDER BY sid',[id])).rows);assert.notEqual(afterBrowser,beforeGet,'Browser POST refresh rotates credentials');
 for(const returnTo of ['//attacker.test','/session/refresh?returnTo=/session/refresh']) {
  const response=expiredPage.waitForResponse(web+'/v1/auth/refresh');await expiredPage.goto(web+'/session/refresh?returnTo='+encodeURIComponent(returnTo));assert.equal((await response).status(),200);await expiredPage.waitForURL(web+'/');
 }
 await expiredContext.close();
 const failedContext=await browser.newContext();await failedContext.addCookies([{name:'refresh_token',value:'invalid',domain:'localhost',path:'/',httpOnly:true}]);
 const failedPage=await failedContext.newPage();let failedRefreshCount=0;failedPage.on('request',request=>{if(request.url()===web+'/v1/auth/refresh')failedRefreshCount++;});
 await failedPage.goto(web+'/sites');await failedPage.waitForURL(web+'/login?sessionExpired=1');assert.equal(failedRefreshCount,1,'Invalid refresh ends at login without a loop');await failedContext.close();
 console.log('PASS: real browser sibling/cross-site form POST 403, DB unchanged; same-origin logout 200');
} finally {await browser.close();await db.query('DELETE FROM audit_events WHERE actor_id=$1',[id]);await db.query('DELETE FROM users WHERE id=$1',[id]);await db.end();}

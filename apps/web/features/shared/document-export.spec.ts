import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {embeddedImageSource} from './document-export';
test('export resolves site-relative and saved issuer paths and embeds the actual image bytes',async()=>{
 const paths:string[]=[];
 const server=createServer((req,res)=>{paths.push(req.url!);if(req.url==='/missing.png'){res.statusCode=404;res.end();return;}res.setHeader('Content-Type','image/png');res.end(Buffer.from([137,80,78,71]));});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {const address=server.address();assert.ok(address&&typeof address!=='string');const base=`http://127.0.0.1:${address.port}/contracts`;
 for(const source of ['/brand/solar-roof-document.png','/saved/issuer.png'])assert.equal(await embeddedImageSource(source,base),'data:image/png;base64,iVBORw==');
 await assert.rejects(embeddedImageSource('/missing.png',base),/Unable to embed document logo/);
 assert.deepEqual(paths,['/brand/solar-roof-document.png','/saved/issuer.png','/missing.png']);
 }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
test('already embedded snapshot logos retain their bytes',async()=>{assert.equal(await embeddedImageSource('data:image/png;base64,iVBORw==','https://example.com'),'data:image/png;base64,iVBORw==');});
test('failed logo fetch prevents a misleading incomplete export',async()=>{await assert.rejects(embeddedImageSource('/logo.png','data:text/plain,unsupported'));});

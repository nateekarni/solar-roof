// Disposable fixture equivalent of the same-origin reverse-proxy route.
// Identity comes exclusively from this listener's socket, never caller headers.
import http from 'node:http';
let lastMutation;
const server=http.createServer((request,response)=>{
 if(request.url==='/__fixture/request') {response.setHeader('Content-Type','application/json');response.end(JSON.stringify(lastMutation));return;}
 if(!['GET','HEAD','OPTIONS'].includes(request.method))lastMutation={origin:request.headers.origin,site:request.headers['sec-fetch-site'],cookies:(request.headers.cookie ?? '').split(';').map(value=>value.trim().split('=')[0])};
 const target=request.url==='/v1'||request.url.startsWith('/v1/')?'api':'web';
 const headers={...request.headers};
 for(const name of Object.keys(headers))if(name==='forwarded'||name==='x-real-ip'||name.startsWith('x-forwarded-'))delete headers[name];
 headers['x-forwarded-for']=request.socket.remoteAddress;
 const upstream=http.request({host:target==='api'?'172.31.253.20':target,port:target==='api'?3001:3000,path:request.url,method:request.method,headers},result=>{response.writeHead(result.statusCode,result.headers);result.pipe(response);});
 upstream.on('error',()=>{response.writeHead(502);response.end();});request.pipe(upstream);
});
// Traefik supports upgrades; relay Next development's HMR transport too.
server.on('upgrade',(request,socket,head)=>{
 const headers={...request.headers};
 for(const name of Object.keys(headers))if(name==='forwarded'||name==='x-real-ip'||name.startsWith('x-forwarded-'))delete headers[name];
 const upstream=http.request({host:'web',port:3000,path:request.url,headers});
 upstream.on('upgrade',(response,peer,peerHead)=>{
  const lines=Object.entries(response.headers).flatMap(([name,value])=>(Array.isArray(value)?value:[value]).map(item=>`${name}: ${item}`));
  socket.write(`HTTP/1.1 101 Switching Protocols\r\n${lines.join('\r\n')}\r\n\r\n`);
  if(head.length)peer.write(head);if(peerHead.length)socket.write(peerHead);
  socket.on('error',()=>peer.destroy());peer.on('error',()=>socket.destroy());socket.pipe(peer).pipe(socket);
 });
 upstream.on('error',()=>socket.destroy());upstream.end();
});
server.listen(3000,'0.0.0.0');

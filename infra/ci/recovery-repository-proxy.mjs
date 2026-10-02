// Isolated fixture TLS termination for pgBackRest, never a production TLS bypass.
import https from 'node:https';
import http from 'node:http';
import {readFileSync} from 'node:fs';
https.createServer({key:readFileSync('/certs/key.pem'),cert:readFileSync('/certs/cert.pem')},(req,res)=>{
 const upstream=http.request({hostname:'storage',port:9000,path:req.url,method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
 upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
}).listen(9443,'0.0.0.0');

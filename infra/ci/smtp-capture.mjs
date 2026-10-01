import net from 'node:net';
import http from 'node:http';
let failed=false;
const messages=[];
net.createServer(socket=>{
  socket.setEncoding('utf8');socket.write('220 local fixture SMTP\r\n');
  let buffer='',data=false,mail='';
  socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+2);
    if(data){if(line==='.') {data=false;if(failed)socket.write('550 fixture delivery rejected\r\n');else {messages.push(mail);socket.write('250 captured locally\r\n');}mail='';}else mail+=line+'\r\n';continue;}
    if(/^EHLO|^HELO/.test(line))socket.write('250 local-capture\r\n');
    else if(/^DATA/.test(line)){data=true;socket.write('354 send content\r\n');}
    else if(/^QUIT/.test(line)){socket.end('221 bye\r\n');}
    else socket.write('250 OK\r\n');
  }});
}).listen(1025,'0.0.0.0');
http.createServer((req,res)=>{if(req.method==='POST'){failed=req.url==='/fail';messages.length=0;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify(messages));}).listen(8025,'0.0.0.0');

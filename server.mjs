import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));const port=Number(process.env.PORT||4173);
http.createServer((req,res)=>{let p=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!p.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(p,(err,data)=>{if(err){res.writeHead(404);return res.end('Not found');}res.setHeader('Content-Type',({'html':'text/html; charset=utf-8','js':'text/javascript','css':'text/css','svg':'image/svg+xml'})[p.split('.').pop()]||'text/plain');res.end(data);});}).listen(port,'127.0.0.1',()=>console.log(`Судота: http://localhost:${port}`));

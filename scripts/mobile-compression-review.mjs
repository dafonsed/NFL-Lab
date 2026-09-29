import http from 'node:http';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const base=process.env.AUDIT_URL||'http://127.0.0.1:3201';
function request(method,encoding){return new Promise((resolve,reject)=>{const req=http.request(base+'/style.css',{method,headers:{'Accept-Encoding':encoding}},res=>{const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));});req.on('error',reject);req.end();});}
const plain=await request('GET','identity'),compressed=await request('GET','gzip'),refused=await request('GET','gzip;q=0, *;q=1'),head=await request('HEAD','gzip');
assert.equal(plain.status,200);assert.equal(compressed.headers['content-encoding'],'gzip');assert.equal(refused.headers['content-encoding'],undefined);assert.equal(head.body.length,0);
assert.deepEqual(gunzipSync(compressed.body),plain.body);assert.deepEqual(refused.body,plain.body);
for(const response of [plain,compressed,refused]){assert.equal(Number(response.headers['content-length']),response.body.length);assert.match(response.headers.vary,/Accept-Encoding/);assert.equal(response.headers['cache-control'],'no-cache');}
const result={url:base+'/style.css',plainBytes:plain.body.length,gzipBytes:compressed.body.length,decodedExact:true,optOutExact:true,headBodyBytes:head.body.length,headContentLength:Number(head.headers['content-length']),vary:compressed.headers.vary,cacheControl:compressed.headers['cache-control']};
await fs.mkdir('artifacts/mobile-audit/shared-review',{recursive:true});await fs.writeFile('artifacts/mobile-audit/shared-review/compression.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));

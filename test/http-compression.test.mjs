import test from 'node:test';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {acceptsGzip,publicCompressionPath,sendPublicResponse} from '../lib/http-compression.mjs';
test('gzip negotiation respects explicit opt-out and public-only boundaries',()=>{
 assert.equal(acceptsGzip('br, gzip'),true);
 assert.equal(acceptsGzip('gzip;q=0, *;q=1'),false);
 assert.equal(acceptsGzip('*;q=.5'),true);
 assert.equal(acceptsGzip('br'),false);
 for(const path of ['/api/auth/get-session','/api/account/data/bets','/admin/users','/account'])assert.equal(publicCompressionPath(path),false);
 for(const path of ['/style.css?v=1','/app.js','/api/board?market=any_td','/api/nfl/live'])assert.equal(publicCompressionPath(path),true);
});
test('compresses large public JSON without changing content or cache policy',async()=>{
 const original=JSON.stringify({players:Array.from({length:200},(_,id)=>({id,name:'Long player name',odds:125,line:2.5}))});
 const response={destroyed:false,hasHeader:()=>false,getHeader:()=>undefined,writeHead(status,headers){this.status=status;this.headers=headers;},end(value){this.body=value;}};
 await sendPublicResponse({method:'GET',url:'/api/board',headers:{'accept-encoding':'gzip'}},response,original,{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 assert.equal(response.status,200);assert.equal(response.headers['Content-Encoding'],'gzip');assert.equal(response.headers['Cache-Control'],'no-store');assert.equal(response.headers.Vary,'Accept-Encoding');assert.equal(gunzipSync(response.body).toString(),original);assert.ok(response.body.length<original.length/4);
});
test('account responses and HEAD never compress or emit an inappropriate body',async()=>{
 const make=()=>({hasHeader:()=>false,getHeader:()=>undefined,writeHead(status,headers){this.headers=headers;},end(value){this.body=value;}});
 const body='x'.repeat(2000),account=make(),head=make();
 await sendPublicResponse({method:'GET',url:'/api/account',headers:{'accept-encoding':'gzip'}},account,body);
 assert.equal(account.headers['Content-Encoding'],undefined);assert.equal(account.body.toString(),body);
 await sendPublicResponse({method:'HEAD',url:'/style.css',headers:{'accept-encoding':'gzip'}},head,body);
 assert.equal(head.body,undefined);assert.equal(head.headers['Content-Length'],2000);
});

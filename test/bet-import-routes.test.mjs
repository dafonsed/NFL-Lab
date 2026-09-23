import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

test('bet import serves local OCR assets with WebAssembly limited to the worker',async()=>{
 const script=`
  import assert from 'node:assert/strict';
  import server from './server.mjs';
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin='http://127.0.0.1:'+server.address().port;
  try {
   const page=await fetch(origin+'/bets'),html=await page.text();
   assert.equal(page.status,200);assert.ok(html.includes('id="import-slip"'));assert.ok(html.includes('id="bet-overview"'));
   assert.ok(!page.headers.get('content-security-policy').includes('wasm-unsafe-eval'));
   const css=html.match(/href="[^\"]+\\.css"/g);assert.equal(css.at(-1),'href="/bets.css"');
   for(const name of ['bet-dashboard.js','bet-analytics.js','bet-slip-parser.js','bet-slip-import.js'])assert.equal((await fetch(origin+'/'+name)).status,200);
   const worker=await fetch(origin+'/vendor/ocr/worker.min.js');assert.equal(worker.status,200);assert.ok(worker.headers.get('content-security-policy').includes("'wasm-unsafe-eval'"));
   for(const name of ['tesseract.esm.min.js','tesseract-core-lstm.wasm.js','tesseract-core-simd-lstm.wasm.js','tesseract-core-relaxedsimd-lstm.wasm.js']) {
    const response=await fetch(origin+'/vendor/ocr/'+name);assert.equal(response.status,200);assert.ok(response.headers.get('content-type').startsWith('text/javascript'));assert.ok((await response.arrayBuffer()).byteLength>1000);
   }
   const model=await fetch(origin+'/vendor/ocr/eng.traineddata.gz');assert.equal(model.status,200);assert.equal(model.headers.get('content-encoding'),null);assert.deepEqual([...new Uint8Array(await model.arrayBuffer()).slice(0,2)],[31,139]);
   assert.equal((await fetch(origin+'/vendor/ocr/secret.json')).status,404);
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 `;
 const child=spawn(process.execPath,['--input-type=module','-e',script],{cwd:new URL('../',import.meta.url),env:{...process.env,VERCEL:'1'},windowsHide:true});
 let output='';child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',resolve);});assert.equal(code,0,output);
});

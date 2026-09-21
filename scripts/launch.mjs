import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT||3100);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('PORT must be an integer from 1024 to 65535.');
const url=`http://127.0.0.1:${port}`;
async function running(){try{const r=await fetch(url+'/api/health',{signal:AbortSignal.timeout(1200)});const d=await r.json();if(d.app==='independent-nfl-workspace')return true;throw new Error('Another application is using this port. Set PORT to a different port.');}catch(e){if(e.message.startsWith('Another'))throw e;return false;}}
if(!await running()){
  fs.mkdirSync(path.join(root,'logs'),{recursive:true});
  const out=fs.openSync(path.join(root,'logs','server.log'),'a');
  const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',out,out],env:process.env});child.unref();fs.closeSync(out);
  let ready=false;for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,300));if(await running()){ready=true;break;}}
  if(!ready)throw new Error('The app did not start. Check logs/server.log.');
}
console.log(`NFL Analytics is running: ${url}`);
if(!process.argv.includes('--no-open')){
  const child=process.platform==='win32'?spawn('cmd.exe',['/c','start','',url],{windowsHide:true,detached:true,stdio:'ignore'}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{detached:true,stdio:'ignore'});child.unref();
}

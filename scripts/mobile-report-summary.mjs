import fs from 'node:fs/promises';
function cls(entries){let max=0,sum=0,start=0,last=0;for(const e of entries){if(e.t-last>1000||e.t-start>5000){sum=0;start=e.t;}sum+=e.v;last=e.t;max=Math.max(max,sum);}return max;}
const results=[];
for(const phase of ['before-compression','after-compression','final-identity','final-gzip']){
 const rows=JSON.parse(await fs.readFile(`reports/mobile/performance/${phase}.json`,'utf8'));
 for(const r of rows){const resources=r.before.resources;const values={phase,route:r.route,condition:r.throttle==='normal'?'normal':'4x CPU / 150ms / 1.6Mbps',lcpMs:r.before.perf.lcp,firstUsefulMs:r.before.perf.useful||null,cls:cls(r.before.perf.shifts),requests:resources.length,transferBytes:resources.reduce((n,a)=>n+a.transferSize,0),jsTransferBytes:resources.filter(a=>/\.js(?:\?|$)/.test(a.name)).reduce((n,a)=>n+a.transferSize,0),cssTransferBytes:resources.filter(a=>/\.css(?:\?|$)/.test(a.name)).reduce((n,a)=>n+a.transferSize,0),jsDecodedBytes:resources.filter(a=>/\.js(?:\?|$)/.test(a.name)).reduce((n,a)=>n+a.decodedBodySize,0),cssDecodedBytes:resources.filter(a=>/\.css(?:\?|$)/.test(a.name)).reduce((n,a)=>n+a.decodedBodySize,0),domNodes:r.before.nodes,heapBytes:r.heap.usedSize,maxEventDurationMs:Math.max(0,...r.after.events.map(e=>e.duration)),interactions:r.interaction};results.push(values);}
}
await fs.writeFile('reports/mobile/performance/summary.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results,null,2));

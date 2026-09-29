import test from 'node:test';
import assert from 'node:assert/strict';
import {stableLiveOrder,liveDisplayRevision} from '../public/live-utils.js';
test('live ranking retains existing players, appends arrivals, and removes missing players',()=>{
 const rows=[{id:'c',value:9},{id:'b',value:8},{id:'a',value:2}];
 assert.deepEqual(stableLiveOrder(rows,['a','b']).map(p=>p.id),['a','b','c']);
 assert.deepEqual(rows.map(p=>p.id),['c','b','a'],'caller input is not mutated');
 assert.deepEqual(stableLiveOrder(rows,['missing','b']).map(p=>p.id),['b','c','a']);
});
test('receipt-only updates avoid redraw while odds, stale status and players still invalidate',()=>{
 const baseline={players:[{id:'a',projection:8}],odds:{price:120,fetchedAt:'a'},fetchedAt:'a',stale:false,sourceAgeMs:0};
 assert.equal(liveDisplayRevision(baseline),liveDisplayRevision({...baseline,fetchedAt:'b',sourceAgeMs:5,odds:{price:120,fetchedAt:'b'}}));
 for(const changed of [{stale:true},{players:[{id:'a',projection:9}]},{odds:{price:125,fetchedAt:'a'}}])assert.notEqual(liveDisplayRevision(baseline),liveDisplayRevision({...baseline,...changed}));
});

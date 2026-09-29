import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { paginateRows, paginationControls } from '../public/product-ui.js';
import { trendRows } from '../public/trends-data.js';

test('a large slate stays bounded and every result is reachable exactly once', () => {
  const rows=Array.from({length:1001},(_,id)=>({id})), original=[...rows], visited=[];
  for(let page=1;page<=41;page++) {
    const result=paginateRows(rows,page);
    assert.ok(result.rows.length<=25);
    assert.equal(result.total,1001);
    visited.push(...result.rows);
  }
  assert.deepEqual(visited,original);
  assert.deepEqual(rows,original);
  assert.equal(new Set(visited.map(row=>row.id)).size,1001);
});

test('invalid pages and shrinking filtered results clamp to valid bounds', () => {
  const rows=Array.from({length:51},(_,id)=>id);
  for(const page of [undefined,NaN,Infinity,-5,0,'bad']) assert.equal(paginateRows(rows,page).page,1);
  assert.deepEqual(paginateRows(rows,999).rows,[50]);
  assert.equal(paginateRows(rows.slice(0,7),3).page,1);
  assert.deepEqual(paginateRows([],4),{rows:[],page:1,pageSize:25,total:0,totalPages:1,start:0,end:0});
  assert.equal(paginationControls(paginateRows([],1)),'');
});

test('page controls expose accurate ranges, boundaries and a bounded page list', () => {
  const rows=Array.from({length:1001},(_,id)=>id);
  const first=load(paginationControls(paginateRows(rows,1)));
  assert.equal(first('[aria-label="Previous page"]').is(':disabled'),true);
  assert.equal(first('[aria-label="Next page"]').attr('data-board-page'),'2');
  assert.match(first('[role=status]').text(),/1–25 of 1001 players/);
  const middle=load(paginationControls(paginateRows(rows,20)));
  assert.equal(middle('[aria-current=page]').attr('aria-label'),'Page 20');
  assert.ok(middle('button').length<=7);
  assert.equal(middle('[aria-label="Page 41"]').length,1);
  const last=load(paginationControls(paginateRows(rows,41)));
  assert.equal(last('[aria-label="Next page"]').is(':disabled'),true);
  assert.match(last('[role=status]').text(),/1001–1001 of 1001 players/);
});

test('Trends searches and ranks the whole result set before pagination', () => {
  const profiles=Array.from({length:61},(_,id)=>({key:String(id),playerId:String(id),name:`Player ${String(id).padStart(2,'0')}`,team:'SEA',opponent:'NY',prop:{line:20},rows:[{date:'2026-09-01',value:id}],sport:'nba',market:'points'}));
  const ranked=trendRows(profiles,{sort:'average'});
  assert.equal(paginateRows(ranked,1).rows[0].p.key,'60');
  assert.equal(paginateRows(ranked,3).rows.at(-1).p.key,'0');
  const searched=trendRows(profiles,{search:'Player 60'});
  assert.equal(paginateRows(searched,3).rows[0].p.key,'60');
  assert.equal(paginateRows(searched,3).page,1);
});

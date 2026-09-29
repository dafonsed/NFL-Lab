import test from 'node:test';
import assert from 'node:assert/strict';
import {compareAdminValues} from '../public/admin-values.js';

test('formatted latency is ordered by duration and unavailable data remains last in either direction',()=>{
  const input=['—','1,840 ms','142 ms','1.2 s','2 min','186 ms','218 ms'];
  assert.deepEqual(input.toSorted(compareAdminValues),['142 ms','186 ms','218 ms','1.2 s','1,840 ms','2 min','—']);
  assert.deepEqual(input.toSorted((a,b)=>compareAdminValues(a,b,true)),['2 min','1,840 ms','1.2 s','218 ms','186 ms','142 ms','—']);
});
test('amounts, percentages, timestamps and natural text labels sort without losing their meaning',()=>{
  assert.deepEqual(['$1,240','$50','$9.50'].toSorted(compareAdminValues),['$9.50','$50','$1,240']);
  assert.deepEqual(['12.5%','-2%','2%'].toSorted(compareAdminValues),['-2%','2%','12.5%']);
  assert.deepEqual(['rule 11','rule 2'].toSorted(compareAdminValues),['rule 2','rule 11']);
  assert.ok(compareAdminValues('2026-09-27T23:00:00-07:00','2026-09-28T05:00:00Z')>0);
});

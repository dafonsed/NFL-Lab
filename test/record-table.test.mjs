import test from 'node:test';
import assert from 'node:assert/strict';
import { RecordTable, RecordView, TableBuilder, tableSnapshot, restamp } from '../lib/odds/record-table.mjs';

const records = () => [
  { id: 'a', book: 'FanDuel', odds: -110, line: 4.5, live: false, links: { bet: 'x' } },
  { id: 'b', book: 'FanDuel', odds: 120, line: '', live: true, team: undefined },
  { id: 'c', book: 'Pinnacle', odds: NaN, line: 0 },
];

test('a table gives back the same records, field for field, whether or not the originals are still held', () => {
  const source = records(), table = new RecordTable(source);
  assert.equal(table.length, 3);
  assert.equal(table.rows(), source, 'the originals while they are held');
  table.cached = null;
  const rebuilt = table.rows();
  assert.notEqual(rebuilt, source);
  assert.deepEqual(rebuilt, records());
  assert.ok('team' in rebuilt[1] && rebuilt[1].team === undefined, 'a field set to undefined is still there');
  assert.ok(!('team' in rebuilt[0]), 'a missing field stays missing');
  assert.equal(rebuilt[0].links, source[0].links, 'objects are shared, not copied');
  assert.equal(table.rows(), rebuilt, 'the rebuilt array is reused while held');
});

test('a view reads several tables as one, keeping only the rows each mask marks', () => {
  const first = new RecordTable(records()), second = new RecordTable([{ id: 'd', book: 'DraftKings', odds: 100 }]);
  const view = new RecordView([{ table: first, keep: Uint8Array.from([1, 0, 1]) }, { table: second, keep: null }, { table: new RecordTable([]), keep: null }]);
  assert.equal(view.length, 3);
  assert.deepEqual(view.rows().map(row => row.id), ['a', 'c', 'd']);
});

test('a table snapshot reads its quotes on demand, and restamp copies it without losing them', () => {
  const table = new RecordTable(records()), snapshot = tableSnapshot({ base: 'b', at: 1, stale: false, quotes: ['ignored'] }, table);
  assert.equal(snapshot.count, 3);
  assert.equal(snapshot.quotes, table.rows());
  assert.deepEqual(Object.keys(snapshot).sort(), ['at', 'base', 'count', 'stale'], 'quotes and the table are not copied by a spread');
  const stale = restamp(snapshot, { stale: true });
  assert.equal(stale.stale, true);
  assert.equal(stale.quotes, snapshot.quotes);
  assert.deepEqual(restamp({ quotes: [1], stale: false }, { stale: true }), { quotes: [1], stale: true }, 'plain snapshots are copied as before');
});

test('a table built one record at a time (from a stream) gives back the same records', () => {
  const builder = new TableBuilder(1);
  for (const record of records()) builder.add(record);
  const table = builder.build();
  assert.equal(table.length, 3);
  assert.deepEqual(table.rows(), records());
  assert.ok(table.columns.every(column => column.length === 3), 'columns are trimmed to the records read');
  assert.deepEqual(new TableBuilder().build().rows(), []);
});

test('one field of every row can be read without building the rows', () => {
  const table = new RecordTable(records()), book = table.field('book'), team = table.field('team');
  assert.deepEqual([0, 1, 2].map(book), ['FanDuel', 'FanDuel', 'Pinnacle']);
  assert.deepEqual([0, 1, 2].map(team), [undefined, undefined, undefined]);
  assert.deepEqual([0, 1].map(table.field('missing')), [undefined, undefined]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readJsonRecords } from '../lib/json-records.mjs';

// Bytes in chunks of `size`, as a response body streams them.
const stream = (text, size) => (async function* () {
  const bytes = new TextEncoder().encode(text);
  for (let at = 0; at < bytes.length; at += size) yield bytes.slice(at, at + size);
})();
const read = async (text, size) => { const records = []; const result = await readJsonRecords(stream(text, size), record => records.push(record)); return { records, ...result }; };

test('a JSON list is read one record at a time, wherever the chunks split it', async () => {
  const cases = [
    '[{"a":1,"b":"x,]}\\"y"},{"c":[1,2,{"d":"é"}]}, 3, "s", null ]',
    '{"complete":true,"quotes":[{"id":"1","t":"a\\\\"},{"id":"2","e":"🙂"}],"next_cursor":null}',
    ' { "other": [1,2], "quotes" : [ ] , "x": {"quotes":[9]} } ',
    '{"a":"quotes","quotes":[{"z":1}]}',
    '[]',
  ];
  for (const text of cases) {
    const parsed = JSON.parse(text), list = Array.isArray(parsed) ? parsed : parsed.quotes;
    for (const size of [1, 2, 3, 7, 1 << 16]) {
      const { records, root, found } = await read(text, size);
      assert.deepEqual(records, list, `${text} in chunks of ${size}`);
      assert.equal(found, true);
      assert.deepEqual(root, Array.isArray(parsed) ? [] : { ...parsed, quotes: [] }, 'the rest of the top level is kept');
    }
  }
  const { records, found } = await read('{"quotes":null,"error":"x"}', 4);
  assert.deepEqual(records, []);
  assert.equal(found, false, 'no list to read');
});

test('anything that isn’t JSON is a SyntaxError', async () => {
  for (const text of ['not json', '[{"a":1}', '[{"a":1},{"b":}]', '{"quotes":[1,2]', '', '[1]]']) await assert.rejects(read(text, 3), SyntaxError, text);
});

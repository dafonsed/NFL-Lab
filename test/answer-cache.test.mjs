import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnswerCache } from '../lib/odds/providers.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));

test('a polled answer is served at once from the last result while the next is computed, and only an old one waits', async () => {
  let clock = 0, loads = 0, release;
  const cache = createAnswerCache({ freshMs: 2_000, staleMs: 60_000, now: () => clock });
  const load = () => { loads += 1; return `answer ${loads}`; };
  assert.equal(await cache('k', load), 'answer 1');
  clock = 1_000;
  assert.equal(await cache('k', load), 'answer 1', 'a fresh answer is not asked again');
  assert.equal(loads, 1);
  clock = 3_000;
  const slow = () => new Promise(resolve => { release = () => resolve('answer 2'); });
  assert.equal(await cache('k', slow), 'answer 1', 'an older one answers at once');
  assert.equal(await cache('k', slow), 'answer 1', 'one refresh at a time');
  release(); await settle(); await settle();
  assert.equal(await cache('k', load), 'answer 2');
  clock = 70_000;
  assert.equal(await cache('k', load), 'answer 2', 'past staleMs the request waits for a new answer');
  assert.equal(await cache('k', load), 'answer 2');
  clock = 140_000;
  assert.equal(await cache('k', () => 'answer 3'), 'answer 3');
});

test('a failed refresh keeps the last answer until it is too old; a first load that fails is the caller’s error', async () => {
  let clock = 0;
  const cache = createAnswerCache({ freshMs: 2_000, staleMs: 60_000, now: () => clock });
  await assert.rejects(cache('k', async () => { throw new Error('down'); }), /down/);
  assert.equal(await cache('k', () => 'good'), 'good');
  clock = 5_000;
  assert.equal(await cache('k', async () => { throw new Error('down'); }), 'good');
  await settle();
  clock = 61_000;
  await assert.rejects(cache('k', async () => { throw new Error('down'); }), /down/);
});

test('answers are bounded by count and total size, oldest first', async () => {
  const cache = createAnswerCache({ maxEntries: 2, maxChars: 1_000, now: () => 0 });
  await cache('a', () => 'a'.repeat(400));
  await cache('b', () => 'b'.repeat(400));
  await cache('c', () => 'c'.repeat(400));
  let reloaded = false;
  await cache('a', () => { reloaded = true; return 'a'; });
  assert.ok(reloaded, 'the oldest answer was evicted');
});

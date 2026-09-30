import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { artUrl, renderArt, sceneForText, SCENE_NAMES } from '../lib/editorial-art.mjs';
import { contentLibrary } from '../lib/content/registry.mjs';

test('every content record has its own illustration', async () => {
  const seen = new Map();
  for (const item of contentLibrary) {
    const [type, ...rest] = item.id.split(':');
    const key = `${type}--${rest.join(':')}`;
    const svg = await renderArt(key);
    assert.ok(svg?.startsWith('<svg'), `art for ${key}`);
    const hash = createHash('sha1').update(svg).digest('hex');
    assert.ok(!seen.has(hash), `${key} duplicates ${seen.get(hash)}`);
    seen.set(hash, key);
  }
});

test('calculators and tools use bespoke scenes, unknown keys return null', async () => {
  for (const item of contentLibrary.filter(entry => entry.type === 'calculator' || entry.type === 'tool')) {
    const svg = await renderArt(`${item.type}--${item.id.split(':')[1]}`);
    assert.doesNotMatch(svg, /url\(#tl\)|LOGGED/, `${item.id} should not fall back to a generic scene`);
  }
  assert.equal(await renderArt('guide--no-such-guide'), null);
  assert.equal(await renderArt('../etc/passwd'), null);
  assert.equal(artUrl('state', 'new-york'), '/art/state--new-york.svg?v=2');
});

test('topic scenes follow the words in a title', () => {
  assert.equal(sceneForText('How to hedge a bet'), 'arbitrage');
  assert.equal(sceneForText('Same game parlay basics'), 'ticket');
  assert.equal(sceneForText('Sport catalog /odds-api/sport-catalog').length > 0, true);
  assert.ok(SCENE_NAMES.includes(sceneForText('Something unrelated entirely')));
});

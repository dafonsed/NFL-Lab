import test from 'node:test';
import assert from 'node:assert/strict';
import { availabilityLabel, availabilityNote, baseballSituation, movementText, withheldSummary } from '../public/presentation.js';
test('baseball situation labels provider balls and strikes without swapping or repairing them', () => {
  assert.equal(baseballSituation({half:'Bottom',inning:12,outs:1,balls:2,strikes:3}), 'Bottom 12 · 1 out · Balls 2 · Strikes 3 · Provider transition state');
  assert.equal(baseballSituation({half:'Top',inning:2,outs:0,balls:0,strikes:0}), 'Top 2 · 0 outs · Balls 0 · Strikes 0');
  assert.match(baseballSituation({inning:3}), /Outs unavailable · Balls — · Strikes —/);
});
test('missing historical availability never implies a healthy or active player', () => {
  for (const status of ['Historical status unavailable', 'historical_unavailable', 'Historical report unavailable']) {
    assert.equal(availabilityLabel(status), 'Past injury / lineup status not archived');
    assert.match(availabilityNote({status}), /not archived/);
    assert.doesNotMatch(availabilityNote({status}), /No absence is listed/);
  }
  assert.match(availabilityNote({status:'unavailable'}), /not available/);
  assert.match(availabilityNote({status:'Active'}), /No absence is listed/);
  assert.match(availabilityNote({status:'Out',unavailable:true}), /reported unavailable/);
  assert.equal(withheldSummary(['Missing input.', 'Extra innings are not modeled.']), 'Extra innings are not modeled.');
});
test('unavailable status describes availability, and movement distinguishes zero from missing', () => {
  assert.equal(availabilityLabel('Historical status unavailable'), 'Past injury / lineup status not archived');
  assert.equal(availabilityLabel('Questionable'), 'Questionable');
  assert.equal(movementText(null), '—');
  assert.equal(movementText(0), '0.0');
  assert.equal(movementText(1.5), '+1.5');
  assert.equal(movementText(-2), '-2.0');
});

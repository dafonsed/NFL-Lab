import test from 'node:test';
import assert from 'node:assert/strict';
import { impliedProbability, probabilityToOdds, buildLineSeries, valueAt, rangeWindow, clipSeries, observedCount, averageLine, oddsScale, stepPath, spreadLabels, timeTicks, timeLabel, defaultBooks, initialRange, LINE_HISTORY_RANGES } from '../public/line-history.js';
import { renderEvBoardDetail } from '../public/ev-board.js';

const H = 3_600_000, now = Date.UTC(2026, 8, 28, 16);
const iso = ms => new Date(ms).toISOString();

test('odds and implied probability round-trip, rejecting invalid American prices', () => {
  assert.equal(impliedProbability(100), .5);
  assert.equal(impliedProbability(-110).toFixed(4), '0.5238');
  assert.ok(Number.isNaN(impliedProbability(50)));
  assert.ok(Number.isNaN(impliedProbability('x')));
  for (const odds of [-250, -110, -100, 120, 450]) assert.equal(probabilityToOdds(impliedProbability(odds)), odds === 100 ? -100 : odds);
  assert.ok(Number.isNaN(probabilityToOdds(0)));
});

test('buildLineSeries groups by book, sorts by time, collapses repeats and follows the book order', () => {
  const series = buildLineSeries([
    { book:'DraftKings', ts:iso(now - H), odds:-110, line:47.5 },
    { book:'FanDuel', ts:iso(now), odds:-105, line:47.5 },
    { book:'FanDuel', ts:iso(now - 2 * H), odds:-115, line:47.5 },
    { book:'FanDuel', ts:iso(now - H), odds:-115, line:47.5 },
    { book:'FanDuel', ts:iso(now - H / 2), odds:-108, line:47.5 },
    { book:'FanDuel', ts:iso(now - H / 2), odds:-107, line:47.5 },
    { book:'BetMGM', ts:'not a date', odds:-110 },
    { book:'Caesars', ts:iso(now), odds:20 }
  ], ['FanDuel', 'DraftKings']);
  assert.deepEqual(series.map(item => item.book), ['FanDuel', 'DraftKings']);
  assert.deepEqual(series[0].points.map(point => point.odds), [-115, -107, -105]);
  assert.deepEqual(series[0].points.map(point => point.ts), [now - 2 * H, now - H / 2, now]);
});

test('clipSeries carries the last earlier price to the left edge and forward-fills to now', () => {
  const points = [{ ts:now - 10 * H, odds:-120 }, { ts:now - 2 * H, odds:-110 }, { ts:now - H, odds:-105 }];
  const { start, end } = rangeWindow([{ points }], '6h', now);
  assert.equal(end - start, 6 * H);
  const clipped = clipSeries(points, start, end);
  assert.deepEqual(clipped.map(point => [point.ts, point.odds, Boolean(point.carried)]), [[start, -120, true], [now - 2 * H, -110, false], [now - H, -105, false], [end, -105, true]]);
  assert.equal(observedCount(clipped), 2);
  assert.deepEqual(clipSeries(points, now - 30 * 60_000, now).map(point => point.odds), [-105, -105]);
  assert.equal(observedCount(clipSeries(points, now - 30 * 60_000, now)), 0);
  assert.deepEqual(clipSeries([{ ts:now + H, odds:100 }], start, end), []);
  assert.equal(valueAt(points, now - 1.5 * H).odds, -110);
  assert.equal(valueAt(points, now - 11 * H), undefined);
});

test('the "All" range starts at the earliest point and the initial range widens until it has data', () => {
  const series = [{ book:'A', points:[{ ts:now - 3 * 24 * H, odds:100 }, { ts:now - 2 * 24 * H, odds:110 }] }];
  assert.deepEqual(rangeWindow(series, 'all', now), { start:now - 3 * 24 * H, end:now });
  assert.equal(initialRange(series, now), '7d');
  assert.equal(initialRange([{ book:'A', points:[{ ts:now - H / 2, odds:100 }] }], now), '24h');
  assert.deepEqual(LINE_HISTORY_RANGES.map(item => item.label), ['1 hour', '6 hours', '24 hours', '7 days', 'All']);
});

test('averageLine averages implied probability of started books at every change', () => {
  const a = [{ ts:0, odds:100 }, { ts:10, odds:100 }], b = [{ ts:5, odds:-150 }, { ts:10, odds:-150 }];
  const average = averageLine([a, b]);
  assert.deepEqual(average.map(point => point.ts), [0, 5, 10]);
  assert.equal(average[0].odds, -100);
  assert.equal(average[1].odds, probabilityToOdds((.5 + .6) / 2));
  assert.deepEqual(averageLine([a]), []);
});

test('oddsScale puts better prices higher and produces rounded ticks inside the domain', () => {
  const scale = oddsScale([-120, -110, 105, 130], { top:0, bottom:300 });
  assert.ok(scale.y(130) < scale.y(105) && scale.y(105) < scale.y(-110) && scale.y(-110) < scale.y(-120));
  assert.ok(scale.ticks.length >= 3);
  for (const tick of scale.ticks) {
    assert.ok(Math.abs(tick.odds) >= 100 && tick.y >= 0 && tick.y <= 300);
    assert.equal(Math.abs(tick.odds % 5), 0);
  }
  const ys = scale.ticks.map(tick => tick.y);
  assert.deepEqual(ys, [...ys].sort((a, b) => a - b));
  const flat = oddsScale([-110, -110], { top:10, bottom:110 });
  assert.ok(Number.isFinite(flat.y(-110)) && flat.y(-110) > 10 && flat.y(-110) < 110);
});

test('stepPath draws horizontal-then-vertical segments and skips unchanged prices', () => {
  const path = stepPath([{ ts:0, odds:1 }, { ts:10, odds:2 }, { ts:20, odds:2 }], t => t, odds => odds * 10);
  assert.equal(path, 'M0,10H10V20H20');
  assert.equal(stepPath([], t => t, v => v), '');
});

test('spreadLabels keeps order, enforces the gap and stays within bounds', () => {
  assert.deepEqual(spreadLabels([50, 52, 200], 20, 0, 300), [50, 70, 200]);
  assert.deepEqual(spreadLabels([295, 290], 20, 0, 300), [300, 280]);
  const crowded = spreadLabels([5, 5, 5, 5], 20, 0, 30);
  assert.ok(crowded.every(y => y >= 0 && y <= 30));
  assert.deepEqual(crowded, [...crowded].sort((a, b) => a - b));
});

test('time ticks land on round local times and labels match the span', () => {
  const start = new Date(2026, 7, 18, 8, 29).getTime(), end = start + 6 * H;
  const ticks = timeTicks(start, end, 6);
  assert.ok(ticks.length >= 3 && ticks.length <= 7);
  assert.ok(ticks.every(t => t >= start && t <= end && new Date(t).getMinutes() === 0));
  assert.equal(timeLabel(start, 6 * H), '8:29am');
  assert.equal(timeLabel(new Date(2026, 7, 18, 13, 5).getTime(), H), '1:05pm');
  assert.equal(timeLabel(start, 7 * 24 * H), 'Aug 18');
});

test('defaultBooks picks the best current prices and always includes the preferred book', () => {
  const series = ['A', 'B', 'C', 'D'].map((book, i) => ({ book, points:[{ ts:0, odds:[-120, 110, -105, 130][i] }] }));
  assert.deepEqual([...defaultBooks(series, '', 2)], ['D', 'B']);
  assert.deepEqual([...defaultBooks(series, 'A', 2)], ['D', 'A']);
});

test('the Positive EV panel history tool opens the Line History modal', () => {
  const model = { columns:[{ name:'FanDuel' }], rows:[{ side:'Over', selection:'Over 47.5', average:'+140', prices:[{ raw:140, value:'+140', best:true }] }] };
  const quote = { id:'q"1', sport:'NFL', event:'A vs B', market:'Game total', line:47.5, side:'Over', book:'FanDuel', odds:140, live:false, ts:new Date().toISOString() };
  const html = renderEvBoardDetail({ live:false, oddsLabel:String, flags:() => ({}), detail:() => model }, quote, .45);
  assert.match(html, /data-line-history="q&quot;1" aria-haspopup="dialog"/);
  assert.doesNotMatch(html, /data-suite-action="history"/);
});

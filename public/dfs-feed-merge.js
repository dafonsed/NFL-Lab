import { canonicalPlatform } from './platform-catalog.js?v=2';

const marketToken = value => String(value ?? '').toLowerCase()
  .replace(/^(?:nfl|nba|wnba|nhl|mlb|ncaaf|ncaab)_player_/, '')
  .replace(/[_+]+/g, ' ')
  .replace(/[^a-z0-9. ]+/g, ' ')
  .replace(/\s+/g, ' ').trim();

export const dfsMergeKey = item => [
  canonicalPlatform(item.app),
  String(item.player ?? '').trim().toLowerCase(),
  marketToken(item.market),
  Number(item.line),
  String(item.side ?? '').toLowerCase().includes('under') ? 'under' : 'over',
  String(item.sport ?? '').toUpperCase(),
  String(item.startTime ?? '').slice(0, 10),
].join('|');

export function mergeDfsFeed(primary = [], relay = []) {
  const rows = [...primary], keys = new Map(rows.map((item, index) => [dfsMergeKey(item), index]));
  for (const item of relay) {
    const key = dfsMergeKey(item), prior = keys.get(key);
    if (prior === undefined) {
      keys.set(key, rows.length);
      rows.push(item);
    } else if (rows[prior].probability == null && item.probability != null) {
      rows[prior] = { ...item, ...rows[prior], probability: item.probability,
        bookLines: rows[prior].bookLines?.length ? rows[prior].bookLines : item.bookLines,
        probabilityBooks: rows[prior].probabilityBooks?.length ? rows[prior].probabilityBooks : item.probabilityBooks };
    }
  }
  return rows;
}

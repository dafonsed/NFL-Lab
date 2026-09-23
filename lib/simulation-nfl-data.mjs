// Read existing raw bytes without changing Provider's standard-model columns.
import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { parse } from 'csv-parse/sync';
import { createHash } from 'node:crypto';
import { nflRegulationIndex } from './simulation-history.mjs';

const columns = new Set(['game_id', 'play_id', 'qtr', 'quarter_seconds_remaining', 'total_home_score', 'total_away_score']);
const cache = new Map();
export async function readNflRegulation(dir, seasons) {
  const index = new Map(), sources = [], missing = [];
  for (const year of [...new Set(seasons)].sort()) {
    const file = path.join(dir, 'raw', `play_by_play_${year}.csv.gz`);
    try {
      const bytes = await fs.readFile(file), sha256 = createHash('sha256').update(bytes).digest('hex');
      let parsed = cache.get(sha256);
      if (!parsed) {
        parsed = nflRegulationIndex(parse(gunzipSync(bytes), { columns: hs => hs.map(h => columns.has(h) ? h : false), skip_empty_lines: true }));
        cache.set(sha256, parsed); if (cache.size > 8) cache.delete(cache.keys().next().value);
      }
      for (const [id, scores] of parsed) index.set(id, scores);
      let meta = {}; try { meta = JSON.parse(await fs.readFile(file + '.meta.json', 'utf8')); } catch {}
      sources.push({ url: meta.url || `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${year}.csv.gz`,
        sha256, fetchedAt: meta.sha256 === sha256 ? meta.fetchedAt : null, localFile: `raw/play_by_play_${year}.csv.gz`, publicationTiming: 'retrospective; not a pregame snapshot' });
    } catch (e) { missing.push({ season: year, reason: e.code === 'ENOENT' ? 'raw play-by-play missing' : 'raw play-by-play unreadable' }); }
  }
  return { index, sources, missing };
}

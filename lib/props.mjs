import { quotePrices, postedLine } from './paper.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import { DATA_DIR } from './providers.mjs';
import { PUBLIC_MARKETS, normalizePlayer } from './markets.mjs';
import { gradeResult } from './results.mjs';

export const PUBLIC_BOARD = 'https://www.scoresandodds.com';
// Anonymous endpoint used by the public "Odds Compare" table. No API key,
// logged-in session, paid projections, or sportsbook account is used.
export const COMPARISON_API = 'https://rga51lus77.execute-api.us-east-1.amazonaws.com/prod/market-comparison';
const BOOK_ORDER = ['fanduel', 'draftkings', 'betmgm', 'caesars', 'fanatics', 'bet365'];
// Stats counted in small whole numbers, where one more moves the Over chance a lot (see postedLine).
const COUNT_MARKETS = new Set(['any_td', 'pass_tds', 'rush_attempts', 'rec', 'pass_attempts', 'pass_completions', 'pass_interceptions']);
const TEAM_SLUGS = { cardinals:'ARI', falcons:'ATL', ravens:'BAL', bills:'BUF', panthers:'CAR', bears:'CHI', bengals:'CIN', browns:'CLE', cowboys:'DAL', broncos:'DEN', lions:'DET', packers:'GB', texans:'HOU', colts:'IND', jaguars:'JAX', chiefs:'KC', raiders:'LV', chargers:'LAC', rams:'LA', dolphins:'MIA', vikings:'MIN', patriots:'NE', saints:'NO', giants:'NYG', jets:'NYJ', eagles:'PHI', steelers:'PIT', '49ers':'SF', seahawks:'SEA', buccaneers:'TB', titans:'TEN', commanders:'WAS', redskins:'WAS' };
const team = t => ({ JAC: 'JAX', WSH: 'WAS', LAR: 'LA', OAK: 'LV', SD: 'LAC' }[String(t).toUpperCase()] || String(t || '').toUpperCase());
const numeric = n => n !== '' && n !== null && n !== undefined && Number.isFinite(Number(n)) ? Number(n) : null;
const sha = value => createHash('sha256').update(value).digest('hex');
const easternDate = value => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));

export function weekURL(season, week, games = []) {
  const post = games[0]?.game_type && games[0].game_type !== 'REG';
  const playoff = { WC: 1, DIV: 2, CON: 3, SB: 4 }[games[0]?.game_type];
  return `${PUBLIC_BOARD}/nfl?week=${season}-${post ? 'post' : 'reg'}-${playoff || week}`;
}

export function parseSchedule(html) {
  const $ = load(html), events = [];
  $('tr.event-card-header[data-content]').each((_, header) => {
    const root = $(header).closest('table'), id = $(header).attr('data-content');
    const commenceTime = $(header).find('[data-role="localtime"][data-value]').attr('data-value');
    const sideTeam = side => {
      const row = root.find(`tr[data-side="${side}"]`);
      const slug = row.find('.team-name a[href]').first().attr('href')?.split('/').pop();
      if (TEAM_SLUGS[slug]) return TEAM_SLUGS[slug];
      const logo = row.find('img[data-src]').first().attr('data-src') || row.find('img').first().attr('src') || '';
      return team(logo.match(/\/([a-z]{2,3})\.png(?:\?|$)/i)?.[1]);
    };
    if (!/^nfl\/\d+$/.test(id || '') || !Number.isFinite(Date.parse(commenceTime))) return;
    const state = $(header).find('[data-field="state"]').first().text().trim();
    const home = sideTeam('home'), away = sideTeam('away');
    if (home && away) events.push({ id, home, away, commenceTime, state });
  });
  return [...new Map(events.map(e => [e.id, e])).values()];
}

export function matchEvent(game, events) {
  const matches = events.filter(e => e.home === team(game.home_team) && e.away === team(game.away_team) && easternDate(e.commenceTime) === game.gameday);
  return matches.length === 1 ? matches[0] : null;
}

export function parseQuotes(payload, event, market, fetchedAt, sourceUrl, rawHash) {
  if (team(payload.event?.home?.key) !== event.home || team(payload.event?.away?.key) !== event.away) throw Error('Public prop feed returned a different matchup.');
  if (!Array.isArray(payload.markets)) throw Error('Public prop table format changed.');
  const quotes = [];
  for (const row of payload.markets) {
    // Only regulation/full-game totals, never quarter/half/alternate markets.
    const parts = String(row.id || '').split('.');
    if (parts[0] !== 'nfl' || parts[1] !== event.id.split('/')[1] || parts[2] !== '0' || row.stat !== PUBLIC_MARKETS[market]) continue;
    const player = [row.player?.first_name, row.player?.last_name].filter(Boolean).join(' ');
    const playerTeam = team(row.player?.team?.key);
    if (!player || ![event.home, event.away].includes(playerTeam)) continue;
    const completed = /FINAL|POSTGAME/i.test(event.state), entries = [];
    for (const book of BOOK_ORDER) {
      const data = row.comparison?.[book], descriptor = payload.books?.[book];
      if (!data || !descriptor || (!completed && data.available !== true)) continue;
      const line = numeric(data.value);
      if (line === null || (market === 'any_td' && line !== 0.5)) continue;
      // Never substitute a DFS pick'em platform for a sportsbook total.
      if (descriptor.states?.length && !descriptor.states.includes('AZ')) continue;
      entries.push({ book, descriptor, line, value: data });
    }
    // The line the books agree on, not whichever book comes first (see postedLine).
    const chosen = postedLine(entries, { discrete: COUNT_MARKETS.has(market) });
    if (!chosen) continue;
    const before = Date.parse(fetchedAt) < Date.parse(event.commenceTime);
    quotes.push({ player, nameKey: normalizePlayer(player), team: playerTeam, market, line: chosen.line, prices:quotePrices(chosen.value), bookmaker: chosen.descriptor.name || chosen.book, bookKey: chosen.book, lineBooks: chosen.books, source: 'ScoresAndOdds public comparison', sourceUrl, rawHash, eventId: event.id, commenceTime: event.commenceTime, fetchedAt, basis: before ? 'captured_pregame' : completed ? 'published_archive' : 'in_play', jurisdiction: 'AZ', jurisdictionVerified: false });
  }
  // Ambiguous duplicate player/market rows must never silently select a line.
  const keys = quotes.map(q => `${q.team}:${q.nameKey}`);
  return quotes.filter((q, i) => keys.indexOf(keys[i]) === keys.lastIndexOf(keys[i]));
}

export class PropStore {
  constructor({ dir = DATA_DIR, fetcher = fetch, now = () => Date.now() } = {}) {
    this.dir = path.join(dir, 'public-props'); this.fetcher = fetcher; this.now = now;
    this.pending = new Map(); this.memory = new Map(); this.saving = new Map(); this.limit = 0; this.queue = []; this.offlineUntil = 0;
  }
  async limited(task) {
    if (this.limit >= 3) await new Promise(resolve => this.queue.push(resolve));
    this.limit++;
    try { return await task(); }
    finally { this.limit--; this.queue.shift()?.(); }
  }
  async read(url, ttl, force = false) {
    if (this.pending.has(url)) return this.pending.get(url);
    const task = this._read(url, ttl, force).finally(() => this.pending.delete(url));
    this.pending.set(url, task); return task;
  }
  async _read(url, ttl, force) {
    const file = path.join(this.dir, sha(url) + '.json');
    let saved = this.memory.get(url);
    if (!saved) { try { saved = JSON.parse(await fs.readFile(file, 'utf8')); } catch {} }
    // Repeated clicks never hammer the public site, including forced refreshes.
    if (saved && this.now() - Date.parse(saved.checkedAt) < (force ? 60_000 : ttl)) return saved;
    try {
      const fresh = await this.limited(async () => {
        if (this.now() < this.offlineUntil) throw Error('Public prop source temporarily unavailable. Retaining saved lines.');
        let r;
        try { r = await this.fetcher(url, { signal: AbortSignal.timeout(8000), headers: { Accept: url.startsWith(COMPARISON_API) ? 'application/json' : 'text/html' } }); }
        catch { this.offlineUntil = this.now() + 60_000; throw Error('Public prop source could not be reached.'); }
        if ([403,429].includes(r.status)) this.offlineUntil = this.now() + 60_000;
        if (!r.ok) throw Error(`Public prop source returned HTTP ${r.status}.`);
        const text = await r.text();
        if (text.length > 8_000_000) throw Error('Unexpectedly large public prop response.');
        const payload = url.startsWith(COMPARISON_API) ? JSON.parse(text) : parseSchedule(text);
        if (url.startsWith(COMPARISON_API) ? !Array.isArray(payload.markets) : !payload.length) throw Error('Public prop source has no readable board yet.');
        return { url, payload, fetchedAt: new Date(this.now()).toISOString(), checkedAt: new Date(this.now()).toISOString(), sha256: sha(text), stale: false };
      });
      await fs.mkdir(this.dir, { recursive: true });
      await fs.writeFile(file + '.tmp', JSON.stringify(fresh)); await fs.rename(file + '.tmp', file);
      this.memory.set(url, fresh); return fresh;
    } catch (error) {
      if (saved) { const fallback = { ...saved, stale: true, error: error.message, checkedAt: new Date(this.now()).toISOString() }; this.memory.set(url, fallback); return fallback; }
      throw error;
    }
  }
  async preserve(gameId, market, quotes) {
    const key = gameId + ':' + market;
    const task = (this.saving.get(key) || Promise.resolve()).catch(() => {}).then(() => this._preserve(gameId, market, quotes));
    this.saving.set(key, task);
    try { return await task; } finally { if (this.saving.get(key) === task) this.saving.delete(key); }
  }
  async _preserve(gameId, market, quotes) {
    const file = path.join(this.dir, `archive-${sha(gameId + ':' + market)}.json`);
    let saved = {};
    try { saved = JSON.parse(await fs.readFile(file, 'utf8')); } catch {}
    for (const q of quotes) {
      const key = q.team + ':' + q.nameKey, old = saved[key];
      // Keep the last independently captured pregame line for future grading.
      // An archive fetched after kickoff must not overwrite that evidence.
      const newer = !old || Date.parse(q.fetchedAt) >= Date.parse(old.fetchedAt);
      if (!old || q.basis === 'captured_pregame' && (old.basis !== 'captured_pregame' || newer) || old.basis !== 'captured_pregame' && newer) saved[key] = q;
    }
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(file + '.tmp', JSON.stringify(saved)); await fs.rename(file + '.tmp', file);
    return Object.values(saved);
  }
  async archived(gameId, market) {
    try { return Object.values(JSON.parse(await fs.readFile(path.join(this.dir, `archive-${sha(gameId + ':' + market)}.json`), 'utf8'))); } catch { return []; }
  }
  async enrich(players, games, { season, week, market, force = false }) {
    const errors = [], url = weekURL(season, week, games), quotesByGame = new Map();
    let board;
    try { board = await this.read(url, 30 * 60_000, force); if (board.stale) errors.push(board.error); } catch (e) { errors.push(e.message); }
    await Promise.all(games.map(async game => {
      const event = board && matchEvent(game, board.payload);
      try {
        if (!event) { quotesByGame.set(game.game_id, (await this.archived(game.game_id, market)).map(q => ({ ...q, stale: true }))); return; }
        const query = new URLSearchParams({ event: event.id, market: PUBLIC_MARKETS[market] });
        const response = await this.read(`${COMPARISON_API}?${query}`, /FINAL|POSTGAME/i.test(event.state) ? 24 * 60 * 60_000 : 30 * 60_000, force);
        if (response.stale) errors.push(response.error);
        const quotes = parseQuotes(response.payload, event, market, response.fetchedAt, url, response.sha256).map(q => ({ ...q, stale: response.stale, gameId: game.game_id, sourceEventUrl: `${PUBLIC_BOARD}/nfl/events/${event.id.split('/')[1]}/details` }));
        const retained = await this.preserve(game.game_id, market, quotes);
        quotesByGame.set(game.game_id, retained.map(q => ({ ...q, stale: response.stale || board.stale || !quotes.some(current => current.nameKey === q.nameKey && current.team === q.team) })));
      } catch (e) { errors.push(e.message); quotesByGame.set(game.game_id, (await this.archived(game.game_id, market)).map(q => ({ ...q, stale: true }))); }
    }));
    for (const p of players) {
      const key = normalizePlayer(p.player), eventPlayers = players.filter(x => x.gameId === p.gameId && team(x.team) === team(p.team) && normalizePlayer(x.player) === key);
      const matching = (quotesByGame.get(p.gameId) || []).filter(q => q.nameKey === key && team(q.team) === team(p.team));
      p.prop = eventPlayers.length === 1 && matching.length === 1 ? matching[0] : null;
      p.result = gradeResult(p.result, p.prop, market);
    }
    const withLine = players.filter(p => p.prop).length;
    return { source: 'ScoresAndOdds', sourceUrl: url, preferredBook: 'FanDuel', region: 'Arizona', regionNote: 'Arizona is the preferred region. Public comparison lines are US listings; a state-specific price is not independently verified.', withLine, fanDuel: players.filter(p => p.prop?.bookKey === 'fanduel').length, total: players.length, stale: !!errors.length, warnings: [...new Set(errors)], note: 'FanDuel first; another named sportsbook is used only when FanDuel has no posted line. Historical results compare official stats with the saved pregame line or the clearly labeled public archive.' };
  }
}

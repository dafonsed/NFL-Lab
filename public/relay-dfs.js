// SmartStake's DFS relay adapter: fetches both boards, joins exact sportsbook lines, and prices
// the relayed pick'em data before the display layer sees it. Display modules remain formula-free.
import { decimal, decimalToAmerican, devig, probabilityToAmerican, DEVIG_METHODS } from './betting-math.js';
import { EXCHANGE_PLATFORMS, SPORTSBOOK_PRICE_FAMILIES, canonicalPlatform, isFantasyPlatform } from './platform-catalog.js?v=2';
import { getSmartstakeDataset } from './odds-client.js';

const stableRelayKey = value => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};
const relayDecimalToAmerican = value => {
  const odds = decimalToAmerican(value);
  return Number.isFinite(odds) ? odds : 0;
};
const RELAY_SPORT_NAME_TO_CODE = { football: 'NFL', basketball: 'NBA', hockey: 'NHL', baseball: 'MLB', soccer: 'SOCCER', tennis: 'TENNIS' };
const relaySportOf = record => {
  const league = String(record.league || '').toLowerCase();
  if (league && league !== 'none' && league !== 'other') return league.toUpperCase();
  const sport = String(record.sport || '').toLowerCase();
  if (sport && sport !== 'other' && RELAY_SPORT_NAME_TO_CODE[sport]) return RELAY_SPORT_NAME_TO_CODE[sport];
  if (sport && sport !== 'other' && ['nfl','nba','wnba','nhl','mlb','soccer','ncaaf','ncaab'].includes(sport)) return sport.toUpperCase();
  const market = String(record.market || '').toLowerCase();
  if (market.startsWith('football')) return 'NFL';
  if (market.startsWith('basketball')) return 'NBA';
  if (market.startsWith('hockey')) return 'NHL';
  if (market.startsWith('baseball')) return 'MLB';
  if (market.startsWith('soccer')) return 'SOCCER';
  return '';
};

export async function getRelayDfsData({ sport, devigMethod = 'multiplicative' }) {
  // Both relay boards are fetched uncut. The source orders fantasy-main-lines by book, not prop:
  // limit=5000 once left the NFL join with only 27 of 140 player props and no prices for the rest.
  const [fantasyBody, linesBody] = await Promise.all([
    getSmartstakeDataset('fantasy', { sport }),
    getSmartstakeDataset('fantasy-main-lines', { sport }).catch(() => ({ records: [] })),
  ]);
  const fantasyRecords = Array.isArray(fantasyBody.records) ? fantasyBody.records : [];
  const lineRecords = Array.isArray(linesBody.records) ? linesBody.records : [];
  const observed = [
    ...fantasyRecords.map(record => Number(record.timestamp)).filter(Number.isFinite),
    ...lineRecords.map(record => Date.parse(record.observedAt) || Number(record.timestamp)).filter(Number.isFinite),
  ].sort((left,right) => right-left)[0] || Date.now();
  const method = DEVIG_METHODS.includes(devigMethod) ? devigMethod : 'multiplicative';
  const relayBookWeights = {
    pinnacle: 100, circa: 100, 'circa sports': 100,
    sporttrade: 50, novig: 50, prophetx: 50, '4caster': 50, fanduel: 50, betonline: 50, bookmaker: 50,
    draftkings: 25, betmgm: 25, caesars: 25, betano: 25, propbuilder: 50,
  };
  const familyRoot = new Map();
  for (const group of SPORTSBOOK_PRICE_FAMILIES) {
    const root = group[0].toLowerCase();
    for (const name of group) familyRoot.set(name.toLowerCase(), root);
  }
  // Exact player/stat/line records per canonical sportsbook. DFS apps in this dataset are not
  // sportsbook opinions; clone skins are deduplicated only while building the consensus.
  const exactMarkets = new Map();
  for (const record of lineRecords) {
    const book = canonicalPlatform(record.bookmaker);
    const middleKey = String(record.middleKey || '');
    const line = Number(record.selectionPoints);
    const odds = Number(record.odds);
    const side = String(record.selectionLine || '').toLowerCase();
    const timestamp = Number(record.timestamp) || 0;
    if (!middleKey || !Number.isFinite(line) || !['over','under'].includes(side) || !(odds > 1) || !book || isFantasyPlatform(canonicalPlatform(book))) continue;
    const key = [middleKey,line].join('\u0000');
    if (!exactMarkets.has(key)) exactMarkets.set(key, new Map());
    const markets = exactMarkets.get(key), prior = markets.get(book) || { book };
    if (!prior[side] || timestamp >= (prior[side].timestamp || 0)) prior[side] = { american: relayDecimalToAmerican(odds), decimal: odds, probability: 1 / odds, timestamp };
    markets.set(book, prior);
  }
  const relayBookLines = (middleKey, line) => [...(exactMarkets.get([middleKey,line].join('\u0000')) || new Map()).values()];
  const consensusFor = (middleKey, line, side) => {
    const exchangeBooks = new Set(EXCHANGE_PLATFORMS.map(name => name.toLowerCase()));
    const valid = relayBookLines(middleKey,line)
      .map(book => ({...book, family: familyRoot.get(book.book.toLowerCase()) || book.book.toLowerCase()}))
      .filter(book => book.over && book.under && Number.isFinite(book.over.probability) && Number.isFinite(book.under.probability))
      .filter(book => {
        const vig = book.over.probability + book.under.probability;
        return exchangeBooks.has(book.book.toLowerCase()) ? vig >= .98 : vig > 1.005 && vig <= 1.06;
      })
      .map(book => ({...book, fairOver: devig([book.over.probability,book.under.probability],method)[0]}))
      .filter(book => Number.isFinite(book.fairOver));
    const families = new Map();
    for (const book of valid) {
      if (!families.has(book.family)) families.set(book.family, []);
      families.get(book.family).push(book);
    }
    const weight = book => {
      const rawWeight = relayBookWeights[book.book.toLowerCase()] ?? 0;
      const vig = book.over.probability + book.under.probability;
      return vig * 100 <= 6 ? rawWeight : Math.min(rawWeight,50);
    };
    let total = 0, sum = 0;
    for (const group of families.values()) {
      const each = Math.max(...group.map(weight));
      total += each;
      sum += each * group.reduce((value,book) => value + book.fairOver,0) / group.length;
    }
    const over = families.size >= 1 && total > 0 ? sum / total : NaN;
    return { probability: Number.isFinite(over) ? (side === 'under' ? 1-over : over) : null,
      books: valid.map(book => book.book), families: [...families.keys()] };
  };
  const picks = fantasyRecords.map(record => {
    const marketLabel = String(record.market || record.marketSlug || '').replace(/_/g,' ').replace(/\b\w+/g,word => word.charAt(0).toUpperCase()+word.slice(1));
    const marketSlug = String(record.marketSlug || record.market || '');
    const playerName = String(record.playerName || '');
    const sportCode = relaySportOf({ sport: record.sport, league: record.league, market: marketSlug });
    const event = record.awayCompetitor && record.homeCompetitor ? `${record.awayCompetitor} @ ${record.homeCompetitor}` : '';
    const startTime = Date.parse(record.startDate) > 0 ? new Date(record.startDate).toISOString() : '';
    const middleKey = String(record.middleKey || '');
    const line = Number(record.selectionPoints) || 0;
    const side = String(record.selectionLine || 'over').toLowerCase();
    const bookLines = relayBookLines(middleKey,line).map(book => ({
      book: book.book,
      ...(book.over ? { over: book.over.american } : {}),
      ...(book.under ? { under: book.under.american } : {}),
      ...(EXCHANGE_PLATFORMS.includes(book.book) ? { exchange: true } : {}),
    }));
    const consensus = consensusFor(middleKey,line,side);
    const sharpOdds = record.sharpOdds && typeof record.sharpOdds === 'object'
      ? ['over','under'].map(each => Number(record.sharpOdds[each])) : [];
    const sharpProbabilities = sharpOdds.length === 2 && sharpOdds.every(odds => odds > 1) ? sharpOdds.map(odds => 1/odds) : [];
    const sharpFair = devig(sharpProbabilities,method);
    const sourceProbability = Number(record.trueProbability);
    const probability = sharpFair.length === 2 && sharpFair[side === 'under' ? 1 : 0] > 0
      ? sharpFair[side === 'under' ? 1 : 0]
      : consensus.probability ?? (sourceProbability > 0 && sourceProbability < 1 ? sourceProbability : null);
    const customDfsOdds = Number(record.odds) > 1 ? relayDecimalToAmerican(Number(record.odds)) : null;
    const calculatedEv = probability != null && customDfsOdds != null ? probability * decimal(customDfsOdds) - 1 : null;
    const partGame = /\b(?:1st|first|2nd|second) (?:quarter|half)\b/i.test(marketLabel);
    return {
      id: `relay-dfs:${stableRelayKey([record.selectionKey || middleKey + line + record.selectionLine, record.bookmaker].join('|'))}`,
      app: canonicalPlatform(record.bookmaker || record.fantasyBook || ''), player: playerName, market: marketLabel,
      line, side,
      event, sport: sportCode.toUpperCase(), league: String(record.league || sportCode).toUpperCase(), matchSport: sportCode,
      startTime, ts: new Date(observed).toISOString(), source: 'local-api',
      odds: (() => {
        const selectedSharp = Number(record.sharpOdds?.[side]);
        if (selectedSharp > 1) return relayDecimalToAmerican(selectedSharp);
        if (customDfsOdds != null) return customDfsOdds;
        return probability != null ? probabilityToAmerican(probability) : NaN;
      })(),
      dfsOdds: customDfsOdds, customOdds: customDfsOdds != null,
      customEv: Number.isFinite(calculatedEv) ? calculatedEv : customDfsOdds != null && Number.isFinite(Number(record.ev)) ? Number(record.ev) : null,
      probability, fairOdds: probability != null && probability > 0 && probability < 1 ? probabilityToAmerican(probability) : null,
      probabilityBooks: consensus.books, probabilityMethod: method, probabilitySource: sharpFair.length === 2 ? 'smartstake-sharp' : consensus.probability != null ? 'sportsbook-consensus' : 'smartstake',
      type: 'prop', alt: Boolean(record.isAlt), url: record.url || '',
      bookLines,
      eventId: `relay:${record.matchKey || ''}`,
      period: partGame ? 'part' : 'full', live: false, exchange: false, team: record.selectionCompetitor || '',
    };
  }).filter(pick => pick.app && pick.player && pick.market && pick.line > 0);
  return { picks, generatedAt: new Date(observed).toISOString() };
}

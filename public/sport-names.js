// Sport and market names as the odds feed's normalization (lib/odds/normalize.mjs) writes them, and as
// the +EV pages read them from a URL or menu. Names only, no betting math.

const MAJOR = { NFL: 'NFL', MLB: 'MLB', NBA: 'NBA', WNBA: 'WNBA', NHL: 'NHL', SOCCER: 'Soccer' };
// `americanfootball` holds Central American soccer clubs in today's feed, so it is not relabeled
// as football; `other` and `unknown` carry no usable sport.
// Soccer league codes become Soccer, with the league kept (see SOCCER_LEAGUES).
export const SOCCER_LEAGUES = { epl: 'EPL', mls: 'MLS', nwsl: 'NWSL', laliga: 'La Liga', seriea: 'Serie A', bundesliga: 'Bundesliga', ligue1: 'Ligue 1', ucl: 'Champions League', uel: 'Europa League' };
const SPORT_NAMES = { ...Object.fromEntries(Object.keys(SOCCER_LEAGUES).map(code => [code, 'Soccer'])), tennis: 'Tennis', mma: 'MMA', boxing: 'Boxing', snooker: 'Snooker', darts: 'Darts', golf: 'Golf', cricket: 'Cricket', rugby: 'Rugby', ncaaf: 'NCAAF', ncaab: 'NCAAB', americanfootball: 'Other', other: 'Other', unknown: 'Other' };
export const MARKET_NAMES = { moneyline: 'Moneyline', spread: 'Spread', total: 'Total', 'three-way': 'Match result (1X2)', prop: 'Player prop', 'game-prop': 'Game prop', alternate: 'Alternate line', future: 'Future' };

// Part-game periods as the feed writes them ("1h", "f5", "1inn_3inn", "1p_1st_10_mins").
const PERIOD_PARTS = { '1h': '1st Half', '2h': '2nd Half', '1q': '1st Quarter', '2q': '2nd Quarter', '3q': '3rd Quarter', '4q': '4th Quarter',
  '1p': '1st Period', '2p': '2nd Period', '3p': '3rd Period', f5: 'First 5 Innings', reg: 'Regulation', ot: 'Overtime', mins: 'Minutes', '1st': '1st' };
const ordinal = n => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
/** A part of the game's name ("1h" → "1st Half", "1inn_3inn" → "Innings 1-3"); '' for the full game. */
export function periodName(period) {
  const code = String(period ?? '').trim().toLowerCase();
  if (!code || code === 'full') return '';
  if (PERIOD_PARTS[code]) return PERIOD_PARTS[code];
  const innings = /^1inn_(\d+)inn$/.exec(code), inning = /^(\d+)inn$/.exec(code);
  if (innings) return `First ${innings[1]} Innings`;
  if (inning) return `${ordinal(Number(inning[1]))} Inning`;
  return code.split('_').map(part => PERIOD_PARTS[part] || part.toUpperCase()).join(' ');
}

export function sportName(raw) {
  const text = String(raw ?? '').trim();
  const upper = text.toUpperCase();
  if (MAJOR[upper]) return MAJOR[upper];
  const known = SPORT_NAMES[text.toLowerCase()];
  // A place sent as the sport (Onyx tennis as "tokyo,-japan") says nothing about the sport.
  if (!known && text.includes(',')) return 'Other';
  return known || (text ? text[0].toUpperCase() + text.slice(1).toLowerCase() : '');
}

/** A sport name from a URL or menu ("tennis" → "Tennis"), or '' when it isn't one the feed uses. */
export function knownSport(raw) {
  const text = String(raw ?? '').trim();
  return MAJOR[text.toUpperCase()] || SPORT_NAMES[text.toLowerCase()] || '';
}

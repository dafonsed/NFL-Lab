// Sport and market names as the odds feed's normalization (lib/odds/normalize.mjs) writes them, and as
// the +EV pages read them from a URL or menu. Names only, no betting math.

const MAJOR = { NFL: 'NFL', MLB: 'MLB', NBA: 'NBA', WNBA: 'WNBA', NHL: 'NHL', SOCCER: 'Soccer' };
// `americanfootball` holds Central American soccer clubs in today's feed, so it is not relabeled
// as football; `other` and `unknown` carry no usable sport.
// Soccer league codes become Soccer, with the league kept (see SOCCER_LEAGUES).
export const SOCCER_LEAGUES = { epl: 'EPL', mls: 'MLS', nwsl: 'NWSL', laliga: 'La Liga', seriea: 'Serie A', bundesliga: 'Bundesliga', ligue1: 'Ligue 1', ucl: 'Champions League', uel: 'Europa League' };
const SPORT_NAMES = { ...Object.fromEntries(Object.keys(SOCCER_LEAGUES).map(code => [code, 'Soccer'])), tennis: 'Tennis', mma: 'MMA', boxing: 'Boxing', snooker: 'Snooker', darts: 'Darts', golf: 'Golf', cricket: 'Cricket', rugby: 'Rugby', ncaaf: 'NCAAF', ncaab: 'NCAAB', americanfootball: 'Other', other: 'Other', unknown: 'Other' };
export const MARKET_NAMES = { moneyline: 'Moneyline', spread: 'Spread', total: 'Total', 'three-way': 'Match result (1X2)', prop: 'Player prop', alternate: 'Alternate line', future: 'Future' };

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

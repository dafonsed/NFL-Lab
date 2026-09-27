// A read-only showcase. These tickets are never written to browser storage.
const examples = [
  ['Devin Booker · Over 25.5 points', 'NBA', 'Player points', 'FanDuel', 'Positive EV'],
  ['Jalen Brunson · Over 6.5 assists', 'NBA', 'Player assists', 'DraftKings', 'Smart Money'],
  ['Seattle vs Houston · Under 8.5', 'MLB', 'Game total', 'bet365', 'Odds Screen'],
  ['Patrick Mahomes · Over 265.5 passing yards', 'NFL', 'Passing yards', 'BetMGM', 'Positive EV'],
  ['Dallas vs Minnesota · Dallas moneyline', 'WNBA', 'Moneyline', 'Caesars', 'Manual'],
  ['Auston Matthews · Over 3.5 shots', 'NHL', 'Shots on goal', 'FanDuel', 'Smart Money'],
  ['Inter Miami vs Atlanta · Both teams score', 'Soccer', 'Both teams score', 'DraftKings', 'Odds Screen'],
  ['Chicago vs Detroit · Chicago +3.5', 'NFL', 'Spread', 'bet365', 'Positive EV'],
  ['Los Angeles vs San Francisco · Over 7.5', 'MLB', 'Game total', 'BetMGM', 'Manual'],
  ['Caitlin Clark · Over 7.5 assists', 'WNBA', 'Player assists', 'Caesars', 'Smart Money'],
  ['Philadelphia vs Buffalo · Buffalo moneyline', 'NHL', 'Moneyline', 'FanDuel', 'Odds Screen'],
  ['Arsenal vs Chelsea · Over 2.5 goals', 'Soccer', 'Game total', 'DraftKings', 'Positive EV']
];
const tags = [['Main slate'], ['Value'], ['Live'], ['Main slate', 'Boosted'], ['Weekend'], ['Value', 'Weekend']];
const outcomes = ['won','open','won','lost','won','won','won','lost','lost','won','won','lost','won','won','lost','won','won','lost','won','won','lost','lost','won','won','lost','won','won','won','lost','won','lost','won','won','lost','won','won','lost','won','won','won','lost','won'];
const pad = value => String(value).padStart(2, '0');
const isoDay = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function sampleBets(now = new Date()) {
  return Array.from({ length: 42 }, (_, index) => {
    const [selection, sport, market, book, tool] = examples[(index * 7 + Math.floor(index / 3)) % examples.length];
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - Math.floor(index / 3) * 2);
    const status = outcomes[index];
    const oddsIndex = (index * 5 + Math.floor(index / 4)) % 6;
    const odds = [-110, +125, -105, +145, -120, +110][oddsIndex];
    const closingOdds = (index % 7 === 0 ? [-100, +135, -100, +155, -110, +120] : [-125, +112, -115, +130, -128, +102])[oddsIndex];
    return {
      id: `sample-${index + 1}`, selection, sport, market, book, tool,
      tags: [...tags[(index * 3 + Math.floor(index / 2)) % tags.length], ...(/Player|Passing|Shots/.test(market) ? ['Player props'] : [])], notes: 'Illustrative sample ticket.',
      type: 'single', date: isoDay(date), stake: [10, 25, 15, 20, 10, 15, 25][(index * 3 + Math.floor(index / 5)) % 7],
      odds, closingOdds, oddsFormat: 'american', status, settlement: 'manual',
      returnOverride: null, cashout: null, legs: [], sample: true,
      updatedAt: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12).toISOString()
    };
  });
}

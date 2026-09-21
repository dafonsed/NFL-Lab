// One market registry for data validation, sportsbook matching and result grading.
export const MARKET_CONFIG = {
  any_td: { label: 'Anytime TD', fields: ['rushing_tds', 'receiving_tds', 'special_teams_tds'], unit: 'TDs' },
  pass_yds: { label: 'Passing yards', fields: ['passing_yards'], unit: 'yards' },
  pass_tds: { label: 'Passing TDs', fields: ['passing_tds'], unit: 'TDs' },
  rush_yds: { label: 'Rushing yards', fields: ['rushing_yards'], unit: 'yards' },
  rush_attempts: { label: 'Rushing attempts', fields: ['carries'], unit: 'attempts' },
  rec: { label: 'Receptions', fields: ['receptions'], unit: 'receptions' },
  rec_yds: { label: 'Receiving yards', fields: ['receiving_yards'], unit: 'yards' },
  pass_attempts: { label: 'Passing attempts', fields: ['attempts'], unit: 'attempts' },
  pass_completions: { label: 'Completions', fields: ['completions'], unit: 'completions' },
  pass_interceptions: { label: 'Interceptions thrown', fields: ['passing_interceptions'], unit: 'interceptions' },
  rush_rec_yds: { label: 'Rush + receiving yards', fields: ['rushing_yards', 'receiving_yards'], unit: 'yards' },
};
export const MARKETS = Object.keys(MARKET_CONFIG);
export const PUBLIC_MARKETS = {
  any_td: 'touchdowns', pass_yds: 'passing yards', pass_tds: 'passing tds',
  rush_yds: 'rushing yards', rush_attempts: 'rush attempts', rec: 'receptions',
  rec_yds: 'receiving yards', pass_attempts: 'pass attempts', pass_completions: 'completions',
  pass_interceptions: 'interceptions', rush_rec_yds: 'rushing & receiving yards',
};
export const normalizePlayer = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\b(jr|sr|ii|iii|iv)\.?$/i, '').replace(/[^a-z0-9]/g, '');

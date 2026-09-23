// Deterministic rule kernels for supplied, adjudicated events. They do not
// estimate possession/event probabilities or claim to be complete officiating.
export function nflOvertimeRules(season, postseason) {
  if (!Number.isInteger(season) || season < 1999 || season > 2026 || typeof postseason !== 'boolean') return null;
  return { season, postseason, mode: season >= (postseason ? 2022 : 2025) ? 'both-possessions'
    : season >= (postseason ? 2010 : 2012) ? 'modified-sudden-death' : 'sudden-death',
  periodSeconds: postseason || season < 2017 ? 900 : 600,
  scope: 'Ordinary alternating possessions in the first two OT periods only; kick recoveries, penalties, replay, tries returned by defense and clock administration are unsupported.' };
}

export function startNflOvertime({ season, postseason, first = 'home' }) {
  const rules = nflOvertimeRules(season, postseason);
  if (!rules || !['home', 'away'].includes(first)) throw Error('Unsupported NFL overtime era or first possession.');
  return { rules, possession: first, first, possessions: 0, remaining: rules.periodSeconds, period: 1,
    scores: { home: 0, away: 0 }, ended: false, winner: null };
}

export function stepNflOvertime(previous, event) {
  if (previous.ended) throw Error('Overtime has ended.');
  const s = structuredClone(previous), other = s.possession === 'home' ? 'away' : 'home';
  const end = () => { s.ended = true; s.winner = s.scores.home === s.scores.away ? 'tie' : s.scores.home > s.scores.away ? 'home' : 'away'; return s; };
  if (event.type === 'period-end') {
    if (event.elapsedSeconds !== s.remaining) throw Error('Period-end must consume the remaining clock.');
    s.remaining = 0;
    if (!s.rules.postseason) return end();
    if (s.period >= 2) throw Error('Third overtime period requires unsupported kickoff/half rules.');
    s.period++; s.remaining = s.rules.periodSeconds; return s; // Same possession continues.
  }
  if (event.type !== 'possession' || event.team !== s.possession
    || !Number.isInteger(event.elapsedSeconds) || event.elapsedSeconds < 0 || event.elapsedSeconds > s.remaining
    || !['no-score', 'field-goal', 'touchdown', 'defensive-touchdown', 'safety'].includes(event.outcome)) throw Error('Unsupported possession event. Supply adjudicated outcome and elapsed clock.');
  s.remaining -= event.elapsedSeconds;
  const defensive = ['defensive-touchdown', 'safety'].includes(event.outcome);
  const scoring = defensive ? other : s.possession;
  const points = { 'no-score': 0, 'field-goal': 3, touchdown: 6, 'defensive-touchdown': 6, safety: 2 }[event.outcome];
  s.scores[scoring] += points;
  // No try is sampled after an already decisive touchdown.
  const leads = s.scores[scoring] > s.scores[scoring === 'home' ? 'away' : 'home'];
  const sudden = s.rules.mode === 'sudden-death' || s.possessions >= 2;
  if (points && leads && (sudden || defensive || s.possessions >= 1
    || s.rules.mode === 'modified-sudden-death' && event.outcome === 'touchdown'
    || !s.rules.postseason && s.remaining === 0)) return end();
  if (event.outcome === 'touchdown') {
    if (![0, 1, 2].includes(event.tryPoints)) throw Error('A supplied offensive try result is required; no try probabilities are invented.');
    s.scores[scoring] += event.tryPoints;
  }
  s.possessions++;
  if (s.possessions >= 2 && s.scores.home !== s.scores.away) return end();
  if (!s.rules.postseason && s.remaining === 0) return end();
  s.possession = other;
  if (s.remaining === 0) {
    if (s.period >= 2) throw Error('Third overtime period requires unsupported kickoff/half rules.');
    s.period++; s.remaining = s.rules.periodSeconds;
  }
  return s;
}

export function automaticRunnerEligible({ sport = 'mlb', season, regularSeason, scheduledInnings = 9 }) {
  if (sport !== 'mlb' || !Number.isInteger(season) || season < 2005 || season > 2026 || typeof regularSeason !== 'boolean' || scheduledInnings !== 9) return null;
  return regularSeason && season >= 2020;
}

export const skipBottom = (inning, home, away) => inning >= 9 && home > away;

// For verified normal scoring plays: `runs` already excludes force/appeal outs.
// An aggregate inning draw cannot tell us that its last play was a home run.
export function settleMlbScoringPlay({ inning, top, home, away, event, runs, runnersOnBase }) {
  if (!Number.isInteger(inning) || inning < 1 || typeof top !== 'boolean'
    || ![home, away, runs].every(n => Number.isInteger(n) && n >= 0)
    || !['ordinary', 'home-run-out-of-park'].includes(event)) throw Error('Verified scoring play required.');
  if (!top && skipBottom(inning, home, away)) return { home, away, ended: true, skipped: true };
  if (event === 'home-run-out-of-park' && (!Number.isInteger(runnersOnBase) || runnersOnBase < 0 || runnersOnBase > 3 || runs !== runnersOnBase + 1)) throw Error('Home-run runs must equal verified runners plus batter.');
  const walkoff = !top && inning >= 9 && home + runs > away;
  const counted = walkoff && event !== 'home-run-out-of-park' ? away - home + 1 : runs;
  return { home: home + (top ? 0 : counted), away: away + (top ? counted : 0), ended: walkoff, skipped: false };
}

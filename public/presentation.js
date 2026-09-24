// Presentation only. Source values and model eligibility remain authoritative.
export function marketLabel(key = '') {
  const labels = {any_td:'Anytime touchdown',pass_yds:'Passing yards',pass_tds:'Passing touchdowns',rush_yds:'Rushing yards',rush_attempts:'Rushing attempts',rec:'Receptions',rec_yds:'Receiving yards',pass_attempts:'Passing attempts',pass_completions:'Completions',pass_interceptions:'Interceptions',rush_rec_yds:'Rush + receiving yards',hr:'Home runs',hits:'Hits',total_bases:'Total bases',rbi:'RBIs',runs:'Runs',strikeouts:'Strikeouts',pitcher_strikeouts:'Pitcher strikeouts',pitcher_outs:'Pitcher outs',earned_runs:'Earned runs',walks:'Walks',hits_runs_rbis:'Hits + runs + RBIs',stolen_bases:'Stolen bases'};
  return labels[key] || key.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
}

export function modelLabel(version = '') {
  if (/workload-context/.test(version)) return 'Workload + context';
  if (/workload-opportunities/.test(version)) return 'Workload + opportunities';
  if (/workload/.test(version)) return 'Workload model';
  return version.replace(/[-_]/g,' ').replace(/^./,c=>c.toUpperCase()) || 'Model unavailable';
}

export function availabilityLabel(status = '') {
  if (/historical/i.test(status)) return 'Past injury / lineup status not archived';
  return status === 'unavailable' ? 'Report unavailable' : status;
}

export function availabilityNote(availability = {}) {
  const status = availability.status || '';
  if (/historical/i.test(status)) return 'The injury and lineup report from before this game is not archived. A current report cannot establish who was expected to play then.';
  if (availability.unavailable) return 'The player is reported unavailable. Check the team’s latest update before using this matchup.';
  if (availability.concern) return 'Participation or playing time may be affected. The projection is not a confirmed minutes limit.';
  if (availability.stale) return 'The last update could not be refreshed. This status may have changed.';
  if (/unavailable|unknown/i.test(status)) return availability.note || 'An injury or lineup report is not available. Participation has not been confirmed.';
  if (/no.*(injury|listing)|\bavailable\b|\bactive\b/i.test(status)) return 'No absence is listed in the latest report. This does not confirm the starting lineup.';
  return availability.note || 'Check the latest team report for participation and any minutes restriction.';
}

export function withheldSummary(reasons = []) {
  return reasons.find(reason => /extra innings/i.test(reason)) || reasons[0] || '';
}

export function baseballSituation(game) {
  const value = n => Number.isFinite(n) ? String(n) : '—';
  const outs = Number.isFinite(game.outs) ? `${game.outs} ${game.outs === 1 ? 'out' : 'outs'}` : 'Outs unavailable';
  const count = `Balls ${value(game.balls)} · Strikes ${value(game.strikes)}`;
  const transition = Number.isFinite(game.balls) && (game.balls < 0 || game.balls > 3) || Number.isFinite(game.strikes) && (game.strikes < 0 || game.strikes > 2) || Number.isFinite(game.outs) && (game.outs < 0 || game.outs > 2);
  return `${game.half || 'Inning'} ${value(game.inning)} · ${outs} · ${count}${transition ? ' · Provider transition state' : ''}`;
}

export function movementText(value, digits = 1) {
  if (!Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

// Preserve a reader's place when a live snapshot replaces a component's DOM.
export function preserveLiveFocus(root) {
  const active = document.activeElement;
  if (!root.contains(active)) return () => {};
  const id = active.id;
  const attr = ['data-line', 'data-pause', 'data-market'].find(key => active.hasAttribute(key));
  const detail = active.closest('[data-detail]')?.getAttribute('data-detail');
  const quote = active.closest('[data-quote]')?.getAttribute('data-quote');
  const summaryClass = active.tagName === 'SUMMARY' ? active.parentElement.className : '';
  const scroll = window.scrollY;
  return () => {
    const control = id ? document.getElementById(id) : attr ? [...root.querySelectorAll(`[${attr}]`)].find(el => el.getAttribute(attr) === active.getAttribute(attr)) : detail ? [...root.querySelectorAll('[data-detail]')].find(el => el.getAttribute('data-detail') === detail)?.querySelector('summary') : quote ? [...root.querySelectorAll('[data-quote]')].find(el => el.getAttribute('data-quote') === quote)?.querySelector('button') : summaryClass ? [...root.querySelectorAll('details')].find(el => el.className === summaryClass)?.querySelector('summary') : null;
    if (control && !control.disabled) control.focus({preventScroll:true});
    window.scrollTo({top:scroll,behavior:'instant'});
  };
}

// Order by the same unrounded value shown in each board column.
const numeric = value => (typeof value === 'number' || typeof value === 'string' && value.trim() !== '') && Number.isFinite(Number(value)) ? Number(value) : null;
const name = row => String(row.player ?? row.name ?? '');
const identity = row => String(row.key ?? [row.gameId, row.playerId ?? row.id].join(':'));
const byName = (a, b) => name(a).localeCompare(name(b)) || identity(a).localeCompare(identity(b), 'en', { numeric: true });
const descending = (left, right) => (left === null) - (right === null) || (right ?? 0) - (left ?? 0);

// The primary model column shows TD strength for NFL touchdowns and the
// projected amount for every other sport/market. Never rank it by book odds.
export function modelValue(player, { sport, market } = {}) {
  if (sport === 'nfl' && market === 'any_td') return (player.forecast?.availability || player.availability)?.unavailable ? null : numeric(player.modelScore);
  return numeric(player.forecast?.point);
}

export function sortPlayers(players, sort, values) {
  const rows = [...players];
  if (sort === 'name') return rows.sort(byName);
  const value = values[sort] || values.model || values.over;
  return rows.sort((a, b) => {
    const left = numeric(value(a)), right = numeric(value(b));
    return descending(left, right) || (values.model ? descending(numeric(values.model(a)), numeric(values.model(b))) : 0) || byName(a, b);
  });
}

export function sortProfiles(profiles, sort = 'model') {
  return sortPlayers(profiles, sort, {
    model: p => modelValue(p.raw || p, p),
    over: p => p.forecast?.probability?.over,
    under: p => p.forecast?.probability?.under,
  });
}

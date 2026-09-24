// Order by the same unrounded value shown in each board column.
const numeric = value => value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : null;
export function sortPlayers(players, sort, values) {
  const rows = [...players];
  if (sort === 'name') return rows.sort((a, b) => a.player.localeCompare(b.player));
  const value = values[sort] || values.over;
  return rows.sort((a, b) => {
    const left = numeric(value(a)), right = numeric(value(b));
    return (right === null ? -Infinity : right) - (left === null ? -Infinity : left) || a.player.localeCompare(b.player);
  });
}

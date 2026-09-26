// A small, sourced read model for the public homepage. No sample players or
// synthetic game results are generated here.
const valid = value => value !== null && value !== undefined && Number.isFinite(Number(value));

export function landingResearch(board) {
  const weekly = (board.datasets || []).filter(source => source.type === 'weekly' && source.available);
  const players = (board.players || []).filter(player =>
    player.position === 'WR' && valid(player.prop?.line) &&
    player.trendGames?.filter(game => valid(game.value) && game.date).length >= 5
  ).slice(0, 16).map(player => ({
    id: String(player.playerId),
    name: player.player,
    team: player.team,
    opponent: player.opponent,
    position: player.position,
    image: player.headshot || null,
    gameId: player.gameId,
    line: Number(player.prop.line),
    quote: {
      book: player.prop.bookmaker || null,
      capturedAt: player.prop.fetchedAt || null,
      stale: Boolean(player.prop.stale),
      url: player.prop.sourceUrl || null,
      basis: player.prop.basis || null
    },
    games: player.trendGames.filter(game => valid(game.value) && game.date).slice(0, 20).map(game => ({
      id: String(game.gameId), date: game.date, opponent: game.opponent,
      home: Boolean(game.home), value: Number(game.value), url: game.url || null
    }))
  }));

  return {
    available: players.length > 0,
    sport: 'NFL',
    market: 'Receiving yards',
    period: board.current ? `${board.current.season} · Week ${board.current.week}` : null,
    boardFetchedAt: board.fetchedAt || null,
    stale: Boolean(board.stale),
    connection: board.connection || null,
    lastGameDate: players.flatMap(player => player.games.map(game => game.date)).sort().at(-1) || null,
    sources: weekly.map(source => ({
      season: source.season, url: source.url, fetchedAt: source.fetchedAt,
      stale: Boolean(source.stale)
    })),
    players
  };
}

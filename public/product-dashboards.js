const summary = document.querySelector('[data-watchlist-summary]');
if (summary) {
  try {
    const saved = JSON.parse(localStorage.getItem('sports-lab-trends-watchlist-' + document.body.dataset.dashboardSport) || '[]');
    if (Array.isArray(saved)) {
      const count = new Set(saved.map(String)).size;
      summary.textContent = count ? `${count} saved ${count === 1 ? 'player' : 'players'} in your ${document.body.dataset.dashboardSport.toUpperCase()} watchlist. Pick up your research where you left off.` : 'Save players from the trends board to build your watchlist.';
    }
  } catch {
    summary.textContent = 'Browser storage is unavailable. You can still explore the player trends board.';
  }
}

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const safeUrl = value => { try { const url = new URL(value); return url.protocol === 'https:' ? escapeHtml(url.href) : '#'; } catch { return '#'; } };
const fmt = value => Number.isInteger(value) ? String(value) : Number(value).toFixed(1);
const date = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(value)) : 'date unavailable';
const dateTime = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }).format(new Date(value)) : 'time unavailable';
const initials = value => String(value).split(/\s+/).map(part => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

export async function mountLandingResearch() {
  const hero = document.querySelector('#home-hero-proof');
  const insight = document.querySelector('#home-insight');
  const workspace = document.querySelector('#workspace');
  const feed = document.querySelector('#home-research-feed');
  const calendar = document.querySelector('#home-results-calendar');
  const pathDetail = document.querySelector('#home-path-detail');
  const outcome = document.querySelector('#home-outcome-panel');
  const receipts = document.querySelector('#home-receipts-rail');
  let payload;
  const read = async path => {
    const response = await fetch(path, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw Error(`Research source returned ${response.status}`);
    const data = await response.json();
    if (!data.available || !data.players?.length) throw Error('No sourced player history is available for this week.');
    return data;
  };
  // The dated, generated snapshot paints the page promptly while the source
  // endpoint checks for a newer receipt. It contains only actual game records.
  const latestPromise = read('/api/landing/research');
  try {
    payload = await read('/landing-research-snapshot.json');
  } catch (error) {
    try { payload = await latestPromise; }
    catch (latestError) {
      const message = `<div class="real-unavailable"><span class="real-kicker">SOURCE STATUS</span><h3>Research is temporarily unavailable.</h3><p>${escapeHtml(latestError.message)} The full workspace may have another sport or date available.</p><a href="/research">Open the workspace ↗</a></div>`;
      [hero, insight, workspace, feed, calendar, pathDetail, outcome].forEach(node => { node.classList.remove('real-loading'); node.innerHTML = message; });
      return;
    }
  }

  const state = { playerId: payload.players[0].id, window: 10, side: 'over', line: payload.players[0].line, view: 'research', path: 'research', search: '', sort: 'board', gameId: null };
  const player = () => payload.players.find(item => item.id === state.playerId) || payload.players[0];
  const games = (p = player(), count = state.window) => p.games.slice(0, count).reverse();
  const summary = (rows, line = state.line, side = state.side) => {
    const values = rows.map(row => row.value);
    const hits = values.filter(value => side === 'over' ? value > line : value < line).length;
    const sorted = [...values].sort((a, b) => a - b);
    return { n: values.length, hits, rate: values.length ? Math.round(hits / values.length * 100) : null,
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      median: values.length ? (sorted[Math.floor((values.length - 1) / 2)] + sorted[Math.floor(values.length / 2)]) / 2 : null,
      min: sorted[0], max: sorted.at(-1) };
  };
  const captured = p => `${p.quote.book || 'Public comparison'} · captured ${dateTime(p.quote.capturedAt)}${p.quote.stale ? ' · refresh delayed' : ''}`;
  const source = () => payload.sources.find(item => item.season === Number(payload.period?.slice(0, 4))) || payload.sources.at(-1);
  const status = () => payload.stale || player().quote.stale ? 'Cached source snapshot; check timestamps before using a line.' : 'Source snapshot with capture time shown below.';
  const headshot = (p, className) => p.image && safeUrl(p.image) !== '#' ? `<img class="${className}" src="${safeUrl(p.image)}" alt="" loading="lazy">` : `<span class="${className} real-initials" aria-hidden="true">${escapeHtml(initials(p.name))}</span>`;
  const researchUrl = p => `/research?sport=nfl&prop=rec_yds&researchPlayer=${encodeURIComponent(p.id)}`;
  const chart = (rows, line, compact = false) => {
    const high = Math.max(line, ...rows.map(row => row.value), 1) * 1.08;
    const ordered = rows.map(row => row.value).join(', ');
    return `<div class="real-chart${compact ? ' real-chart-compact' : ''}" role="group" aria-label="Completed receiving yard results, oldest to newest: ${escapeHtml(ordered)}; comparison line ${fmt(line)}">
      <div class="real-chart-scroll"><div class="real-chart-plot" style="--real-columns:${rows.length};--real-line:${Math.min(compact ? 138 : 148, line / high * (compact ? 138 : 148)).toFixed(1)}px">
        <span class="real-chart-threshold" aria-hidden="true"></span>
        ${rows.map(row => `<${compact ? 'span' : 'button'} class="real-chart-cell${row.value > line ? ' is-above' : row.value === line ? ' is-push' : ''}" ${compact ? '' : `type="button" data-home-game="${escapeHtml(row.id)}" aria-label="${escapeHtml(date(row.date))}, ${row.home ? 'vs' : 'at'} ${escapeHtml(row.opponent)}, ${fmt(row.value)} receiving yards"`} title="${escapeHtml(date(row.date))} · ${row.home ? 'vs' : '@'} ${escapeHtml(row.opponent)} · ${fmt(row.value)} receiving yards"><b>${fmt(row.value)}</b><i style="height:${Math.max(3, row.value / high * (compact ? 138 : 148)).toFixed(1)}px"></i><small>${escapeHtml(row.opponent)}</small></${compact ? 'span' : 'button'}>`).join('')}
      </div></div></div>`;
  };
  function renderHero() {
    const p = player(), rows = games(p, 10), s = summary(rows, p.line, 'over');
    const atOrBelow = s.n - s.hits;
    const highest = Math.max(...rows.map(row => row.value), p.line, 1);
    hero.classList.remove('real-loading');
    hero.innerHTML = `<div class="hero-preview-top"><span>NFL / ${escapeHtml(payload.period || 'PLAYER RESEARCH')}</span><span>COMPLETED GAME HISTORY</span></div>
      <div class="hero-preview-player">${headshot(p, 'hero-player-avatar')}<div class="hero-preview-identity"><small>${escapeHtml(p.team)} vs ${escapeHtml(p.opponent)} · ${escapeHtml(p.position)}</small><strong>${escapeHtml(p.name)}</strong><span>Receiving yards · captured ${escapeHtml(p.quote.book || 'public comparison')} line</span></div><div class="hero-preview-line"><small>LINE</small><strong>${fmt(p.line)}</strong></div></div>
      <div class="hero-preview-comparison"><div><small>ABOVE ${fmt(p.line)} YARDS</small><strong>${s.hits}<span> / ${s.n}</span></strong><p>Completed games above the captured line</p></div><div><small>AT OR BELOW ${fmt(p.line)}</small><strong>${atOrBelow}<span> / ${s.n}</span></strong><p>Completed games at or below the line</p></div></div>
      <div class="hero-preview-chart-heading"><span>LAST ${s.n} COMPLETED GAMES</span><span>${escapeHtml(payload.market || 'Receiving yards')}</span></div>
      <div class="hero-preview-chart" role="img" aria-label="${escapeHtml(p.name)} receiving yards in the last ${s.n} completed games, oldest to newest: ${escapeHtml(rows.map(row => fmt(row.value)).join(', '))}. Captured comparison line ${fmt(p.line)}"><div class="hero-preview-bars">${rows.map(row => `<span class="${row.value > p.line ? 'is-above' : ''}" title="${escapeHtml(date(row.date))} · ${escapeHtml(row.opponent)} · ${fmt(row.value)} yards"><b>${fmt(row.value)}</b><i style="height:${Math.max(8,row.value / highest * 100).toFixed(1)}%"></i><small>${escapeHtml(row.opponent)}</small></span>`).join('')}</div></div>
      <div class="hero-preview-summary"><span><small>AVERAGE</small><strong>${fmt(s.average)} yd</strong></span><span><small>MEDIAN</small><strong>${fmt(s.median)} yd</strong></span><span><small>RANGE</small><strong>${fmt(s.min)}–${fmt(s.max)} yd</strong></span></div>
      <div class="hero-preview-foot"><span>${escapeHtml(p.quote.book || 'Public comparison')} · captured ${dateTime(p.quote.capturedAt)}${p.quote.stale ? ' · refresh delayed' : ''}</span><a href="${researchUrl(p)}">Open player research ↗</a></div>`;
  }
  function renderInsight() {
    const p = player(), rows = games(p, 10), s = summary(rows, p.line, 'over');
    insight.classList.remove('real-loading');
    insight.innerHTML = `<div class="landing-insight-top"><span><i></i> COMPLETED GAME HISTORY</span><small>${escapeHtml(payload.period || 'NFL')}</small></div>
      <div class="landing-insight-player"><div><small>NFL · ${escapeHtml(p.team)} vs ${escapeHtml(p.opponent)} · ${escapeHtml(p.position)}</small><strong>${escapeHtml(p.name)}</strong><span>Receiving yards</span></div><div class="landing-insight-rate"><strong>${s.rate}%</strong><span>${s.hits} of ${s.n} above ${fmt(p.line)}</span></div></div>
      <div class="landing-insight-meta"><span>LAST ${s.n} COMPLETED GAMES</span><span>CAPTURED LINE ${fmt(p.line)}</span></div>${chart(rows, p.line, true)}
      <div class="landing-insight-foot"><span><small>AVERAGE</small><strong>${fmt(s.average)}</strong></span><span><small>MEDIAN</small><strong>${fmt(s.median)}</strong></span><span><small>RANGE</small><strong>${fmt(s.min)}–${fmt(s.max)}</strong></span></div>
      <div class="real-insight-source"><span>Latest result ${date(p.games[0]?.date)} · ${escapeHtml(p.quote.stale ? 'line refresh delayed' : 'line captured')}</span><a href="${safeUrl(source()?.url)}" target="_blank" rel="noreferrer">nflverse source ↗</a></div>`;
  }
  function renderFeed() {
    feed.classList.remove('real-loading');
    const list = payload.players.slice(0, 3);
    feed.innerHTML = `<div class="landing-feed-top"><span><i></i> NFL RECEIVING YARDS</span><small>COMPLETED GAMES</small></div>
      ${list.map(p => { const s = summary(games(p, 10), p.line, 'over'); return `<button class="landing-feed-row real-feed-row" type="button" data-home-player="${escapeHtml(p.id)}"><span class="real-feed-identity">${headshot(p, 'real-feed-avatar')}<span><small>${escapeHtml(p.team)} vs ${escapeHtml(p.opponent)} · ${fmt(p.line)} captured line</small><strong>${escapeHtml(p.name)}</strong><em>Latest game ${date(p.games[0]?.date)}</em></span></span><span class="real-feed-stat"><strong>${s.hits} / ${s.n}</strong><small>ABOVE LINE ↗</small></span></button>`; }).join('')}
      <div class="landing-feed-bottom"><span>Historical counts · ${escapeHtml(payload.period || 'NFL')} · quotes may be stale</span><a href="#workspace">Explore all players ↗</a></div>`;
  }
  function renderCalendar() {
    const p = player(), rows = games(p, 20), s = summary(rows, p.line, 'over');
    calendar.classList.remove('real-loading');
    calendar.innerHTML = `<div class="landing-calendar-head"><div><span class="landing-calendar-avatar">${escapeHtml(initials(p.name))}</span><span><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(payload.period || 'NFL')} · receiving yards</small></span></div><span class="landing-calendar-count"><small>ABOVE CAPTURED LINE</small><strong>${s.hits} / ${s.n}</strong></span></div><div class="landing-calendar-labels"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div><div class="landing-calendar-grid">${rows.map(row => `<a href="${safeUrl(row.url)}" target="_blank" rel="noreferrer" class="${row.value > p.line ? 'is-above' : row.value === p.line ? 'is-push' : ''}" title="${escapeHtml(date(row.date))} · ${fmt(row.value)} receiving yards · ${row.home ? 'vs' : '@'} ${escapeHtml(row.opponent)}"><small>${escapeHtml(row.opponent)}</small><strong>${fmt(row.value)}</strong></a>`).join('')}</div><div class="landing-calendar-foot"><span>Last ${s.n} completed games · line ${fmt(p.line)}</span><a href="${researchUrl(p)}">View game log ↗</a></div>`;
  }
  function renderPathDetail() {
    const p = player(), rows = games(p, 10), s = summary(rows, state.line, 'over');
    pathDetail.classList.remove('real-loading');
    document.querySelectorAll('[data-home-path]').forEach(button => { const active = button.dataset.homePath === state.path; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
    const shared = `<div class="landing-path-panel-meta"><span>SPORTSLAB / ${escapeHtml(state.path.toUpperCase())}</span><span>EXPLORE THE WORKSPACE ↗</span></div>`;
    if (state.path === 'research') pathDetail.innerHTML = `${shared}<div class="landing-path-panel-content"><div class="landing-path-panel-title"><div><h3>Player research</h3><p>Put completed games next to the number you want to examine.</p></div><a class="landing-button landing-button-small" href="${researchUrl(p)}">Open research ↗</a></div><div class="landing-path-research-surface"><div class="landing-path-player"><span class="landing-path-player-mark">${escapeHtml(initials(p.name))}</span><div><small>NFL · ${escapeHtml(p.team)} · RECEIVING YARDS</small><strong>${escapeHtml(p.name)}</strong><span>${s.n} completed games · captured line ${fmt(p.line)}</span></div><b>${s.hits}/${s.n}<small>ABOVE ${fmt(state.line)}</small></b></div><div class="landing-path-mini-chart">${rows.map(row => `<span class="${row.value > state.line ? 'is-above' : ''}" title="${escapeHtml(date(row.date))}: ${fmt(row.value)} yards"><b>${fmt(row.value)}</b><i style="height:${Math.max(10,Math.min(100,row.value / Math.max(...rows.map(item => item.value),1) * 100)).toFixed(1)}%"></i><small>${escapeHtml(row.opponent)}</small></span>`).join('')}</div><div class="landing-path-surface-foot"><span>Historical results · ${escapeHtml(captured(p))}</span><a href="#workspace">Move the line ↗</a></div></div></div>`;
    if (state.path === 'live') pathDetail.innerHTML = `${shared}<div class="landing-path-panel-content"><div class="landing-path-panel-title"><div><h3>Live game view</h3><p>Follow the current game with feed timing alongside the score and markets when available.</p></div><a class="landing-button landing-button-small" href="/live">Open live games ↗</a></div><div class="landing-path-feature-surface"><div><span class="landing-path-feature-icon">◉</span><small>GAME CENTER</small><strong>Find today’s matchup</strong><p>Choose a sport, then open a scheduled game to see available score, state, and market data.</p></div><div class="landing-path-feature-list"><a href="/live?sport=nfl">NFL <b>↗</b></a><a href="/live?sport=nba">NBA <b>↗</b></a><a href="/live?sport=wnba">WNBA <b>↗</b></a><a href="/live?sport=mlb">MLB <b>↗</b></a></div></div><p class="landing-path-footnote">Live data depends on public feed availability. The game view labels its last update.</p></div>`;
    if (state.path === 'simulation') pathDetail.innerHTML = `${shared}<div class="landing-path-panel-content"><div class="landing-path-panel-title"><div><h3>Simulation</h3><p>Change an assumption and read the model’s range in its stated context.</p></div><a class="landing-button landing-button-small" href="/simulation">Open simulation ↗</a></div><div class="landing-path-feature-surface"><div><span class="landing-path-feature-icon">◇</span><small>SCENARIO WORKSPACE</small><strong>Test the question</strong><p>Start from a matchup, adjust the inputs, and inspect what the model used to form its range.</p></div><div class="landing-path-feature-list"><span>01 <b>Select a game</b></span><span>02 <b>Adjust inputs</b></span><span>03 <b>Review assumptions</b></span></div></div><p class="landing-path-footnote">Model outputs are experimental estimates, not guaranteed results.</p></div>`;
    if (state.path === 'picks') pathDetail.innerHTML = `${shared}<div class="landing-path-panel-content"><div class="landing-path-panel-title"><div><h3>My picks</h3><p>Keep your selections and notes together in this browser.</p></div><a class="landing-button landing-button-small" href="/bets">Open my picks ↗</a></div><div class="landing-path-feature-surface"><div><span class="landing-path-feature-icon">✓</span><small>PERSONAL RECORD</small><strong>Your decisions, in one place</strong><p>Save a pick, add context, and revisit your own record without an account.</p></div><div class="landing-path-feature-list"><span>01 <b>Save a pick</b></span><span>02 <b>Add a note</b></span><span>03 <b>Review your record</b></span></div></div><p class="landing-path-footnote">Picks and notes are stored locally in this browser.</p></div>`;
  }
  function renderOutcome() {
    const p = player(), rows = games(), above = rows.filter(row => row.value > state.line).length, below = rows.filter(row => row.value < state.line).length, equal = rows.length - above - below;
    const high = Math.max(above, below, equal, 1);
    outcome.classList.remove('real-loading');
    outcome.innerHTML = `<div class="landing-outcome-head"><span>NFL · RECEIVING YARDS</span><span>${escapeHtml(payload.period || 'COMPLETED GAMES')}</span><h3>${escapeHtml(p.name)}</h3><p>${rows.length} completed games against ${fmt(state.line)} yards</p></div><div class="landing-outcome-body"><div class="landing-outcome-columns"><div class="landing-outcome-side"><span>ABOVE THE LINE</span><strong>${above}<small> / ${rows.length}</small></strong><div class="landing-outcome-track"><i style="height:${Math.max(8,above / high * 100).toFixed(1)}%"></i></div><small>More than ${fmt(state.line)} yards</small></div><div class="landing-outcome-divider"></div><div class="landing-outcome-side"><span>BELOW THE LINE</span><strong>${below}<small> / ${rows.length}</small></strong><div class="landing-outcome-track is-below"><i style="height:${Math.max(8,below / high * 100).toFixed(1)}%"></i></div><small>Fewer than ${fmt(state.line)} yards</small></div></div><div class="landing-outcome-note">${equal ? `${equal} game${equal === 1 ? '' : 's'} landed exactly on the line · ` : ''}Counts describe completed games, not a future probability.</div></div><div class="landing-outcome-footer"><div><span>SELECTED LINE</span><strong>${fmt(state.line)} yards</strong></div><div><span>LATEST RESULT</span><strong>${date(p.games[0]?.date)}</strong></div><a href="#workspace">Change the comparison ↗</a></div>`;
  }
  function renderReceipts() {
    const p = player(), src = source();
    receipts.innerHTML = `<article class="landing-receipt-card"><span>01 / COMPLETED GAMES</span><h3>nflverse weekly data</h3><p>${escapeHtml(p.name)}’s game log is drawn from completed NFL player statistics.</p><div class="landing-receipt-preview"><small>RECENT COMPLETED GAMES</small>${p.games.slice(0, 4).map(row => `<div><span>${date(row.date)} · ${row.home ? 'vs' : '@'} ${escapeHtml(row.opponent)}</span><strong>${fmt(row.value)} yd</strong></div>`).join('')}</div><div class="landing-receipt-detail"><small>DATASET</small><strong>${escapeHtml(payload.period || 'NFL season')} · receiving yards</strong></div><a href="${safeUrl(src?.url)}" target="_blank" rel="noreferrer">Open source file ↗</a></article><article class="landing-receipt-card"><span>02 / COMPARISON LINE</span><h3>Captured public quote</h3><p>The displayed line was captured from ${escapeHtml(p.quote.book || 'a public comparison')}. It may no longer be available.</p><div class="landing-receipt-preview landing-receipt-quote"><small>CAPTURED COMPARISON</small><div><span>${escapeHtml(p.name)} · receiving yards</span><strong>${fmt(p.line)}</strong></div><em>${escapeHtml(p.quote.book || 'Public comparison')} · ${p.quote.stale ? 'refresh delayed' : 'capture available'}</em></div><div class="landing-receipt-detail"><small>CAPTURED</small><strong>${dateTime(p.quote.capturedAt)}${p.quote.stale ? ' · refresh delayed' : ''}</strong></div><a href="${safeUrl(p.quote.url)}" target="_blank" rel="noreferrer">View quote source ↗</a></article><article class="landing-receipt-card"><span>03 / GAME DETAIL</span><h3>Box score links</h3><p>Open an individual result to check the completed game behind a bar.</p><div class="landing-receipt-preview landing-receipt-score"><small>LATEST COMPLETED GAME</small><strong>${escapeHtml(p.team)} ${p.games[0]?.home ? 'vs' : 'at'} ${escapeHtml(p.games[0]?.opponent)}</strong><div><span>${date(p.games[0]?.date)}</span><strong>${fmt(p.games[0]?.value)} yd</strong></div></div><div class="landing-receipt-detail"><small>GAME RESULT</small><strong>${escapeHtml(p.name)} · receiving yards</strong></div><a href="${safeUrl(p.games[0]?.url)}" target="_blank" rel="noreferrer">Open latest box score ↗</a></article>`;
  }
  function renderWorkspace() {
    const p = player(), rows = games(), s = summary(rows);
    workspace.classList.remove('real-loading');
    workspace.innerHTML = `<div class="real-toolbar"><div class="real-tabs" role="tablist" aria-label="Research views"><button role="tab" type="button" data-home-view="research" aria-selected="${state.view === 'research'}">Player research</button><button role="tab" type="button" data-home-view="board" aria-selected="${state.view === 'board'}">Research board</button></div><span class="real-toolbar-period">${escapeHtml(payload.period || 'NFL')} · ${escapeHtml(payload.market)}</span></div>
      <div class="real-source-banner"><span class="real-status-dot"></span><span>${escapeHtml(status())}</span><span>Latest completed game ${date(payload.lastGameDate)}</span></div>
      ${state.view === 'research' ? `<div class="real-research-panel"><div class="real-player-heading">${headshot(p, 'real-player-photo')}<div class="real-player-title"><small>NFL · ${escapeHtml(p.team)} vs ${escapeHtml(p.opponent)} · ${escapeHtml(p.position)}</small><h4>${escapeHtml(p.name)}</h4><span>Receiving yards · ${escapeHtml(captured(p))}</span></div><label class="real-player-select">PLAYER<select data-home-select aria-label="Select a real NFL player">${payload.players.map(item => `<option value="${escapeHtml(item.id)}"${item.id === p.id ? ' selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label></div>
        <div class="real-research-body"><div class="real-research-main"><div class="real-controls"><div class="real-control-group" role="group" aria-label="Game window">${[5, 10, 20].map(count => `<button type="button" data-home-window="${count}" aria-pressed="${state.window === count}">L${count}</button>`).join('')}</div><div class="real-control-group" role="group" aria-label="Compare side"><button type="button" data-home-side="over" aria-pressed="${state.side === 'over'}">Over</button><button type="button" data-home-side="under" aria-pressed="${state.side === 'under'}">Under</button></div></div>
          <div class="real-rate-row"><div><strong>${s.rate === null ? '—' : s.rate + '%'}</strong><span>${state.side === 'over' ? 'above' : 'below'} ${fmt(state.line)}</span><small>${s.hits} of ${s.n} completed games</small></div><dl><div><dt>Average</dt><dd>${fmt(s.average)}</dd></div><div><dt>Median</dt><dd>${fmt(s.median)}</dd></div><div><dt>Range</dt><dd>${fmt(s.min)}–${fmt(s.max)}</dd></div></dl></div>
          ${chart(rows, state.line)}<div class="real-chart-caption"><span><i></i>${state.side === 'over' ? 'Above' : 'Below'} selected line <i></i>Other results</span><span>Oldest → newest</span></div>
          <div class="real-selected-game" role="status">${state.gameId ? (() => { const game = p.games.find(item => item.id === state.gameId); return game ? `<strong>${date(game.date)} · ${game.home ? 'vs' : '@'} ${escapeHtml(game.opponent)}</strong><span>${fmt(game.value)} receiving yards</span>${game.url ? `<a href="${safeUrl(game.url)}" target="_blank" rel="noreferrer">Box score ↗</a>` : ''}` : 'Select a bar to inspect a completed game.'; })() : 'Select a bar to inspect a completed game.'}</div>
        </div><aside class="real-research-aside"><div class="real-aside-kicker">THE COMPARISON</div><h5>Move the line</h5><p>Count how many completed games finished above or below a number you choose.</p><label for="real-line">Receiving yards<input id="real-line" data-home-line type="number" inputmode="decimal" min="0" max="350" step="0.5" value="${fmt(state.line)}"></label><button class="real-reset-line" type="button" data-home-reset>Reset to captured ${fmt(p.line)}</button><div class="real-source-receipt"><span>CAPTURED QUOTE</span><strong>${escapeHtml(p.quote.book || 'Public comparison')} · ${fmt(p.line)}</strong><small>${dateTime(p.quote.capturedAt)}${p.quote.stale ? ' · stale' : ''}</small><a href="${safeUrl(p.quote.url)}" target="_blank" rel="noreferrer">View quote source ↗</a></div><div class="real-source-receipt"><span>GAME STATISTICS</span><strong>nflverse weekly player data</strong><small>Latest game ${date(p.games[0]?.date)}${source()?.stale ? ' · source refresh delayed' : ''}</small><a href="${safeUrl(source()?.url)}" target="_blank" rel="noreferrer">View dataset ↗</a></div></aside></div></div>` : `<div class="real-board-panel"><div class="real-board-heading"><div><h4>Receiving yards board</h4><p>Real player results from the selected NFL week. Rates count the last 10 completed games against each captured line.</p></div><span>${payload.players.length} players with history and a captured line</span></div><div class="real-board-filters"><label>Find player<input type="search" data-home-search placeholder="Name or team" value="${escapeHtml(state.search)}"></label><label>Order<select data-home-sort><option value="board"${state.sort === 'board' ? ' selected' : ''}>Board order</option><option value="rate"${state.sort === 'rate' ? ' selected' : ''}>Recent hit rate</option><option value="name"${state.sort === 'name' ? ' selected' : ''}>Player name</option></select></label></div><div class="real-board-results"></div></div>`}
      <div class="real-workspace-footer"><span>Historical results only · source dates shown above</span><a href="${researchUrl(p)}">Open ${escapeHtml(p.name)} in the full workspace ↗</a></div>`;
    if (state.view === 'board') renderBoardResults();
  }
  function renderBoardResults() {
    const host = workspace.querySelector('.real-board-results');
    if (!host) return;
    const list = payload.players.filter(p => `${p.name} ${p.team} ${p.opponent}`.toLowerCase().includes(state.search.toLowerCase()));
    if (state.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
    if (state.sort === 'rate') list.sort((a, b) => summary(games(b, 10), b.line, 'over').rate - summary(games(a, 10), a.line, 'over').rate || a.name.localeCompare(b.name));
    host.innerHTML = list.length ? `<div class="real-board-table-wrap"><table class="real-board-table"><thead><tr><th>Player / matchup</th><th>Captured line</th><th>Last 10 above</th><th>Last game</th><th></th></tr></thead><tbody>${list.map(p => { const s = summary(games(p, 10), p.line, 'over'); return `<tr><td><button type="button" data-home-player="${escapeHtml(p.id)}"><strong>${escapeHtml(p.name)}</strong><small>${escapeHtml(p.team)} vs ${escapeHtml(p.opponent)} · WR</small></button></td><td><strong>${fmt(p.line)}</strong><small>${escapeHtml(p.quote.book || 'Public quote')}${p.quote.stale ? ' · stale' : ''}</small></td><td><strong>${s.hits} / ${s.n}</strong><small>${s.rate}% historical</small></td><td>${date(p.games[0]?.date)}</td><td>↗</td></tr>`; }).join('')}</tbody></table></div>` : `<p class="real-empty">No players match that search.</p>`;
  }
  function refreshComparison() {
    const main = workspace.querySelector('.real-research-main');
    if (!main) return;
    const rows = games(), s = summary(rows);
    main.querySelector('.real-rate-row strong').textContent = s.rate === null ? '—' : `${s.rate}%`;
    main.querySelector('.real-rate-row span').textContent = `${state.side === 'over' ? 'above' : 'below'} ${fmt(state.line)}`;
    main.querySelector('.real-rate-row small').textContent = `${s.hits} of ${s.n} completed games`;
    main.querySelector('.real-chart').outerHTML = chart(rows, state.line);
  }
  function renderAll() { renderHero(); renderInsight(); renderFeed(); renderWorkspace(); renderCalendar(); renderPathDetail(); renderOutcome(); renderReceipts(); }
  renderAll();
  latestPromise.then(next => {
    const currentQuote = payload.players.find(item => item.id === state.playerId)?.quote.capturedAt;
    const nextQuote = next.players.find(item => item.id === state.playerId)?.quote.capturedAt;
    const newer = Date.parse(nextQuote || '') > Date.parse(currentQuote || '') || Date.parse(next.boardFetchedAt || '') > Date.parse(payload.boardFetchedAt || '');
    if (!newer) return;
    const wasAtCapturedLine = state.line === player().line;
    payload = next;
    if (!payload.players.some(item => item.id === state.playerId)) state.playerId = payload.players[0].id;
    if (wasAtCapturedLine) state.line = player().line;
    state.gameId = null;
    renderAll();
  }).catch(() => {});

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-home-player],[data-home-view],[data-home-window],[data-home-side],[data-home-reset],[data-home-game],[data-home-path]');
    if (!button) return;
    if (button.dataset.homePlayer) { state.playerId = button.dataset.homePlayer; state.line = player().line; state.gameId = null; state.view = 'research'; renderAll(); workspace.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else if (button.dataset.homePath) { state.path = button.dataset.homePath; renderPathDetail(); }
    else if (button.dataset.homeView) { state.view = button.dataset.homeView; renderWorkspace(); }
    else if (button.dataset.homeWindow) { state.window = Number(button.dataset.homeWindow); state.gameId = null; renderWorkspace(); renderOutcome(); }
    else if (button.dataset.homeSide) { state.side = button.dataset.homeSide; renderWorkspace(); }
    else if (button.hasAttribute('data-home-reset')) { state.line = player().line; renderWorkspace(); renderPathDetail(); renderOutcome(); }
    else if (button.dataset.homeGame) { state.gameId = button.dataset.homeGame; const result = workspace.querySelector('.real-selected-game'); const game = player().games.find(item => item.id === state.gameId); if (game && result) result.innerHTML = `<strong>${date(game.date)} · ${game.home ? 'vs' : '@'} ${escapeHtml(game.opponent)}</strong><span>${fmt(game.value)} receiving yards</span>${game.url ? `<a href="${safeUrl(game.url)}" target="_blank" rel="noreferrer">Box score ↗</a>` : ''}`; }
  });
  document.querySelector('.landing-paths-select')?.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tabs = [...document.querySelectorAll('[data-home-path]')];
    const current = tabs.indexOf(event.target.closest('[data-home-path]'));
    if (current < 0) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    state.path = tabs[next].dataset.homePath;
    renderPathDetail();
    tabs[next].focus();
  });
  workspace.addEventListener('change', event => {
    if (event.target.matches('[data-home-select]')) { state.playerId = event.target.value; state.line = player().line; state.gameId = null; renderAll(); }
    if (event.target.matches('[data-home-line]')) { const next = Number(event.target.value); if (Number.isFinite(next) && next >= 0 && next <= 350) state.line = next; renderWorkspace(); renderPathDetail(); renderOutcome(); }
    if (event.target.matches('[data-home-sort]')) { state.sort = event.target.value; renderBoardResults(); }
  });
  workspace.addEventListener('input', event => {
    if (event.target.matches('[data-home-search]')) { state.search = event.target.value; renderBoardResults(); }
    if (event.target.matches('[data-home-line]')) { const next = Number(event.target.value); if (event.target.value !== '' && Number.isFinite(next) && next >= 0 && next <= 350) { state.line = next; refreshComparison(); renderPathDetail(); renderOutcome(); } }
  });
}

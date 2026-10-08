import {SECONDARY_TOOLS, MORE_TOOL_GROUPS} from './ev-tool-catalog.js';
import {icon} from './ui-icons.js';
import {boardIcon, bookLogo, startLabel} from './ev-board.js?v=7';
import {leagueMark} from './sports-identity.js';
export const toolEsc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const purposes = {
  middles:'Two lines. One winning window. Compare the upside and the cost outside it.',
  holds:'Find the tightest two-sided markets across your recorded sportsbook prices.',
  promo:'Turn a promotion into a clear stake plan. See the result on either side.',
  parlay:'Build your ticket one leg at a time, with fair probabilities beside every price.',
  optimizer:'Rank two-pick power entries from no-vig fair probabilities and each app’s published payouts.',
  slip:'Choose your picks, set the payout rules, and see the math behind your entry.',
  'fantasy-alerts':'Keep your player-prop watchlist in one place. Review matches as you add new lines.',
  prediction:'A workspace for contract prices, market depth, and your recorded positions.',
  'relay-boards':'Read the relayed positive-EV, arbitrage, liquidity and market-position boards side by side.',
  trends:'Read the recent form in your saved results, then compare related player props.',
  'line-alerts':'Set your price targets and follow the moves in your recorded markets.'
};
/* Page hero shared by every secondary /ev tool: icon tile, title with a gradient
   accent word, one-line purpose, primary action and optional stat counters. */
export const accentTitle = title => {
  const text = String(title ?? ''), cut = text.lastIndexOf(' ');
  return cut < 0 ? `<span class="tool-accent">${toolEsc(text)}</span>` : `${toolEsc(text.slice(0, cut))} <span class="tool-accent">${toolEsc(text.slice(cut + 1))}</span>`;
};
export function toolHero({title = '', description = '', group = '', symbol = 'research', dataLabel = '', actions = '', stats = ''} = {}) {
  const counters = Array.isArray(stats) ? (stats.length ? `<dl class="tool-hero-stats">${stats.map(([label, value, accent]) => `<div${accent ? ' class="is-accent"' : ''}><dt>${toolEsc(label)}</dt><dd>${toolEsc(value)}</dd></div>`).join('')}</dl>` : '') : stats;
  return `<header class="tool-heading tool-hero"><div class="tool-hero-copy">${group ? `<span class="tool-kicker">${toolEsc(group)}</span>` : ''}<div class="tool-title-row"><span class="tool-hero-icon" aria-hidden="true">${icon(symbol)}</span><h1>${accentTitle(title)}</h1>${dataLabel ? `<span class="tool-data-label">${toolEsc(dataLabel)}</span>` : ''}</div><p>${description}</p></div><div class="tool-heading-actions">${actions}</div>${counters}</header>`;
}
export function secondaryShell(key, content, {actions='',sport='',sports=['NFL','MLB','NBA','WNBA','NHL','Soccer'],search='',dataLabel='',filters=''} = {}) {
  const tool = SECONDARY_TOOLS.find(item=>item.key===key);
  if (!tool) return content;
  const related = MORE_TOOL_GROUPS.find(group=>group.label===tool.group).tools.filter(item=>!['ev-live','arb-live'].includes(item.key));
  // Middles and Low holds keep their board body (and its own summary strip);
  // every tool gets the 2026 page hero.
  const board = ['middles','holds'].includes(key) && !String(content).includes('class="evx-workspace');
  let stats = '';
  // A leading stat strip in the tool body becomes the hero's counters.
  if (!board) content = String(content).replace(/<dl class="tool-stats">[\s\S]*?<\/dl>/, match => { stats = match.replace('class="tool-stats"', 'class="tool-hero-stats"'); return ''; });
  const heading = toolHero({title:tool.label,description:purposes[key],group:tool.group,symbol:tool.icon,dataLabel,actions,stats});
  return `<div class="tool-workspace es-2026${board ? ' is-board' : ''}" data-tool-workspace="${key}">${heading}
    <div class="tool-context"><nav class="tool-related" aria-label="Related tools">${related.map(item=>`<button type="button" data-tool="${item.key}" ${key===item.key?'aria-current="page"':''}>${icon(item.icon)}${item.label}</button>`).join('')}</nav><div class="tool-filters"><label><span class="tool-sr">Tool sport</span><select aria-label="Tool sport" data-tool-sport><option value="">All sports</option>${sports.map(name=>`<option ${sport===name?'selected':''}>${toolEsc(name)}</option>`).join('')}</select></label><label class="tool-search">${icon('search')}<input type="search" data-tool-search aria-label="Search this tool" placeholder="Search teams, players, markets" value="${toolEsc(search)}"></label></div></div>${filters}
    <div class="tool-content">${content}</div></div>`;
}
export function toolPanel(title, subtitle, body, {actions='',className=''}={}) {
  return `<section class="tool-panel ${className}"><header class="tool-panel-heading"><div><h2>${title}</h2>${subtitle?`<p>${subtitle}</p>`:''}</div>${actions?`<div class="tool-panel-actions">${actions}</div>`:''}</header><div class="tool-panel-body">${body}</div></section>`;
}
export function toolEmpty(title, description, action='', symbol='research') {
  return `<div class="tool-empty"><span class="tool-empty-icon">${icon(symbol)}</span><h3>${title}</h3><p>${description}</p>${action?`<div class="tool-empty-action">${action}</div>`:''}</div>`;
}
export function toolStats(items) {
  return `<dl class="tool-stats">${items.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}
export function toolNote(text) { return `<p class="tool-note">${icon('info')}<span>${text}</span></p>`; }
export function toolReceipt(title, value, rows, note='') {
  return `<aside class="tool-receipt"><span class="tool-receipt-label">${title}</span><strong class="tool-receipt-value">${value}</strong><dl>${rows.map(([label,amount])=>`<div><dt>${label}</dt><dd>${amount}</dd></div>`).join('')}</dl>${note?`<p>${note}</p>`:''}</aside>`;
}

/* Opportunity boards: the Positive EV table language (evb-*) for secondary tools.
   Text fields are escaped; `actions`, `html` and `summary.text` are internal markup slots. */
const BOARD_COLUMNS = ['metric','event','market','bet','odds','prob','stake','actions'];
export const boardButton = (label, attrs = '', symbol = '') => `<button type="button" class="evb-link" ${attrs}>${label}${symbol ? boardIcon(symbol, 13) : ''}</button>`;
export const boardIconButton = (symbol, label, attrs = '') => `<button type="button" class="evb-icon" ${attrs} aria-label="${toolEsc(label)}" title="${toolEsc(label)}">${boardIcon(symbol)}</button>`;
export const boardToggle = (label, attrs = '') => `<button type="button" class="evb-icon evb-toggle" ${attrs} aria-expanded="false" aria-label="${toolEsc(label)}" title="Compare books">${boardIcon('chevron')}</button>`;
/* Selected legs/picks: book mark, selection, price pill and a remove control (internal markup). */
export function boardTicket(items) {
  return `<div class="tool-selected evt-ticket">${items.map(item => `<div class="tool-selected-item">${item.book ? `<span class="evb-book-logo">${bookLogo(item.book, 30)}</span>` : ''}<div><strong>${toolEsc(item.title)}</strong>${item.sub ? `<small>${toolEsc(item.sub)}</small>` : ''}</div><span class="evt-ticket-side">${item.price ? `<span class="evb-price">${toolEsc(item.price)}</span>` : ''}${item.action || ''}</span></div>`).join('')}</div>`;
}
/* Card layout for the builder and research tools: each variant arranges the same row data
   (metric, event, market, bet, odds, prob, stake, actions) around what that tool is for. */
function toolCards({label, columns, rows, summary, variant, className}) {
  const small = value => value === '' || value == null ? '' : `<small>${toolEsc(value)}</small>`;
  const pct = value => { const n = parseFloat(String(value ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0; };
  const league = sport => sport ? `<span class="evc-league">${String(sport).split(' / ').map(code => leagueMark(code.toLowerCase()) || '').join('')}<span>${toolEsc(sport)}</span></span>` : '';
  const logo = book => book ? `<span class="evb-book-logo">${bookLogo(book, 30)}</span>` : '';
  const head = row => `<header class="evc-head">${league(row.event?.sport)}<small>${toolEsc(row.event?.time ?? (row.event?.quote ? startLabel(row.event.quote) : ''))}</small>${row.live ? '<span class="evc-live">Live</span>' : ''}${row.market ? `<span class="evc-tag">${toolEsc(row.market)}</span>` : ''}</header>`;
  const metric = row => { const m = row.metric || {}; return `<div class="evc-metric${m.negative ? ' is-negative' : ''}" data-tier="${m.tier || 'high'}"><span>${toolEsc(columns.metric || 'Edge')}</span><strong>${toolEsc(m.value ?? '—')}</strong>${small(m.label)}</div>`; };
  const ring = (value, caption) => `<div class="evc-ring" style="--pct:${pct(value)}"><span class="evc-ring-dial"><strong>${toolEsc(value ?? '—')}</strong></span><small>${toolEsc(caption)}</small></div>`;
  const stat = (name, cell) => cell ? `<div class="evc-stat"><span>${toolEsc(name)}</span><strong>${toolEsc(cell.value ?? '—')}</strong>${small(cell.sub)}</div>` : '';
  const bodies = {
    promo: row => `<div class="evc-event"><strong>${toolEsc(row.event?.title || '—')}</strong></div>
      <div class="evc-pair"><div class="evc-side"><span class="evc-side-label">${toolEsc(columns.bet || 'Promotion bet')}</span><div class="evc-side-main">${logo(row.bet?.book)}<span><strong>${toolEsc(row.bet?.title || '—')}</strong>${small(row.bet?.book)}</span><span class="evb-price">${toolEsc(row.odds?.value ?? '—')}</span></div></div>
      <span class="evc-arrow" aria-hidden="true">→</span>
      <div class="evc-side is-hedge"><span class="evc-side-label">${toolEsc(columns.prob || 'Hedge')}</span><div class="evc-side-main"><span><strong>${toolEsc(row.prob?.sub || '—')}</strong>${small(row.stake ? `Stake ${row.stake.value}` : '')}</span><span class="evb-price">${toolEsc(row.prob?.value ?? '—')}</span></div></div></div>
      ${metric(row)}`,
    parlay: row => `<div class="evc-event"><strong>${toolEsc(row.event?.title || '—')}</strong></div>
      <div class="evc-pick">${logo(row.bet?.book)}<span><strong>${toolEsc(row.bet?.title || '—')}</strong>${small(row.bet?.book)}</span><span class="evb-price">${toolEsc(row.odds?.value ?? '—')}</span></div>
      <div class="evc-meter"><span>${toolEsc(columns.prob || 'Fair chance')} <b>${toolEsc(row.prob?.value ?? '—')}</b></span><i><em style="width:${pct(row.prob?.value)}%"></em></i>${small(row.odds?.sub)}</div>
      ${metric(row)}`,
    optimizer: row => `<div class="evc-combo">${(row.picks || []).map((pick, index) => `${index ? '<span class="evc-plus" aria-hidden="true">+</span>' : ''}<div class="evc-combo-pick"><strong>${toolEsc(pick.player)}</strong><small>${toolEsc(`${pick.side} ${pick.line ?? '—'} ${pick.market}`)}</small><span class="evc-chip">${toolEsc(pick.chance)}</span></div>`).join('')}</div>
      <div class="evc-foot-stats">${ring(row.prob?.value, columns.prob || 'Both hit')}<div class="evc-stat-stack">${stat(columns.odds || 'Payout', row.odds)}<div class="evc-app">${logo(row.bet?.book)}<small>${toolEsc(row.bet?.book || '')}</small></div></div>${metric(row)}</div>`,
    slip: row => { const d = row.slip || {}, initials = String(d.player || '').split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]).join('');
      return `<header class="evc-slip-head"><span class="evc-avatar" aria-hidden="true">${toolEsc(initials || '—')}${d.sport ? `<span class="evc-avatar-league">${leagueMark(String(d.sport).toLowerCase()) || ''}</span>` : ''}</span>
        <div class="evc-slip-who"><strong>${toolEsc(d.player || '—')}</strong><small>${toolEsc([d.team, d.time || d.event].filter(Boolean).join(' · ') || d.sport || '')}</small></div>${logo(row.bet?.book)}</header>
      <div class="evc-slip-line"><strong>${toolEsc(d.line ?? '—')}</strong><span>${toolEsc(d.market)}</span></div>
      <div class="evc-slip-sides${(d.sides || []).length === 1 ? ' is-single' : ''}" role="group" aria-label="Choose a side">${(d.sides || []).map(side => `<button type="button" class="evc-side-pick" data-side="${toolEsc(String(side.side).toLowerCase())}" style="--rate:${pct(side.value)}%" ${side.attrs}><span class="evc-side-name">${String(side.side).toLowerCase() === 'under' ? '<i aria-hidden="true">↓</i>' : '<i aria-hidden="true">↑</i>'}${toolEsc(side.side)}</span><b>${toolEsc(side.value)}</b></button>`).join('')}</div>`; },
    prediction: row => `<div class="evc-event"><strong>${toolEsc(row.event?.title || '—')}</strong></div>
      <div class="evc-pick">${logo(row.bet?.book)}<span><strong>${toolEsc(row.bet?.title || '—')}</strong>${row.bet?.html || ''}</span></div>
      <div class="evc-quotes"><div class="is-ask"><span>${toolEsc(columns.odds || 'Yes ask')}</span><strong>${toolEsc(row.odds?.value ?? '—')}</strong>${small(row.odds?.sub)}</div><div class="is-bid"><span>${toolEsc(columns.prob || 'Yes bid')}</span><strong>${toolEsc(row.prob?.value ?? '—')}</strong>${small(row.prob?.sub)}</div></div>
      <div class="evc-meter is-market"><span>Market chance of yes <b>${pct(row.odds?.value)}%</b></span><i><em style="width:${pct(row.odds?.value)}%"></em></i></div>
      <div class="evc-foot-stats">${metric(row)}${stat(columns.stake || 'Depth', row.stake)}</div>`
  };
  const body = bodies[variant] || bodies.parlay;
  const cards = rows.map(row => `<article class="evc-card${row.attrs && /data-open-(quote|dfs)=/.test(row.attrs) ? ' is-openable' : ''}${row.selected ? ' is-pinned' : ''}${row.className ? ' ' + toolEsc(row.className) : ''}" role="listitem"${row.id ? ` data-wager-id="${toolEsc(row.id)}"` : ''} ${row.attrs || ''}>${variant === 'slip' ? '' : head(row)}${body(row)}${row.actions ? `<footer class="evc-actions">${row.actions}</footer>` : ''}</article>`).join('');
  const bar = summary ? `<div class="evb-summary"><p>${summary.text || ''}</p>${summary.pills?.length ? `<dl>${summary.pills.map(([term, value, positive]) => `<div><dt>${toolEsc(term)}</dt><dd${positive ? ' class="is-positive"' : ''}>${toolEsc(value)}</dd></div>`).join('')}</dl>` : ''}</div>` : '';
  return `<div class="evb-board evc-board evc-${toolEsc(variant)}${className ? ' ' + toolEsc(className) : ''}">${bar}<div class="evc-grid" role="list" aria-label="${toolEsc(label)}">${cards}</div></div>`;
}
export function toolBoard({label = 'Opportunities', columns = {}, rows = [], summary = null, compact = false, className = '', layout = 'table', variant = ''} = {}) {
  if (layout === 'cards') return toolCards({label, columns, rows, summary, variant, className});
  const used = BOARD_COLUMNS.filter(key => ['metric','event','market','actions'].includes(key) || columns[key]);
  const width = Math.max(...rows.map(row => Number(row.metric?.bar)).filter(Number.isFinite), 0);
  const head = used.map(key => key === 'actions' ? '<th scope="col" class="evb-col-actions"><span class="tool-sr">Actions</span></th>' : `<th scope="col"${key === 'metric' ? ' class="evb-col-ev"' : ''}>${toolEsc(columns[key] || {metric:'Edge',event:'Event',market:'Market'}[key])}</th>`).join('');
  const small = value => value === '' || value == null ? '' : `<small>${toolEsc(value)}</small>`;
  const cell = {
    metric: ({metric: m = {}}) => `<td class="evb-ev${m.negative ? ' is-negative' : ''}" data-tier="${m.tier || 'high'}"><strong>${toolEsc(m.value ?? '—')}</strong>${Number.isFinite(Number(m.bar)) && width > 0 ? `<span class="evb-ev-bar" aria-hidden="true"><i style="width:${Math.max(6, Math.min(100, Number(m.bar) / width * 100)).toFixed(1)}%"></i></span>` : ''}${small(m.label)}</td>`,
    event: ({event: e = {}}) => `<td class="evb-event">${small(e.time ?? (e.quote ? startLabel(e.quote) : ''))}<strong>${toolEsc(e.title || '—')}</strong>${e.note ? `<small class="evt-event-note">${toolEsc(e.note)}</small>` : ''}${e.sport ? `<span class="evb-league">${leagueMark(String(e.sport).toLowerCase()) || ''}<span>${toolEsc(e.sport)}</span></span>` : ''}</td>`,
    market: ({market = '', live}) => `<td class="evb-market"><span>${toolEsc(market || '—')}</span>${live ? '<small class="evb-live-dot">Live</small>' : ''}</td>`,
    bet: ({bet: b = {}, market = ''}) => `<td class="evb-bet">${b.book ? `<span class="evb-book-logo">${bookLogo(b.book, 30)}</span>` : ''}<span><strong>${toolEsc(b.title || '—')}</strong>${market ? `<small class="evb-bet-market">${toolEsc(market)}</small>` : ''}${(b.lines || []).map(small).join('')}${b.html || ''}</span></td>`,
    odds: ({odds: o = {}}) => `<td class="evb-odds">${o.value == null || o.value === '' ? '<strong class="evt-none">—</strong>' : `<span class="evb-price">${toolEsc(o.value)}</span>`}${small(o.sub)}</td>`,
    prob: ({prob: p = {}}) => `<td class="evb-prob"><strong${p.positive ? ' class="is-positive"' : ''}>${toolEsc(p.value ?? '—')}</strong>${small(p.sub)}</td>`,
    stake: ({stake: s = {}}) => `<td class="evb-stake"><strong${s.positive ? ' class="is-positive"' : s.negative ? ' class="is-negative"' : ''}>${toolEsc(s.value ?? '—')}</strong>${small(s.sub)}</td>`,
    actions: ({actions = ''}) => `<td class="evb-actions"><div>${actions}</div></td>`
  };
  const body = rows.map(row => `<tr class="evb-row evt-row${row.attrs && /data-open-(quote|dfs)=/.test(row.attrs) ? '' : ' is-static'}${row.selected ? ' is-pinned' : ''}${row.className ? ' ' + toolEsc(row.className) : ''}"${row.id ? ` data-wager-id="${toolEsc(row.id)}"` : ''} ${row.attrs || ''}>${used.map(key => cell[key](row)).join('')}</tr>`).join('');
  const bar = summary ? `<div class="evb-summary"><p>${summary.text || ''}</p>${summary.pills?.length ? `<dl>${summary.pills.map(([term, value, positive]) => `<div><dt>${toolEsc(term)}</dt><dd${positive ? ' class="is-positive"' : ''}>${toolEsc(value)}</dd></div>`).join('')}</dl>` : ''}</div>` : '';
  return `<div class="evb-board evt-board${compact ? ' is-compact' : ''}${className ? ' ' + toolEsc(className) : ''}">${bar}<div class="evb-table-wrap"><table class="evb-table evt-table" aria-label="${toolEsc(label)}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></div>`;
}

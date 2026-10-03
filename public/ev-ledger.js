import { accountStorage, accountReady, accountSyncState } from './account-sync.js';
import { readBets, writeBets, validateBet, betReturns, STATUSES, SPORTS, BET_STORAGE_KEY } from './bet-utils.js?v=4';
import { performanceSummary, marketIdentity, quoteAvailable, consensusPrice } from './ev-advanced-math.js?v=2';

await accountReady;

// The ledger shares /ev/tracker's account-owned bet records.
export const suiteLedgerStorage = {
  getItem: key => accountStorage.getItem(key),
  setItem: (key,value) => accountStorage.setItem(key,value),
  removeItem: key => accountStorage.removeItem(key)
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
const numeric = value => value !== '' && value != null && typeof value !== 'boolean' && Number.isFinite(Number(value)) ? Number(value) : NaN;
const cash = value => Number.isFinite(value) ? new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(value) : '—';
const pct = value => Number.isFinite(value) ? `${(100 * value).toFixed(2)}%` : '—';
const price = (value, format = 'american') => Number.isFinite(numeric(value)) ? format === 'decimal' ? Number(value).toFixed(3) : `${value > 0 ? '+' : ''}${value}` : '—';
const toAmerican = (value, format) => format !== 'decimal' ? numeric(value) : numeric(value) > 1 ? Number(value) >= 2 ? (Number(value) - 1) * 100 : -100 / (Number(value) - 1) : NaN;
const uid = () => crypto.randomUUID();
const today = () => { const time = new Date(); return new Date(time.getTime() - time.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const clone = value => JSON.parse(JSON.stringify(value));
const selectedKey = quote => `${marketIdentity(quote)}|${String(quote.side || '').trim().toLowerCase()}`;
const eventKey = quote => JSON.stringify([quote.sport, quote.league || quote.sport, quote.eventId || quote.event]);
// "Dallas Cowboys +3 · Spread · Dallas Cowboys @ Houston Texans": team and game, not the feed's home/away key.
const signedLine = quote => quote.line === '' || quote.line == null ? '' : `${quote.type === 'spread' && Number(quote.line) > 0 ? '+' : ''}${quote.line}`;
const quoteLabel = quote => [[quote.player, quote.selection || quote.side, signedLine(quote)].filter(Boolean).join(' '), quote.displayMarket || quote.market, quote.displayEvent || quote.event].filter(Boolean).join(' · ');
const sourceLabel = quote => quote?.source === 'manual' || !quote?.source ? 'Entered' : String(quote.source);
const button = (label, action, id = '') => `<button type="button" data-evl-action="${action}" data-evl-id="${esc(id)}">${esc(label)}</button>`;
const input = (name, label, value = '', type = 'text', extra = '') => `<label class="evl-field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
const select = (name, label, value, options, filter = false) => `<label class="evl-field"><span>${esc(label)}</span><select ${filter ? `data-evl-filter="${name}"` : `name="${name}"`}>${options.map(item => { const [key, title] = Array.isArray(item) ? item : [item, item]; return `<option value="${esc(key)}"${String(key) === String(value) ? ' selected' : ''}>${esc(title)}</option>`; }).join('')}</select></label>`;
const statusName = status => STATUSES[status] || ({live:'Live',ungraded:'Needs grading',settled:'Settled'})[status] || status;
const tone = value => Number.isFinite(value) ? value > 0 ? 'evl-positive' : value < 0 ? 'evl-negative' : '' : '';
const isMap = value => value && typeof value === 'object' && !Array.isArray(value);
const marketCache = new WeakMap();
function manualLeg(quote, index = 0, result = 'open') {
  const side = String(quote.side || '').toLowerCase(), type = String(quote.type || '').toLowerCase();
  const moneyline = ['moneyline','three-way','1x2','future'].includes(type) || /moneyline/i.test(quote.market || '')
    || !Number.isFinite(numeric(quote.line)) && !['over','under'].includes(side) && !['prop','spread','total','alternate'].includes(type);
  const market = moneyline ? 'moneyline' : type === 'spread' || type === 'alternate' && !['over','under'].includes(side) ? 'spread' : String(quote.market || 'custom').slice(0,50);
  const canonicalSide = ['over','under','home','away','draw','at_least','exactly'].includes(side) ? side : ['home','away'].includes(quote.homeAway) ? quote.homeAway : 'home';
  return { id:uid(),mode:'manual',entry:'game',sport:SPORTS.includes(quote.sport)?quote.sport:'Other',league:quote.league||'',
    date:String(quote.startTime||quote.date||'').slice(0,10),gameId:'',market,marketLabel:String(quote.market||market),
    subjectId:'',subject:quote.player||quote.selection||quote.side||'',matchup:quote.displayEvent||quote.event||'',label:quoteLabel(quote).slice(0,240)||`Selection ${index+1}`,
    side:canonicalSide,line:moneyline?null:numeric(quote.line),override:({win:'won',loss:'lost'})[result]||result,observation:null };
}

/** Shares the existing tracker's account storage, migration receipts and validator. */
export function createEvLedger({ getState, save, redraw, navigate, getSettings = () => ({}) }) {
  let active = 'tracker', message = '', storageError = '', selected = new Set(), page = 1, dialog = null;
  const defaults = { query:'', status:'all', sport:'', league:'', market:'', book:'', tool:'', tag:'', from:'', to:'', source:'personal', group:'tool', chart:'cumulative' };
  function suite() {
    const state = getState();
    if (!isMap(state.suite)) state.suite = {};
    if (!isMap(state.suite.betMeta)) state.suite.betMeta = {};
    if (!isMap(state.suite.tagColors)) state.suite.tagColors = {};
    return state.suite;
  }
  const options = () => ({ ...defaults, ...(suite().ledger?.filters || suite().ledgerPreferences || {}) });
  function setFilters(value = {}, refresh = true) {
    const filters = Object.fromEntries(Object.keys(defaults).map(key => [key, typeof value[key] === 'string' ? value[key] : defaults[key]]));
    suite().ledger = { ...(suite().ledger || {}), filters };
    page = 1;
    if (refresh) persist();
    return filters;
  }
  const metaFor = id => Object.hasOwn(suite().betMeta, id) ? suite().betMeta[id] || {} : {};
  const quotes = () => Array.isArray(getState().quotes) ? getState().quotes : [];
  function persist(text) { if (text) message = text; save(); redraw(); }
  function personal() {
    try { const records = readBets(suiteLedgerStorage); storageError = ''; return records; }
    catch (error) { storageError = error.message || 'Saved bets could not be read.'; return []; }
  }
  function readForWrite() {
    // Never replace a malformed or inaccessible ledger with an empty array.
    return readBets(suiteLedgerStorage);
  }
  function legacyBet(raw) {
    const status = ({win:'won',loss:'lost',cashout:'cashed',live:'open',ungraded:'open'})[raw.result || raw.status] || raw.result || raw.status || 'open';
    return validateBet({ ...raw, selection:raw.selection || raw.event || 'Saved workspace bet', book:raw.book || raw.app || '', sport:SPORTS.includes(raw.sport) ? raw.sport : 'Other',
      type:raw.type === 'parlay' ? 'parlay' : 'single', date:String(raw.date || raw.ts || '').slice(0,10), oddsFormat:raw.oddsFormat || 'american',
      status, closingOdds:raw.closingOdds ?? raw.closeOdds, settlement:'manual', legs:[] });
  }
  function allRows() {
    const rows = personal().map(bet => ({ ref:`personal:${bet.id}`, id:bet.id, bet, meta:metaFor(bet.id), source:'personal', label:'Personal ledger' }));
    for (const [index, raw] of (Array.isArray(getState().bets) ? getState().bets : []).entries()) {
      try {
        if (raw.source === 'example' || raw.demo === true) continue;
        rows.push({ ref:`legacy:${index}`, id:`legacy:${raw.id || index}`, bet:legacyBet(raw), meta:{ ...raw, ...metaFor(`legacy:${raw.id || index}`) },
          source:'legacy', label:'Legacy workspace', raw });
      } catch { /* Invalid legacy records stay untouched in their original collection. */ }
    }
    return rows;
  }
  function rowStatus(row) {
    if (row.meta.kind === 'fantasy' && row.bet.status !== 'open' && Number.isFinite(numeric(row.meta.settledReturn))) return 'settled';
    if (row.bet.status !== 'open') return row.bet.status;
    if (row.bet.legs?.some(leg => ['review','unavailable'].includes(leg.observation?.state))) return 'ungraded';
    if (row.bet.legs?.some(leg => leg.observation?.state === 'live') || row.meta.progress?.state === 'live') return 'live';
    return 'open';
  }
  function filtered(rows = allRows()) {
    const current = options(), query = current.query.trim().toLowerCase();
    return rows.filter(row => (current.source === 'all' || row.source === current.source)
      && (current.status === 'all' || current.status === 'settled' ? current.status === 'all' || row.bet.status !== 'open' : rowStatus(row) === current.status)
      && (!current.from || row.bet.date >= current.from) && (!current.to || row.bet.date <= current.to)
      && ['sport','league','market','book','tool'].every(field => !current[field] || String(field === 'league' ? row.meta.league || row.bet.sport : row.bet[field] || '') === current[field])
      && (!current.tag || row.bet.tags.includes(current.tag))
      && (!query || [row.bet.selection,row.bet.book,row.bet.sport,row.bet.market,row.bet.notes,...row.bet.tags].some(value => String(value || '').toLowerCase().includes(query))))
      .sort((a,b) => b.bet.date.localeCompare(a.bet.date) || String(b.bet.updatedAt || '').localeCompare(String(a.bet.updatedAt || '')));
  }
  function summaryInput(row) {
    const bet = row.bet, returns = betReturns(bet), snapshot = row.meta.quoteSnapshots?.length === 1 ? row.meta.quoteSnapshots[0] : row.meta.quote;
    return { ...(snapshot || {}), ...bet, ...row.meta, id:row.ref, odds:toAmerican(bet.odds,bet.oddsFormat), stake:bet.stake,
      result:row.meta.kind === 'fantasy' && bet.status !== 'open' ? 'settled' : ({won:'win',lost:'loss',cashed:'cashout'})[bet.status] || bet.status, date:bet.date,
      profit:returns.profit, netProfit:returns.profit, closeOdds:row.meta.closeComparable===true?toAmerican(bet.closingOdds,bet.oddsFormat):NaN, quote:snapshot,
      // The other side's close makes no-vig CLV possible (devigged with the member's method).
      ...(bet.closingOtherOdds!=null?{closeOtherOdds:toAmerican(bet.closingOtherOdds,bet.oddsFormat)}:{}),
      closeLine:row.meta.closeLine, closeComparable:row.meta.closeComparable === true, league:row.meta.league || bet.sport };
  }
  function filterBar(rows) {
    const current = options(), values = field => [...new Set(rows.map(row => field === 'league' ? row.meta.league || row.bet.sport : row.bet[field]).filter(Boolean))].sort();
    const field = (key,label,type='text') => `<label class="evl-field"><span>${label}</span><input data-evl-filter="${key}" type="${type}" value="${esc(current[key])}"></label>`;
    return `<div class="evl-filters">${field('query','Search bets','search')}${select('status','Status',current.status,[['all','All results'],['open','Open'],['live','Live'],['ungraded','Needs grading'],['settled','Settled'],['won','Won'],['lost','Lost'],['push','Push'],['void','Void']],true)}${select('source','Record source',current.source,[['personal','Personal ledger'],['legacy','Legacy workspace'],['all','All sources']],true)}${field('from','From','date')}${field('to','Through','date')}<details class="evl-extra"><summary>More filters</summary><div class="evl-filters">${['sport','league','market','book','tool'].map(key=>select(key,key[0].toUpperCase()+key.slice(1),current[key],[['','All'],...values(key).map(value=>[value,value])],true)).join('')}${select('tag','Tag',current.tag,[['','All tags'],...[...new Set(rows.flatMap(row=>row.bet.tags))].sort().map(tag=>[tag,tag])],true)}${button('Clear filters','reset')}</div></details></div>`;
  }
  const statistic = (label,value) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  const stats = summary => `<div class="evl-stats">${statistic('Settled profit',cash(summary.profit))}${statistic('ROI',pct(summary.roi))}${statistic('Amount risked',cash(summary.risked))}${statistic('Open exposure',cash(summary.openExposure))}${statistic('Price CLV',pct(summary.averageClv))}${summary.noVigClvCount>0?statistic('No-vig CLV',pct(summary.averageNoVigClv)):''}</div>`;
  function tagsMarkup(tags) {
    return tags.map(tag => { const color = suite().tagColors[tag], safe = /^#[0-9a-f]{6}$/i.test(color || '') ? color : '#9890ef'; return `<span class="evl-tag" style="--tag-color:${safe}">${esc(tag)}</span>`; }).join('');
  }
  function progress(row) {
    const legs = row.bet.legs || [], supplied = row.meta.progress;
    const lines = legs.filter(leg => Number.isFinite(numeric(leg.observation?.actual))).map(leg => `${leg.label}: ${leg.observation.actual}${Number.isFinite(numeric(leg.line)) ? ` / ${leg.line}` : ''}`);
    if(!Array.isArray(row.meta.legResults))for(const leg of legs)if(leg.override&&leg.override!=='open')lines.push(`${leg.label}: ${statusName(leg.override)} (entered)`);
    if (isMap(supplied) && Number.isFinite(numeric(supplied.actual))) lines.push(`${supplied.label || 'Observed statistic'}: ${supplied.actual}${Number.isFinite(numeric(supplied.target)) ? ` / ${supplied.target}` : ''}`);
    if (Array.isArray(row.meta.legResults) && row.meta.legResults.length) lines.push('Recorded legs: ' + row.meta.legResults.map((result,index)=>`${index+1} ${statusName(({win:'won',loss:'lost'})[result]||result)}`).join(' · '));
    return lines.length ? `<small class="evl-progress">${lines.map(esc).join('<br>')}</small>` : '';
  }
  function calculation(meta) {
    if (!isMap(meta.devigSettings)) return '';
    const settings=meta.devigSettings,rules=Array.isArray(settings.bookRules)?settings.bookRules.filter(rule=>rule.enabled!==false):[];
    return `<details class="evl-calculation"><summary>Calculation snapshot</summary><p>${esc(settings.devigMethod||'multiplicative')} devig · ${esc(settings.minSharpBooks||1)} minimum reference book${Number(settings.minSharpBooks||1)===1?'':'s'}<br>${esc(rules.map(rule=>`${rule.book}: ${rule.weight??1}${rule.required?' (required)':''}`).join(' · ')||'All eligible reference books')}${meta.probabilityBasis?'<br>'+esc(meta.probabilityBasis):''}</p></details>`;
  }
  // Current price and fair value for each tracked bet. Scanning every quote (and pricing consensus
  // from all of them) per row took 5 s for a 40-row page on the 20k-quote feed, on every redraw. The
  // feed replaces the quote array on each sync, so one index per array serves every redraw until then
  // (rebuilt when settings change or after 30 s, as quotes age out of availability).
  function market() {
    const list = quotes(), settings = getSettings() || {}, settingsKey = JSON.stringify(settings), now = Date.now(), cached = marketCache.get(list);
    if (cached && cached.length === list.length && cached.settingsKey === settingsKey && now - cached.at < 30_000) return cached;
    // Newest available quote per selection and book, and available quotes per market identity (the
    // index consensusPrice accepts, built from the same quotes, settings and time).
    const newest = new Map(), byMarket = new Map();
    for (const quote of list) {
      if (!quoteAvailable(quote,settings,now)) continue;
      const identity = marketIdentity(quote), rows = byMarket.get(identity);
      if (rows) rows.push(quote); else byMarket.set(identity,[quote]);
      const id = `${identity}|${String(quote.side || '').trim().toLowerCase()}|${quote.book}`, previous = newest.get(id);
      if (!previous || Date.parse(quote.ts) > Date.parse(previous.ts)) newest.set(id,quote);
    }
    const entry = { length:list.length, settingsKey, at:now, settings:{ ...settings, now }, newest, byMarket, consensus:new Map() };
    marketCache.set(list,entry);
    return entry;
  }
  function marketNow(row) {
    const snapshots = row.meta.quoteSnapshots || [], original = snapshots.length === 1 ? snapshots[0] : null;
    if (!original) return '';
    const index = market(), current = index.newest.get(`${selectedKey(original)}|${original.book}`);
    if (!current) return '';
    if (!index.consensus.has(current.id)) index.consensus.set(current.id,consensusPrice(current,quotes(),index.settings,index.byMarket));
    const consensus = index.consensus.get(current.id);
    return `<small>Current ${esc(price(current.odds))}${Number.isFinite(consensus.probability) ? ` · Fair ${pct(consensus.probability)}` : ''}</small>`;
  }
  function tracker(rows) {
    const pages = Math.max(1,Math.ceil(rows.length/40)); page = Math.max(1,Math.min(page,pages));
    const visible = rows.slice((page-1)*40,page*40);
    return `<div class="evl-toolbar">${button('Add a bet','add')}${button('Export filtered CSV','export')}${button(`Tag selected (${selected.size})`,'bulk')}<label class="evl-check"><input type="checkbox" data-evl-select-all ${visible.some(row=>row.source==='personal')&&visible.filter(row=>row.source==='personal').every(row=>selected.has(row.ref))?'checked':''}> Select page</label><span>${rows.length} records</span></div>${rows.length?`<div class="evl-scroll"><table class="evl-table"><thead><tr><th scope="col">Select</th><th scope="col">Selection</th><th scope="col">Book / source</th><th scope="col">Stake / odds</th><th scope="col">Result / P&amp;L</th><th scope="col">Actions</th></tr></thead><tbody>${visible.map(row=>{
      const bet=row.bet, returns=betReturns(bet), recorded=numeric(row.meta.probability);
      return `<tr><td><input type="checkbox" data-evl-select="${esc(row.ref)}" aria-label="Select ${esc(bet.selection)}" ${selected.has(row.ref)?'checked':''} ${row.source!=='personal'?'disabled title="Legacy records remain in their original workspace"':''}></td><td><strong>${esc(bet.selection)}</strong><small>${esc(bet.date)} · ${esc(bet.sport)}${row.meta.league?' · '+esc(row.meta.league):''}</small>${progress(row)}${Number.isFinite(recorded)?`<small>Recorded win estimate ${pct(recorded)}</small>`:''}${marketNow(row)}<div class="evl-tags">${tagsMarkup(bet.tags)}</div>${bet.notes?`<details><summary>Notes</summary><p>${esc(bet.notes)}</p></details>`:''}${row.meta.gradeFlag?'<small class="evl-negative">Grading flagged for review</small>':''}</td><td>${esc(bet.book || 'Unspecified')}<small>${esc(bet.tool || 'Manual')}</small><span class="evl-source">${esc(row.label)}</span>${row.meta.dataSource?`<small>${esc(row.meta.dataSource)}</small>`:''}</td><td>${cash(bet.stake)}<small>${esc(price(bet.odds,bet.oddsFormat))}</small>${bet.status==='open'?`<small>Potential profit ${cash(returns.potentialProfit)}</small>`:''}</td><td><span class="evl-status">${esc(statusName(rowStatus(row)))}</span><strong class="${tone(returns.profit)}">${cash(returns.profit)}</strong></td><td><div class="evl-actions">${row.source==='personal'?button('Edit / settle','edit',row.ref)+button(row.meta.gradeFlag?'Clear flag':'Flag grading','flag',row.ref):button('Copy to ledger','copy',row.ref)}</div></td></tr>`;
    }).join('')}</tbody></table></div><div class="evl-pagination">${page>1?button('Previous','previous'):''}<span>Page ${page} of ${pages}</span>${page<pages?button('Next','next'):''}</div>`:'<div class="evl-empty"><strong>No matching bets</strong><p>Track a selection from a market tool, add a ticket, or choose another record source.</p></div>'}`;
  }
  function chart(summary) {
    const mode=options().chart, source=mode==='monthly'?summary.monthly:summary.daily,clv=mode==='clv',format=clv?pct:cash;
    const series=clv?summary.validBets.filter(row=>Number.isFinite(row.clv)&&row.bet.date).sort((a,b)=>a.bet.date.localeCompare(b.bet.date)).map(row=>({label:row.bet.date,value:row.clv}))
      :source.map(point=>({label:point.date||point.month,value:mode==='cumulative'?point.cumulativeProfit:point.profit}));
    if (!series.length) return `<div class="evl-empty">${clv?'Record comparable closing prices for the exact selection and line to chart CLV.':'Settled, dated bets will appear on this chart.'}</div>`;
    const width=940,height=250,left=76,right=20,top=18,bottom=36,low=Math.min(0,...series.map(point=>point.value)),high=Math.max(0,...series.map(point=>point.value));
    const range=high-low||1, y=value=>top+(high-value)/range*(height-top-bottom), x=index=>left+(series.length===1?0.5:index/(series.length-1))*(width-left-right);
    const line=series.map((point,index)=>`${index?'L':'M'}${x(index).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ');
    return `<figure class="evl-chart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(clv?'Price CLV percentages':mode+' profit in dollars')} from ${esc(series[0].label)} to ${esc(series.at(-1).label)}"><line x1="${left}" y1="${y(0)}" x2="${width-right}" y2="${y(0)}" class="evl-grid"/><text x="${left-10}" y="${top+7}" text-anchor="end">${esc(format(high))}</text><text x="${left-10}" y="${height-bottom}" text-anchor="end">${esc(format(low))}</text><path d="${line}" class="evl-chart-line"/>${series.map((point,index)=>`<circle cx="${x(index)}" cy="${y(point.value)}" r="${series.length<80?3:1.5}"><title>${esc(point.label)}: ${esc(format(point.value))}</title></circle>`).join('')}<text x="${left}" y="${height-8}">${esc(series[0].label)}</text><text x="${width-right}" y="${height-8}" text-anchor="end">${esc(series.at(-1).label)}</text></svg><figcaption>${esc(clv?'Recorded price CLV for comparable selections':mode==='cumulative'?'Cumulative settled profit':mode==='monthly'?'Profit by calendar month':'Profit by day')} · ${clv?'Tickets ordered by placement date.':'Dates use the recorded settlement date when supplied.'}</figcaption></figure>`;
  }
  function performance(rows,summary) {
    const group=options().group, breakdown=summary.groups[group]||[];
    return `<div class="evl-toolbar">${select('chart','Chart',options().chart,[['cumulative','Cumulative profit'],['daily','Daily profit'],['monthly','Monthly profit'],['clv','Price CLV']],true)}${select('group','Break down by',group,['sport','league','market','book','tool','tag'].map(value=>[value,value[0].toUpperCase()+value.slice(1)]),true)}${button('Export filtered CSV','export')}${button('View these bets','tracker')}</div>${chart(summary)}<div class="evl-scroll"><table class="evl-table"><thead><tr><th scope="col">${esc(group)}</th><th scope="col">Settled</th><th scope="col">Profit</th><th scope="col">Risked</th><th scope="col">ROI</th><th scope="col">Exposure</th><th scope="col">Price CLV</th></tr></thead><tbody>${breakdown.map(item=>`<tr><td>${esc(item.label)}</td><td>${item.settled}</td><td class="${tone(item.profit)}">${cash(item.profit)}</td><td>${cash(item.risked)}</td><td>${pct(item.roi)}</td><td>${cash(item.openExposure)}</td><td>${pct(item.averageClv)}<small>${item.clvCount} comparable</small>${item.noVigClvCount>0?`<small>No-vig ${pct(item.averageNoVigClv)} · ${item.noVigClvCount}</small>`:''}</td></tr>`).join('')||'<tr><td colspan="7">No matching performance records.</td></tr>'}</tbody></table></div><p class="evl-note">ROI uses settled money at risk and excludes refunded push and void stakes. Price CLV (vig included) requires a recorded closing price for the identical selection and line; no-vig CLV also needs the other side's close and uses your no-vig method. Multi-tag records appear in each applicable tag group.</p>`;
  }
  function render(tool) {
    if (!['tracker','performance'].includes(tool)) return '';
    active=tool;
    const all=allRows(),rows=filtered(all),summary=performanceSummary(rows.map(summaryInput),getSettings()||{});
    return `<section class="evl-root"><header class="evl-heading"><div><h2>${tool==='tracker'?'Your bet ledger':'Performance'}</h2><p>${tool==='tracker'?'Booked prices, notes and outcomes across every tool.':'Follow profit, exposure and the closing prices you record.'}</p></div>${tool==='tracker'?button('Performance','performance'):button('Bet ledger','tracker')}</header>${message?`<p class="evl-message" role="status">${esc(message)}</p>`:''}${storageError?`<p class="evl-error" role="alert">${esc(storageError)} Existing stored data has been preserved.</p>`:''}${filterBar(all)}${stats(summary)}${tool==='tracker'?tracker(rows):performance(rows,summary)}</section>`;
  }
  function modal(title,content,onSubmit) {
    dialog?.close(); dialog?.remove();
    const element=document.createElement('dialog'); element.className='evl-dialog';element.setAttribute('aria-label',title);
    element.innerHTML=`<form><header><h2>${esc(title)}</h2><button type="button" data-evl-close aria-label="Close dialog">×</button></header>${content}<p class="evl-error" data-evl-error hidden role="alert"></p><footer><button type="button" data-evl-close>Cancel</button><button type="submit" class="evl-primary">Save</button></footer></form>`;
    element.addEventListener('click',event=>{event.stopPropagation();if(event.target.closest('[data-evl-close]'))element.close();});
    element.addEventListener('change',event=>event.stopPropagation());
    element.addEventListener('input',event=>event.stopPropagation());
    element.querySelector('form').addEventListener('submit',event=>{event.preventDefault();event.stopPropagation();try{onSubmit(new FormData(event.currentTarget),event.currentTarget);element.close();}catch(error){const feedback=element.querySelector('[data-evl-error]');feedback.hidden=false;feedback.textContent=error.message||'Unable to save this record.';}});
    const focus=document.activeElement;
    element.addEventListener('close',()=>{element.remove();if(dialog===element)dialog=null;focus?.isConnected&&focus.focus();},{once:true});
    document.body.append(element); dialog=element; element.showModal(); return element;
  }
  function duplicateWarnings(records,editingId='') {
    if(!records.length)return '';
    const keys=new Set(records.map(selectedKey)),events=new Set(records.map(eventKey));
    const existing=allRows().filter(row=>row.id!==editingId&&row.source==='personal');
    const duplicate=existing.filter(row=>(row.meta.quoteSnapshots||[]).some(quote=>keys.has(selectedKey(quote))));
    const related=existing.filter(row=>row.bet.status==='open'&&(row.meta.quoteSnapshots||[]).some(quote=>events.has(eventKey(quote))));
    return `${duplicate.length?`<p class="evl-warning">Already tracked: ${duplicate.length} ticket${duplicate.length===1?'':'s'} contain this exact selection and line.</p>`:''}${related.length?`<p class="evl-warning">Related exposure: ${related.length} open ticket${related.length===1?'':'s'} involve the same event. Outcomes may be correlated.</p>`:''}`;
  }
  function ticketContent(bet,meta,records,batch=false) {
    return `${duplicateWarnings(records,bet.id)}<div class="evl-form-grid">${input('selection','Ticket description',bet.selection,'text','required maxlength="240"')}${select('sport','Sport',bet.sport,SPORTS)}${input('book','Sportsbook / app',bet.book,'text','maxlength="80"')}${input('date','Date placed',bet.date,'date','required')}${input('market','Market',bet.market,'text','maxlength="80"')}${input('league','League',meta.league||bet.sport,'text','maxlength="80"')}${input('tool','Source tool',bet.tool,'text','maxlength="80"')}${select('type','Ticket type',bet.type,[['single','Single'],['parlay','Parlay']])}${!batch?input('stake','Stake ($)',bet.stake,'number','required min="0.01" max="1000000" step="0.01"')+select('oddsFormat','Odds format',bet.oddsFormat,[['american','American'],['decimal','Decimal']])+input('odds','Booked odds',bet.odds,'number','required step="any"'):''}${input('probability','Recorded win estimate (%)',Number.isFinite(numeric(meta.probability))?100*Number(meta.probability):'','number','min="0" max="100" step="any"')}${input('tags','Tags, separated by commas',(bet.tags||[]).join(', '),'text')}${select('status','Result',bet.status,Object.entries(STATUSES))}${input('cashout','Cash-out return ($)',bet.cashout??'','number','min="0" step="0.01"')}${input('returnOverride','Actual winning return ($), optional',bet.returnOverride??'','number','min="0" step="0.01"')}${!batch?input('closingOdds','Closing odds, same format',bet.closingOdds??'','number','step="any"')+input('closingOtherOdds','Other side closing odds, for no-vig CLV',bet.closingOtherOdds??'','number','step="any"')+input('closeLine','Closing line / threshold',meta.closeLine??'','number','step="any"')+'<label class="evl-check"><input name="closeComparable" type="checkbox" '+(meta.closeComparable?'checked':'')+'> Closing price is for the identical selection, period and settlement rules</label>':''}<label class="evl-field evl-wide"><span>Notes</span><textarea name="notes" rows="3" maxlength="2000">${esc(bet.notes||'')}</textarea></label></div>${batch?`<fieldset class="evl-batch"><legend>Save each side as its own ticket</legend>${records.map((quote,index)=>`<div><strong>${esc(quote.book)} · ${esc(quoteLabel(quote))}</strong>${input(`stake-${index}`,'Stake ($)',quote.trackingStake??'','number','required min="0.01" step="0.01"')}${input(`odds-${index}`,'Booked American odds',quote.odds,'number','required step="1"')}</div>`).join('')}</fieldset>`:''}${records.length?`<details class="evl-snapshots"><summary>${records.length} recorded selection${records.length===1?'':'s'} · quote snapshots</summary>${records.map(quote=>`<p><strong>${esc(quote.event)}</strong><br>${esc(quoteLabel(quote))} · ${esc(quote.book)} ${esc(price(quote.odds))}<br><small>${esc(sourceLabel(quote))} · ${esc(quote.ts||'Observation time not supplied')}</small></p>`).join('')}</details>`:''}<p class="evl-note">Tickets and grading are saved locally. Only supplied observations are shown as progress. Confirm any manually entered result against the sportsbook.</p>`;
  }
  function formBet(data,existing={},overrides={}) {
    const legs=(existing.legs||[]).map((leg,index)=>data.has(`leg-${index}`)?{...leg,override:String(data.get(`leg-${index}`))}:leg);
    return validateBet({ ...existing, ...Object.fromEntries(data), tags:String(data.get('tags')||'').split(','), legs, settlement:'manual', ...overrides });
  }
  function metadata(data,base,records) {
    const value=data.get('probability'),probability=value===''?null:numeric(value)/100;
    if(probability!==null&&!(probability>=0&&probability<=1))throw Error('Use a win probability between 0% and 100%.');
    const closeLine=data.get('closeLine');
    const fantasyReturn = base.kind === 'fantasy' ? data.get('status') === 'open' ? null : data.get('status') === 'lost' ? 0
      : ['push','void'].includes(data.get('status')) ? numeric(data.get('stake')) : data.get('status') === 'cashed' ? numeric(data.get('cashout'))
        : data.get('returnOverride') !== '' ? numeric(data.get('returnOverride')) : null : undefined;
    return { ...base, league:String(data.get('league')||''), probability, quoteSnapshots:clone(records), dataSource:[...new Set(records.map(sourceLabel))].join(', ')||base.dataSource||'Entered',
      closeLine:closeLine===''||closeLine===null?null:numeric(closeLine), closeComparable:data.has('closeComparable'),
      ...(base.kind === 'fantasy' ? {settledReturn:fantasyReturn} : {}),
      ...(base.kind === 'fantasy' && records.some((_,index)=>data.has(`leg-${index}`)) ? {legResults:records.map((_,index)=>({won:'win',lost:'loss'})[data.get(`leg-${index}`)]||String(data.get(`leg-${index}`)||'open'))} : {}),
      ...(data.get('status')!=='open'?{settledAt:base.settledAt||new Date().toISOString()}:{settledAt:null}) };
  }
  function write(records,metaUpdates) {
    writeBets(suiteLedgerStorage,records);
    suite().betMeta={...suite().betMeta,...metaUpdates};
    persist('Bet ledger saved.');
  }
  function openTracking(inputQuotes=[],opts={}) {
    const records=(Array.isArray(inputQuotes)?inputQuotes:[inputQuotes]).filter(quote=>quote&&typeof quote==='object').map(clone);
    const first=records[0]||{},fantasy=opts.kind==='fantasy',parlay=opts.type==='parlay'||fantasy&&records.length>1,batch=records.length>1&&!parlay;
    const linked=opts.slipId||opts.trackingId?allRows().find(row=>row.source==='personal'&&((opts.slipId&&row.meta.slipId===opts.slipId)||(opts.trackingId&&(row.id===opts.trackingId||row.meta.trackingId===opts.trackingId)))):null;
    const sport=SPORTS.includes(first.sport)?first.sport:'Other';
    const combinedPrice=numeric(opts.offeredDecimal),useDecimal=Number.isFinite(combinedPrice)&&combinedPrice>1;
    const bet={selection:opts.selection|| (parlay?records.map(quoteLabel).join(' + '):batch?'Linked selections':quoteLabel(first)||''),sport,
      type:parlay?'parlay':'single',book:opts.book||opts.app||(parlay?[...new Set(records.map(quote=>quote.book))].join(' / '):first.book||first.app||''),date:today(),
      market:parlay?'Parlay':first.market||'',tool:opts.tool||'Manual',stake:opts.stake??'',odds:opts.odds??(parlay?'':first.odds)??'',oddsFormat:opts.oddsFormat||'american',
      status:'open',tags:[],notes:opts.notes||'',legs:[],settlement:'manual',...(linked?.bet||{}),...(useDecimal?{odds:combinedPrice,oddsFormat:'decimal'}:{})};
    if(fantasy&&opts.result==='settled'){
      const returned=numeric(opts.settledReturn);if(!(returned>=0)){message='Enter the actual fantasy return before settling the ticket.';redraw();return false;}
      Object.assign(bet,{status:returned>0?'won':'lost',returnOverride:returned>0?returned:null});
    }
    if(bet.selection.length>240)bet.selection=bet.selection.slice(0,237)+'…';
    const settings=clone(getSettings()||{}),meta={...clone(opts),...(linked?.meta||{}),...clone(opts),probability:opts.probability??linked?.meta.probability??null,league:first.league||first.sport||'',devigSettings:linked?.meta.devigSettings||settings,quoteSnapshots:records,sourceTool:bet.tool,recordedAt:linked?.meta.recordedAt||new Date().toISOString()};
    if(!batch&&records.length)bet.legs=records.map((quote,index)=>fantasy?manualLeg(quote,index,opts.legResults?.[index]||'open'):linked?.bet.legs?.[index]||manualLeg(quote,index));
    const legControls=!batch&&bet.legs.length?`<fieldset class="evl-batch"><legend>Individual leg results</legend>${bet.legs.map((leg,index)=>select(`leg-${index}`,leg.label,leg.override||'open',[['open','Open'],['won','Won'],['lost','Lost'],['push','Push'],['void','Void']])).join('')}</fieldset>`:'';
    modal(batch?'Track each side':fantasy?'Track fantasy entry':parlay?'Track parlay':'Track a bet',ticketContent(bet,meta,records,batch)+legControls+calculation(meta),(data)=>{
      const current=readForWrite(),updates={},timestamp=new Date().toISOString(),batchId=batch?uid():null;
      if(batch){
        if(data.get('type')!=='single')throw Error('Linked sides are separate single tickets. Choose Single.');
        for(const [index,quote]of records.entries()){
          const validated=formBet(data,{}, {selection:quoteLabel(quote).slice(0,240),book:quote.book||quote.app||'',sport:SPORTS.includes(quote.sport)?quote.sport:'Other',market:quote.market||'',type:'single',stake:data.get(`stake-${index}`),odds:data.get(`odds-${index}`),oddsFormat:'american',closingOdds:null,legs:[manualLeg(quote,index)]});
          const id=uid();current.push({...validated,id,updatedAt:timestamp});updates[id]={...metadata(data,meta,[quote]),probability:null,batchId,sourceTool:validated.tool};
        }
      }else{
        const validated=formBet(data,bet);if(records.length>1&&validated.type!=='parlay')throw Error('Multiple selections must be saved as a parlay or as separate tickets.');
        const index=linked?current.findIndex(row=>row.id===linked.id):-1;
        if(linked&&(index<0||current[index].updatedAt!==linked.bet.updatedAt))throw Error('This ticket changed. Close the dialog and open it again.');
        const id=linked?.id||uid(),record={...validated,id,updatedAt:timestamp};if(index>=0)current[index]=record;else current.push(record);updates[id]=metadata(data,meta,records);
      }
      write(current,updates);
      for(const id of Object.keys(updates))document.dispatchEvent(new CustomEvent('sportslab:bet-tracked',{detail:{id,slipId:updates[id].slipId,trackingId:updates[id].trackingId}}));
    });
  }
  function edit(row,copy=false) {
    const original=row.bet,records=row.meta.quoteSnapshots||[],starting={...original,...(copy?{id:null}:{})};
    const legControls=(original.legs||[]).length?`<fieldset class="evl-batch"><legend>Individual leg results</legend>${original.legs.map((leg,index)=>select(`leg-${index}`,leg.label,leg.override||'open',[['open','Open'],['won','Won'],['lost','Lost'],['push','Push'],['void','Void']])).join('')}</fieldset>`:'';
    return modal(copy?'Copy legacy bet into personal ledger':'Edit ticket / manual settlement',ticketContent(starting,row.meta,records)+legControls+calculation(row.meta),(data)=>{
      const current=readForWrite(),index=current.findIndex(bet=>bet.id===row.id);
      if(!copy&&(index<0||current[index].updatedAt!==original.updatedAt))throw Error('This ticket changed in another tab. Close this dialog and reopen the latest record.');
      const validated=formBet(data,original),id=copy?uid():row.id,record={...validated,id,updatedAt:new Date().toISOString()};
      if(copy)current.push(record);else current[index]=record;
      const update=metadata(data,row.meta,records);if(copy){update.copiedFrom=row.ref;update.dataSource=row.label;}
      write(current,{[id]:update});
    });
  }
  function bulkTags() {
    if(!selected.size){message='Select personal ledger tickets first.';redraw();return;}
    modal('Tag selected tickets',`<p>${selected.size} selected tickets</p><div class="evl-form-grid">${input('tags','Tags to add','','text','required')}${input('color','Tag color','#9890ef','color')}</div>`,data=>{
      const tags=[...new Set(String(data.get('tags')||'').split(',').map(tag=>tag.trim()).filter(Boolean))];
      if(!tags.length)throw Error('Enter at least one tag.');
      const current=readForWrite(),updated=current.map(bet=>selected.has(`personal:${bet.id}`)?{...validateBet({...bet,tags:[...new Set([...bet.tags,...tags])]}),id:bet.id,updatedAt:new Date().toISOString()}:bet);
      writeBets(suiteLedgerStorage,updated);const color=String(data.get('color'));if(/^#[0-9a-f]{6}$/i.test(color))for(const tag of tags)suite().tagColors={...suite().tagColors,[tag]:color};
      selected.clear();persist('Tags added to selected tickets.');
    });
  }
  function exportCsv(rows) {
    const cell=value=>typeof value==='number'&&Number.isFinite(value)?String(value):'"'+String(value??'').replace(/^[\s]*[=+@-]/,match=>"'"+match).replaceAll('"','""')+'"';
    const heading=['ID','Record source','Data source','Date placed','Settled at','Sport','League','Market','Source tool','Selection','Sportsbook','Type','Stake','Odds format','Booked odds','Closing odds','Closing line','Comparable closing price confirmed','Result','Returned','Net profit','Tags','Notes','Recorded win probability','Devig settings JSON','Quote snapshots JSON','Leg observations JSON'];
    const lines=rows.map(row=>{const bet=row.bet,returns=betReturns(bet);return[row.id,row.label,row.meta.dataSource,bet.date,row.meta.settledAt,bet.sport,row.meta.league,bet.market,bet.tool,bet.selection,bet.book,bet.type,bet.stake,bet.oddsFormat,bet.odds,bet.closingOdds,row.meta.closeLine,row.meta.closeComparable===true?'Yes':'No',statusName(rowStatus(row)),returns.returned,returns.profit,bet.tags.join(', '),bet.notes,row.meta.probability,JSON.stringify(row.meta.devigSettings||{}),JSON.stringify(row.meta.quoteSnapshots||[]),JSON.stringify(bet.legs||[])];});
    const blob=new Blob(['\uFEFF'+[heading,...lines].map(line=>line.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download=`sportslab-${active}-${today()}.csv`;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function handleEvent(event) {
    const target=event.target;
    if(!target?.closest?.('.evl-root,[data-evl-hero]'))return false;
    const filter=target.closest('[data-evl-filter]');
    if(filter&&event.type==='change'){setFilters({...options(),[filter.dataset.evlFilter]:filter.value});return true;}
    if(event.type==='change'&&target.matches('[data-evl-select]')){target.checked?selected.add(target.dataset.evlSelect):selected.delete(target.dataset.evlSelect);redraw();return true;}
    if(event.type==='change'&&target.matches('[data-evl-select-all]')){for(const row of filtered().slice((page-1)*40,page*40).filter(row=>row.source==='personal'))target.checked?selected.add(row.ref):selected.delete(row.ref);redraw();return true;}
    if(event.type!=='click')return false;
    const action=target.closest('[data-evl-action]');if(!action)return false;event.preventDefault();
    try{
      const type=action.dataset.evlAction,id=action.dataset.evlId;
      if(type==='add')openTracking([]);
      else if(type==='export')exportCsv(filtered());
      else if(type==='bulk')bulkTags();
      else if(type==='next'||type==='previous'){page+=type==='next'?1:-1;redraw();}
      else if(type==='reset')setFilters(defaults);
      else if(type==='tracker'||type==='performance')navigate(type);
      else if(type==='edit'||type==='copy'){const row=allRows().find(row=>row.ref===id);if(row)edit(row,type==='copy');}
      else if(type==='flag'){const row=allRows().find(row=>row.ref===id);if(row){suite().betMeta={...suite().betMeta,[row.id]:{...row.meta,gradeFlag:row.meta.gradeFlag?null:{flaggedAt:new Date().toISOString(),reason:'Marked for manual review'}}};persist(row.meta.gradeFlag?'Grading flag cleared.':'Grading flagged for review.');}}
      else return false;
    }catch(error){message=error.message||'This action could not be completed.';redraw();}
    return true;
  }
  return {render,handleEvent,openTracking,getFilters:()=>({...options()}),setFilters};
}

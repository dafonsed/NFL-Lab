import { canonicalPlatform } from './platform-catalog.js';
import { validateLeg, ticketSettlement, LEG_RESULTS, legState, formatLegTarget } from './bet-legs.js';
// A member's own tickets: returns and CLV from what they recorded, through the shared calculator.
import { priceClv, noVigClv, decimal } from './betting-math.js';
export const BET_STORAGE_KEY = 'nfl-lab.personal-bets.v1';
export const SPORTS = ['NFL', 'MLB', 'NBA', 'WNBA', 'NHL', 'Soccer', 'Other'];
export const STATUSES = { open: 'Open', won: 'Won', lost: 'Lost', push: 'Push', void: 'Void', cashed: 'Cashed out' };
const MAX_MONEY = 1_000_000;
const cents = amount => Math.round(amount * 100);

function amount(value, label, allowZero = false) {
  if (value === '' || value == null || !Number.isFinite(Number(value))) throw new Error(`Enter ${label}.`);
  const number = Number(value);
  if (number < (allowZero ? 0 : 0.01) || number > MAX_MONEY || Math.abs(number * 100 - cents(number)) > 0.00001) {
    throw new Error(`${label} must be ${allowZero ? 'zero or ' : ''}a positive amount up to $1,000,000, with at most two decimal places.`);
  }
  return cents(number) / 100;
}

export function validateBet(input) {
  const selection = String(input.selection ?? '').trim();
  const book = canonicalPlatform(input.book);
  const notes = String(input.notes ?? '').trim();
  const market = String(input.market ?? '').trim();
  const event = String(input.event ?? '').trim();
  const tool = String(input.tool ?? '').trim();
  const tags = (Array.isArray(input.tags) ? input.tags : String(input.tags ?? '').split(',')).map(tag => String(tag).trim()).filter(Boolean);
  if (!selection || selection.length > 240) throw new Error('Enter a bet description of up to 240 characters.');
  if (event.length > 120) throw new Error('Use up to 120 characters for the event.');
  if (book.length > 80 || market.length > 80 || tool.length > 80 || notes.length > 2000) throw new Error('Use up to 80 characters for book, market, and source, and 2,000 for notes.');
  if (tags.length > 8 || tags.some(tag => tag.length > 24)) throw new Error('Use up to 8 tags, each 24 characters or fewer.');
  if (!SPORTS.includes(input.sport)) throw new Error('Choose a sport.');
  if (!['single', 'parlay'].includes(input.type)) throw new Error('Choose a bet type.');
  if (!Object.hasOwn(STATUSES, input.status)) throw new Error('Choose a result.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0, 10) !== input.date) throw new Error('Choose a valid bet date.');
  const odds = Number(input.odds);
  if (!['american', 'decimal'].includes(input.oddsFormat) || !Number.isFinite(odds)) throw new Error('Enter valid odds.');
  if (input.oddsFormat === 'american' && (!Number.isInteger(odds) || Math.abs(odds) < 100 || Math.abs(odds) > 100000)) throw new Error('American odds must be a whole number from +100 to +100000 or −100 to −100000.');
  if (input.oddsFormat === 'decimal' && (odds <= 1 || odds > 1001)) throw new Error('Decimal odds must be greater than 1 and no more than 1001.');
  const closingOdds = input.closingOdds === '' || input.closingOdds == null ? null : Number(input.closingOdds);
  const validClose = value => Number.isFinite(value) && (input.oddsFormat !== 'american' || Number.isInteger(value) && Math.abs(value) >= 100 && Math.abs(value) <= 100000) && (input.oddsFormat !== 'decimal' || value > 1 && value <= 1001);
  if (closingOdds !== null && !validClose(closingOdds)) throw new Error('Enter valid closing odds in the selected format.');
  // The other side's closing price, when recorded, gives a no-vig CLV.
  const closingOtherOdds = input.closingOtherOdds === '' || input.closingOtherOdds == null ? null : Number(input.closingOtherOdds);
  if (closingOtherOdds !== null && (closingOdds === null || !validClose(closingOtherOdds))) throw new Error('Enter valid closing odds for the other side in the selected format.');
  const legs=input.legs===undefined?[]:input.legs;
  if(!Array.isArray(legs)||legs.length>20)throw new Error('Use up to 20 legs per ticket.');
  if(legs.length&&(input.type==='single'&&legs.length!==1||input.type==='parlay'&&legs.length<2))throw new Error('A single needs one leg; a parlay needs at least two.');
  const validatedLegs=legs.map(validateLeg);
  if(new Set(validatedLegs.map(l=>l.id)).size!==validatedLegs.length)throw new Error('Every leg must have its own ID.');
  const settlement=input.settlement||'manual';
  if(!['auto','manual'].includes(settlement)||settlement==='auto'&&!legs.length)throw new Error('Add legs before enabling automatic ticket results.');
  const status=settlement==='auto'?ticketSettlement(validatedLegs).status:input.status;
  // Promotions: a free bet risks a token, not cash; a profit boost raises winnings by a percentage.
  const freeBet = input.freeBet === true || input.freeBet === 'on' || input.freeBet === 'true';
  const boost = input.boost === '' || input.boost == null ? 0 : Number(input.boost);
  if (!Number.isFinite(boost) || boost < 0 || boost > 500) throw new Error('Enter a profit boost from 0% to 500%.');
  return {
    selection, book, market, ...(event ? { event } : {}), tool, tags, notes, sport: input.sport, type: input.type, date: input.date,
    odds, closingOdds, ...(closingOtherOdds !== null ? { closingOtherOdds } : {}), oddsFormat: input.oddsFormat, stake: amount(input.stake, 'Stake'), status,
    cashout: status === 'cashed' ? amount(input.cashout, 'Cash-out return', true) : null,
    legs:validatedLegs,settlement,
    ...(freeBet ? { freeBet: true } : {}), ...(boost ? { boost: Math.round(boost * 100) / 100 } : {}),
    returnOverride:settlement==='manual'&&status==='won'&&input.returnOverride!==''&&input.returnOverride!=null?amount(input.returnOverride,'Actual return',true):null,
  };
}

const decimalOdds = (odds, format) => format === 'decimal' ? odds : decimal(odds);
// CLV in percent, with the definitions the /ev/tracker Performance view uses (betting-math.js).
/** Price CLV, vig included: booked payout / closing payout of the same side − 1. Null without closing odds. */
export function closingLineValue(bet) {
  if (bet.closingOdds == null) return null;
  const value = priceClv(decimalOdds(bet.odds, bet.oddsFormat), decimalOdds(bet.closingOdds, bet.oddsFormat));
  return Number.isFinite(value) ? value * 100 : null;
}
export const priceClosingLineValue = closingLineValue;
/** No-vig CLV: booked payout × the close's devigged probability − 1. Null unless the other side's close is recorded. */
export function noVigClosingLineValue(bet, method = 'multiplicative') {
  if (bet.closingOdds == null || bet.closingOtherOdds == null) return null;
  const value = noVigClv(decimalOdds(bet.odds, bet.oddsFormat), decimalOdds(bet.closingOdds, bet.oddsFormat), decimalOdds(bet.closingOtherOdds, bet.oddsFormat), method);
  return Number.isFinite(value) ? value * 100 : null;
}

// Round each ticket to cents before adding it to the ledger.
export function betReturns(bet) {
  const stake = cents(bet.stake);
  const multiplier = decimalOdds(bet.odds, bet.oddsFormat) - 1;
  const boost = Number.isFinite(bet.boost) ? bet.boost : 0;
  const potentialProfit = Math.round(stake * multiplier * (1 + boost / 100));
  // A free bet's stake is a sportsbook token: it is never returned and costs no cash if the bet loses.
  const cost = bet.freeBet ? 0 : stake;
  const winReturn = bet.freeBet ? potentialProfit : stake + potentialProfit;
  let returned = null;
  if (bet.status === 'won') returned = winReturn;
  if (bet.status === 'won' && Number.isFinite(bet.returnOverride)) returned = cents(bet.returnOverride);
  if (bet.status === 'lost') returned = 0;
  if (['push', 'void'].includes(bet.status)) returned = cost;
  if (bet.status === 'cashed') returned = cents(bet.cashout);
  return { potentialProfit: potentialProfit / 100, potentialReturn: winReturn / 100, returned: returned === null ? null : returned / 100, profit: returned === null ? null : (returned - cost) / 100 };
}

export function summarizeBets(bets) {
  let profit = 0, settledStake = 0, openStake = 0, open = 0, won = 0, lost = 0;
  for (const bet of bets) {
    if (bet.status === 'open') { open++; if (!bet.freeBet) openStake += cents(bet.stake); continue; }
    profit += cents(betReturns(bet).profit);
    // Refunded tickets and free bets have no cash at risk in the ROI denominator.
    if (!['push', 'void'].includes(bet.status) && !bet.freeBet) settledStake += cents(bet.stake);
    if (bet.status === 'won') won++;
    if (bet.status === 'lost') lost++;
  }
  return { profit: profit / 100, settledStake: settledStake / 100, openStake: openStake / 100, open, won, lost, roi: settledStake ? profit / settledStake * 100 : null, winRate: won + lost ? won / (won + lost) * 100 : null };
}

export function readBets(storage) {
  const raw = storage.getItem(BET_STORAGE_KEY);
  if (raw === null) return [];
  const data = JSON.parse(raw);
  if (data?.version !== 1 || !Array.isArray(data.bets)) throw new Error('Unrecognized bet data.');
  const ids = new Set();
  return data.bets.map(bet => {
    if (!bet || typeof bet.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(bet.id) || ids.has(bet.id) || !Number.isFinite(Date.parse(bet.updatedAt))) throw new Error('Invalid saved bet.');
    ids.add(bet.id);
    return { ...validateBet(bet), id: bet.id, updatedAt: bet.updatedAt };
  });
}

export function writeBets(storage, bets) {
  const saved = JSON.parse(storage.getItem(BET_STORAGE_KEY) || '{}');
  storage.setItem(BET_STORAGE_KEY, JSON.stringify({ version: 1, bets, ...(saved.migrations ? { migrations: saved.migrations } : {}) }));
}

export function betsCsv(bets) {
  // Quoting alone does not prevent spreadsheet formula execution.
  const cell = value => typeof value === 'number' ? String(value) : '"' + String(value ?? '').replace(/^[\s]*[=+@-]/, match => "'" + match).replaceAll('"', '""') + '"';
  const rows = [['Date', 'Sport', 'Market', 'Source', 'Tags', 'Type', 'Bet', 'Sportsbook', 'Odds format', 'Odds', 'Closing odds', 'Price CLV %', 'Stake USD', 'Result', 'Return USD', 'Profit USD', 'Notes', 'Legs', 'Ticket settlement', 'Free bet', 'Boost %']];
  for (const bet of bets) {
    const result = betReturns(bet);
    rows.push([bet.date, bet.sport, bet.market, bet.tool, (bet.tags || []).join(', '), bet.type, bet.selection, bet.book, bet.oddsFormat, bet.odds, bet.closingOdds, closingLineValue(bet)?.toFixed(2), bet.stake, STATUSES[bet.status], result.returned, result.profit, bet.notes,(bet.legs||[]).map((l,i)=>`${i+1}. ${l.label} | ${formatLegTarget(l)} | ${l.matchup} | ${l.date} | ${LEG_RESULTS[legState(l)]} | Actual: ${l.observation?.actual??'—'} | ${l.observation?.sourceUrl||'Manual'}`).join('\n'),bet.settlement||'manual', bet.freeBet ? 'Yes' : 'No', bet.boost || 0]);
  }
  return rows.map(row => row.map(cell).join(',')).join('\r\n');
}


// ---------------------------------------------------------------- CSV import
// Reads this tracker's own export and common sportsbook history columns. Every row still goes
// through validateBet, so an import can never store a ticket the form would reject.
function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  const input = String(text).replace(/^﻿/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(value => value.trim())) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some(value => value.trim())) rows.push(row);
  return rows;
}

const IMPORT_COLUMNS = {
  date: ['date', 'placed', 'placed date', 'bet date', 'date placed'],
  sport: ['sport', 'league'],
  market: ['market', 'bet type detail'],
  tool: ['source', 'tool'],
  tags: ['tags'],
  type: ['type', 'bet type'],
  selection: ['bet', 'selection', 'pick', 'description', 'wager'],
  book: ['sportsbook', 'book', 'bookmaker', 'site'],
  oddsFormat: ['odds format'],
  odds: ['odds', 'price'],
  closingOdds: ['closing odds', 'closing line'],
  stake: ['stake usd', 'stake', 'risk', 'amount', 'wager amount'],
  status: ['result', 'status', 'outcome'],
  returned: ['return usd', 'return', 'payout'],
  notes: ['notes', 'note'],
  freeBet: ['free bet', 'freebet', 'bonus bet'],
  boost: ['boost %', 'boost', 'profit boost'],
};
const RESULT_WORDS = { open: 'open', pending: 'open', won: 'won', win: 'won', lost: 'lost', loss: 'lost', lose: 'lost', push: 'push', void: 'void', cancelled: 'void', canceled: 'void', refunded: 'void', 'cashed out': 'cashed', cashout: 'cashed', cashed: 'cashed' };

function importDate(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) return `${us[3].length === 2 ? '20' + us[3] : us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : '';
}

/** Parse CSV text into validated tickets. Returns { bets, errors, skipped } without saving anything. */
export function parseBetsCsv(text, { idFactory = () => globalThis.crypto.randomUUID(), now = () => new Date().toISOString() } = {}) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { bets: [], errors: ['The file has no ticket rows.'], skipped: 0 };
  const header = rows[0].map(name => name.trim().toLowerCase());
  const column = key => IMPORT_COLUMNS[key].map(name => header.indexOf(name)).find(index => index >= 0) ?? -1;
  const index = Object.fromEntries(Object.keys(IMPORT_COLUMNS).map(key => [key, column(key)]));
  const missing = ['selection', 'odds', 'stake'].filter(key => index[key] < 0);
  if (missing.length) return { bets: [], errors: [`Missing required column${missing.length > 1 ? 's' : ''}: ${missing.map(key => IMPORT_COLUMNS[key][0]).join(', ')}.`], skipped: rows.length - 1 };
  // Our export guards spreadsheet formulas with a leading apostrophe; strip it back off.
  const get = (row, key) => index[key] < 0 ? '' : String(row[index[key]] ?? '').trim().replace(/^'(?=[=+@-])/, '');
  const bets = [], errors = [];
  rows.slice(1).forEach((row, offset) => {
    const line = offset + 2;
    try {
      const rawOdds = get(row, 'odds').replace(/[−–]/g, '-').replace(/[^0-9.+-]/g, '');
      const odds = Number(rawOdds);
      const format = /decimal/i.test(get(row, 'oddsFormat')) || (odds > 1 && odds < 100 && /\./.test(rawOdds)) ? 'decimal' : 'american';
      const sportText = get(row, 'sport').toUpperCase();
      const sport = SPORTS.find(item => item.toUpperCase() === sportText) || 'Other';
      const status = RESULT_WORDS[get(row, 'status').toLowerCase()] || 'open';
      const typeText = get(row, 'type').toLowerCase();
      const input = {
        selection: get(row, 'selection'), book: get(row, 'book'), market: get(row, 'market'), tool: get(row, 'tool') || 'Import',
        tags: get(row, 'tags'), notes: get(row, 'notes'), sport, type: typeText.includes('parlay') ? 'parlay' : 'single',
        date: importDate(get(row, 'date')) || now().slice(0, 10), odds: format === 'american' ? Math.round(odds) : odds, oddsFormat: format,
        closingOdds: get(row, 'closingOdds').replace(/[−–]/g, '-'), stake: get(row, 'stake').replace(/[$,]/g, ''), status,
        cashout: status === 'cashed' ? get(row, 'returned').replace(/[$,]/g, '') : undefined,
        freeBet: /^(yes|true|1|y)$/i.test(get(row, 'freeBet')), boost: get(row, 'boost').replace(/[%\s]/g, ''),
      };
      const bet = validateBet(input);
      bets.push({ ...bet, id: idFactory(), updatedAt: now() });
    } catch (error) { errors.push(`Row ${line}: ${error.message}`); }
  });
  return { bets, errors, skipped: errors.length };
}

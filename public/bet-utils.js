import { validateLeg, ticketSettlement, LEG_RESULTS, legState, formatLegTarget } from './bet-legs.js';
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
  const book = String(input.book ?? '').trim();
  const notes = String(input.notes ?? '').trim();
  if (!selection || selection.length > 240) throw new Error('Enter a bet description of up to 240 characters.');
  if (book.length > 80 || notes.length > 2000) throw new Error('Use up to 80 characters for the sportsbook and 2,000 for notes.');
  if (!SPORTS.includes(input.sport)) throw new Error('Choose a sport.');
  if (!['single', 'parlay'].includes(input.type)) throw new Error('Choose a bet type.');
  if (!Object.hasOwn(STATUSES, input.status)) throw new Error('Choose a result.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0, 10) !== input.date) throw new Error('Choose a valid bet date.');
  const odds = Number(input.odds);
  if (!['american', 'decimal'].includes(input.oddsFormat) || !Number.isFinite(odds)) throw new Error('Enter valid odds.');
  if (input.oddsFormat === 'american' && (!Number.isInteger(odds) || Math.abs(odds) < 100 || Math.abs(odds) > 100000)) throw new Error('American odds must be a whole number from +100 to +100000 or −100 to −100000.');
  if (input.oddsFormat === 'decimal' && (odds <= 1 || odds > 1001)) throw new Error('Decimal odds must be greater than 1 and no more than 1001.');
  const legs=input.legs===undefined?[]:input.legs;
  if(!Array.isArray(legs)||legs.length>20)throw new Error('Use up to 20 legs per ticket.');
  if(legs.length&&(input.type==='single'&&legs.length!==1||input.type==='parlay'&&legs.length<2))throw new Error('A single needs one leg; a parlay needs at least two.');
  const validatedLegs=legs.map(validateLeg);
  if(new Set(validatedLegs.map(l=>l.id)).size!==validatedLegs.length)throw new Error('Every leg must have its own ID.');
  const settlement=input.settlement||'manual';
  if(!['auto','manual'].includes(settlement)||settlement==='auto'&&!legs.length)throw new Error('Add legs before enabling automatic ticket results.');
  const status=settlement==='auto'?ticketSettlement(validatedLegs).status:input.status;
  return {
    selection, book, notes, sport: input.sport, type: input.type, date: input.date,
    odds, oddsFormat: input.oddsFormat, stake: amount(input.stake, 'Stake'), status,
    cashout: status === 'cashed' ? amount(input.cashout, 'Cash-out return', true) : null,
    legs:validatedLegs,settlement,
    returnOverride:settlement==='manual'&&status==='won'&&input.returnOverride!==''&&input.returnOverride!=null?amount(input.returnOverride,'Actual return',true):null,
  };
}

// Round each ticket to cents before adding it to the ledger.
export function betReturns(bet) {
  const stake = cents(bet.stake);
  const multiplier = bet.oddsFormat === 'decimal' ? bet.odds - 1 : bet.odds > 0 ? bet.odds / 100 : 100 / Math.abs(bet.odds);
  const potentialProfit = Math.round(stake * multiplier);
  let returned = null;
  if (bet.status === 'won') returned = stake + potentialProfit;
  if (bet.status === 'won' && Number.isFinite(bet.returnOverride)) returned = cents(bet.returnOverride);
  if (bet.status === 'lost') returned = 0;
  if (['push', 'void'].includes(bet.status)) returned = stake;
  if (bet.status === 'cashed') returned = cents(bet.cashout);
  return { potentialProfit: potentialProfit / 100, potentialReturn: (stake + potentialProfit) / 100, returned: returned === null ? null : returned / 100, profit: returned === null ? null : (returned - stake) / 100 };
}

export function summarizeBets(bets) {
  let profit = 0, settledStake = 0, openStake = 0, open = 0, won = 0, lost = 0;
  for (const bet of bets) {
    if (bet.status === 'open') { open++; openStake += cents(bet.stake); continue; }
    profit += cents(betReturns(bet).profit);
    // Refunded tickets have no money at risk in the ROI denominator.
    if (!['push', 'void'].includes(bet.status)) settledStake += cents(bet.stake);
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
  storage.setItem(BET_STORAGE_KEY, JSON.stringify({ version: 1, bets }));
}

export function betsCsv(bets) {
  // Quoting alone does not prevent spreadsheet formula execution.
  const cell = value => typeof value === 'number' ? String(value) : '"' + String(value ?? '').replace(/^[\s]*[=+@-]/, match => "'" + match).replaceAll('"', '""') + '"';
  const rows = [['Date', 'Sport', 'Type', 'Bet', 'Sportsbook', 'Odds format', 'Odds', 'Stake USD', 'Result', 'Return USD', 'Profit USD', 'Notes', 'Legs', 'Ticket settlement']];
  for (const bet of bets) {
    const result = betReturns(bet);
    rows.push([bet.date, bet.sport, bet.type, bet.selection, bet.book, bet.oddsFormat, bet.odds, bet.stake, STATUSES[bet.status], result.returned, result.profit, bet.notes,(bet.legs||[]).map((l,i)=>`${i+1}. ${l.label} | ${formatLegTarget(l)} | ${l.matchup} | ${l.date} | ${LEG_RESULTS[legState(l)]} | Actual: ${l.observation?.actual??'—'} | ${l.observation?.sourceUrl||'Manual'}`).join('\n'),bet.settlement||'manual']);
  }
  return rows.map(row => row.map(cell).join(',')).join('\r\n');
}

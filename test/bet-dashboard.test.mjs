import test from 'node:test';
import assert from 'node:assert/strict';
import {monthAnalytics,shiftMonth} from '../public/bet-analytics.js';
import {parseBetSlip} from '../public/bet-slip-parser.js';
import {validateBet,betReturns,summarizeBets} from '../public/bet-utils.js';
const base={selection:'Test ticket',book:'Test book',sport:'NFL',type:'single',date:'2026-09-05',stake:25,odds:100,oddsFormat:'american',status:'open',settlement:'manual',legs:[]};

test('calendar preserves existing ticket accounting, grouped by date placed',()=>{
 const bets=[{...base,status:'won'},{...base,status:'lost',date:'2026-09-06'},{...base,status:'push'},{...base,status:'void'},{...base,status:'cashed',cashout:30},{...base},{...base,status:'won',date:'2026-08-31'}];
 const result=monthAnalytics(bets,'2026-09');
 assert.equal(result.tickets.length,6);assert.deepEqual(result.total,summarizeBets(bets.slice(0,6)));assert.equal(result.total.profit,5);assert.equal(result.total.openStake,25);
 assert.equal(result.days[4].profit,30);assert.equal(result.days[4].open,1);assert.equal(result.days[5].profit,-25);assert.equal(result.cumulative.at(-1).profit,5);assert.equal(result.books[0].profit,5);
 assert.equal(result.returned,bets.slice(0,6).reduce((n,b)=>n+(betReturns(b).returned||0),0));
});
test('calendar handles leap years, year transitions, empty and unsettled days',()=>{
 assert.equal(shiftMonth('2026-01',-1),'2025-12');assert.equal(shiftMonth('2026-12',1),'2027-01');
 assert.equal(monthAnalytics([],'2024-02').days.length,29);assert.equal(monthAnalytics([],'2026-02').days.length,28);assert.equal(monthAnalytics([],'2026-09').firstWeekday,2);
 const open=monthAnalytics([base],'2026-09');assert.equal(open.settled,0);assert.equal(open.bestDay,null);assert.equal(open.total.winRate,null);assert.equal(open.total.roi,null);assert.equal(open.days[4].settled,0);assert.equal(open.days[4].count,1);
});
test('single slip extracts explicit fields into an editable, unsettled manual draft',()=>{
 const result=parseBetSlip('FanDuel\nNFL\nSingle\nChris Olave\nOver 75.5 Receiving Yards\n-110\nStake $25.00\nPotential payout $47.73\nDate placed: Sep 23, 2026');
 assert.equal(result.fields.book,'FanDuel');assert.equal(result.fields.stake,25);assert.equal(result.fields.odds,-110);assert.equal(result.fields.date,'2026-09-23');assert.equal(result.legs.length,1);assert.equal(result.legs[0].line,75.5);assert.equal(result.legs[0].side,'over');assert.match(result.legs[0].label,/Chris Olave/);
 const saved=validateBet({...result.fields,legs:result.legs});assert.equal(saved.settlement,'manual');assert.equal(saved.status,'open');assert.equal(saved.legs[0].mode,'manual');assert.equal(saved.legs[0].gameId,'');assert.equal(saved.legs[0].subjectId,'');assert.equal(saved.returnOverride,null);
});
test('parlay uses combined odds and preserves every recognized leg and target',()=>{
 const result=parseBetSlip('DraftKings\nNBA\n2 leg parlay\nJayson Tatum\nOver 25.5 Points\n-115\nJaylen Brown\n20+ Points\n-130\nCombined odds +260\nWager\n$40.00\nPlaced: 09/23/2026');
 assert.equal(result.legs.length,2);assert.equal(result.fields.type,'parlay');assert.equal(result.fields.odds,260);assert.equal(result.fields.stake,40);assert.equal(result.legs[1].side,'at_least');assert.equal(result.legs[1].line,20);assert.equal(result.fields.date,'2026-09-23');
 assert.equal(validateBet({...result.fields,legs:result.legs}).legs.length,2);
});
test('ambiguous parlay odds, missing dates and unrecognized text are not fabricated',()=>{
 const result=parseBetSlip('2 leg parlay\nChris Olave\nOver 75.5 Receiving Yards -110\nAlvin Kamara\nUnder 60.5 Rushing Yards -115\nTotal payout $120');
 assert.equal(result.fields.odds,'');assert.equal(result.fields.stake,'');assert.equal(result.fields.date,'');assert.equal(result.fields.sport,'Other');assert.equal(result.legs.length,2);assert.ok(result.issues.some(s=>s.includes('Combined')));
 assert.equal(parseBetSlip('No useful text found').recognized,false);assert.equal(parseBetSlip('Date placed: 02/30/2026').fields.date,'');
 assert.equal(parseBetSlip('09/23/2026\n09/24/2026\nStake $10').fields.date,'');
});
test('moneylines, decimal odds, spreads and promotions remain reviewable',()=>{
 const ml=parseBetSlip('bet365\nMLB\nLos Angeles Dodgers Moneyline -150\nStake $12.50\nDate: 2026-09-23');assert.equal(ml.legs[0].market,'moneyline');assert.equal(ml.legs[0].line,null);assert.equal(ml.fields.odds,-150);
 const spread=parseBetSlip('NBA\nBoston Celtics -4.5 (-110)\nOdds 1.91\nStake $10\nDate: 2026-09-23\nWon\nProfit boost');assert.equal(spread.legs[0].market,'spread');assert.equal(spread.legs[0].line,-4.5);assert.equal(spread.fields.oddsFormat,'decimal');assert.equal(spread.fields.status,'open');assert.ok(spread.issues.some(s=>s.includes('Promotions')));assert.ok(spread.issues.some(s=>s.includes('settled')));
});
test('touchdown and target-first receipts keep their explicit target and subject',()=>{
 const touchdown=parseBetSlip('FanDuel\nNFL\nChris Olave\nAnytime Touchdown Scorer\n+180\nStake $10\nPlaced 2026-09-23');
 assert.equal(touchdown.legs[0].side,'at_least');assert.equal(touchdown.legs[0].line,1);assert.match(touchdown.legs[0].label,/Chris Olave.*Touchdowns/);
 const reverse=parseBetSlip('NBA\nOver 25.5\nJayson Tatum Points\n-110\nStake $10\nDate 2026-09-23');assert.match(reverse.legs[0].label,/Jayson Tatum/);assert.equal(reverse.legs[0].line,25.5);
});

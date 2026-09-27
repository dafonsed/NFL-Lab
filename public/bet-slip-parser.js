import { detectPlatform } from './platform-catalog.js';
// Receipt text is a draft, never a source for automatic settlement or game IDs.
const clean = text => String(text || '').normalize('NFKC').replace(/[−–—]/g, '-').replace(/[’‘]/g, "'").replace(/\r/g, '').slice(0, 24000);
const validDate = text => /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(text)) && new Date(text).toISOString().slice(0, 10) === text;
const moneyNumber = text => { const n = Number(String(text).replace(/[$,\s]/g, '')); return Number.isFinite(n) && n >= 0 && n <= 1000000 ? n : null; };
function receiptDate(text) {
  const tagged = text.match(/(?:date placed|bet placed|placed(?: on)?|date)\s*[:\-]?\s*([^\n]{4,45})/i)?.[1];
  const candidates = tagged ? [tagged] : text.split('\n').filter(line => /^\s*(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]{3,9} \d{1,2},? \d{4})(?:\s|$)/.test(line));
  const dates = new Set();
  for (const candidate of candidates) {
    let date = candidate.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
    const us = candidate.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})\b/);
    if (!date && us) date = `${us[3].length===2?'20'+us[3]:us[3]}-${us[1].padStart(2,'0')}-${us[2].padStart(2,'0')}`;
    const named = candidate.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2}),?\s+(\d{4})\b/i);
    if (!date && named) date = `${named[3]}-${String(['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(named[1].slice(0,3).toLowerCase())+1).padStart(2,'0')}-${named[2].padStart(2,'0')}`;
    if (validDate(date || '')) dates.add(date);
  }
  return dates.size === 1 ? [...dates][0] : '';
}
const ignoredName = /^(?:test|sample|receipt|draft|ticket|bet\b|sportslab|fanduel|draftkings|betmgm|bet365|caesars|espn|fanatics|hard rock|(?:\d+[- ]leg|same game)?\s*parlay|single|straight|selections?|stake|wager|risk|total|potential|to win|payout|return|profit|odds|placed|date|pending|open|won|lost|settled|cash|live|[+\-$\d]|NFL\b|(?:NBA|WNBA)\b|MLB\b|NHL\b)/i;
const stripOdds = line => line.replace(/\s*\(?[+-]\d{3,6}\)?\s*$/, '').trim();
function selectionName(lines, index, prefix) {
  const direct = prefix.replace(/^\s*(?:\d+[.)]\s*)?(?:leg\s*\d+\s*[:.-]?\s*)?/i,'').replace(/[|:-]\s*$/, '').trim();
  if (direct && !ignoredName.test(direct)) return direct;
  for (let i=index-1;i>=Math.max(0,index-3);i--) {
    if (/\b(over|under|at least|moneyline)\b/i.test(lines[i])) break;
    if (!ignoredName.test(lines[i]) && !/\b(?: vs\.? | @ | at )\b/i.test(lines[i]) && /[a-z]{2}/i.test(lines[i])) return lines[i];
  }
  return '';
}

export function parseBetSlip(rawText) {
  const text=clean(rawText),lines=text.split('\n').map(line=>line.trim()).filter(Boolean),issues=[];
  const bookPatterns=[['FanDuel',/fan\s*duel/i],['DraftKings',/draft\s*kings/i],['BetMGM',/bet\s*mgm/i],['bet365',/bet\s*365/i],['Caesars',/caesars/i],['ESPN BET',/espn\s*bet/i],['Fanatics',/fanatics/i],['Hard Rock Bet',/hard\s*rock/i],['BetRivers',/bet\s*rivers/i],['Bovada',/bovada/i]];
  const book=detectPlatform(text) || bookPatterns.find(([,pattern])=>pattern.test(text))?.[0] || '';
  const sports=[...new Set([...text.matchAll(/\b(NFL|WNBA|NBA|MLB|NHL|Soccer)\b/gi)].map(match=>match[1].toLowerCase()==='soccer'?'Soccer':match[1].toUpperCase()))];
  const sport=sports.length===1?sports[0]:'Other',date=receiptDate(text);
  const amountMatch=text.match(/\b(?:total\s+(?:stake|wager)|stake|wager(?: amount)?|bet amount|amount wagered|risk)\s*:?\s*\$?\s*(\d[\d,]*(?:\.\d{1,2})?)/i);
  const stake=amountMatch?moneyNumber(amountMatch[1]):null;
  const legs=[];
  for(let i=0;i<lines.length;i++) {
    const line=stripOdds(lines[i]);
    const target=line.match(/\b(over|under|at least|exactly|more than|less than)\s*([0-9]+(?:\.[0-9]+)?)/i);
    const milestone=!target&&line.match(/\b(\d+)\+\s+([a-z][a-z +&-]*)/i);
    const touchdown=!target&&!milestone&&line.match(/\banytime\s+(?:touchdown|td)(?:\s+scorer)?\b/i);
    const moneyline=!target&&!milestone&&!touchdown&&line.match(/\b(money\s*line|moneyline|to win)\b/i);
    const spread=!target&&!milestone&&!moneyline&&line.match(/^(.+?)\s+([+-]\d{1,2}(?:\.\d+)?)\s*(?:spread|run line|puck line)?$/i);
    if(!target&&!milestone&&!touchdown&&!moneyline&&!spread)continue;
    // Monetary summaries such as "To win $50" are not selections.
    if(moneyline&&/^(?:to win|potential|total|profit|payout|return)/i.test(line))continue;
    const match=target||milestone||touchdown||moneyline||spread;
    let name=selectionName(lines,i,spread?spread[1]:line.slice(0,match.index));
    const following=lines[i+1]||'';
    if(!name&&!ignoredName.test(following)&&!/(?:over|under|at least|exactly|anytime|moneyline)/i.test(following)&&/^[A-Za-z][A-Za-z' -]+\s+[A-Za-z]/.test(following)&&! /^(?:receiving|rushing|passing|total|points|assists|rebounds|strikeouts|hits|touchdowns)\b/i.test(following))name=following;
    const suffix=target?line.slice(target.index+target[0].length).trim():milestone?milestone[2].trim():touchdown?'Touchdowns':'';
    const marketText=suffix.replace(/^[|:-]\s*/,'') || (/^(?:points|assists|rebounds|receiving yards|rushing yards|passing yards|hits|strikeouts|total bases|shots|goals|receptions|threes|3-pointers)(?:\b|$)/i.test(lines[i+1]||'')?lines[i+1]:'');
    if(!name&&!marketText){issues.push('A selection was found without a player or market. Check the text before importing.');continue;}
    const side=target?({under:'under','less than':'under','at least':'at_least',exactly:'exactly'}[target[1].toLowerCase()]||'over'):milestone||touchdown?'at_least':'home';
    const threshold=target?Number(target[2]):milestone?Number(milestone[1]):touchdown?1:spread?Number(spread[2]):null;
    const market=moneyline?'moneyline':spread?'spread':'custom';
    const label=[name,marketText|| (moneyline?'Moneyline':spread?'Spread':'')].filter(Boolean).join(' · ').slice(0,240);
    legs.push({mode:'manual',sport,date,market,marketLabel:marketText,subject:name,label,side,line:threshold,override:'open',observation:null});
  }
  const parlay=/\bparlay\b/i.test(text)||legs.length>1;
  const statedLegs=Number(text.match(/\b(\d{1,2})[- ](?:leg|pick|selection)s?\b/i)?.[1]);
  if(statedLegs&&statedLegs!==legs.length)issues.push(`The slip lists ${statedLegs} selections, but ${legs.length} were recognized. Add or correct the missing selections before saving.`);
  let oddsMatch=text.match(/\b(?:combined|total|ticket|parlay)\s+odds\s*:?\s*([+-]\d{3,6}|\d{1,4}\.\d{1,4})\b/i);
  if(!oddsMatch&&parlay)oddsMatch=text.match(/\bparlay\s*\(?\s*([+-]\d{3,6})\b/i);
  if(!oddsMatch&&!parlay)oddsMatch=text.match(/\bodds\s*:?\s*([+-]\d{3,6}|\d{1,4}\.\d{1,4})\b/i);
  if(!oddsMatch&&!parlay){const possibilities=[...text.matchAll(/(?:^|\s|\()([+-]\d{3,6})(?=\s|$|\))/g)].map(m=>m[1]);if(new Set(possibilities).size===1)oddsMatch=[null,possibilities[0]];}
  const odds=oddsMatch?Number(oddsMatch[1]):null,oddsFormat=oddsMatch&&!/^[+-]/.test(oddsMatch[1])?'decimal':'american';
  const fields={selection:legs.map(l=>l.label+' '+(l.market==='moneyline'?'':l.side==='at_least'?l.line+'+':l.side==='home'?l.line:l.side+' '+l.line)).join(' / ').trim().slice(0,240),book,sport,date,stake:stake??'',odds:odds??'',oddsFormat,type:parlay?'parlay':'single',settlement:'manual',status:'open'};
  if(!date)issues.push('Date placed was not clear. Choose the date shown on your ticket.');
  if(!stake)issues.push('Stake was not clear. Enter the amount you wagered.');
  if(odds===null)issues.push(parlay?'Combined ticket odds were not clear. Enter the parlay odds, not an individual leg’s odds.':'Odds were not clear. Enter the odds you took.');
  if(sport==='Other')issues.push('Confirm the sport for the ticket and each selection.');
  if(!legs.length)issues.push('No complete selections were recognized. Add the ticket description and selections in the form.');
  if(legs.length>20)issues.push('More than 20 selections were found. Only the first 20 can be imported.');
  if(/\b(won|lost|settled|cashed out|cashout|cash out)\b/i.test(text))issues.push('This may be a settled or cashed-out ticket. Confirm its result and actual return in the form.');
  if(/\b(bonus|free bet|profit boost|boosted|insurance|insured)\b/i.test(text))issues.push('Promotions can change payouts. Confirm the booked odds and actual return when settling.');
  return {fields,legs:legs.slice(0,20),issues:[...new Set(issues)],text,recognized:!!(book||date||stake||odds!==null||legs.length)};
}

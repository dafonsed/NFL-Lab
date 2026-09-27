// Online sportsbook coverage, checked against operator sources on 2026-09-25.
// Excludes casino-only products, prediction markets and on-property-only apps.
// This is a discovery filter, not geolocation or a wagering eligibility check.
import { canonicalPlatform } from './platform-catalog.js';
export const COVERAGE_CHECKED = '2026-09-25';
export const STATE_STORAGE_KEY = 'sportslab-sportsbook-state-v1';
export const STATE_CHANGE_EVENT = 'sportslab-state-change';
export const US_STATES = Object.freeze({
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California',
  CO:'Colorado', CT:'Connecticut', DE:'Delaware', DC:'District of Columbia',
  FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana',
  IA:'Iowa', KS:'Kansas', KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland',
  MA:'Massachusetts', MI:'Michigan', MN:'Minnesota', MS:'Mississippi', MO:'Missouri',
  MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire', NJ:'New Jersey',
  NM:'New Mexico', NY:'New York', NC:'North Carolina', ND:'North Dakota', OH:'Ohio',
  OK:'Oklahoma', OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina',
  SD:'South Dakota', TN:'Tennessee', TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia',
  WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming'
});
const coverage = (states, source) => Object.freeze({states:Object.freeze(states.split(' ')), source});
export const SPORTSBOOK_COVERAGE = Object.freeze({
  bet365:coverage('AZ CO DC IL IN IA KS KY LA MD MI MO NJ NC OH PA TN VA WV', 'https://help.bet365.com/s/en-us/technical-support/where-can-i-play'),
  DraftKings:coverage('AZ AR CO CT DC IL IN IA KS KY LA ME MD MA MI MO NH NJ NY NC OH OR PA TN VT VA WV WY', 'https://sportsbook.draftkings.com/is-draftkings-available-nationwide-for-sports'),
  FanDuel:coverage('AZ AR CO CT DC IL IN IA KS KY LA MD MA MI MO NJ NY NC OH PA TN VT VA WV WY', 'https://www.fanduel.com/legal-sports-betting-us-map'),
  BetMGM:coverage('AZ CO DC IL IN IA KS KY LA MD MA MI MO NV NJ NY NC OH PA TN VA WV WY', 'https://sports.betmgm.com/en/blog/discover-betmgm-across-america/'),
  Caesars:coverage('AZ CO DC IL IN IA KS KY LA ME MD MA MI MO NV NJ NY NC OH PA TN VA WV WY', 'https://www.caesars.com/sportsbook-and-casino'),
  BetRivers:coverage('AZ CO DE IL IN IA LA MD MI NJ NY OH PA VA WV', 'https://www.betrivers.com/'),
  Fanatics:coverage('AZ CO CT DC IL IN IA KS KY LA MD MA MI MO NJ NY NC OH PA TN VT VA WV WY', 'https://www.fanaticsinc.com/fanatics-sportsbook-online-experience'),
  'Hard Rock Bet':coverage('AZ CO FL IL IN MI NJ OH TN VA', 'https://www.hardrock.bet/sportsbook/soccer/'),
  'theScore Bet':coverage('AZ CO IL IN IA KS KY LA MD MA MI MO NJ NY NC OH PA TN VA WV', 'https://sportsbook.thescore.bet/hc/en-us/articles/13873583070733-Where-can-I-use-theScore-Bet'),
  'Bally Bet':coverage('AZ CO IN IA MD MA NJ NY OH TN VA', 'https://www.ballybet.com/states-where-sports-betting-is-legal'),
  'Desert Diamond Sports':coverage('AZ', 'https://www.ddcaz.com/west-valley/gaming/sportsbook')
});

// Supplemental Caesars evidence: mobile wallet jurisdictions plus newer launches.
// https://investor.caesars.com/node/35476
// https://investor.caesars.com/static-files/d8c2308d-f883-4f1e-9402-986bc2f49b10
// https://investor.caesars.com/node/35671/pdf
// https://massgaming.com/about/sports-wagering-in-massachusetts/sports-wagering-licensees/caesars-sportsbook/
// BetRivers mobile coverage (including Delaware's sportsbook, not just its casino):
// https://ir.rushstreetinteractive.com/news/news-details/2024/Delaware-Lottery-Launches-Online-Sports-Betting-With-The-Transition-To-BetRivers-Powering-The-States-New-Online-Casinos--Online-Sportsbooks/default.aspx

export function normalizeState(value) {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return Object.hasOwn(US_STATES, code) ? code : '';
}
export function readSportsbookState(storage) {
  try { return normalizeState((storage ?? globalThis.localStorage)?.getItem(STATE_STORAGE_KEY)); } catch { return ''; }
}
export function saveSportsbookState(value, storage) {
  const code = normalizeState(value);
  try {
    storage ??= globalThis.localStorage;
    if (code) storage.setItem(STATE_STORAGE_KEY, code);
    else storage.removeItem(STATE_STORAGE_KEY);
    return true;
  } catch { return false; }
}
export function sportsbookStatus(book, state) {
  const code = normalizeState(state);
  if (!code) return 'unfiltered';
  const name = canonicalPlatform(book).toLowerCase();
  const canonical = Object.keys(SPORTSBOOK_COVERAGE).find(key => key.toLowerCase() === name);
  if (!canonical) return 'unverified';
  return SPORTSBOOK_COVERAGE[canonical].states.includes(code) ? 'available' : 'unavailable';
}
export function sportsbookAvailable(book, state) {
  return ['unfiltered','available'].includes(sportsbookStatus(book, state));
}
export function availableSportsbookQuotes(quotes, state) {
  return quotes.filter(quote => sportsbookAvailable(quote.book, state));
}

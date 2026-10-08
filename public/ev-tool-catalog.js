export const MORE_TOOL_GROUPS = Object.freeze([
  {label:'Markets',tools:[
    {key:'ev-live',label:'Live positive EV',description:'Value in in-game prices',icon:'live'},
    {key:'arb-live',label:'Live arbitrage',description:'Opposing live opportunities',icon:'live'},
    {key:'middles',label:'Middles',description:'Find the window to win both sides',icon:'expand'},
    {key:'holds',label:'Low holds',description:'Compare the cost of both sides',icon:'performance'}
  ]},
  {label:'Builders',tools:[
    {key:'promo',label:'Promo converter',description:'Balance a bonus with a hedge',icon:'tag'},
    {key:'parlay',label:'Parlay builder',description:'Combine and compare your legs',icon:'plus'},
    {key:'optimizer',label:'Fantasy optimizer',description:'Rank two-pick combinations',icon:'settings'},
    {key:'slip',label:'Fantasy slip builder',description:'Build a slip around payout rules',icon:'picks'}
  ]},
  {label:'Research & alerts',tools:[
    {key:'prediction',label:'Prediction markets',description:'Contracts, positions and trades',icon:'research'},
    {key:'relay-boards',label:'Relayed tool boards',description:'Positive EV, arb and market depth',icon:'performance'},
    {key:'trends',label:'Player prop trends',description:'Hit rates and paired results',icon:'trends'},
    {key:'fantasy-alerts',label:'Fantasy alerts',description:'Watch for new player props',icon:'bookmark'},
    {key:'line-alerts',label:'Price & movement alerts',description:'Follow prices and line changes',icon:'live'}
  ]}
]);
export const MORE_TOOLS = Object.freeze(MORE_TOOL_GROUPS.flatMap(group => group.tools.map(tool => Object.freeze({...tool,group:group.label}))));
export const SECONDARY_TOOLS = Object.freeze(MORE_TOOLS.filter(tool => !['ev-live','arb-live'].includes(tool.key)));
// Major leagues plus the other sports the quote feed carries (see lib/odds/normalize.mjs).
const EV_SPORT_CODES = new Set(['nfl','mlb','nba','wnba','nhl','soccer','tennis','mma','boxing','snooker','darts','golf','cricket','rugby','ncaaf','ncaab','other']);
// +EV has one address per tool; sport is a filter inside the tool, never part of the URL.
export function evToolUrl(key) {
  return key === 'tracker' ? '/ev/tracker' : `/ev#${key}`;
}

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
    {key:'trends',label:'Player prop trends',description:'Hit rates and paired results',icon:'trends'},
    {key:'fantasy-alerts',label:'Fantasy alerts',description:'Watch for new player props',icon:'bookmark'},
    {key:'line-alerts',label:'Price & movement alerts',description:'Follow prices and line changes',icon:'live'}
  ]}
]);
export const MORE_TOOLS = Object.freeze(MORE_TOOL_GROUPS.flatMap(group => group.tools.map(tool => Object.freeze({...tool,group:group.label}))));
export const SECONDARY_TOOLS = Object.freeze(MORE_TOOLS.filter(tool => !['ev-live','arb-live'].includes(tool.key)));
export function evToolUrl(key, sport = 'all') {
  const code = ['nfl','mlb','nba','wnba','nhl','soccer'].includes(String(sport).toLowerCase()) ? String(sport).toLowerCase() : 'all';
  return key === 'tracker' ? '/ev/tracker' + (code === 'all' ? '' : '?sport='+code) : `/ev?sport=${code}#${key}`;
}

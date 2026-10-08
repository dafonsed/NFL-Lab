// Site support: names, categories and local brand assets. This catalog does not
// imply API coverage, posted lines, payout rules or jurisdiction eligibility.
const platform = (name, label, category, asset, aliases = []) => Object.freeze({
  name, label, category, asset: `/assets/brands/${asset}.png`, aliases: Object.freeze(aliases)
});
export const PLATFORM_CATEGORIES = Object.freeze({sportsbook:'Sportsbooks', fantasy:'DFS and pick’em apps', prediction:'Prediction markets'});
export const SITE_PLATFORMS = Object.freeze([
  platform('BetMGM','BetMGM','sportsbook','betmgm'),
  platform('bet365','bet365','sportsbook','bet365'),
  platform('BetRivers','BetRivers','sportsbook','betrivers'),
  platform('Caesars','Caesars Sportsbook','sportsbook','caesars'),
  platform('DraftKings','DraftKings Sportsbook','sportsbook','draftkings'),
  platform('Fanatics','Fanatics Sportsbook','sportsbook','fanatics'),
  platform('FanDuel','FanDuel Sportsbook','sportsbook','fanduel'),
  platform('Hard Rock Bet','Hard Rock Bet','sportsbook','hardrock',['Hard Rock']),
  platform('theScore Bet','theScore Bet','sportsbook','thescore',['ESPN BET','theScore','theScore Bet (formerly ESPN BET)']),
  platform('Bally Bet','Bally Bet','sportsbook','bally',['Bally']),
  platform('Desert Diamond Sports','Desert Diamond Sports','sportsbook','desertdiamond',['Desert Diamond']),
  platform('DraftKings Fantasy','DraftKings Fantasy','fantasy','draftkings',['DraftKings DFS']),
  platform('FanDuel Fantasy','FanDuel Fantasy','fantasy','fanduel',['FanDuel DFS']),
  platform('PrizePicks','PrizePicks','fantasy','prizepicks'),
  platform('Underdog Fantasy','Underdog Fantasy','fantasy','underdog',['Underdog']),
  platform('Sleeper Picks','Sleeper Picks','fantasy','sleeper',['Sleeper']),
  platform('Betr Picks','Betr Picks','fantasy','betr',['Betr']),
  platform('Dabble','Dabble','fantasy','dabble'),
  platform('Chalkboard','Chalkboard','fantasy','chalkboard'),
  platform('ParlayPlay','ParlayPlay','fantasy','parlayplay'),
  platform('OwnersBox','OwnersBox','fantasy','ownersbox'),
  platform('Boom Fantasy','Boom Fantasy','fantasy','boom'),
  platform('Vivid Picks','Vivid Picks','fantasy','vivid'),
  platform('Novig','Novig','prediction','novig'),
  platform('ProphetX','ProphetX','prediction','prophetx'),
  platform('Sporttrade','Sporttrade','prediction','sporttrade'),
  platform('BettorEdge','BettorEdge','prediction','bettoredge'),
  platform('Kalshi','Kalshi','prediction','kalshi'),
  platform('Polymarket','Polymarket','prediction','polymarket')
]);
// Preserve existing Pick6 entries and the sharp-book comparison benchmark.
const legacyPlatforms = [platform('DraftKings Pick6','DraftKings Pick6','fantasy','draftkings'), platform('Pinnacle','Pinnacle','sportsbook','pinnacle')];
const key = value => String(value ?? '').replace(/\s*\(example\)$/i,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const lookup = new Map([...SITE_PLATFORMS, ...legacyPlatforms].flatMap(item => [item.name,item.label,...item.aliases].map(name => [key(name),item])));
export const findPlatform = value => lookup.get(key(value)) || null;
export const canonicalPlatform = value => findPlatform(value)?.name || String(value ?? '').replace(/\s*\(example\)$/i,'').trim();
export const platformLabel = value => findPlatform(value)?.label || String(value ?? '');
// Feed book slugs that share a brand's artwork, plus books with their own file in /assets/brands.
const BOOK_ASSETS = Object.freeze({
  'draftkings6':'draftkings', 'draftkings6best':'draftkings', 'fanduelpicks':'fanduel',
  'hardrockfl':'hardrock', 'hardrockil':'hardrock', 'hardrockon':'hardrock',
  'prizepicksbest':'prizepicks', 'dabblebest':'dabble', 'ownersboxbest':'ownersbox', 'underdogdfs':'underdog', 'underdogdfsbest':'underdog',
  'betrbest':'betr', 'polymarketus':'polymarket',
  // Each book's own published icon (sources: assets/brands/SOURCES.md).
  '888sport':'888sport.png', 'action247':'action247.png', 'betjack':'bet-jack.png', 'bet105':'bet105.png', 'bet99':'bet99.png', 'betano':'betano.png',
  'betanything':'betanything.png', 'betcris':'betcris.png', 'betfair':'betfair.png', 'betinia':'betinia.png', 'betnow':'betnow.png', 'betonline':'betonline.png',
  'betparx':'betparx.png', 'betphoenix':'betphoenix.png', 'betsafe':'betsafe.png', 'betus':'betus.png', 'betvictor':'betvictor.png', 'betway':'betway.png',
  'bleachernation':'bleachernation.png', 'bodog':'bodog.png', 'bookmaker':'bookmaker.png', 'borgata':'borgata.png', 'bovada':'bovada.png', 'bwin':'bwin.png',
  'casumo':'casumo.png', 'circa':'circa.png', 'comeon':'comeon.png', 'crabsports':'crab-sports.png', 'daznbet':'daznbet.png', 'drf':'drf.png',
  'everygame':'everygame.png', 'firekeepers':'firekeepers.png', 'fitzdares':'fitzdares.png', 'fliff':'fliff.png', 'fourwinds':'four-winds.png', 'goalserve':'goalserve.png',
  'goldennugget':'golden-nugget.png', 'gunlake':'gun-lake.png', 'heritage':'heritage.png', 'jazzsports':'jazzsports.png', 'justbet':'justbet.png', 'leovegas':'leovegas.png',
  'letsbetmd':'letsbetmd.png', 'miseojeu':'miseojeu.png', 'monopoly':'monopoly.png', 'mybookie':'mybookie.png', 'neobet':'neobet.png', 'northstarbets':'northstar-bets.png',
  'oaklawn':'oaklawn.png', 'partysports':'partysports.png', 'playfallsview':'playfallsview.png', 'playnow':'playnow.png', 'pointsbetca':'pointsbet-ca.png', 'pokerstars':'pokerstars.png',
  'powerplay':'powerplay.png', 'proline':'proline.png', 'ps3838':'ps3838.png', 'rebet':'rebet.png', 'resortsworld':'resorts-world.png', 'rivalry':'rivalry.png',
  'smarkets':'smarkets.png', 'splashsports':'splashsports.png', 'sportsinteraction':'sports-interaction.png', 'sportzino':'sportzino.png', 'stake':'stake.png', 'tonybet':'tonybet.png',
  'tooniebet':'tooniebet.png', 'wagerattack':'wagerattack.png', 'wannaparlay':'wannaparlay.png', 'windcreek':'wind-creek.png', 'xbet':'xbet.png', 'youwager':'youwager.png',
  '4cx':'4cx.png', 'onyx':'onyx.png', 'bet99ca':'bet99.png', 'betinianj':'betinia.png', 'bleachernationbest':'bleachernation.png', 'splashsportsbest':'splashsports.png',
  'sugarhouse':'betrivers.png'
});
const bookAsset = value => { const file = BOOK_ASSETS[key(value)]; return file ? `/assets/brands/${file.includes('.') ? file : file + '.png'}` : ''; };
export const platformAsset = value => findPlatform(value)?.asset || bookAsset(value);
export const SPORTSBOOK_PLATFORMS = Object.freeze(SITE_PLATFORMS.filter(item => item.category === 'sportsbook').map(item => item.name));
export const FANTASY_PLATFORMS = Object.freeze(['PrizePicks','Underdog Fantasy','DraftKings Pick6','Sleeper Picks','ParlayPlay','Dabble','Chalkboard','Betr Picks','OwnersBox','Boom Fantasy','Vivid Picks','DraftKings Fantasy','FanDuel Fantasy']);
export const PREDICTION_PLATFORMS = Object.freeze(SITE_PLATFORMS.filter(item => item.category === 'prediction').map(item => item.name));
export const EXCHANGE_PLATFORMS = Object.freeze(['Novig','ProphetX','Sporttrade','BettorEdge']);
export const isFantasyPlatform = value => findPlatform(value)?.category === 'fantasy';
export const isContestPlatform = value => ['DraftKings Fantasy','FanDuel Fantasy'].includes(canonicalPlatform(value));
const esc = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function platformOptions(names = SITE_PLATFORMS.map(item => item.name)) {
  return names.map(name => `<option value="${esc(name)}">${esc(platformLabel(name))}</option>`).join('');
}
// Prefer specific product names over their parent brand when recognizing slips.
const mentions = [...SITE_PLATFORMS,...legacyPlatforms].flatMap(item => [item.name,item.label,...item.aliases].map(name => ({item,name}))).sort((a,b) => b.name.length-a.name.length);
export function detectPlatform(text) {
  return mentions.find(({name}) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/ /g,'\\s*')}\\b`,'i').test(text))?.item.name || '';
}

// Site support: names, categories and local brand assets. This catalog does not
// imply API coverage, posted lines, payout rules or jurisdiction eligibility.
// An app without a local logo (asset null) shows its initials where a logo would go.
const platform = (name, label, category, asset, aliases = []) => Object.freeze({
  name, label, category, asset: asset ? `/assets/brands/${asset}.png` : '', aliases: Object.freeze(aliases)
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
  platform('Underdog Fantasy','Underdog Fantasy','fantasy','underdog',['Underdog','Underdog DFS','underdog_dfs','underdog_dfs_best']),
  platform('Sleeper Picks','Sleeper Picks','fantasy','sleeper',['Sleeper']),
  platform('Betr Picks','Betr Picks','fantasy','betr',['Betr']),
  platform('Dabble','Dabble','fantasy','dabble'),
  platform('Chalkboard','Chalkboard','fantasy','chalkboard'),
  platform('ParlayPlay','ParlayPlay','fantasy','parlayplay'),
  platform('OwnersBox','OwnersBox','fantasy','ownersbox'),
  platform('Boom Fantasy','Boom Fantasy','fantasy','boom'),
  platform('Vivid Picks','Vivid Picks','fantasy','vivid'),
  platform('WannaParlay','WannaParlay','fantasy','wannaparlay'),
  platform('HotStreak','HotStreak','fantasy',null,['Hot Streak']),
  platform('Novig','Novig','prediction','novig'),
  platform('ProphetX','ProphetX','prediction','prophetx'),
  platform('Sporttrade','Sporttrade','prediction','sporttrade'),
  platform('BettorEdge','BettorEdge','prediction','bettoredge'),
  platform('Kalshi','Kalshi','prediction','kalshi'),
  platform('Polymarket','Polymarket','prediction','polymarket')
]);
// Preserve existing Pick6 entries and the sharp-book comparison benchmark.
const legacyPlatforms = [platform('DraftKings Pick6','DraftKings Pick6','fantasy','draftkings'), platform('Pinnacle','Pinnacle','sportsbook','pinnacle')];
const SMARTSTAKE_BOOKS = Object.freeze(JSON.parse('{"4caster":"4Caster","4cx":"4CX","888sport":"888sport","action247":"Action247","bally_bet":"Bally Bet","bet_jack":"Bet Jack","bet_monarch":"Bet Monarch","bet_sacaren":"Bet Sacaren","bet105":"Bet105","bet365":"Bet365","bet99":"Bet99","bet99_ca":"Bet99 (CA)","betano":"Betano","betanything":"BetAnything","betcris":"Betcris","betfair":"betfair","betfred":"Betfred","betinia":"Betinia","betinia_nj":"Betinia (NJ)","betly":"Betly","betmgm":"Betmgm","betnow":"BetNow","betonline":"Betonline","betparx":"BetParx","betphoenix":"Betphoenix","betr":"Betr","betr_best":"Betr","betrivers":"Betrivers","betsafe":"Betsafe","betus":"Betus","betvictor":"BetVictor","betway":"BetWay","bleachernation":"Bleacher Nation","bleachernation_best":"BleacherNation","bodog":"Bodog","bookmaker":"Bookmaker","boomfantasy":"BoomFantasy","borgata":"Borgata","bovada":"Bovada","bracco":"Bracco","bwin":"Bwin","caesars":"Caesars","casumo":"Casumo","chalkboard":"Chalkboard","circa":"Circa","clutchbet":"Clutchbet","comeon":"ComeOn","coolbet":"Coolbet","courtside":"Courtside","crab_sports":"Crab Sports","dabble":"Dabble","dabble_best":"Dabble","daznbet":"DAZN Bet","desert_diamond":"Desert Diamond","draftkings":"Draftkings","draftkings6":"DraftKings Pick6","draftkings6_best":"Draftkings Pick6","drf":"DRF","eagle":"Eagle","epick":"EPICK","espn_bet":"ESPN Bet","everygame":"everygame","fanatics":"Fanatics","fanduel":"Fanduel","fanduelpicks":"Fanduel Picks","firekeepers":"FireKeepers","fitzdares":"Fitzdares","fliff":"Fliff","four_winds":"Four Winds","goalserve":"goalserve","golden_nugget":"Golden Nugget","gun_lake":"Gun Lake","hard_rock":"Hard Rock","hardrock_fl":"Hardrock (FL)","hardrock_il":"Hardrock (IL,OH)","hardrock_on":"Hardrock (ON)","heritage":"Heritage Sports","jazzsports":"Jazz Sports","justbet":"JustBet","kalshi":"Kalshi","leovegas":"Leovegas","letsbetmd":"Letsbetmd","miseojeu":"Mise-o-jeu","monopoly":"Monopoly","mvgbet":"MVGBet","mybookie":"Mybookie","neobet":"Neo.bet","northstar_bets":"Northstar Bets","novig":"Novig","oaklawn":"Oaklawn","onyx":"Onyx","ownersbox":"Owners Box","ownersbox_best":"Owners Box","parlayplay":"ParlayPlay","partysports":"Partysports","pinnacle":"Pinnacle","playfallsview":"Playfallsview","playnow":"Playnow","pointsbet_ca":"Pointsbet","pokerstars":"Pokerstars","polymarket":"Polymarket","polymarket_us":"Polymarket US","powerplay":"Powerplay","prime_sports":"Prime Sports","prizepicks":"PrizePicks","prizepicks_best":"PrizePicks","proline":"Proline","propbuilder":"Propbuilder","prophetx":"ProphetX","ps3838":"ps3838","q_sportsbook":"Q Sportsbook","rebet":"Rebet","resorts_world":"Resorts World","rivalry":"Rivalry","si_sportsbook":"Si Sportsbook","sleeper":"Sleeper","smarkets":"Smarkets","smartstake":"SmartStake","splashsports":"SplashSports","splashsports_best":"SplashSports","sports_interaction":"Sports Interaction","sporttrade":"SportTrade","sportzino":"Sportzino","stake":"Stake","stnsports":"STN Sports","stx":"Stx","sugar_house":"Sugar House","swiper":"Swiper","swisstony":"x010123","thescore":"theScore","tipico":"Tipico","titan_play":"Titan Play","tonybet":"Tonybet","tooniebet":"Tooniebet","underdog":"Underdog","underdog_dfs":"Underdog DFS","underdog_dfs_best":"Underdog DFS","wagerattack":"WagerAttack","wannaparlay":"WannaParlay","wind_creek":"Wind Creek","xbet":"Xbet","youwager":"YouWager","zensports":"Zensports"}'));
export const SMARTSTAKE_BOOK_COUNT = Object.keys(SMARTSTAKE_BOOKS).length;
export const SMARTSTAKE_SPORTSBOOK_PLATFORMS = Object.freeze(Object.keys(SMARTSTAKE_BOOKS).filter(name => name !== 'smartstake'));
// Books on one odds platform are one opinion, not three. The server's dynamic 70% overlap detector
// unions these known groups first; relayed DFS data uses the same groups in the browser.
export const SPORTSBOOK_PRICE_FAMILIES = Object.freeze([
  Object.freeze(['BetRivers', 'Desert Diamond Sports', 'Bally Bet', 'Betly', 'Leovegas']),
  Object.freeze(['BetMGM', 'Sports Interaction', 'Bwin', 'PartySports']),
  Object.freeze(['theScore', 'ESPN Bet']),
  Object.freeze(['Bookmaker', 'Prime Sports', 'Betcris']),
  Object.freeze(['MyBookie', 'Xbet']),
  Object.freeze(['Bodog', 'Bovada']),
]);
const key = value => String(value ?? '').replace(/\s*\(example\)$/i,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const SMARTSTAKE_BOOK_LOOKUP = new Map(Object.entries(SMARTSTAKE_BOOKS).map(([slug,label]) => [key(slug),label]));
const lookup = new Map([...SITE_PLATFORMS, ...legacyPlatforms].flatMap(item => [item.name,item.label,...item.aliases].map(name => [key(name),item])));
export const findPlatform = value => lookup.get(key(value)) || null;
export const canonicalPlatform = value => findPlatform(value)?.name || SMARTSTAKE_BOOK_LOOKUP.get(key(value)) || String(value ?? '').replace(/\s*\(example\)$/i,'').trim();
export const platformLabel = value => SMARTSTAKE_BOOK_LOOKUP.get(key(value)) || findPlatform(value)?.label || String(value ?? '');
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
export const FANTASY_PLATFORMS = Object.freeze(['PrizePicks','Underdog Fantasy','DraftKings Pick6','Sleeper Picks','ParlayPlay','Dabble','Chalkboard','Betr Picks','OwnersBox','Boom Fantasy','Vivid Picks','WannaParlay','HotStreak','DraftKings Fantasy','FanDuel Fantasy']);
export const PREDICTION_PLATFORMS = Object.freeze(SITE_PLATFORMS.filter(item => item.category === 'prediction').map(item => item.name));
export const EXCHANGE_PLATFORMS = Object.freeze(['Novig','ProphetX','Sporttrade','Kalshi','BettorEdge']);
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

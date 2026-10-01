import {escape as esc} from './research-data.js';
import {icon} from './ui-icons.js';
import {findPlatform} from './platform-catalog.js';

export function sportsbookBadge(quote) {
  if(!quote)return '';
  const platform=findPlatform(quote.bookKey)||findPlatform(quote.bookmaker);
  const name=platform?.name||quote.bookmaker||quote.bookKey||'Sportsbook';
  const status=quote.stale?'Saved quote':quote.basis==='published_archive'?'Archived quote':quote.basis==='in_play'?'In play':'Sportsbook';
  return `<span class="quote-book-badge">${platform?`<span class="quote-book-mark"><img src="${esc(platform.asset)}" alt="" width="24" height="24"></span>`:''}<span class="quote-book-copy"><strong>${esc(name)}</strong><small>${status}</small></span></span>`;
}

const imageHosts=new Set(['a.espncdn.com','img.mlbstatic.com','static.www.nfl.com']);
function trustedImage(value) {
  try { const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&imageHosts.has(url.hostname)?url.href:''; } catch { return ''; }
}
const numeric=value=>/^\d+$/.test(String(value??''))?String(value):'';
const mlbCutout=id=>`https://img.mlbstatic.com/mlb-photos/image/upload/w_320,q_auto:good,f_png/v1/people/${id}/headshot/silo/current`;
const teamAliases={nfl:{LA:'lar',LAR:'lar',WAS:'wsh',WSH:'wsh',JAC:'jax'},mlb:{CWS:'chw',CHW:'chw',WAS:'wsh',WSN:'wsh',SDP:'sd',SFG:'sf',KCR:'kc',TBR:'tb',ATH:'ath'},nba:{NYK:'ny',GSW:'gs',NOP:'no',SAS:'sa',PHO:'phx',WSH:'wsh',UTA:'utah'},nhl:{LAK:'la',SJS:'sj',TBL:'tb',NJD:'nj'}};
// Reviewed over actual headshots at 21px, not just against an empty dark tile.
// Keep readable primary marks; use brighter official artwork for dark crests.
const mlbDarkBadges=new Set(['ath','atl','bos','cle','col','chw','det','kc','lad','min','nyy','sd','stl','tb','wsh']);
const mlbCapBadges={nym:'/assets/teams/mlb/nym.svg',mia:'/assets/teams/mlb/mia.svg'};
function overlayLogo(logo) {
  const match=logo.match(/^https:\/\/a\.espncdn\.com\/i\/teamlogos\/(mlb|nfl)\/500\/([a-z]+)\.png$/);
  if(!match)return logo;
  const [,sport,team]=match;
  if(sport==='mlb'&&mlbCapBadges[team])return mlbCapBadges[team];
  return sport==='nfl'||mlbDarkBadges.has(team)?logo.replace('/500/','/500-dark/'):logo;
}

// MLB IDs are not ESPN team IDs. History rows carry these official MLB IDs.
const mlbTeams={108:'LAA',109:'ARI',110:'BAL',111:'BOS',112:'CHC',113:'CIN',114:'CLE',115:'COL',116:'DET',117:'HOU',118:'KC',119:'LAD',120:'WSH',121:'NYM',133:'ATH',134:'PIT',135:'SD',136:'SEA',137:'SF',138:'STL',139:'TB',140:'TEX',141:'TOR',142:'MIN',143:'PHI',144:'ATL',145:'CWS',146:'MIA',147:'NYY',158:'MIL'};
const mlbNames={'los angeles angels':'LAA','arizona diamondbacks':'ARI','baltimore orioles':'BAL','boston red sox':'BOS','chicago cubs':'CHC','cincinnati reds':'CIN','cleveland guardians':'CLE','colorado rockies':'COL','detroit tigers':'DET','houston astros':'HOU','kansas city royals':'KC','los angeles dodgers':'LAD','washington nationals':'WSH','new york mets':'NYM','athletics':'ATH','oakland athletics':'ATH','pittsburgh pirates':'PIT','san diego padres':'SD','seattle mariners':'SEA','san francisco giants':'SF','st. louis cardinals':'STL','tampa bay rays':'TB','texas rangers':'TEX','toronto blue jays':'TOR','minnesota twins':'MIN','philadelphia phillies':'PHI','atlanta braves':'ATL','chicago white sox':'CWS','miami marlins':'MIA','new york yankees':'NYY','milwaukee brewers':'MIL'};

export function opponentIdentity(row,sport) {
  const name=String(row.opponent||''),id=numeric(row.opponentId);
  const code=(sport==='mlb'&&(mlbTeams[id]||mlbNames[name.toLowerCase()]))||row.opponentCode||(/^\w{2,4}$/.test(name)?name.toUpperCase():'');
  return {name:name||code,code,logo:overlayLogo(teamLogo({sport,team:code,teamId:id}))};
}

export function teamMark({sport,team,teamId}) {
  // Standalone matchup marks use the primary, full-color artwork. The brighter
  // alternate badges are reserved for the much smaller portrait overlay.
  const logo=teamLogo({sport,team,teamId});
  return `<span class="team-mark" aria-hidden="true"><span>${esc(team||'—')}</span>${logo?`<img src="${esc(logo)}" alt="" width="40" height="40" decoding="async" data-identity-image>`:''}</span>`;
}

export function teamLogo(profile) {
  const sport=profile.sport,raw=profile.raw||profile;
  const provided=trustedImage(profile.teamLogo||raw.teamLogo);if(provided)return provided;
  if(!['nfl','mlb','nba','wnba','nhl','soccer'].includes(sport))return '';
  // Other-sport IDs come from ESPN; MLB team IDs use a different namespace.
  const id=numeric(profile.teamId??raw.teamId);
  if(id&&['nba','wnba','nhl','soccer'].includes(sport))return `https://a.espncdn.com/i/teamlogos/${sport}/500/${id}.png`;
  const code=String(profile.team||'').toUpperCase();
  if(sport==='soccer'||!/^\w{2,4}$/.test(code))return '';
  const key=teamAliases[sport]?.[code]||code.toLowerCase();
  return `https://a.espncdn.com/i/teamlogos/${sport}/500/${key}.png`;
}

export function playerPhoto(profile) {
  if(profile.position==='TEAM')return '';
  const supplied=trustedImage(profile.image||profile.headshot||profile.raw?.headshot);
  // MLB's /67 portraits have a baked-in gray background; /silo is the real cutout.
  if(supplied) {
    const url=new URL(supplied),mlbId=url.hostname==='img.mlbstatic.com'&&url.pathname.match(/\/people\/(\d+)\/headshot\/(?:67|silo)\/current(?:\.[a-z]+)?$/)?.[1];
    return mlbId?mlbCutout(mlbId):supplied;
  }
  const id=numeric(profile.playerId??profile.raw?.playerId??profile.id),sport=profile.sport;
  if(id&&sport==='mlb')return mlbCutout(id);
  if(id&&['nba','wnba','nhl','soccer'].includes(sport))return `https://a.espncdn.com/i/headshots/${sport}/players/full/${id}.png`;
  // NFL research IDs are GSIS IDs, so never guess an ESPN athlete from one.
  return '';
}

export function playerPortrait(profile,{size='row',eager=false}={}) {
  const name=profile.name||profile.player||'',initials=name.split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('');
  const logo=teamLogo(profile),photo=profile.position==='TEAM'?logo:playerPhoto(profile),team=String(profile.team||'');
  const displayLogo=overlayLogo(logo);
  return `<span class="player-portrait portrait-${size==='hero'?'hero':'row'}${profile.position==='TEAM'?' portrait-team':''}" aria-hidden="true"><span class="portrait-face"><span class="portrait-fallback">${esc(initials||team||'—')}</span>${photo?`<img class="portrait-photo" src="${esc(photo)}" alt="" width="96" height="96" loading="${eager?'eager':'lazy'}" decoding="${eager?'sync':'async'}" referrerpolicy="no-referrer" data-identity-image>`:''}</span>${team&&profile.position!=='TEAM'?`<span class="portrait-team-badge" title="${esc(team)}"><span>${esc(team)}</span>${logo?`<img class="portrait-team-logo" src="${esc(displayLogo)}"${displayLogo!==logo?` data-identity-fallback="${esc(logo)}"`:""} alt="" width="32" height="32" loading="${eager?'eager':'lazy'}" decoding="async" data-identity-image>`:''}</span>`:''}</span>`;
}

const identityImages=new WeakMap();
const identitySource=img=>`${img.src}\n${img.srcset||''}`;

// Dimensions may be available before an asynchronously decoded bitmap can paint.
// Keep the initials visible until this exact image request has finished decoding.
export function prepareIdentityImages(root) {
  const images=root.matches?.('[data-identity-image]')?[root]:[...root.querySelectorAll?.('[data-identity-image]')||[]];
  for(const img of images) {
    if(img.tagName!=='IMG')continue;
    const existing=identityImages.get(img);
    if(existing){existing();continue;}
    let source=identitySource(img),revision=0,status='idle';
    const reset=()=>{revision++;status='idle';img.classList.remove('identity-loaded');};
    const recover=()=>{
      reset();status='failed';
      const fallback=img.dataset.identityFallback;
      if(fallback){delete img.dataset.identityFallback;img.src=fallback;}
    };
    const sync=()=>{
      const next=identitySource(img);
      if(next!==source){source=next;reset();}
      if(!img.complete||status!=='idle')return;
      if(!img.naturalWidth){recover();return;}
      const expectedSource=source,expectedRevision=revision;
      status='decoding';
      const current=()=>revision===expectedRevision&&identitySource(img)===expectedSource;
      let decoded;
      try {decoded=typeof img.decode==='function'?img.decode():Promise.resolve();}
      catch {recover();return;}
      Promise.resolve(decoded).then(()=>{
        if(!current())return;
        if(!img.complete||!img.naturalWidth){recover();return;}
        status='ready';img.classList.add('identity-loaded');
      },()=>{if(current())recover();});
    };
    reset();
    img.dataset.identityReady='true';
    img.addEventListener('load',()=>{if(status==='failed')reset();sync();});
    img.addEventListener('error',recover);
    identityImages.set(img,sync);
    sync();
  }
}

// League logos exist only for these; other sports (tennis, MMA ...) get no image instead of a broken one.
const LEAGUE_LOGOS = new Set(['nfl','nba','mlb','nhl','wnba','premier']);
export function leagueMark(sport) {
  const key = String(sport ?? '').toLowerCase();
  if (key !== 'soccer' && !LEAGUE_LOGOS.has(key)) return '';
  return `<span class="league-mark" data-league="${esc(key)}" aria-hidden="true">${key==='soccer'?icon('soccer'):`<img src="/assets/leagues/${esc(key)}.png" width="32" height="32" alt="" decoding="async">`}</span>`;
}

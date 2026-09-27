import { probabilityToAmerican } from './ev-core.js?v=2';

// Release switch: keep enabled throughout development. Turn off explicitly when
// the real odds feed is ready. Fixtures never enter the user's saved workspace.
export const ODDS_DEMO_ENABLED = true;
export const ODDS_DEMO_BOOKS = Object.freeze(['bet365','DraftKings','FanDuel','BetMGM','Caesars','BetRivers','Fanatics','Hard Rock Bet','theScore Bet','Bally Bet','Desert Diamond Sports']);

// Frozen showcase rosters, not current league schedules or roster assertions.
// All fixtures, prices, projections and movement are simulated.
const teams = {
  MLB: [
    ['NYY','New York Yankees','Aaron Judge','Anthony Volpe'],['BOS','Boston Red Sox','Jarren Duran','Trevor Story'],
    ['LAD','Los Angeles Dodgers','Shohei Ohtani','Mookie Betts'],['SD','San Diego Padres','Fernando Tatis Jr.','Manny Machado'],
    ['NYM','New York Mets','Francisco Lindor','Juan Soto'],['PHI','Philadelphia Phillies','Bryce Harper','Trea Turner'],
    ['ATL','Atlanta Braves','Ronald Acuña Jr.','Matt Olson'],['MIA','Miami Marlins','Xavier Edwards','Connor Norby'],
    ['CHC','Chicago Cubs','Pete Crow-Armstrong','Seiya Suzuki'],['STL','St. Louis Cardinals','Masyn Winn','Brendan Donovan'],
    ['HOU','Houston Astros','Yordan Alvarez','Jose Altuve'],['TEX','Texas Rangers','Corey Seager','Wyatt Langford'],
    ['SEA','Seattle Mariners','Julio Rodríguez','Cal Raleigh'],['ATH','Athletics','Brent Rooker','Tyler Soderstrom'],
    ['BAL','Baltimore Orioles','Gunnar Henderson','Adley Rutschman'],['TOR','Toronto Blue Jays','Vladimir Guerrero Jr.','Bo Bichette'],
    ['DET','Detroit Tigers','Riley Greene','Spencer Torkelson'],['CLE','Cleveland Guardians','José Ramírez','Steven Kwan'],
    ['MIN','Minnesota Twins','Byron Buxton','Royce Lewis'],['KC','Kansas City Royals','Bobby Witt Jr.','Vinnie Pasquantino'],
    ['MIL','Milwaukee Brewers','Jackson Chourio','William Contreras'],['CIN','Cincinnati Reds','Elly De La Cruz','Matt McLain'],
    ['SF','San Francisco Giants','Jung Hoo Lee','Heliot Ramos'],['AZ','Arizona Diamondbacks','Corbin Carroll','Ketel Marte'],
    ['TB','Tampa Bay Rays','Junior Caminero','Yandy Díaz'],['WSH','Washington Nationals','James Wood','CJ Abrams'],
    ['PIT','Pittsburgh Pirates','Oneil Cruz','Bryan Reynolds'],['COL','Colorado Rockies','Ezequiel Tovar','Brenton Doyle'],
    ['LAA','Los Angeles Angels','Mike Trout','Zach Neto'],['CWS','Chicago White Sox','Colson Montgomery','Chase Meidroth']
  ],
  NBA: [
    ['HOU','Houston Rockets','Alperen Şengün','Amen Thompson'],['WSH','Washington Wizards','Bilal Coulibaly','Bub Carrington'],
    ['BOS','Boston Celtics','Jayson Tatum','Jaylen Brown'],['NYK','New York Knicks','Jalen Brunson','Karl-Anthony Towns'],
    ['LAL','Los Angeles Lakers','Luka Dončić','LeBron James'],['GSW','Golden State Warriors','Stephen Curry','Jimmy Butler'],
    ['DEN','Denver Nuggets','Nikola Jokić','Jamal Murray'],['OKC','Oklahoma City Thunder','Shai Gilgeous-Alexander','Jalen Williams'],
    ['MIL','Milwaukee Bucks','Giannis Antetokounmpo','Kyle Kuzma'],['CLE','Cleveland Cavaliers','Donovan Mitchell','Evan Mobley'],
    ['DAL','Dallas Mavericks','Kyrie Irving','Cooper Flagg'],['SAS','San Antonio Spurs','Victor Wembanyama','De’Aaron Fox'],
    ['MIN','Minnesota Timberwolves','Anthony Edwards','Julius Randle'],['MEM','Memphis Grizzlies','Ja Morant','Jaren Jackson Jr.'],
    ['PHI','Philadelphia 76ers','Tyrese Maxey','Joel Embiid'],['ORL','Orlando Magic','Paolo Banchero','Franz Wagner'],
    ['MIA','Miami Heat','Bam Adebayo','Tyler Herro'],['ATL','Atlanta Hawks','Trae Young','Jalen Johnson'],
    ['SAC','Sacramento Kings','Domantas Sabonis','Zach LaVine'],['LAC','Los Angeles Clippers','Kawhi Leonard','James Harden'],
    ['DET','Detroit Pistons','Cade Cunningham','Jalen Duren'],['IND','Indiana Pacers','Tyrese Haliburton','Pascal Siakam'],
    ['CHI','Chicago Bulls','Coby White','Josh Giddey'],['TOR','Toronto Raptors','Scottie Barnes','Brandon Ingram'],
    ['PHX','Phoenix Suns','Devin Booker','Jalen Green'],['NOP','New Orleans Pelicans','Zion Williamson','Trey Murphy III'],
    ['POR','Portland Trail Blazers','Deni Avdija','Shaedon Sharpe'],['UTA','Utah Jazz','Lauri Markkanen','Keyonte George'],
    ['BKN','Brooklyn Nets','Michael Porter Jr.','Nic Claxton'],['CHA','Charlotte Hornets','LaMelo Ball','Brandon Miller']
  ],
  NFL: [
    ['BUF','Buffalo Bills','Josh Allen','Khalil Shakir'],['MIA','Miami Dolphins','Tua Tagovailoa','Jaylen Waddle'],
    ['KC','Kansas City Chiefs','Patrick Mahomes','Rashee Rice'],['LAC','Los Angeles Chargers','Justin Herbert','Ladd McConkey'],
    ['PHI','Philadelphia Eagles','Jalen Hurts','A.J. Brown'],['DAL','Dallas Cowboys','Dak Prescott','CeeDee Lamb'],
    ['CIN','Cincinnati Bengals','Joe Burrow','Ja’Marr Chase'],['BAL','Baltimore Ravens','Lamar Jackson','Zay Flowers'],
    ['DET','Detroit Lions','Jared Goff','Amon-Ra St. Brown'],['GB','Green Bay Packers','Jordan Love','Jayden Reed'],
    ['SF','San Francisco 49ers','Brock Purdy','Ricky Pearsall'],['SEA','Seattle Seahawks','Sam Darnold','Jaxon Smith-Njigba'],
    ['LAR','Los Angeles Rams','Matthew Stafford','Puka Nacua'],['ARI','Arizona Cardinals','Kyler Murray','Marvin Harrison Jr.'],
    ['HOU','Houston Texans','C.J. Stroud','Nico Collins'],['JAX','Jacksonville Jaguars','Trevor Lawrence','Brian Thomas Jr.'],
    ['MIN','Minnesota Vikings','J.J. McCarthy','Justin Jefferson'],['CHI','Chicago Bears','Caleb Williams','DJ Moore'],
    ['DEN','Denver Broncos','Bo Nix','Courtland Sutton'],['LV','Las Vegas Raiders','Geno Smith','Brock Bowers'],
    ['TB','Tampa Bay Buccaneers','Baker Mayfield','Mike Evans'],['ATL','Atlanta Falcons','Michael Penix Jr.','Drake London'],
    ['NYJ','New York Jets','Justin Fields','Garrett Wilson'],['NE','New England Patriots','Drake Maye','Stefon Diggs'],
    ['PIT','Pittsburgh Steelers','Aaron Rodgers','DK Metcalf'],['CLE','Cleveland Browns','Joe Flacco','Jerry Jeudy'],
    ['WSH','Washington Commanders','Jayden Daniels','Terry McLaurin'],['NYG','New York Giants','Jaxson Dart','Malik Nabers'],
    ['IND','Indianapolis Colts','Daniel Jones','Michael Pittman Jr.'],['TEN','Tennessee Titans','Cam Ward','Calvin Ridley'],
    ['CAR','Carolina Panthers','Bryce Young','Tetairoa McMillan'],['NO','New Orleans Saints','Tyler Shough','Chris Olave']
  ],
  WNBA: [
    ['IND','Indiana Fever','Caitlin Clark','Aliyah Boston'],['NY','New York Liberty','Sabrina Ionescu','Breanna Stewart'],
    ['LV','Las Vegas Aces','A’ja Wilson','Jackie Young'],['MIN','Minnesota Lynx','Napheesa Collier','Courtney Williams'],
    ['PHX','Phoenix Mercury','Alyssa Thomas','Kahleah Copper'],['SEA','Seattle Storm','Nneka Ogwumike','Skylar Diggins'],
    ['LA','Los Angeles Sparks','Kelsey Plum','Cameron Brink'],['DAL','Dallas Wings','Paige Bueckers','Arike Ogunbowale'],
    ['ATL','Atlanta Dream','Rhyne Howard','Allisha Gray'],['CHI','Chicago Sky','Angel Reese','Kamilla Cardoso'],
    ['CON','Connecticut Sun','Marina Mabrey','Aneesah Morrow'],['WSH','Washington Mystics','Sonia Citron','Kiki Iriafen'],
    ['GS','Golden State Valkyries','Kayla Thornton','Veronica Burton'],['TOR','Toronto Tempo','Avery Brooks','Jordan Ellis'],
    ['POR','Portland Fire','Morgan Hayes','Riley Bennett']
  ],
  NHL: [
    ['TOR','Toronto Maple Leafs','Auston Matthews','William Nylander'],['MTL','Montreal Canadiens','Nick Suzuki','Cole Caufield'],
    ['EDM','Edmonton Oilers','Connor McDavid','Leon Draisaitl'],['CGY','Calgary Flames','Nazem Kadri','Jonathan Huberdeau'],
    ['COL','Colorado Avalanche','Nathan MacKinnon','Cale Makar'],['DAL','Dallas Stars','Mikko Rantanen','Jason Robertson'],
    ['FLA','Florida Panthers','Aleksander Barkov','Sam Reinhart'],['TB','Tampa Bay Lightning','Nikita Kucherov','Brayden Point'],
    ['NYR','New York Rangers','Artemi Panarin','Adam Fox'],['NJD','New Jersey Devils','Jack Hughes','Jesper Bratt'],
    ['PIT','Pittsburgh Penguins','Sidney Crosby','Evgeni Malkin'],['PHI','Philadelphia Flyers','Matvei Michkov','Travis Konecny'],
    ['BOS','Boston Bruins','David Pastrňák','Pavel Zacha'],['BUF','Buffalo Sabres','Tage Thompson','Rasmus Dahlin'],
    ['CAR','Carolina Hurricanes','Sebastian Aho','Andrei Svechnikov'],['WSH','Washington Capitals','Alex Ovechkin','Dylan Strome'],
    ['VGK','Vegas Golden Knights','Jack Eichel','Mark Stone'],['LA','Los Angeles Kings','Adrian Kempe','Quinton Byfield'],
    ['MIN','Minnesota Wild','Kirill Kaprizov','Matt Boldy'],['WPG','Winnipeg Jets','Kyle Connor','Mark Scheifele'],
    ['VAN','Vancouver Canucks','Elias Pettersson','Quinn Hughes'],['SEA','Seattle Kraken','Matty Beniers','Jared McCann'],
    ['DET','Detroit Red Wings','Dylan Larkin','Lucas Raymond'],['OTT','Ottawa Senators','Tim Stützle','Brady Tkachuk'],
    ['NYI','New York Islanders','Mathew Barzal','Bo Horvat'],['CBJ','Columbus Blue Jackets','Zach Werenski','Adam Fantilli'],
    ['STL','St. Louis Blues','Robert Thomas','Jordan Kyrou'],['NSH','Nashville Predators','Filip Forsberg','Roman Josi'],
    ['SJ','San Jose Sharks','Macklin Celebrini','Will Smith'],['ANA','Anaheim Ducks','Leo Carlsson','Cutter Gauthier'],
    ['CHI','Chicago Blackhawks','Connor Bedard','Frank Nazar'],['UTA','Utah Mammoth','Clayton Keller','Logan Cooley']
  ],
  Soccer: [
    ['ARS','Arsenal','Bukayo Saka','Martin Ødegaard'],['CHE','Chelsea','Cole Palmer','Enzo Fernández'],
    ['LIV','Liverpool','Mohamed Salah','Florian Wirtz'],['MCI','Manchester City','Erling Haaland','Phil Foden'],
    ['RMA','Real Madrid','Kylian Mbappé','Vinícius Júnior'],['BAR','Barcelona','Lamine Yamal','Raphinha'],
    ['BAY','Bayern Munich','Harry Kane','Jamal Musiala'],['BVB','Borussia Dortmund','Serhou Guirassy','Julian Brandt'],
    ['PSG','Paris Saint-Germain','Ousmane Dembélé','Désiré Doué'],['MAR','Marseille','Mason Greenwood','Pierre-Emile Højbjerg'],
    ['INT','Inter Milan','Lautaro Martínez','Marcus Thuram'],['MIL','AC Milan','Rafael Leão','Christian Pulisic'],
    ['JUV','Juventus','Kenan Yıldız','Dušan Vlahović'],['NAP','Napoli','Scott McTominay','Romelu Lukaku'],
    ['MUN','Manchester United','Bruno Fernandes','Bryan Mbeumo'],['TOT','Tottenham Hotspur','Dominic Solanke','Dejan Kulusevski'],
    ['NEW','Newcastle United','Anthony Gordon','Bruno Guimarães'],['AVL','Aston Villa','Ollie Watkins','Morgan Rogers'],
    ['MIA','Inter Miami','Lionel Messi','Luis Suárez'],['LAFC','Los Angeles FC','Son Heung-min','Denis Bouanga']
  ]
};

const props = {
  MLB:[['Hits',[.5,1.5]],['Total bases',[1.5,2.5]],['Runs',[.5]],['Home runs',[.5]]],
  NBA:[['Player points',[19.5,23.5,26.5,21.5]],['Rebounds',[5.5,7.5,4.5]],['Assists',[4.5,6.5,3.5]],['Three-pointers',[1.5,2.5]]],
  WNBA:[['Player points',[17.5,21.5,15.5]],['Rebounds',[5.5,7.5,6.5]],['Assists',[4.5,6.5,3.5]],['Three-pointers',[1.5,2.5]]],
  NFL:[['Passing yards',[239.5,254.5,224.5]],['Passing touchdowns',[1.5,2.5]],['Receiving yards',[64.5,74.5,84.5]],['Receptions',[4.5,5.5,6.5]]],
  NHL:[['Shots on goal',[2.5,3.5]],['Player points',[.5,1.5]],['Assists',[.5]],['Goals',[.5]]],
  Soccer:[['Shots',[2.5,3.5]],['Shots on target',[.5,1.5]],['Goals',[.5]],['Assists',[.5]]]
};
const totals = {MLB:[7.5,8.5,9.5],NBA:[222.5,229.5,234.5],WNBA:[158.5,164.5,170.5],NFL:[43.5,47.5,50.5],NHL:[5.5,6.5],Soccer:[2.5,3.5]};
const hash = value => {let result=2166136261;for(const char of value)result=Math.imul(result^char.charCodeAt(0),16777619);return result>>>0;};
const clamp = value => Math.max(.055,Math.min(.945,value));
let cachedWindow = null, cachedQuotes = [];

export function createOddsDemoQuotes(at = new Date()) {
  const base = new Date(at.getFullYear(),at.getMonth(),at.getDate());
  const captured = at.toISOString();
  const quotes = [];
  for (const [sport,roster] of Object.entries(teams)) {
    for (let game=0;game<Math.ceil(roster.length/2);game++) {
      const away = roster[game*2], home = roster[(game*2+1)%roster.length];
      const eventId = `odds-demo-v1-${sport.toLowerCase()}-${away[0]}-${home[0]}`;
      const event = `${away[1]} vs ${home[1]}`;
      const dayOffset = roster.length%2 && game===Math.ceil(roster.length/2)-1 ? 3 : game%3;
      const start = new Date(base);start.setDate(base.getDate()+dayOffset);start.setHours(16+game%6,game%2?30:0,0,0);
      if(start.getTime()<at.getTime()+1800000)start.setDate(start.getDate()+1);
      const daysAway = Math.round((new Date(start.getFullYear(),start.getMonth(),start.getDate())-base)/86400000);
      const dayLabel = daysAway===0?'Today':daysAway===1?'Tomorrow':start.toLocaleDateString('en-US',{weekday:'short'});
      const displayTime = `${dayLabel} · ${start.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}`;
      let marketIndex=0;
      function market(name,type,line,sides,probabilities,extra={}) {
        const marketId = marketIndex++;
        ODDS_DEMO_BOOKS.forEach((book,bookIndex) => {
          // A few genuinely empty cells make coverage varied without losing a pair.
          if(bookIndex>5 && hash(`${eventId}-${marketId}-${book}`)%19===0)return;
          const move = (hash(`${eventId}-${marketId}-${book}`)%17-8)/1000;
          const vig = .025 + (bookIndex%5)*.007;
          sides.forEach((side,sideIndex) => {
            const fair = probabilities[sideIndex];
            const adjusted = clamp(fair+(sideIndex===0?move:-move/(sides.length-1))+vig/sides.length);
            const odds = probabilityToAmerican(adjusted);
            const quoteLine = type==='spread' ? sideIndex===0?line:-line : line;
            quotes.push({id:`${eventId}-${marketId}-${bookIndex}-${sideIndex}`,eventId,sport,league:sport,event,displayEvent:`${away[0]} @ ${home[0]}`,displayTime,startTime:start.toISOString(),
              market:name,type,line:quoteLine,side,book,odds,live:false,ts:captured,source:'example',demo:true,demoVersion:1,team:sideIndex===0?away[0]:home[0],...extra});
          });
        });
      }
      // Player markets come first, as in the reference board.
      for(const [teamIndex,team] of [away,home].entries()) {
        for(let playerIndex=0;playerIndex<2;playerIndex++) {
          const player = team[2+playerIndex];
          const playerProps = sport==='NFL' ? props.NFL.slice(playerIndex*2,playerIndex*2+2) : props[sport];
          for(const [propIndex,[label,lines]] of playerProps.entries()) {
            const line = lines[(game+playerIndex+teamIndex)%lines.length];
            const variation = (hash(`${eventId}-${player}-${label}`)%9)/100;
            let p = .47+variation;
            if (sport==='MLB' && label==='Hits') p = (line===.5?.66:.28)+variation;
            if (sport==='MLB' && label==='Total bases' && line===2.5) p = .33+variation;
            if (label==='Home runs') p = .14+variation;
            if (label==='Goals') p = .19+variation;
            if (sport==='Soccer' && label==='Assists') p = .14+variation;
            if (sport==='Soccer' && label==='Shots on target') p = (line===.5?.61:.33)+variation;
            if (sport==='NHL' && label==='Player points') p = (line===.5?.62:.32)+variation;
            market(`${player} ${label.toLowerCase()}`,'prop',line,['Over','Under'],[p,1-p],{player,displayMarket:label,team:team[0]});
            if(propIndex===0) {
              const step = sport==='NFL'?25:['NBA','WNBA'].includes(sport)?5:1;
              market(`${player} ${label.toLowerCase()}`,'alternate',line+step,['Over','Under'],[Math.max(.15,p-.16),Math.min(.85,1-p+.16)],{player,displayMarket:`${label} · Alt`,team:team[0]});
            }
          }
        }
      }
      const awayWin = .35+(game%7)*.04;
      market('Moneyline',sport==='Soccer'?'three-way':'moneyline','',sport==='Soccer'?[away[0],'Draw',home[0]]:[away[0],home[0]],sport==='Soccer'?[awayWin*.76,.24,(1-awayWin)*.76]:[awayWin,1-awayWin]);
      const total = totals[sport][game%totals[sport].length];
      const totalName = ['Soccer','NHL'].includes(sport)?'Total goals':sport==='MLB'?'Total runs':'Game total';
      market(totalName,'total',total,['Over','Under'],[.51,.49]);
      const spread = ['MLB','NHL'].includes(sport)?1.5:sport==='Soccer'?1.5:[2.5,3.5,5.5,6.5][game%4];
      market(sport==='MLB'?'Run line':sport==='NHL'?'Puck line':sport==='Soccer'?'Goal handicap':'Point spread','spread',spread,[away[0],home[0]],[.5,.5]);
      market(`${totalName} (alternate)`,'alternate',total+(['NBA','WNBA'].includes(sport)?5:1),['Over','Under'],[.4,.6],{displayMarket:`${totalName} · Alt`});
    }
  }
  return quotes;
}

export function oddsDemoQuotes(at = new Date()) {
  if(!ODDS_DEMO_ENABLED)return [];
  const window = Math.floor(at.getTime()/300000);
  if(window!==cachedWindow) {cachedWindow=window;cachedQuotes=createOddsDemoQuotes(at);}
  return cachedQuotes;
}

export function oddsWorkspaceQuotes(saved, at = new Date(), enabled = ODDS_DEMO_ENABLED) {
  const entered = saved.filter(q=>q.source!=='example' && !q.demo);
  if(!enabled)return entered;
  // Old optional examples no longer determine whether the development board fills.
  return [...entered,...oddsDemoQuotes(at)];
}

export function oddsDemoHistory(quote) {
  if(!quote.demo)return [];
  const base = Date.parse(quote.ts), p = quote.odds>0?100/(quote.odds+100):-quote.odds/(-quote.odds+100);
  const hoursAgo = [24,12,6,2,1,.75,.5,.25,0];
  return hoursAgo.map((hours,index)=>({...quote,id:`${quote.id}-history-${index}`,quoteId:quote.id,ts:new Date(base-hours*3600000).toISOString(),odds:index===hoursAgo.length-1?quote.odds:probabilityToAmerican(clamp(p+(hash(`${quote.id}-${index}`)%13-6)/1000))}));
}

// Test fixture: nine fixed DFS props (formerly the fantasy view's design preview). Tests only.
import { isContestPlatform } from '../../public/platform-catalog.js';
import { isDfsPlatform } from '../../public/dfs-workspace.js';

export function dfsPreview(app = 'PrizePicks') {
  if (isContestPlatform(app)) return [];
  const rows = [
    ['podziemski','NBA','GSW','Brandin Podziemski','Golden State Warriors vs Memphis Grizzlies','Made Threes',1.5,'Over',.5646,'10:00pm'],
    ['maxey','NBA','PHI','Tyrese Maxey','Philadelphia 76ers vs Orlando Magic','Points',28.5,'Under',.5567,'7:00pm'],
    ['jokic','NBA','DEN','Nikola Jokić','Minnesota Timberwolves vs Denver Nuggets','Assists',9.5,'Under',.5560,'9:30pm'],
    ['tatum','NBA','BOS','Jayson Tatum','Boston Celtics vs New York Knicks','Points + Rebounds + Assists',37.5,'Over',.5555,'7:30pm'],
    ['curry','NBA','GSW','Stephen Curry','Golden State Warriors vs Memphis Grizzlies','Points',26.5,'Over',.5498,'10:00pm'],
    ['banchero','NBA','ORL','Paolo Banchero','Philadelphia 76ers vs Orlando Magic','Rebounds',7.5,'Under',.5410,'7:00pm'],
    ['allen','NFL','BUF','Josh Allen','Buffalo Bills vs Miami Dolphins','Passing Yards',249.5,'Over',.5590,'1:00pm'],
    ['chase','NFL','CIN','Ja’Marr Chase','Cincinnati Bengals vs Baltimore Ravens','Receiving Yards',92.5,'Over',.5470,'1:00pm'],
    ['judge','MLB','NYY','Aaron Judge','New York Yankees vs Boston Red Sox','Total Bases',1.5,'Over',.5520,'7:10pm']
  ];
  const platforms = [...new Set(['PrizePicks','Underdog Fantasy','DraftKings Pick6','Sleeper Picks','ParlayPlay','Dabble','Betr Picks',app])].filter(isDfsPlatform);
  return rows.map(row => {
    const [id,sport,team,player,event,market,line,side,probability,startLabel] = row;
    return {id:`dfs-preview-${id}`,sport,team,player,event,market,line,side,probability,startLabel,app,source:'design-preview',platformLines:platforms.map(name => ({app:name,line,over:{line},under:{line},[side.toLowerCase()]:{line,probability}}))};
  });
}

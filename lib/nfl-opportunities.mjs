// A transparent workload scenario, not a fitted injury-performance coefficient.
export const OPPORTUNITY_VERSION='teammate-opportunities-v1';
const n=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const sum=(xs,f)=>xs.reduce((s,x)=>s+(n(f(x))||0),0);
const mean=(xs,f)=>xs.length?sum(xs,f)/xs.length:0;
const round=x=>Math.round(x*10000)/10000;
const cap=(x,max)=>Math.max(0,Math.min(max,x));
const skill=p=>['WR','TE','RB','FB'].includes(p.position);
const role=(p,field)=>field==='targets'?skill(p):['RB','FB'].includes(p.position);
const appeared=p=>p&&p.statsAvailable!==false&&(n(p.offense_snaps)>0||sum([p],r=>(n(r.targets)||0)+(n(r.carries)||0)+(n(r.attempts)||0))>0);
const prior=(g,t)=>g.complete&&g.game_type!=='PRE'&&g.gameday<t.date&&(Number(g.season)<t.season||Number(g.season)===t.season&&Number(g.week)<t.week);
const healthy=a=>a&&!a.stale&&!a.unavailable&&!a.concern&&a.status!=='unavailable'&&a.status!=='historical_unavailable';

export function teammateOpportunities({games,rosters,weeklyRosters=[],snaps=[],availability,target,stale=false}){
  const current=[...rosters.values()].filter(p=>p.team===target.team&&p.gsis_id);
  const result=new Map(current.map(p=>[p.gsis_id,{version:OPPORTUNITY_VERSION,status:'unchanged',applied:false,adjustments:{targets:0,carries:0},donors:[],channels:[],note:'No newly vacated workload in the recent team sample.'}]));
  const injured=current.filter(p=>availability.get(p.gsis_id)?.unavailable);
  const setNote=(status,note)=>{for(const x of result.values())Object.assign(x,{status,note});return result;};
  if(!injured.length)return result;
  if(stale||injured.some(p=>availability.get(p.gsis_id)?.stale))return setNote('withheld','Injury or statistical source is stale; teammate workload adjustment withheld.');
  const history=games.filter(g=>prior(g,target)&&(g.home_team===target.team||g.away_team===target.team)).sort((a,b)=>b.gameday.localeCompare(a.gameday)).slice(0,24);
  const recent=history.slice(0,3);
  if(recent.length<3)return setNote('withheld','Fewer than three completed team games; no supported workload allocation.');
  const teamAttempts=sum(recent,g=>sum([...g.players.values()].filter(r=>r.team===target.team),r=>r.attempts));
  const startingQbOut=injured.some(p=>p.position==='QB'&&(target.quarterbackId?p.gsis_id===target.quarterbackId:teamAttempts>0&&sum(recent,g=>g.players.get(p.gsis_id)?.attempts)/teamAttempts>.5));
  if(startingQbOut)return setNote('withheld','The scheduled or recent starting quarterback is unavailable; the replacement passing environment is unresolved. No automatic teammate boost.');
  const sources=[{label:'Weekly player statistics',url:'https://github.com/nflverse/nflverse-data/releases/tag/stats_player'},{label:'Offensive snap counts',url:'https://github.com/nflverse/nflverse-data/releases/tag/snap_counts'},{label:'Weekly team membership',url:'https://github.com/nflverse/nflverse-data/releases/tag/weekly_rosters'}];
  const rosterIndex=new Map(weeklyRosters.filter(r=>r.team===target.team&&r.week&&r.gsis_id).map(r=>[`${r.season}:${r.week}:${r.gsis_id}`,r]));
  const snapsByGame=new Map();for(const s of snaps)if(s.team===target.team){if(!snapsByGame.has(s.game_id))snapsByGame.set(s.game_id,new Map());snapsByGame.get(s.game_id).set(s.pfr_player_id,s);}
  // Missing statistics alone are never proof of absence. Require exact weekly
  // team membership plus a covered snap report or an explicit inactive roster.
  function participation(g,p){
    const row=g.players.get(p.gsis_id);if(row?.team===target.team&&appeared(row))return 'with';
    const membership=rosterIndex.get(`${g.season}:${g.week}:${p.gsis_id}`);if(!membership)return 'unknown';
    if(['RES','INA','PUP','SUS','RSN'].includes(membership.status))return 'without';
    const report=snapsByGame.get(g.game_id),snap=report?.get(membership.pfr_id||p.pfr_id);
    if(snap&&n(snap.offense_snaps)===0)return 'without';
    if(membership.status==='ACT'&&!snap&&report&&[...report.values()].filter(s=>n(s.offense_snaps)>0).length>=8)return 'without';
    return 'unknown';
  }
  for(const field of ['targets','carries']){
    const total=g=>sum([...g.players.values()].filter(p=>p.team===target.team&&p.statsAvailable!==false),p=>p[field]);
    const teamTotal=mean(recent,total);
    if(teamTotal<=0)continue;
    const donors=injured.filter(p=>role(p,field)).map(p=>({p,amount:mean(recent,g=>{const row=g.players.get(p.gsis_id);return row?.team===target.team?n(row[field]):0;})})).filter(d=>d.amount>0);
    const vacant=sum(donors,d=>d.amount);if(!vacant)continue;
    const candidates=current.filter(p=>p.status==='ACT'&&role(p,field)&&healthy(availability.get(p.gsis_id))).map(p=>{
      const baseline=mean(recent,g=>{const r=g.players.get(p.gsis_id);return r?.team===target.team?n(r[field]):0;});
      // Recent on-field usage, not nominal roster order, defines recipients.
      const latest=recent[0].players.get(p.gsis_id);
      if(!appeared(latest)||latest.team!==target.team||baseline<=0)return null;
      const withRows=[],withoutRows=[];
      for(const g of history){
        const r=g.players.get(p.gsis_id);if(!appeared(r)||r.team!==target.team||!n(total(g)))continue;
        const states=donors.map(d=>participation(g,d.p));
        if(states.includes('unknown'))continue;
        const item={gameId:g.game_id,date:g.gameday,opportunities:n(r[field])||0,teamOpportunities:total(g),share:(n(r[field])||0)/total(g),offenseSnaps:n(r.offense_snaps),boxscore:g.espn?`https://www.espn.com/nfl/boxscore/_/gameId/${g.espn}`:null};
        if(states.every(s=>s==='without'))withoutRows.push(item);else if(states.every(s=>s==='with'))withRows.push(item);
      }
      const currentShare=baseline/teamTotal,withShare=mean(withRows,r=>r.share),withoutShare=mean(withoutRows,r=>r.share);
      const supported=withRows.length>=3&&withoutRows.length>=2;
      const exposure=mean(recent,g=>sum(donors,d=>{const r=g.players.get(d.p.gsis_id);return r?.team===target.team&&appeared(r)?1:0;})/donors.length);
      const historicalGain=supported?Math.max(0,withoutShare-currentShare)*teamTotal*exposure:0;
      return {p,baseline,currentShare,withShare,withoutShare,withRows,withoutRows,supported,historicalGain};
    }).filter(Boolean);
    const activeVolume=sum(candidates,c=>c.baseline);
    if(!activeVolume)continue;
    for(const c of candidates){
      // With/without evidence is shrunk toward role-share allocation. The
      // eight-game prior, 50% fallback allocation and caps are explicit rules,
      // not claimed as learned optimal weights or a causal injury effect.
      const roleAllocation=vacant*c.baseline/activeVolume;
      const weight=c.supported?c.withoutRows.length/(c.withoutRows.length+8):0;
      const raw=c.supported?weight*c.historicalGain+(1-weight)*roleAllocation*.5:roleAllocation*.5;
      c.delta=Math.min(raw,c.baseline*.5,field==='targets'?4:8);
    }
    const allocation=sum(candidates,c=>c.delta),scale=allocation>vacant?vacant/allocation:1;
    for(const c of candidates){
      const x=result.get(c.p.gsis_id),delta=c.delta*scale;
      x.adjustments[field]=round(delta);
      x.channels.push({field,delta:round(delta),recentWorkload:round(c.baseline),adjustedWorkload:round(c.baseline+delta),teamWorkload:round(teamTotal),vacated:round(vacant),allocated:round(sum(candidates,r=>r.delta*scale)),unallocated:round(vacant-sum(candidates,r=>r.delta*scale)),method:c.supported?'Historical absence + recent role':'Recent role estimate',withCount:c.withRows.length,withoutCount:c.withoutRows.length,withShare:round(c.withShare),withoutShare:round(c.withoutShare),historicalWeight:c.supported?round(c.withoutRows.length/(c.withoutRows.length+8)):0,withGames:c.withRows,withoutGames:c.withoutRows,recentGames:recent.map(g=>({gameId:g.game_id,date:g.gameday,teamOpportunities:total(g),playerOpportunities:n(g.players.get(c.p.gsis_id)?.[field])||0}))});
      x.donors=[...new Map([...x.donors,...donors.map(d=>({playerId:d.p.gsis_id,player:d.p.full_name,position:d.p.position,availability:availability.get(d.p.gsis_id)}))].map(d=>[d.playerId,d])).values()];
      x.sources=sources;x.applied=Object.values(x.adjustments).some(v=>v>0);x.status=x.applied?'experimental':'unchanged';
      x.note='Projected workload scenario. Recent usage identifies recipients; verified historical nonparticipation informs the estimate when available. Team volume is not increased. These rules have not been calibrated for injury-adjusted probabilities.';
    }
  }
  return result;
}

export function relevantOpportunity(impact,market,position){
  if(!impact||!skill({position})||market.startsWith('pass_'))return null;
  const fields=market.startsWith('rec')?['targets']:['rush_yds','rush_attempts'].includes(market)?['carries']:['targets','carries'];
  const channels=impact.channels.filter(c=>fields.includes(c.field));
  return {...impact,channels,adjustments:Object.fromEntries(fields.map(f=>[f,impact.adjustments[f]||0])),applied:channels.some(c=>c.delta>0)};
}

// Preserve the original rating formula. Only projected workload inputs move;
// historical stats, red-zone roles, efficiency and scoring weights stay intact.
export function applyOpportunityRating(p,market){
  const impact=p.forecast?.teammateImpact;if(!impact?.applied)return;
  const before={score:p.modelScore,baseline:p.baselineScore,projected:p.projected,tdProb:p.tdProb,components:{...p.details.components}};
  const after={...before.components},d=impact.adjustments,t=d.targets||0,c=d.carries||0;
  const totals={};for(const r of p.forecast.sample||[])for(const k of ['targets','receptions','receiving_yards','receiving_tds','carries','rushing_yards','rushing_tds'])totals[k]=(totals[k]||0)+(n(r[k])||0);
  const efficiency=(a,b)=>totals[b]>0?totals[a]/totals[b]:0;
  const rec=t*efficiency('receptions','targets'),recYds=t*efficiency('receiving_yards','targets'),rushYds=c*efficiency('rushing_yards','carries');
  const teamTargets=impact.channels.find(x=>x.field==='targets')?.teamWorkload,teamCarries=impact.channels.find(x=>x.field==='carries')?.teamWorkload;
  const bump=(key,value,max)=>{if(Number.isFinite(after[key]))after[key]=cap(after[key]+value/max*100,100);};
  if(market==='any_td'){
    bump('volume',c+rec,25);if(teamTargets)bump('target_share',t/teamTargets,.35);
    const weights=[['rz_role',.35],['volume',.25],['goal_line',.15],['target_share',.15],['td_rate',.1]].filter(([k])=>Number.isFinite(after[k]));
    p.baselineScore=sum(weights,([k,w])=>after[k]*w)/sum(weights,([,w])=>w);
    const lambdaDelta=t*efficiency('receiving_tds','targets')+c*efficiency('rushing_tds','carries');
    if(Number.isFinite(p.tdProb))p.tdProb=1-(1-p.tdProb)*Math.exp(-lambdaDelta);
  }else{
    const changes={rec:[t,12,rec,9],rec_yds:[t,12,recYds,100],rush_yds:[c,25,rushYds,120],rush_attempts:[teamCarries?c/teamCarries:0,.75,c,25],rush_rec_yds:[c+rec,25,rushYds+recYds,150]}[market];
    if(!changes)return;bump('volume',changes[0],changes[1]);bump('baseline',changes[2],changes[3]);
    p.baselineScore=(after.volume*.5+after.baseline*.3)/.8;
  }
  const w=market==='any_td'?.6:.8;
  p.modelScore=round(cap(Number.isFinite(p.opportunityScore)?p.baselineScore*w+p.opportunityScore*(1-w)+(p.dueBonus||0):p.baselineScore+(p.dueBonus||0),100));
  p.compositeScore=p.modelScore;p.baselineScore=round(p.baselineScore);p.details.components=after;
  p.baseRating=before;impact.rating={before:before.score,after:p.modelScore,delta:round(p.modelScore-before.score)};
  const changes=impact.channels.filter(x=>x.delta>0).map(x=>`+${x.delta.toFixed(1)} projected ${x.field}`).join(' and ');
  p.reason=`${impact.donors.map(d=>d.player).join(' and ')} out: ${changes} from teammate workload allocation. ${p.reason}`;
}

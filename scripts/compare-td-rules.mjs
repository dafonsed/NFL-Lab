import { Provider } from '../lib/providers.mjs';
import { buildPlayers, buildRates, prepareData, number } from '../lib/model.mjs';
import { fitTdCalibration, calibratedTdProbability, tdProbabilityMetrics } from '../lib/td-calibration.mjs';

const provider = new Provider({ fetcher: async () => { throw Error('Use cached public datasets.'); } });
const specs = [['schedule', null], ...[2024, 2025].flatMap(y => ['pbp', 'weekly', 'roster', 'weeklyRoster', 'snaps'].map(type => [type, y]))];
const datasets = await Promise.all(specs.map(async ([type, year]) => ({ type, rows: (await provider.load(type, year)).rows })));
const get = type => datasets.filter(d => d.type === type).flatMap(d => d.rows);
const rosters = [...get('roster'), ...get('weeklyRoster')];
const games = prepareData({ schedule: get('schedule'), pbp: get('pbp'), weekly: get('weekly'), rosters, snaps: get('snaps'), chart: [] });
const rates = new Map([[2024, buildRates([])], [2025, buildRates(get('pbp').filter(p => Number(p.season) === 2024 && games.get(p.game_id)?.complete))]]);
for (const variant of [{name:'current',opponentWindow:5,droughtBonus:false},{name:'opponent-eight',opponentWindow:8,droughtBonus:false},{name:'drought',opponentWindow:5,droughtBonus:true},{name:'both',opponentWindow:8,droughtBonus:true}]) {
  const rows=[];
  for (const [season,first,last] of [[2024,6,18],[2025,1,18]]) for (let week=first;week<=last;week++) {
    const board=buildPlayers({games,rosters,season,week,market:'any_td',rates:rates.get(season),trainingSeason:season-1,opponentWindow:variant.opponentWindow,droughtBonus:variant.droughtBonus});
    for(const p of board){const game=games.get(p.gameId),actual=game?.players.get(p.playerId);if(!game?.complete||p.details.sample.length<5||p.result.status!=='final'||!actual)continue;const rush=number(actual.rushing_tds),rec=number(actual.receiving_tds);if(rush===null||rec===null||!Number.isFinite(p.modelScore))continue;rows.push({season,score:p.modelScore,position:p.position,outcome:Number(rush+rec>0)});}
  }
  const fit=fitTdCalibration(rows.filter(r=>r.season===2024));
  const metrics=tdProbabilityMetrics(rows.filter(r=>r.season===2025),r=>calibratedTdProbability(r.score,r.position,fit,2025));
  console.log(JSON.stringify({variant:variant.name,n:metrics.n,brier:metrics.brier,logLoss:metrics.logLoss}));
}

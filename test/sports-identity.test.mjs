import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {playerPhoto,teamLogo,playerPortrait,opponentIdentity} from '../public/sports-identity.js';

test('player images respect provider ID namespaces and retain supplied headshots',()=>{
 assert.equal(playerPhoto({sport:'nfl',playerId:'00-0033873'}),'');
 assert.equal(playerPhoto({sport:'nfl',image:'https://static.www.nfl.com/player.png'}),'https://static.www.nfl.com/player.png');
 assert.equal(playerPhoto({sport:'mlb',playerId:660271,image:'https://img.mlbstatic.com/mlb-photos/image/upload/w_96,q_auto:good/v1/people/660271/headshot/67/current'}),'https://img.mlbstatic.com/mlb-photos/image/upload/w_320,q_auto:good,f_png/v1/people/660271/headshot/silo/current');
 assert.equal(playerPhoto({sport:'mlb',playerId:660271}),playerPhoto({sport:'mlb',image:'https://img.mlbstatic.com/mlb-photos/image/upload/w_96/v1/people/660271/headshot/67/current'}));
 assert.match(playerPhoto({sport:'nba',id:'1966'}),/headshots\/nba\/players\/full\/1966\.png$/);
 assert.equal(playerPhoto({sport:'nba',id:'12/34',image:'javascript:alert(1)'}),'');
 assert.equal(playerPhoto({sport:'soccer',id:'359',position:'TEAM'}),'');
});

test('team badges use current profile team, not the team implied by a headshot',()=>{
 assert.equal(teamLogo({sport:'mlb',team:'CWS',raw:{teamId:145}}),'https://a.espncdn.com/i/teamlogos/mlb/500/chw.png');
 assert.equal(teamLogo({sport:'nfl',team:'LA'}),'https://a.espncdn.com/i/teamlogos/nfl/500/lar.png');
 assert.equal(teamLogo({sport:'wnba',team:'NY',raw:{teamId:'9'}}),'https://a.espncdn.com/i/teamlogos/wnba/500/9.png');
 assert.equal(teamLogo({sport:'soccer',team:'ARS',raw:{teamId:'359'}}),'https://a.espncdn.com/i/teamlogos/soccer/500/359.png');
 assert.equal(teamLogo({sport:'soccer',team:'ARS'}),'');
 const $=load(playerPortrait({sport:'mlb',name:'Player <A>',playerId:'660271',team:'LAD'},{size:'hero',eager:true}));
 assert.equal($('.portrait-team-logo').attr('src'),'https://a.espncdn.com/i/teamlogos/mlb/500-dark/lad.png');
 assert.equal($('.portrait-team-logo').attr('data-identity-fallback'),'https://a.espncdn.com/i/teamlogos/mlb/500/lad.png');
 assert.equal($('.portrait-photo').attr('loading'),'eager');assert.equal($('.portrait-hero').length,1);assert.equal($('a').length,0);
 const team=load(playerPortrait({sport:'soccer',name:'Arsenal',position:'TEAM',teamId:'359',team:'ARS'}));
 assert.equal(team('.portrait-team-badge').length,0);assert.match(team('.portrait-photo').attr('src'),/teamlogos\/soccer\/500\/359.png$/);
});

test('dark MLB and NFL badges retain a standard-logo fallback without guessing other leagues',()=>{
 for(const [sport,team,slug] of [['mlb','SDP','sd'],['nfl','BAL','bal']]){
  const $=load(playerPortrait({sport,team,name:'Player'}));
  assert.equal($('.portrait-team-logo').attr('src'),`https://a.espncdn.com/i/teamlogos/${sport}/500-dark/${slug}.png`);
  assert.equal($('.portrait-team-logo').attr('data-identity-fallback'),`https://a.espncdn.com/i/teamlogos/${sport}/500/${slug}.png`);
  assert.equal($('.portrait-face .portrait-team-logo').length,0);
 }
 const $=load(playerPortrait({sport:'nba',team:'CLE',teamId:'5',name:'Player'}));
 assert.equal($('.portrait-team-logo').attr('src'),'https://a.espncdn.com/i/teamlogos/nba/500/5.png');
 assert.equal($('.portrait-team-logo').attr('data-identity-fallback'),undefined);
});

test('overlay artwork is selected per team and retains readable primary marks',()=>{
 for(const team of ['NYM','MIA']){
  const $=load(playerPortrait({sport:'mlb',team,name:'Player'}));
  assert.equal($('.portrait-team-logo').attr('src'),`/assets/teams/mlb/${team.toLowerCase()}.svg`);
  assert.equal($('.portrait-team-logo').attr('data-identity-fallback'),teamLogo({sport:'mlb',team}));
 }
 for(const team of ['PHI','TEX','SF','BAL']){
  const $=load(playerPortrait({sport:'mlb',team,name:'Player'}));
  assert.equal($('.portrait-team-logo').attr('src'),teamLogo({sport:'mlb',team}));
  assert.equal($('.portrait-team-logo').attr('data-identity-fallback'),undefined);
 }
});

test('opponent marks respect MLB and ESPN namespaces and leave unknown teams unbranded',()=>{
 assert.equal(opponentIdentity({opponent:'San Diego Padres',opponentId:135},'mlb').code,'SD');
 assert.match(opponentIdentity({opponent:'San Diego Padres',opponentId:135},'mlb').logo,/500-dark\/sd.png$/);
 assert.equal(opponentIdentity({opponent:'New York Mets'},'mlb').logo,'/assets/teams/mlb/nym.svg');
 assert.equal(opponentIdentity({opponent:'CLE',opponentId:5},'nba').logo,'https://a.espncdn.com/i/teamlogos/nba/500/5.png');
 assert.equal(opponentIdentity({opponent:'Unknown opponent',opponentId:999},'mlb').logo,'');
 assert.equal(opponentIdentity({opponent:'Unknown opponent'},'soccer').logo,'');
});

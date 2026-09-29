import test from 'node:test';
import assert from 'node:assert/strict';
import {readResearchNote,writeResearchNote} from '../public/research-notes.js';

function memory(initial={}) {
  const values=new Map(Object.entries(initial));
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
}

test('Trends research notes reuse each model workspace’s existing player notes',()=>{
  for(const [sport,key] of [['nfl','nfl-notes'],['mlb','mlb-lab-notes'],['nba','sports-lab-notes-nba'],['wnba','sports-lab-notes-wnba'],['nhl','sports-lab-notes-nhl'],['soccer','sports-lab-notes-soccer']]) {
    const store=memory({[key]:JSON.stringify({42:'Prior matchup note',other:'Keep this note'})});
    const player={sport,playerId:42};
    assert.equal(readResearchNote(player,store),'Prior matchup note');
    assert.equal(writeResearchNote(player,'Updated in Trends',store),true);
    assert.equal(readResearchNote(player,store),'Updated in Trends');
    assert.equal(JSON.parse(store.getItem(key)).other,'Keep this note');
  }
});

test('notes can recover malformed saved data and report an unavailable store',()=>{
  const player={sport:'nfl',playerId:'p'},store=memory({'nfl-notes':'broken data'});
  assert.equal(readResearchNote(player,store),'');
  assert.equal(writeResearchNote(player,'Recovered note',store),true);
  assert.equal(readResearchNote(player,store),'Recovered note');
  const blocked={getItem:()=>{throw Error('Unavailable');},setItem:()=>{throw Error('Unavailable');}};
  assert.equal(readResearchNote(player,blocked),'');
  assert.equal(writeResearchNote(player,'Unsaved note',blocked),false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {load} from 'cheerio';
import {historySeries,lineHistoryView,bindHistory} from '../public/bet-history.js';

const now=Date.parse('2026-09-28T12:00:00Z');
const point=(book,line,odds,minutes=1)=>({book,line,odds,ts:new Date(now-minutes*60000).toISOString()});

test('line history plots actual numerical lines, including zero, independently of valid odds',()=>{
  const model={selection:'Over 0.5',columns:[{name:'Book A'},{name:'Book B'}],history:[
    point('Book A',0,-110,3),point('Book A',1.5,-110,2),point('Book A',2.5,null),
    point('Book B',null,120),point('Book B','',125),point('Book B',false,130)]};
  const $=load(lineHistoryView(model,{metric:'line',range:'three',now,inline:true}));
  assert.equal($('.bet-history-view').attr('data-history-metric'),'line');
  assert.equal($('.bet-history-view h3').text(),'Line movement');
  assert.deepEqual($('.bet-history-hit').map((_,el)=>$(el).attr('data-line')).get(),['0','1.5','2.5']);
  assert.equal($('[data-history-book="Book A"] .bet-history-book-latest').text(),'2.5');
  assert.equal($('[data-history-book="Book B"] .bet-history-book-latest').text(),'—');
  assert.equal($('[data-history-range] option[value=three][selected]').text(),'3 hours');
  assert.match($('.bet-history-trace path').attr('d'),/H[\d.]+ V[\d.]+/,'observed line changes use steps');
  assert.equal($('.bet-history-hit').last().attr('data-odds'),'—');
  assert.equal(historySeries(model,{metric:'line'})[1].points.length,0,'missing lines never become zero');
});

test('markets without numerical lines explicitly fall back to saved odds without invented snapshots',()=>{
  const model={selection:'Home',history:[point('Book A',null,120,2),point('Book A','',130)]};
  const $=load(lineHistoryView(model,{metric:'line',now}));
  assert.equal($('.bet-history-view').attr('data-history-metric'),'odds');
  assert.equal($('h3').text(),'Odds history');
  assert.match($('.bet-history-fallback').text(),/No numerical line snapshots/);
  assert.equal($('.bet-history-hit').length,2);
  assert.equal($('.bet-history-book-latest').text(),'+130');
  const empty=load(lineHistoryView({selection:'Home',columns:[{name:'Book A'}],history:[]},{metric:'line',now}));
  assert.equal(empty('svg,.bet-history-hit').length,0);
  assert.match(empty('.bet-history-empty').text(),/No recorded odds/);
});

test('single snapshots remain points and out-of-window observations are not plotted',()=>{
  const model={selection:'Under 20.5',history:[point('Book A',20.5,-110),point('Book A',19.5,-105,240),point('Book A',22.5,100,-1)]};
  const $=load(lineHistoryView(model,{metric:'line',range:'three',now}));
  assert.equal($('.bet-history-hit').length,1);
  assert.equal($('.bet-history-trace path').length,0);
  assert.match($('.bet-history-caption').text(),/One snapshot per book/);
});

test('history binding preserves requested metric and selection when changing range and disposes listeners',t=>{
  const saved={window:globalThis.window,ResizeObserver:globalThis.ResizeObserver,cancelAnimationFrame:globalThis.cancelAnimationFrame,requestAnimationFrame:globalThis.requestAnimationFrame};
  let disconnected=false;
  Object.assign(globalThis,{window:{innerWidth:440,innerHeight:844},ResizeObserver:class{observe(){}disconnect(){disconnected=true;}},cancelAnimationFrame(){},requestAnimationFrame:()=>1});
  t.after(()=>{for(const [key,value] of Object.entries(saved))if(value===undefined)delete globalThis[key];else globalThis[key]=value;});
  const events=new Map(),root={clientWidth:400,innerHTML:'',closest:()=>null,addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name),querySelector:()=>null};
  const dispose=bindHistory(root,{selection:'Over',columns:[{name:'Book A'},{name:'Book B'}],history:[point('Book A',0,110),point('Book B',1,120)]},{metric:'line',inline:true,selected:['Book A'],now});
  events.get('change')({target:{value:'all',matches:selector=>selector==='[data-history-range]'}});
  const $=load(root.innerHTML);
  assert.equal($('.bet-history-view').attr('data-history-metric'),'line');
  assert.equal($('[data-history-range] option[selected]').val(),'all');
  assert.equal($('[data-history-book="Book B"]').attr('aria-pressed'),'false');
  assert.equal($('.bet-history-hit').length,1);
  dispose();assert.equal(events.size,0);assert.equal(disconnected,true);
});

const comparisonSource=(await fs.readFile(new URL('../public/bet-comparison.js',import.meta.url),'utf8')).replace(/^import .*?;\r?\n/gm,'').replace(/^await accountReady;\r?\n/gm,'').replace(/^export /gm,'');
function comparisonHarness(inlineHistory=true){
  const historyCalls=[],events=new Map(),storage=new Map();let disposed=0,modalCount=0,dialog;
  const element=dataset=>({dataset,hidden:false,attrs:{},setAttribute(name,value){this.attrs[name]=value;},focus(){},closest(selector){return selector==='[data-comparison-action]'&&this.dataset.comparisonAction||selector==='[data-book-history]'&&this.dataset.bookHistory?this:null;}});
  const actions=Object.fromEntries(['table','chart','hide','pin','flag'].map(name=>[name,[element({comparisonAction:name})]]));actions.pin.push(element({comparisonAction:'pin'}));
  const data=element({}),history=element({}),saved=element({});history.querySelector=()=>({});
  const card={addEventListener:(name,handler)=>events.set(name,handler),querySelectorAll:selector=>actions[/data-comparison-action="([^"]+)"/.exec(selector)?.[1]]||[],querySelector:selector=>selector==='.bet-comparison-data'?data:selector==='.bet-comparison-history'?history:selector==='[data-comparison-saved]'?saved:actions[/data-comparison-action="([^"]+)"/.exec(selector)?.[1]]?.[0]||element({})};
  const document={body:{append(){}},createElement(tag){assert.equal(tag,'dialog','inline mode must not create a dialog');modalCount++;const handlers=new Map(),control={addEventListener(){},focus(){}};dialog={setAttribute(){},innerHTML:'',querySelector:()=>control,addEventListener:(type,fn)=>handlers.set(type,fn),showModal(){},remove(){},handlers};return dialog;}};
  const model={id:'test',selection:'Over 20.5',inlineHistory,historyMetric:'line',history:[],historyBySide:{Under:[point('Book B',20.5,-110)]},rows:[{side:'Under',selection:'Under 20.5'}]};
  const context=vm.createContext({document,localStorage:{getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)},bindHistory:(root,historyModel,options)=>{historyCalls.push({root,model:historyModel,options});return ()=>disposed++;}});
  vm.runInContext(comparisonSource,context);context.bindComparison({querySelector:()=>card},model);
  return {actions,data,history,historyCalls,get disposed(){return disposed;},get modalCount(){return modalCount;},get dialog(){return dialog;},click:name=>events.get('click')({target:actions[name][0]}),book:()=>events.get('click')({target:element({bookHistory:'Book B',historySide:'Under'})})};
}

test('inline comparison switches table/history, hides the active view, and syncs duplicate pins',()=>{
  const h=comparisonHarness();
  h.click('chart');assert.equal(h.modalCount,0);assert.equal(h.data.hidden,true);assert.equal(h.history.hidden,false);
  assert.equal(h.actions.chart[0].attrs['aria-pressed'],'true');assert.equal(h.actions.table[0].attrs['aria-pressed'],'false');
  assert.equal(h.historyCalls[0].options.metric,'line');assert.equal(h.historyCalls[0].options.inline,true);
  h.click('hide');assert.equal(h.history.hidden,true);assert.equal(h.data.hidden,true);
  h.click('hide');assert.equal(h.history.hidden,false);assert.equal(h.data.hidden,true);
  h.click('table');assert.equal(h.history.hidden,true);assert.equal(h.data.hidden,false);
  h.click('chart');assert.equal(h.historyCalls.length,1,'switching back preserves chart range and books');
  h.book();assert.equal(h.disposed,1);assert.equal(h.historyCalls[1].model.selection,'Under 20.5');assert.equal(h.historyCalls[1].options.selected[0],'Book B');
  h.click('pin');assert.ok(h.actions.pin.every(button=>button.attrs['aria-pressed']==='true'));
});

test('consumers without inline history retain the chart dialog and restore pressed states on close',()=>{
  const h=comparisonHarness(false);h.click('chart');
  assert.equal(h.modalCount,1);assert.equal(h.data.hidden,false);
  assert.equal(h.actions.chart[0].attrs['aria-pressed'],'true');
  h.dialog.handlers.get('close')();
  assert.equal(h.disposed,1);assert.equal(h.actions.chart[0].attrs['aria-pressed'],'false');assert.equal(h.actions.table[0].attrs['aria-pressed'],'true');
});

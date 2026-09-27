import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {load} from 'cheerio';
import {siteHeader,renderSitePage} from '../lib/site-layout.mjs';
import {MORE_TOOLS,SECONDARY_TOOLS} from '../public/ev-tool-catalog.js';
import {evToolUrl} from '../public/ev-tool-catalog.js';
import * as views from '../public/ev-secondary-views.js';
import * as core from '../public/ev-core.js';

test('every secondary destination is reachable from each EV header with sport context', () => {
  for (const path of ['/ev?sport=nfl','/ev/tracker?sport=mlb','/ev/dashboard?sport=all']) {
    const url=new URL(path,'http://localhost'), $=load(siteHeader(url));
    assert.equal($('[data-ev-more]').length,1,path);
    assert.equal($('.ev-more-groups [data-more-tool]').length,12);
    for(const tool of MORE_TOOLS) {
      const link=$(`[data-more-tool="${tool.key}"]`);
      assert.equal(link.length,1);
      assert.equal(link.attr('href'),`/ev?sport=${url.searchParams.get('sport')}#${tool.key}`);
      assert.equal(link.find('strong').text(),tool.label);
    }
    assert.equal($('.ev-primary-nav [data-more-tool]').length,0,'popup stays outside the scrolling primary nav');
  }
});

test('secondary workspaces keep navigation, controls and escaped search accessible', () => {
  for(const tool of SECONDARY_TOOLS) {
    const $=load(views.secondaryShell(tool.key,'<p>Content</p>',{sport:'NBA',search:'\"<script>',actions:'<button>Add entry</button>'}));
    assert.equal($('h1').text(),tool.label);
    assert.equal($('.tool-heading-actions button').text(),'Add entry');
    assert.equal($('.tool-related [aria-current=page]').attr('data-tool'),tool.key);
    assert.equal($('script').length,0);
    if(tool.key!=='promo') {
      assert.equal($('[data-tool-sport] option[selected]').text(),'NBA');
      assert.equal($('[data-tool-search]').attr('value'),'\"<script>');
    }
  }
  assert.equal(views.secondaryShell('ev-live','Existing live screen'),'Existing live screen');
});

test('EV pages load the shared navigation behavior and final override stylesheet', async () => {
  const template=await fs.readFile(new URL('../public/ev.html',import.meta.url),'utf8');
  const $=load(renderSitePage(template,new URL('http://localhost/ev')));
  assert.equal($('script[src^="/ev-more-menu.js"]').attr('type'),'module');
  assert.equal($('link[rel=stylesheet]').last().attr('href'),'/ev-more-tools.css?v=1');
});

test('promo view balances outcomes and never applies a disabled cash boost to a bonus', async () => {
  const source=await fs.readFile(new URL('../public/ev.js',import.meta.url),'utf8');
  const start=source.indexOf('function renderPromo()');
  const end=source.indexOf('\nfunction ',start+1);
  const context=vm.createContext({...views,...core,promoInput:{kind:'bonus',stake:100,promoOdds:150,hedgeOdds:-130,boost:50},eligibleQuotes:x=>x,quotes:()=>[],esc:views.toolEsc,money:n=>'$'+n.toFixed(2),percent:n=>(n*100).toFixed(1)+'%',action:()=>'',button:()=>''});
  const $=load(vm.runInContext(source.slice(start,end)+'\nrenderPromo()',context));
  assert.equal($('.tool-receipt-value').text(),'$84.78');
  assert.deepEqual($('.tool-receipt dd').map((_,el)=>$(el).text()).get(),['$65.22','$65.22','65.2%']);
  assert.equal($('[data-promo=boost]').prop('disabled'),true);
});

test('More supports hover, pinned click, focus within the panel and Escape', async () => {
  const handlers = new Map(), documentHandlers = new Map(), triggerHandlers = new Map();
  const attributes = new Map(), link = {}, outside = {};
  const trigger = {setAttribute:(key,value)=>attributes.set(key,value), addEventListener:(key,handler)=>triggerHandlers.set(key,handler), focus:()=>{document.activeElement=trigger;}};
  const menu = {open:false,contains:el=>[menu,trigger,link].includes(el), querySelector:selector=>selector==='summary'?trigger:link, querySelectorAll:()=>[], classList:{toggle(){}},addEventListener:(key,handler)=>handlers.set(key,handler)};
  const document = {activeElement:outside,querySelector:()=>menu,addEventListener:(key,handler)=>documentHandlers.set(key,handler)};
  const source=(await fs.readFile(new URL('../public/ev-more-menu.js',import.meta.url),'utf8')).replace(/^import .*?;\s*/, '');
  let scheduled;
  vm.runInNewContext(source,{document,window:{addEventListener(){}},location:{pathname:'/ev',hash:'#promo',search:'?sport=nfl'},URLSearchParams,evToolUrl,matchMedia:()=>({matches:true}),setTimeout:fn=>{scheduled=fn;return 1;},clearTimeout:()=>{scheduled=null;}});
  handlers.get('pointerenter')();
  assert.equal(menu.open,true,'hover opens');
  handlers.get('pointerleave')(); scheduled();
  assert.equal(menu.open,false,'leaving a hover-opened menu closes it');
  handlers.get('pointerenter')();
  triggerHandlers.get('click')({preventDefault(){}});
  handlers.get('pointerleave')();
  assert.equal(menu.open,true,'click pins the hovered menu');
  handlers.get('focusout')({relatedTarget:link});
  assert.equal(menu.open,true,'moving focus to a menu link keeps it available for activation');
  handlers.get('keydown')({key:'Escape',preventDefault(){},stopPropagation(){}});
  assert.equal(menu.open,false);
  assert.equal(attributes.get('aria-expanded'),'false');
  assert.equal(document.activeElement,trigger);
});

test('filtering available fantasy picks preserves the selected ticket and payout', async () => {
  const source=await fs.readFile(new URL('../public/ev.js',import.meta.url),'utf8');
  const start=source.indexOf('function renderSlip()'), end=source.indexOf('\nfunction ',start+1);
  const dfs=[{id:'a',app:'PrizePicks',player:'First player',probability:.6,side:'Over',line:10,market:'Points'},{id:'b',app:'PrizePicks',player:'Second player',probability:.55,side:'Under',line:20,market:'Points'}];
  const context=vm.createContext({...views,...core,state:{dfs,paytables:{PrizePicks:{2:[0,0,3]}}},fantasyApp:'PrizePicks',fantasyIds:['a','b'],fantasyStake:10,dfs:()=>[],isContestPlatform:()=>false,esc:views.toolEsc,fmtLine:String,money:n=>'$'+n.toFixed(2),percent:n=>(n*100).toFixed(1)+'%',signed:n=>(n*100).toFixed(1)+'%',action:()=>'',button:(label,attrs)=>`<button ${attrs}>${label}</button>`});
  const $=load(vm.runInContext(source.slice(start,end)+'\nrenderSlip()',context));
  assert.equal($('.tool-selected-item').length,2);
  assert.equal($('.tool-receipt-value').text(),'$9.90');
  assert.equal($('[data-tool-clear]').text(),'Clear filters');
});

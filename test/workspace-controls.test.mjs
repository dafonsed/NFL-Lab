import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {productDashboardUrl} from '../public/navigation.js';

const source = name => fs.readFile(new URL('../public/' + name, import.meta.url), 'utf8');
const event = (target, key) => ({target,key,preventDefault(){},stopPropagation(){}});

test('product navigation keeps the page sport and supports keyboard selection and dismissal', async () => {
  const handlers = new Map(), toggleHandlers = new Map(), menuHandlers = new Map(), documentHandlers = new Map();
  const attributes = new Map();
  const document = {cookie:'',activeElement:null,querySelector:()=>root,addEventListener:(type,handler)=>documentHandlers.set(type,handler)};
  const toggle = {setAttribute:(name,value)=>attributes.set(name,value),addEventListener:(type,handler)=>toggleHandlers.set(type,handler),focus:()=>{document.activeElement=toggle;}};
  const links = ['trends','models','ev'].map(product=>({product,dataset:{product},focus(){document.activeElement=this;},closest(){return this;}}));
  const menu = {hidden:true,querySelectorAll:()=>links,contains:node=>links.includes(node),addEventListener:(type,handler)=>menuHandlers.set(type,handler)};
  const root = {
    querySelector:selector=>selector==='.site-product-toggle'?toggle:selector==='.site-product-menu'?menu:links.find(link=>selector.includes('"'+link.product+'"')),
    querySelectorAll:()=>links,
    contains:node=>node===toggle||node===menu||links.includes(node),
    closest:()=>({dataset:{siteSport:'nfl'}}),
    addEventListener:(type,handler)=>handlers.set(type,handler),
  };
  const location = {href:'http://localhost/performance'};
  vm.runInNewContext((await source('product-switcher.js')).replace(/^import .*?;\s*/,''),{document,location,URL,productDashboardUrl});
  toggleHandlers.get('keydown')(event(toggle,'ArrowDown'));
  assert.equal(menu.hidden,false);
  assert.equal(document.activeElement,links[0]);
  assert.deepEqual(links.map(link=>link.href),['/trends?sport=nfl','/models?sport=nfl','/ev/dashboard']);
  handlers.get('keydown')(event(links[0],'ArrowUp'));
  assert.equal(document.activeElement,links[2],'up wraps to the last product');
  handlers.get('keydown')(event(links[2],'Home'));
  assert.equal(document.activeElement,links[0]);
  handlers.get('keydown')(event(links[0],'End'));
  assert.equal(document.activeElement,links[2]);
  handlers.get('keydown')(event(links[2],'Escape'));
  assert.equal(menu.hidden,true);
  assert.equal(document.activeElement,toggle);
  assert.equal(attributes.get('aria-expanded'),'false');
  location.href='http://localhost/research?sport=wnba';
  toggleHandlers.get('click')();
  assert.equal(links[1].href,'/models?sport=wnba','read in-place sport changes when opening');
  menuHandlers.get('click')(event(links[1]));
  assert.equal(menu.hidden,true);
  assert.match(document.cookie,/^sl-group=models;/,'the picked workspace group is remembered for the shared Dashboard');
  toggleHandlers.get('click')();
  documentHandlers.get('pointerdown')(event({}));
  assert.equal(menu.hidden,true);
});

test('cross-tab developer settings notify panels when disabled or storage is cleared', async () => {
  const handlers = new Map(), events = [], attributes = new Map();
  const button = {setAttribute:(key,value)=>attributes.set(key,value)};
  const document = {documentElement:{dataset:{}},querySelectorAll:()=>[button],addEventListener(){},dispatchEvent:e=>events.push(e)};
  vm.runInNewContext((await source('site-preferences.js')).replace(/^import .*?;\s*/gm,'').replace(/^await accountReady;\s*/m,''),{
    document,window:{addEventListener:(type,handler)=>handlers.set(type,handler)},localStorage:{getItem:()=> '1'},
    icon:()=>'',CustomEvent:class {constructor(type,{detail}){this.type=type;this.detail=detail;}},
  });
  assert.equal(document.documentElement.dataset.devMode,'true');
  handlers.get('storage')({key:'sports-lab-dev-mode',newValue:'0'});
  assert.equal(attributes.get('aria-pressed'),'false');
  assert.equal(events.at(-1).type,'devmodechange');
  assert.equal(events.at(-1).detail,false);
  handlers.get('storage')({key:'sports-lab-dev-mode',newValue:'1'});
  handlers.get('storage')({key:null,newValue:null});
  assert.equal(document.documentElement.dataset.devMode,'false');
  assert.equal(events.at(-1).detail,false);
});

test('model filter apply preserves unavailable controls and dispatches changes to visible dropdowns', async () => {
  const script = await source('workspace-ui.js');
  const start = script.indexOf('  function applyFilters(draft)');
  const end = script.indexOf('  const trigger = document.createElement',start);
  const option = (value,disabled=false,groupDisabled=false) => ({value,disabled,parentElement:{matches:()=>groupDisabled}});
  const changes = [];
  const select = (value,options,properties={}) => ({value,options,closest(){return this.hidden?{}:null;},dispatchEvent(e){changes.push(e.type);this.displayedValue=this.value;},...properties});
  const controls = {
    sort:select('name',[option('name'),option('score'),option('blocked',true),option('grouped',false,true)]),
    hidden:select('keep',[option('keep'),option('reset')],{hidden:true}),
    disabled:select('keep',[option('keep'),option('reset')],{disabled:true}),
  };
  let summaries = 0;
  const context = vm.createContext({
    fields:Object.keys(controls).map(id=>({id,kind:'select'})),document:{getElementById:id=>controls[id]},
    updateSummary:()=>summaries++,Event,
  });
  vm.runInContext('const available = control => control && !control.disabled && !control.closest("[hidden]");\n'+script.slice(start,end),context);
  context.draft={sort:'score',hidden:'reset',disabled:'reset'};
  vm.runInContext('applyFilters(draft)',context);
  assert.equal(controls.sort.value,'score');
  assert.equal(controls.sort.displayedValue,'score','custom dropdown receives the change event after reset');
  assert.equal(controls.hidden.value,'keep');
  assert.equal(controls.disabled.value,'keep');
  assert.deepEqual(changes,['change']);
  for(const value of ['blocked','grouped','missing']) {
    context.draft={sort:value};vm.runInContext('applyFilters(draft)',context);
    assert.equal(controls.sort.value,'score','saved presets cannot select unavailable options');
  }
  assert.equal(summaries,4);
});

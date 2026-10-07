import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from 'cheerio';
import {siteHeader} from '../lib/site-layout.mjs';
import {initDashboardNavigation} from '../public/dashboard-navigation.js';

// Render the real shell, adapting only browser events, visibility and focus.
function fixture(route='/nfl',mobile=true) {
  const url=new URL(route,'http://localhost');
  const $=load(`<body>${siteHeader(url)}<main id="page-main"><button id="outside-control">Page action</button></main><aside id="already-inert" inert></aside></body>`);
  const cache=new WeakMap(),listeners=new WeakMap(),observers=[];
  const on=(target,type,fn)=>{if(!listeners.has(target))listeners.set(target,new Map());const events=listeners.get(target);if(!events.has(type))events.set(type,[]);events.get(type).push(fn);};
  const emit=(target,type,values={})=>{const event={target,defaultPrevented:false,propagationStopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.propagationStopped=true;},...values};for(const fn of listeners.get(target)?.get(type)||[])fn(event);return event;};
  const media={matches:mobile,addEventListener(type,fn){on(media,type,fn);}};
  const win={location:{href:url.href},innerHeight:900,matchMedia:()=>media,addEventListener(type,fn){on(win,type,fn);},MutationObserver:class {constructor(fn){observers.push(fn);}observe(){}}};
  const doc={defaultView:win,activeElement:null,addEventListener(type,fn){on(doc,type,fn);},querySelector:selector=>wrap($(selector)[0]),querySelectorAll:selector=>$(selector).toArray().map(wrap)};
  function wrap(node) {
    if(!node)return null;
    if(cache.has(node))return cache.get(node);
    const element={
      node,style:{},popoverOpen:false,popoverShows:0,popoverHides:0,
      get dataset(){return Object.fromEntries(Object.entries(node.attribs||{}).filter(([name])=>name.startsWith('data-')).map(([name,value])=>[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),value]));},
      get children(){return $(node).children().toArray().map(wrap);},
      get href(){return new URL($(node).attr('href'),win.location.href).href;},set href(value){$(node).attr('href',value);},
      get inert(){return $(node).is('[inert]');},set inert(value){value?$(node).attr('inert',''):$(node).removeAttr('inert');},
      get hidden(){return $(node).is('[hidden]');},set hidden(value){value?$(node).attr('hidden',''):$(node).removeAttr('hidden');},
      get open(){return $(node).is('[open]');},set open(value){value?$(node).attr('open',''):$(node).removeAttr('open');},
      get isConnected(){return Boolean(node.parent);},
      getAttribute:name=>$(node).attr(name)??null,setAttribute:(name,value)=>$(node).attr(name,String(value)),removeAttribute:name=>$(node).removeAttr(name),hasAttribute:name=>$(node).attr(name)!==undefined,
      matches:selector=>$(node).is(selector),closest:selector=>wrap($(node).closest(selector)[0]),
      querySelector:selector=>wrap($(node).find(selector)[0]),querySelectorAll:selector=>$(node).find(selector).toArray().map(wrap),
      contains(other){for(let item=other?.node;item;item=item.parent)if(item===node)return true;return false;},
      getClientRects(){const el=$(node);if(el.closest('[hidden],[inert],.site-sports,[data-dev-only]').length)return [];if(el.closest('details:not([open])').length&&!el.is('summary')&&!el.closest('summary').length)return [];return [{}];},
      getBoundingClientRect(){return $(node).is('#dashboard-sidebar')?{right:224}:$(node).is('summary')?{top:360}:{height:480};},
      showPopover(){assert.equal(element.popoverOpen,false,'popover is opened once');element.popoverOpen=true;element.popoverShows++;},
      hidePopover(){assert.equal(element.popoverOpen,true,'only an open popover is hidden');element.popoverOpen=false;element.popoverHides++;},
      addEventListener(type,fn){on(element,type,fn);},focus(){doc.activeElement=element;emit(doc,'focusin',{target:element});},
      classList:{toggle:(name,force)=>$(node).toggleClass(name,force),contains:name=>$(node).hasClass(name)},
    };
    cache.set(node,element);return element;
  }
  doc.body=doc.querySelector('body');
  const get=selector=>doc.querySelector(selector),toggle=get('[data-sidebar-toggle]');
  toggle.focus();
  const controller=initDashboardNavigation(doc);
  return {$,doc,win,media,get,toggle,controller,emit,resize(matches){media.matches=matches;emit(media,'change');},appendOutside(){ $('body').append('<section id="late-panel"></section>');for(const fn of observers)fn();return get('#late-panel'); }};
}

test('mobile drawer isolates the page, restores prior inert state and returns focus on dismissal',()=>{
  const f=fixture(),sidebar=f.get('#dashboard-sidebar'),main=f.get('#page-main'),backdrop=f.get('.dashboard-sidebar-backdrop');
  assert.equal(sidebar.inert,true);
  assert.equal(sidebar.getAttribute('aria-hidden'),'true');
  assert.equal(initDashboardNavigation(f.doc),f.controller,'reinitialization does not register a second toggle');
  f.emit(f.toggle,'click');
  assert.equal(f.doc.body.classList.contains('sidebar-open'),true);
  assert.equal(f.toggle.getAttribute('aria-expanded'),'true');
  assert.equal(sidebar.inert,false);assert.equal(sidebar.getAttribute('role'),'dialog');assert.equal(sidebar.getAttribute('aria-modal'),'true');
  assert.equal(backdrop.hidden,false);assert.equal(main.inert,true);
  assert.equal(f.doc.activeElement,f.get('[data-sidebar-close]'));
  const late=f.appendOutside();assert.equal(late.inert,true,'panels added while open cannot steal interaction');
  assert.equal(f.emit(f.doc,'keydown',{key:'Escape'}).defaultPrevented,true);
  assert.equal(sidebar.inert,true);assert.equal(sidebar.getAttribute('role'),null);assert.equal(sidebar.getAttribute('aria-modal'),null);
  assert.equal(main.inert,false);assert.equal(late.inert,false);assert.equal(f.get('#already-inert').inert,true);
  assert.equal(backdrop.hidden,true);assert.equal(f.doc.activeElement,f.toggle);
  for(const target of [backdrop,f.get('[data-sidebar-close]')]) {
    f.emit(f.toggle,'click');f.emit(target,'click');
    assert.equal(f.toggle.getAttribute('aria-expanded'),'false');assert.equal(f.doc.activeElement,f.toggle);
  }
});

test('drawer traps keyboard focus and restores desktop navigation when the viewport widens',()=>{
  const f=fixture(),sidebar=f.get('#dashboard-sidebar'),first=f.get('#dashboard-sidebar a[href]'),last=f.get('#dashboard-sidebar [data-dev-toggle]');
  f.controller.open();
  first.focus();assert.equal(f.emit(f.doc,'keydown',{key:'Tab',shiftKey:true}).defaultPrevented,true);assert.equal(f.doc.activeElement,last);
  last.focus();assert.equal(f.emit(f.doc,'keydown',{key:'Tab',shiftKey:false}).defaultPrevented,true);assert.equal(f.doc.activeElement,first);
  f.get('#outside-control').focus();assert.equal(f.doc.activeElement,first,'focus cannot escape into the inert page');
  f.resize(false);
  assert.equal(sidebar.inert,false);assert.equal(sidebar.getAttribute('aria-hidden'),null);assert.equal(sidebar.getAttribute('role'),null);
  assert.equal(f.get('#page-main').inert,false);assert.equal(f.get('.dashboard-sidebar-backdrop').hidden,true);
  f.controller.open();assert.equal(f.toggle.getAttribute('aria-expanded'),'false','desktop does not become a modal drawer');
  first.focus();f.resize(true);assert.equal(sidebar.inert,true);assert.equal(f.doc.activeElement,f.toggle,'hidden desktop navigation does not retain keyboard focus');
});

test('EV hash changes select the exact tool, and every +EV link is one address with no sport',()=>{
  const f=fixture('/ev#ev-live',false);
  const selected=()=>f.$('.ev-primary-nav [aria-current=page],.dashboard-tool-nav [aria-current=page]');
  assert.equal(selected().length,1);assert.equal(selected().attr('data-more-tool'),'ev-live');
  f.$('[data-ev-nav="Arbitrage"]').attr('aria-current','page');
  f.win.location.href='http://localhost/ev#arb-live';f.emit(f.doc,'ev-tool-change');
  assert.equal(selected().length,1);assert.equal(selected().attr('data-more-tool'),'arb-live');
  for(const [key,path] of [['ev','/ev/dashboard'],['bets','/ev/tracker']]) assert.equal(f.get(`[data-dashboard-section="${key}"]`).href,`http://localhost${path}`);
  for(const link of f.$('[data-ev-nav],[data-more-tool]').toArray()) {
    const url=new URL(f.$(link).attr('href'),'http://localhost');
    assert.equal(url.pathname,'/ev');assert.equal(url.search,'','no sport in +EV addresses');
  }
  f.win.location.href='http://localhost/ev';f.emit(f.win,'hashchange');
  assert.equal(selected().length,1);assert.equal(selected().attr('data-ev-nav'),'Positive EV','the bare address opens Positive EV');
  const tracker=fixture('/ev/tracker#fantasy',false);
  assert.equal(tracker.$('.ev-primary-nav [aria-current],.dashboard-tool-nav [aria-current]').length,0,'tracker hashes do not select EV workspaces');
});

test('drawer releases the page when navigating or opening appearance settings',()=>{
  const f=fixture('/ev#odds'),sidebar=f.get('#dashboard-sidebar');
  f.controller.open();f.emit(sidebar,'click',{target:f.get('[data-more-tool=promo]')});
  assert.equal(f.doc.body.classList.contains('sidebar-open'),false);assert.equal(f.get('#page-main').inert,false);
  f.toggle.focus();f.controller.open();f.win.location.href='http://localhost/ev#promo';f.emit(f.win,'hashchange');
  assert.equal(f.get('.dashboard-sidebar-backdrop').hidden,true);assert.equal(f.doc.activeElement,f.toggle);
  f.controller.open();f.emit(sidebar,'click',{target:f.get('[data-display-settings]')});
  assert.equal(f.toggle.getAttribute('aria-expanded'),'false');assert.equal(f.get('#page-main').inert,false);
  assert.equal(f.doc.activeElement,f.toggle,'appearance dialog can restore focus to the visible mobile launcher');
});

test('every EV tool is listed in the sidebar under its group, with no flyout to open',()=>{
  const f=fixture('/ev#promo',false);
  assert.equal(f.$('.dashboard-more-tools,#dashboard-tool-groups,[data-more-close]').length,0,'no More tools popup');
  const sections=f.$('.dashboard-tool-section');
  assert.ok(sections.length>=3,'tool groups render as sidebar sections');
  for(const section of sections.toArray()) {
    assert.ok(f.$(section).find('h2.dashboard-nav-label').text().trim().length>0,'each group keeps its label');
    assert.ok(f.$(section).find('.dashboard-tool-nav a[data-more-tool]').length>0,'each group lists its tools');
  }
  assert.equal(f.$('.dashboard-tool-nav [aria-current=page]').attr('data-more-tool'),'promo','the current tool is marked in place');
});

test('tool navigation and route changes close the drawer and mark the new tool',()=>{
  for(const eventType of ['click','hashchange','popstate']) {
    const f=fixture('/ev#odds');
    f.controller.open();
    f.win.location.href='http://localhost/ev#promo';
    if(eventType==='click')f.emit(f.get('#dashboard-sidebar'),'click',{target:f.get('[data-more-tool=promo]')});
    else f.emit(f.win,eventType);
    assert.equal(f.toggle.getAttribute('aria-expanded'),'false',eventType);assert.equal(f.get('#page-main').inert,false,eventType);
    if(eventType!=='click')assert.equal(f.get('[data-more-tool=promo]').getAttribute('aria-current'),'page');
  }
});

test('breakpoint changes release the drawer',()=>{
  const f=fixture('/ev?sport=nba',false);
  f.resize(true);f.toggle.focus();f.controller.open();f.resize(false);
  assert.equal(f.toggle.getAttribute('aria-expanded'),'false');assert.equal(f.get('#page-main').inert,false);
  assert.equal(f.get('#dashboard-sidebar').inert,false);
});

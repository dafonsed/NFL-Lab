import {SPORTS,productDashboardUrl,betTrackerUrl} from './navigation.js';
import {evToolUrl} from './ev-tool-catalog.js';

const initialized=new WeakMap();

export function initDashboardNavigation(doc=document) {
  const sidebar=doc.querySelector('#dashboard-sidebar');
  if(!sidebar)return null;
  if(initialized.has(sidebar))return initialized.get(sidebar);
  const win=doc.defaultView||window,body=doc.body;
  const toggle=doc.querySelector('[data-sidebar-toggle]'),closeButton=sidebar.querySelector('[data-sidebar-close]');
  const backdrop=doc.querySelector('.dashboard-sidebar-backdrop');
  const mobile=win.matchMedia('(max-width: 800px)');
  const more=sidebar.querySelector('.dashboard-more-tools');
  const moreTrigger=more?.querySelector('summary'),groups=more?.querySelector('#dashboard-tool-groups');
  const inertBefore=new Map();
  let opened=false,returnFocus=null,toolsOpen=false,lastContext='',drawerHistory=false;
  if(groups)groups.popover='manual';
  const positionTools=()=>{
    if(!groups||!moreTrigger)return;
    if(mobile.matches){groups.style.left='12px';groups.style.right='12px';groups.style.top='76px';}
    else {
      groups.style.left=sidebar.getBoundingClientRect().right+12+'px';groups.style.right='auto';
      const height=groups.getBoundingClientRect().height,anchor=moreTrigger.getBoundingClientRect();
      groups.style.top=Math.max(16,Math.min(anchor.top-40,win.innerHeight-height-16))+'px';
    }
    groups.style.bottom='auto';
  };
  const closeTools=(restoreFocus=false)=>{
    if(!more)return;
    const wasOpen=toolsOpen||more.open;
    more.open=false;moreTrigger?.setAttribute('aria-expanded','false');
    if(toolsOpen)groups?.hidePopover?.();
    toolsOpen=false;
    if(wasOpen&&restoreFocus&&moreTrigger?.isConnected)moreTrigger.focus({preventScroll:true});
  };
  const openTools=(focusFirst=false)=>{
    if(!more||!groups||sidebar.inert)return;
    more.open=true;moreTrigger?.setAttribute('aria-expanded','true');
    if(!toolsOpen){groups.showPopover?.();toolsOpen=true;}
    positionTools();
    if(focusFirst)groups.querySelector('a[href]')?.focus({preventScroll:true});
  };
  const focusable=()=>[...sidebar.querySelectorAll('a[href],button:not([disabled]),summary,input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(node=>!node.closest('[hidden],[inert]')&&node.getClientRects().length);
  const lockOutside=()=>{
    for(const node of body.children) {
      if(node===sidebar||node===backdrop||node.matches('script,style,link'))continue;
      if(!inertBefore.has(node))inertBefore.set(node,node.inert);
      node.inert=true;
    }
  };
  const unlockOutside=()=>{for(const [node,inert] of inertBefore)node.inert=inert;inertBefore.clear();};
  const reflect=()=>{
    body.classList.toggle('sidebar-open',opened);
    toggle?.setAttribute('aria-expanded',String(opened));
    if(backdrop)backdrop.hidden=!opened;
    sidebar.inert=mobile.matches&&!opened;
    if(sidebar.inert)sidebar.setAttribute('aria-hidden','true');else sidebar.removeAttribute('aria-hidden');
    if(opened){sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');}
    else {sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');}
  };
  const close=(restoreFocus=true,consumeHistory=true)=>{
    const wasOpen=opened;
    closeTools();
    opened=false;unlockOutside();reflect();
    if(wasOpen&&restoreFocus&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});
    returnFocus=null;
    if(drawerHistory){drawerHistory=false;if(win.history?.state?.workspaceNavigation){if(consumeHistory)win.history.back();else{const next={...win.history.state};delete next.workspaceNavigation;win.history.replaceState(next,'');}}}
  };
  const open=()=>{
    if(!mobile.matches||opened)return;
    // Touch browsers do not consistently focus a clicked button. Return to the
    // drawer's visible launcher even when document.activeElement is still body.
    returnFocus=toggle||doc.activeElement;
    opened=true;reflect();lockOutside();
    if(win.history?.pushState){win.history.pushState({...win.history.state,workspaceNavigation:true},'',win.location.href);drawerHistory=true;}
    (closeButton||focusable()[0]||sidebar).focus({preventScroll:true});
  };
  const sync=()=>{
    const url=new URL(win.location.href),path=url.pathname.replace(/\/$/,'');
    const requested=url.searchParams.get('sport');
    const sport=requested!==null?(Object.hasOwn(SPORTS,requested)?requested:null):(Object.hasOwn(SPORTS,path.split('/')[1])?path.split('/')[1]:['/ev','/ev/tracker','/ev/dashboard','/bets'].includes(path)?null:sidebar.dataset.siteSport||null);
    const destinations={home:'/research?sport='+(sport||'mlb'),models:productDashboardUrl('models',sport),trends:productDashboardUrl('trends',sport),ev:productDashboardUrl('ev',sport),bets:betTrackerUrl(sport)};
    for(const link of sidebar.querySelectorAll('[data-dashboard-section]'))link.href=destinations[link.dataset.dashboardSection];
    for(const link of sidebar.querySelectorAll('.site-product-menu [data-product]'))link.href=productDashboardUrl(link.dataset.product,sport);
    const key=path==='/ev'?(url.hash.slice(1)||'ev-pre'):'';
    let moreSelected=false;
    for(const link of sidebar.querySelectorAll('[data-ev-nav],[data-more-tool]')) {
      const tool=link.dataset.moreTool||new URL(link.href,url).hash.slice(1);
      link.href=evToolUrl(tool,sport);
      const selected=Boolean(key)&&tool===key;
      if(selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
      if(link.hasAttribute('data-more-tool')&&selected)moreSelected=true;
    }
    if(more){more.classList.toggle('has-current-tool',moreSelected);moreTrigger?.classList.toggle('has-current-tool',moreSelected);}
    // EV tools live behind one path: a sport pill switches the sport but stays on the active tool,
    // and follows in-place sport changes. Pills may have been moved into the page heading.
    if(key){
      const codes=Object.keys(SPORTS);
      doc.querySelectorAll('.site-sports a').forEach((link,index)=>{
        const code=link.dataset.sport||codes[index];
        if(!code)return;
        link.href=evToolUrl(key,code);
        if(code===sport)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
      });
    }
    lastContext=url.pathname+url.search+url.hash;
  };
  toggle?.addEventListener('click',()=>opened?close():open());
  closeButton?.addEventListener('click',()=>close());
  backdrop?.addEventListener('click',()=>close());
  sidebar.addEventListener('click',event=>{
    if(event.target.closest('a[href]'))close(false,false);
    // Let the appearance dialog open after the drawer releases the page.
    else if(event.target.closest('[data-display-settings]'))close(true,false);
  });
  doc.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&toolsOpen){event.preventDefault();event.stopPropagation?.();closeTools(true);return;}
    if(!opened)return;
    if(event.key==='Escape'){event.preventDefault();close();return;}
    if(event.key!=='Tab')return;
    const items=focusable(),first=items[0],last=items.at(-1);
    if(!first){event.preventDefault();sidebar.focus();return;}
    if(event.shiftKey&&(doc.activeElement===first||!sidebar.contains(doc.activeElement))){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(doc.activeElement===last||!sidebar.contains(doc.activeElement))){event.preventDefault();first.focus();}
  });
  doc.addEventListener('focusin',event=>{if(opened&&!sidebar.contains(event.target))(focusable()[0]||sidebar).focus({preventScroll:true});});
  moreTrigger?.addEventListener('click',event=>{event.preventDefault();toolsOpen?closeTools(true):openTools();});
  moreTrigger?.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();openTools(true);}});
  more?.addEventListener('toggle',()=>more.open?openTools():closeTools());
  groups?.addEventListener('click',event=>{if(event.target.closest('[data-more-close]'))closeTools(true);});
  doc.addEventListener('pointerdown',event=>{if(toolsOpen&&!more.contains(event.target))closeTools();});
  mobile.addEventListener('change',()=>{
    const hadSidebarFocus=sidebar.contains(doc.activeElement);
    close(false);
    if(mobile.matches&&hadSidebarFocus)toggle?.focus({preventScroll:true});
  });
  win.addEventListener('hashchange',()=>{close();sync();});
  win.addEventListener('popstate',()=>{close(true,false);sync();});
  win.addEventListener('resize',()=>closeTools(true));
  doc.addEventListener('ev-tool-change',()=>{
    const url=new URL(win.location.href);
    if(url.pathname+url.search+url.hash!==lastContext)closeTools();
    sync();
  });
  doc.addEventListener('change',event=>{if(event.target.matches('#sport-filter'))sync();});
  new win.MutationObserver(()=>{if(opened)lockOutside();}).observe(body,{childList:true});
  const controller={open,close,sync,openTools,closeTools};
  initialized.set(sidebar,controller);
  closeTools();reflect();sync();
  return controller;
}

if(typeof document!=='undefined')initDashboardNavigation(document);

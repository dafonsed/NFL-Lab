// Shared mobile behavior. No market values or account records are changed here.
const root=document.documentElement;
const viewport=()=>root.style.setProperty('--mobile-viewport-height',`${Math.round(window.visualViewport?.height||window.innerHeight)}px`);
viewport();window.visualViewport?.addEventListener('resize',viewport);window.addEventListener('resize',viewport);
const marketLoading=document.querySelector('#ev-loading');
if(marketLoading){
 const message=marketLoading.querySelector('[data-loading-message]'),retry=marketLoading.querySelector('[data-loading-retry]');
 const showDelay=(text)=>{if(document.body.hasAttribute('data-ev-screen'))return;message.textContent=text;retry.hidden=false;};
 retry.addEventListener('click',()=>location.reload());
 const delay=setTimeout(()=>showDelay('The workspace is taking longer to load. Check your connection, or reload to try again.'),12000);
 document.addEventListener('ev-tool-change',()=>clearTimeout(delay),{once:true});
 document.addEventListener('accountsyncchange',event=>{if(event.detail?.locked&&event.detail?.userId){clearTimeout(delay);showDelay('Your account session changed. Sign in again, or reload to try again.');}});
}
const enhancedCharts=new WeakSet();
function enhanceCharts(container=document){
 for(const chart of container.querySelectorAll('.pr-chart-scroll')){
  if(enhancedCharts.has(chart)||chart.closest('.mobile-chart-dialog')||!chart.querySelector('svg [data-result]'))continue;
  enhancedCharts.add(chart);
  const chartSvg=chart.querySelector('svg');
  if(chartSvg.getAttribute('role')==='img')continue;
  const tools=document.createElement('div');tools.className='mobile-chart-tools';
  tools.innerHTML='<span>Tap a bar for game details. Scroll for more games.</span><button type="button" aria-haspopup="dialog">Expand chart</button>';
  const reading=document.createElement('p');reading.className='mobile-chart-reading';reading.setAttribute('role','status');
  chart.before(tools);chart.after(reading);
  const describe=event=>{const bar=event.target.closest('[data-result]');if(bar&&chart.contains(bar))reading.textContent=bar.querySelector('title')?.textContent||'';};
  chart.addEventListener('click',describe);chart.addEventListener('focusin',describe);chart.addEventListener('pointerover',event=>{if(event.pointerType==='mouse')describe(event);});
  for(const bar of chart.querySelectorAll('[data-result]')){bar.setAttribute('tabindex','0');bar.setAttribute('role','img');bar.setAttribute('aria-label',bar.querySelector('title')?.textContent||`Result ${bar.dataset.result}`);}
  tools.querySelector('button').addEventListener('click',()=>{
   const anchor=document.createComment('chart origin');chart.before(anchor);
   const dialog=document.createElement('dialog');dialog.className='mobile-chart-dialog';dialog.setAttribute('aria-label','Expanded game history');
   dialog.innerHTML='<header><h2>Game history</h2><button type="button" aria-label="Close expanded chart">Close</button></header>';
   // Comparison edits belong to the parent research view. Its delegated drag
   // handler cannot follow a chart moved into this separate modal.
   const comparison=chart.querySelector('[data-comparison-line]');
   const comparisonAttributes=comparison?new Map(['role','tabindex','aria-label','aria-description','aria-orientation','aria-valuemin','aria-valuemax','aria-valuenow','aria-valuetext'].map(name=>[name,comparison.getAttribute(name)])):null;
   if(comparison){
    const value=comparison.getAttribute('aria-valuenow');
    for(const name of comparisonAttributes.keys())comparison.removeAttribute(name);
    comparison.setAttribute('role','img');comparison.setAttribute('aria-label',`Comparison line at ${value}. Adjust in player research.`);
    const note=document.createElement('p');note.className='mobile-chart-note';note.textContent=`Comparison line: ${value}. Close expanded chart to adjust it.`;dialog.append(note);
   }
   dialog.append(chart,reading);document.body.append(dialog);dialog.querySelector('button').addEventListener('click',()=>dialog.close());
   dialog.addEventListener('close',()=>{if(comparisonAttributes)for(const [name,value]of comparisonAttributes){if(value===null)comparison.removeAttribute(name);else comparison.setAttribute(name,value);}if(anchor.isConnected){anchor.replaceWith(chart);chart.after(reading);}dialog.remove();tools.querySelector('button').focus({preventScroll:true});},{once:true});dialog.showModal();
  });
 }
}
let pending=false;
const observer=new MutationObserver(records=>{
 if(pending||!records.some(record=>record.addedNodes.length))return;
 pending=true;requestAnimationFrame(()=>{pending=false;enhanceCharts();});
});
observer.observe(document.body,{subtree:true,childList:true});enhanceCharts();

// Back dismisses a phone dialog before leaving its current route. EV's filter
// sheet manages its own history and is intentionally excluded from this boundary.
const dialogState=new Map();
let historySequence=0;
function registerDialogs(){
 for(const dialog of document.querySelectorAll('dialog:not(.ev-mobile-filter-dialog)')){
  if(dialogState.has(dialog))continue;
  const state={token:null};dialogState.set(dialog,state);
  const reflect=()=>{
   if(dialog.open&&!state.token&&matchMedia('(max-width:800px)').matches){state.token=`dialog-${++historySequence}`;history.pushState({...history.state,mobileDialog:state.token},'',location.href);}
   else if(!dialog.open&&state.token){const token=state.token;state.token=null;if(history.state?.mobileDialog===token)history.back();}
  };
  state.observer=new MutationObserver(reflect);state.observer.observe(dialog,{attributes:true,attributeFilter:['open']});reflect();
 }
}
// Observe only newly added top-level dialogs, avoiding work on every price tick.
new MutationObserver(records=>{for(const [dialog,state]of dialogState)if(!dialog.isConnected){state.observer.disconnect();dialogState.delete(dialog);}if(records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1&&(node.matches('dialog')||node.querySelector('dialog')))))registerDialogs();}).observe(document.body,{childList:true});registerDialogs();
window.addEventListener('popstate',()=>{for(const [dialog,state]of dialogState)if(state.token&&history.state?.mobileDialog!==state.token){state.token=null;if(dialog.open)dialog.close();}});

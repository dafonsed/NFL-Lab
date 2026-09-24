import {icon} from './ui-icons.js';
import {escape as esc} from './research-data.js';
import {defaultTrendFilters,trendFilterCount} from './trends-data.js';
import {teamMark} from './sports-identity.js';
import {enhanceTrendControls} from './trends-controls.js';

export function setupTrendFilters({getState,apply,preview,sport}) {
  const bar=document.querySelector('.td-filters'),trigger=document.createElement('button');
  trigger.type='button';trigger.className='filter-open';trigger.setAttribute('aria-haspopup','dialog');
  trigger.innerHTML=icon('filter')+'<span>Filters</span><b class="filter-count" hidden></b>';bar.append(trigger);bar.classList.add('filters-enhanced');
  document.querySelector('#td-posted').hidden=true;
  const summary=document.createElement('div');summary.className='advanced-filter-summary';summary.hidden=true;
  (document.querySelector('.desk-toolbar')||bar).after(summary);
  const count=()=>{const s=getState();return trendFilterCount(s.filters)+(s.posted?1:0)+(s.savedOnly?1:0)+(s.sort!=='rate'?1:0);};
  const update=()=>{
    const n=count(),badge=trigger.querySelector('b');badge.hidden=!n;badge.textContent=n;trigger.classList.toggle('has-filters',n>0);summary.hidden=!n;
    const f=getState().filters;
    const labels=[f.minRate>0?`${f.minRate}%+ hit rate`:null,f.minGames>0?`${f.minGames}+ games`:null,f.sample!=='10'?({all:'All games',h2h:'Head to head'}[f.sample]||`Last ${f.sample}`):null,f.venue!=='all'?`${f.venue==='home'?'Home':'Away'} games`:null,...f.teams,...f.positions,f.book||null,f.minLine!==''||f.maxLine!==''?'Line range':null,f.minOdds!==''||f.maxOdds!==''?'Odds range':null,f.hideUnavailable?'Hide unavailable':null,f.startersOnly?'Confirmed starters':null,getState().posted?'Current lines':null,getState().savedOnly?'Saved players':null,getState().sort!=='rate'?'Custom sort':null].filter(Boolean);
    summary.innerHTML=labels.map(label=>`<span>${esc(label)}</span>`).join('')+'<button type="button" data-reset-advanced>Clear all '+icon('close')+'</button>';
  };
  summary.addEventListener('click',e=>{if(e.target.closest('button'))apply({filters:defaultTrendFilters(),posted:false,savedOnly:false,sort:'rate'});});
  trigger.addEventListener('click',()=>{
    const state=getState(),draft={filters:structuredClone(state.filters),posted:state.posted,savedOnly:state.savedOnly,sort:state.sort,side:state.side};
    const profiles=state.profiles,teams=[...new Set(profiles.map(p=>p.team).filter(Boolean))].sort(),positions=[...new Set(profiles.map(p=>p.position).filter(Boolean))].sort();
    const books=[...new Map(profiles.filter(p=>p.prop).map(p=>[p.prop.bookKey||p.prop.bookmaker,p.prop.bookmaker||p.prop.bookKey])).entries()].filter(([key])=>key);
    const dialog=document.createElement('dialog');dialog.className='trend-filter-dialog';dialog.setAttribute('aria-labelledby','trend-filter-title');
    const segmented=(key,choices)=>`<div class="filter-segments" role="group" aria-label="${key==='sample'?'Game sample':key==='venue'?'Game venue':'Comparison side'}">${choices.map(([value,label])=>`<button type="button" data-filter-key="${key}" data-filter-value="${value}">${label}</button>`).join('')}</div>`;
    const range=(key,label,placeholder)=>`<label><span>${label}</span><input type="number" step="any" data-filter-number="${key}" aria-label="${label}" placeholder="${placeholder}"></label>`;
    const toggle=(key,label)=>`<label class="filter-toggle"><span>${label}</span><input type="checkbox" data-filter-toggle="${key}"><i aria-hidden="true"></i></label>`;
    dialog.innerHTML=`<header class="filter-dialog-header"><div class="filter-title-icon">${icon('filter')}</div><h2 id="trend-filter-title">Filters</h2><button type="button" class="icon-button" data-close aria-label="Close filters">${icon('close')}</button></header>
      <div class="filter-dialog-body"><nav class="filter-category-nav" role="tablist" aria-label="Filter categories" aria-orientation="vertical">${[['performance','research','Performance'],['players','players','Players & teams'],['lines','filter','Lines & odds']].map(([key,symbol,label],i)=>`<button type="button" role="tab" id="filter-tab-${key}" data-filter-category="${key}" aria-controls="filter-panel-${key}" aria-selected="${i===0}" tabindex="${i===0?0:-1}">${icon(symbol)}<span>${label}</span><b data-category-count="${key}"></b></button>`).join('')}</nav><div class="filter-editors">
        <section class="filter-section" id="filter-panel-performance" role="tabpanel" aria-labelledby="filter-tab-performance"><div class="filter-panel-title"><h3>Performance</h3><span>${esc(state.profiles[0]?.label||'Player history')}</span></div>
        <div class="filter-quick"><button type="button" data-quick-filter="rate">${icon('trends')} 80%+ hit rate</button><button type="button" data-quick-filter="sample">${icon('research')} Full L10 sample</button><button type="button" data-reset-filter>Reset all</button></div>
        <div class="filter-field"><label>Game sample</label>${segmented('sample',[['5','L5'],['10','L10'],['20','L20'],['h2h','H2H'],['all','All']])}</div>
          <div class="filter-columns"><div class="filter-field"><label>Venue</label>${segmented('venue',[['all','All'],['home','Home'],['away','Away']])}</div><div class="filter-field"><label>Side</label>${segmented('side',[['over','Over'],['under','Under']])}</div></div>
          <div class="filter-rate-label"><label for="filter-min-rate">Minimum hit rate</label><output for="filter-min-rate" id="filter-rate-value"></output></div><input id="filter-min-rate" type="range" min="0" max="100" step="5"><div class="filter-range-labels"><span>Any</span><span>50%</span><span>100%</span></div>
          <div class="filter-columns"><label class="filter-field">Minimum games<input type="number" min="0" max="1000" step="1" data-filter-number="minGames" aria-label="Minimum games"></label><label class="filter-field">Sort by<select data-filter-sort aria-label="Sort players"><option value="rate">Highest hit rate</option><option value="average">Highest average</option><option value="change">Biggest form change</option><option value="name">Player name</option></select></label></div>
        </section>
        <section class="filter-section" id="filter-panel-players" role="tabpanel" aria-labelledby="filter-tab-players" hidden><div class="filter-panel-title"><h3>Players & teams</h3><span>${teams.length} teams</span></div><details class="filter-team-list" open><summary><span>Teams</span><b data-team-count>All teams</b>${icon('chevron')}</summary><label class="filter-team-search">${icon('search')}<input type="search" placeholder="Search teams" aria-label="Search filter teams"></label><div class="filter-team-grid">${teams.map(team=>`<button type="button" data-filter-team="${esc(team)}">${teamMark({sport,team})}<span>${esc(team)}</span>${icon('check')}</button>`).join('')}</div></details>
          ${positions.length?`<div class="filter-field"><label>Positions</label><div class="filter-position-list">${positions.map(position=>`<button type="button" data-filter-position="${esc(position)}">${esc(position)}</button>`).join('')}</div></div>`:''}
          <div class="filter-toggles">${toggle('savedOnly','Saved players only')}${toggle('hideUnavailable','Hide unavailable players')}${sport==='mlb'?toggle('startersOnly','Confirmed starters only'):''}</div>
        </section>
        <section class="filter-section" id="filter-panel-lines" role="tabpanel" aria-labelledby="filter-tab-lines" hidden><h3>Lines & odds</h3><label class="filter-field">Sportsbook<select data-filter-book aria-label="Sportsbook"><option value="">Any sportsbook</option>${books.map(([key,label])=>`<option value="${esc(key)}">${esc(label)}</option>`).join('')}</select></label>
          <div class="filter-range-pair"><span>Line</span><div>${range('minLine','Minimum line','No minimum')}<i>–</i>${range('maxLine','Maximum line','No maximum')}</div></div>
          <div class="filter-range-pair"><span>American odds</span><div>${range('minOdds','Minimum odds','e.g. -200')}<i>–</i>${range('maxOdds','Maximum odds','e.g. +200')}</div></div>
          ${toggle('posted','Current posted lines only')}
        </section><p class="filter-error" role="alert" hidden></p>
      </div></div><footer class="filter-dialog-footer"><span class="filter-footer-count"><strong data-results></strong> matching players</span><button type="button" data-reset-filter>Reset</button><button type="button" class="primary" data-apply>Apply filters ${icon('arrow')}</button></footer>`;
    document.body.append(dialog);
    const selectCategory=(key,focus=false)=>{
      for(const tab of dialog.querySelectorAll('[data-filter-category]')){const active=tab.dataset.filterCategory===key;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;dialog.querySelector('#'+tab.getAttribute('aria-controls')).hidden=!active;if(active&&focus)tab.focus();}
      dialog.querySelector('.filter-editors').scrollTop=0;
    };
    dialog.querySelector('.filter-category-nav').addEventListener('keydown',event=>{
      if(!['ArrowDown','ArrowUp','ArrowRight','ArrowLeft','Home','End'].includes(event.key))return;
      event.preventDefault();const tabs=[...dialog.querySelectorAll('[data-filter-category]')],index=tabs.indexOf(event.target);
      const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(['ArrowDown','ArrowRight'].includes(event.key)?1:-1)+tabs.length)%tabs.length;
      selectCategory(tabs[next].dataset.filterCategory,true);
    });
    const sync=()=>{
      const f=draft.filters;
      for(const b of dialog.querySelectorAll('[data-filter-key]'))b.setAttribute('aria-pressed',String((b.dataset.filterKey==='side'?draft.side:f[b.dataset.filterKey])===b.dataset.filterValue));
      for(const input of dialog.querySelectorAll('[data-filter-number]'))if(document.activeElement!==input)input.value=f[input.dataset.filterNumber];
      for(const input of dialog.querySelectorAll('[data-filter-toggle]'))input.checked=['posted','savedOnly'].includes(input.dataset.filterToggle)?draft[input.dataset.filterToggle]:f[input.dataset.filterToggle];
      for(const b of dialog.querySelectorAll('[data-filter-team]'))b.setAttribute('aria-pressed',String(f.teams.includes(b.dataset.filterTeam)));
      for(const b of dialog.querySelectorAll('[data-filter-position]'))b.setAttribute('aria-pressed',String(f.positions.includes(b.dataset.filterPosition)));
      dialog.querySelector('[data-team-count]').textContent=f.teams.length?`${f.teams.length} selected`:'All teams';
      const slider=dialog.querySelector('#filter-min-rate');slider.value=f.minRate;slider.style.setProperty('--range-progress',f.minRate+'%');dialog.querySelector('#filter-rate-value').textContent=f.minRate?f.minRate+'%':'Any';
      for(const [selector,value] of [['[data-filter-sort]',draft.sort],['[data-filter-book]',f.book]]){const select=dialog.querySelector(selector);if(select.value!==value){select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));}}
      const invalid=[['minLine','maxLine'],['minOdds','maxOdds']].some(([a,b])=>f[a]!==''&&f[b]!==''&&Number(f[a])>Number(f[b]))||Number(f.minGames)<0||!Number.isInteger(Number(f.minGames));
      const error=dialog.querySelector('.filter-error');error.hidden=!invalid;error.textContent='Check your ranges. Minimums must not exceed maximums, and games must be a whole number.';
      dialog.querySelector('[data-apply]').disabled=invalid;dialog.querySelector('[data-results]').textContent=preview(draft).length;
      const defaults=defaultTrendFilters(),counts={performance:['sample','venue','minRate','minGames'].filter(k=>f[k]!==defaults[k]).length+(draft.sort!=='rate'?1:0),players:f.teams.length+f.positions.length+Number(f.hideUnavailable)+Number(f.startersOnly)+Number(draft.savedOnly),lines:['book','minLine','maxLine','minOdds','maxOdds'].filter(k=>f[k]!==defaults[k]).length+Number(draft.posted)};
      for(const badge of dialog.querySelectorAll('[data-category-count]'))badge.textContent=counts[badge.dataset.categoryCount]||'';
    };
    dialog.addEventListener('click',e=>{
      const b=e.target.closest('button');if(b){
        if(b.hasAttribute('data-close'))dialog.close();
        if(b.dataset.filterCategory)selectCategory(b.dataset.filterCategory);
        if(b.hasAttribute('data-apply')){apply(draft);dialog.close();return;}
        if(b.hasAttribute('data-reset-filter'))Object.assign(draft,{filters:defaultTrendFilters(),posted:false,savedOnly:false,sort:'rate',side:'over'});
        if(b.dataset.quickFilter==='rate')draft.filters.minRate=80;
        if(b.dataset.quickFilter==='sample'){draft.filters.sample='10';draft.filters.minGames=10;}
        if(b.dataset.filterKey){const key=b.dataset.filterKey;if(key==='side')draft.side=b.dataset.filterValue;else draft.filters[key]=b.dataset.filterValue;}
        for(const [data,key] of [['filterTeam','teams'],['filterPosition','positions']])if(b.dataset[data]){const list=draft.filters[key],value=b.dataset[data];draft.filters[key]=list.includes(value)?list.filter(x=>x!==value):[...list,value];}
        sync();
      }
      if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}
    });
    dialog.addEventListener('input',e=>{
      const input=e.target;
      if(input.dataset.filterNumber)draft.filters[input.dataset.filterNumber]=input.value===''?(input.dataset.filterNumber==='minGames'?0:''):Number(input.value);
      if(input.id==='filter-min-rate')draft.filters.minRate=Number(input.value);
      if(input.matches('[aria-label="Search filter teams"]'))for(const button of dialog.querySelectorAll('[data-filter-team]'))button.hidden=!button.dataset.filterTeam.toLowerCase().includes(input.value.trim().toLowerCase());
      sync();
    });
    dialog.addEventListener('change',e=>{
      const input=e.target,key=input.dataset.filterToggle;
      if(key){if(['posted','savedOnly'].includes(key))draft[key]=input.checked;else draft.filters[key]=input.checked;}
      if(input.matches('[data-filter-sort]'))draft.sort=input.value;
      if(input.matches('[data-filter-book]'))draft.filters.book=input.value;
      sync();
    });
    dialog.addEventListener('close',()=>{dialog.remove();trigger.focus();},{once:true});
    sync();enhanceTrendControls(dialog,'select');dialog.showModal();
  });
  update();return {update};
}

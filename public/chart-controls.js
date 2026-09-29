import {icon} from './ui-icons.js';
let dismissalBound=false;

// The reference keeps venue, side and comparison settings behind the sliders
// next to the history window. Both player views use this same control.
export function chartFilterControl(nodes,{open=false,count=0}={}) {
  if(!dismissalBound){
    document.addEventListener('click',event=>{
      // A setting can synchronously re-render the panel. Its original event path
      // still identifies the interaction as inside the menu after that update.
      const current=event.composedPath().find(node=>node.classList?.contains('reference-chart-filter'));
      if(current){for(const menu of document.querySelectorAll('.reference-chart-filter[open]'))if(menu!==current&&current.isConnected)menu.open=false;return;}
      for(const menu of document.querySelectorAll('.reference-chart-filter[open]'))menu.open=false;
    });
    dismissalBound=true;
  }
  const details=document.createElement('details');
  details.className='reference-chart-filter';details.open=open;
  details.innerHTML=`<summary aria-label="Chart filters${count?` · ${count} active`:''}" title="Chart filters">${icon('filter')}<span class="chart-filter-label">Filters</span>${count?`<span class="chart-filter-count">${count}</span>`:''}</summary><div class="reference-chart-filter-panel"><h4>Chart filters</h4></div>`;
  details.lastElementChild.append(...nodes);
  details.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&details.open){event.preventDefault();event.stopPropagation();details.open=false;details.firstElementChild.focus();}
  });
  return details;
}

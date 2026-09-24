import {icon} from './ui-icons.js';
let dismissalBound=false;

// The reference keeps venue, side and comparison settings behind the sliders
// next to the history window. Both player views use this same control.
export function chartFilterControl(nodes,{open=false,count=0}={}) {
  if(!dismissalBound){
    document.addEventListener('click',event=>{
      // A setting can synchronously re-render the panel. Its original event path
      // still identifies the interaction as inside the menu after that update.
      if(event.composedPath().some(node=>node.classList?.contains('reference-chart-filter')))return;
      for(const menu of document.querySelectorAll('.reference-chart-filter[open]'))menu.open=false;
    });
    dismissalBound=true;
  }
  const details=document.createElement('details');
  details.className='reference-chart-filter';details.open=open;
  details.innerHTML=`<summary aria-label="Chart filters" title="Chart filters">${icon('filter')}${count?`<span>${count}</span>`:''}</summary><div class="reference-chart-filter-panel"><h4>Chart filters</h4></div>`;
  details.lastElementChild.append(...nodes);
  details.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&details.open){event.preventDefault();event.stopPropagation();details.open=false;details.firstElementChild.focus();}
  });
  return details;
}



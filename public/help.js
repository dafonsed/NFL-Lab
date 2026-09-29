import { renderHelpResults, searchHelp } from './help-search.js';

const input = document.querySelector('#help-search-input');
const form = document.querySelector('#help-search');
const results = document.querySelector('#help-results');
const browse = document.querySelector('#help-browse');
const clear = document.querySelector('.help-search-clear');
const status = document.querySelector('#help-search-status');
const data = JSON.parse(document.querySelector('#help-search-data').textContent);
let timer;
function update() {
  const query = input.value.trim().slice(0,120);
  clear.hidden=!query; browse.hidden=Boolean(query); results.hidden=!query;
  if(query) {
    results.innerHTML=renderHelpResults(data.articles,query,data);
    const count=searchHelp(data.articles,query).length;
    status.textContent=`${count} ${count===1?'article':'articles'} found.`;
  } else {
    results.replaceChildren(); status.textContent='Browse help articles by topic.';
  }
}
input.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(update,140);});
clear.addEventListener('click',()=>{
  clearTimeout(timer);input.value='';update();input.focus();
  if(new URL(location.href).searchParams.has('q')) {
    const url=new URL(location.href);url.searchParams.delete('q');history.replaceState(null,'',url.pathname+url.search+url.hash);
  }
});
form.addEventListener('submit',()=>{clearTimeout(timer);input.value=input.value.trim().slice(0,120);});
document.addEventListener('keydown',event=>{
  const editing=event.target.closest('input,textarea,select,[contenteditable="true"]');
  if(event.key==='/'&&!editing&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();input.focus();}
  if(event.key==='Escape'&&document.activeElement===input&&input.value){event.preventDefault();clear.click();}
});

import {api,message,setBusy,readableDate,downloadJson} from './account-client.js';
import {prepareAdminPassword,confirmAdminPassword,invalidateAdminConfirmation} from './admin-confirmation.js';
import {staffContext} from './admin-shell.js';
const $=selector=>document.querySelector(selector);
const view=document.body.dataset.adminView||'operations';
const visibleArea=permission=>permissions.includes(permission)&&(view==='operations'||(permission==='support'&&view==='support')||(permission==='content'&&view==='content')||(permission==='data'&&['sources','events'].includes(view)));
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let permissions=[],selected=null,busy=false,focusBefore,marketRows=[],marketInventoryUnavailable=false,detailSequence=0,marketSequence=0;
const lists={support:{page:1,items:[],sequence:0},content:{page:1,items:[],sequence:0}};
const field=(name,label,value='',extra='')=>`<div class="account-field"><label for="op-${name}">${label}</label><input id="op-${name}" name="${name}" value="${esc(value)}" ${extra}></div>`;
const select=(name,label,values,value)=>`<div class="account-field"><label for="op-${name}">${label}</label><select id="op-${name}" name="${name}">${values.map(v=>`<option value="${v}" ${v===value?'selected':''}>${v.replaceAll('-',' ')}</option>`).join('')}</select></div>`;
const textarea=(name,label,value='',max=10000,min=10)=>`<div class="account-field"><label for="op-${name}">${label}</label><textarea id="op-${name}" name="${name}" rows="5" maxlength="${max}" minlength="${min}" ${min?'required':''}>${esc(value)}</textarea></div>`;
const localDate=value=>{if(!value)return '';const date=new Date(value);return new Date(date.valueOf()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const editedDate=(value,original)=>value===localDate(original)?original??null:value?new Date(value).toISOString():null;
function showForm(selection,title,html,label='Save changes',opener=document.activeElement){
  prepareAdminPassword($('#operation-password'));
  if(busy)return;++detailSequence;focusBefore=opener;selected=selection;$('#operation-form').reset();$('#operation-title').textContent=title;$('#operation-fields').innerHTML=html;$('#operation-save').textContent=label;$('#operation-error').hidden=true;$('#operation-dialog').showModal();$('#operation-fields input, #operation-fields textarea, #operation-fields select, #operation-reason')?.focus();
}
function draftFields(item={}){
  return field('title','Title',item.title,'required maxlength="160"')+textarea('body','Notice text',item.body,20000,1)+select('category','Notice type',['announcement','banner','guide','promotion'],item.category||'announcement')+field('publishAt','Publish from (blank means now)',localDate(item.publishAt),'type="datetime-local"')+field('expiresAt','Expires (optional)',localDate(item.expiresAt),'type="datetime-local"');
}
function create(kind,opener){
  if(kind==='content')showForm({kind,mode:'create'},'Create notice draft',draftFields(),'Create draft',opener);
  else showForm({kind,mode:'create'},'Create support ticket',field('userId','Customer account ID','','required maxlength="200"')+field('title','Report title','','required maxlength="160"')+textarea('body','Report details')+select('category','Category',['bug','incorrect-line','grading-dispute','billing','account','other'],'other')+select('priority','Priority',['low','normal','high','urgent'],'normal')+field('reference','Related bet, market or snapshot reference','','maxlength="200"'),'Create ticket',opener);
}
async function editTicket(id,opener){
  const sequence=++detailSequence;
  try{const data=await api(`/api/admin/support/${encodeURIComponent(id)}`);if(sequence!==detailSequence)return;const item=data.item;
    showForm({kind:'support',mode:'edit',item},item.title,`<p>${esc(item.body)}</p><p class="account-help">Customer ${esc(item.userId)} · ${esc(item.category)} · ${esc(item.reference||'No linked reference')}</p>`+select('status','Status',['open','in-progress','waiting-on-customer','resolved'],item.status)+select('priority','Priority',['low','normal','high','urgent'],item.priority)+field('assigneeId','Assigned staff account ID (optional)',item.assigneeId,'maxlength="200"')+textarea('note','Add an internal note (optional)','',4000,0)+`<details><summary>Recent internal notes</summary>${(data.notes||[]).map(n=>`<p>${esc(n.body??n.note??n.text)}<br><small>${esc(readableDate(n.createdAt))}</small></p>`).join('')||'<p>No internal notes.</p>'}${data.notesHasMore?'<p>Additional older notes are available in the support API.</p>':''}</details>`,'Save changes',opener);
  }catch(error){if(sequence===detailSequence)message($('#operations-status'),error.userMessage,true);}
}
function renderList(kind){
  const state=lists[kind],root=$(`#${kind}-list`);root.replaceChildren();
  if(!state.items.length){root.innerHTML=`<p class="account-help">${kind==='support'?'No support tickets match this view.':'No customer notices yet. Create a draft to begin.'}</p>`;return;}
  for(const item of state.items){
    const article=document.createElement('article');article.className='admin-account-row';article.innerHTML=`<header><h3>${esc(item.title)}</h3><span class="admin-account-status">${esc(item.effectiveStatus||item.status)}</span></header><p>${esc(kind==='support'?`${item.category} · ${item.priority} · customer ${item.userId}`:item.body)}</p><p class="account-help">Updated ${esc(readableDate(item.updatedAt))}${kind==='content'?` · publish from ${esc(readableDate(item.publishAt))} · expires ${esc(readableDate(item.expiresAt))}`:''}</p>`;
    const controls=document.createElement('div');controls.className='settings-actions';
    const button=(label,fn)=>{const b=document.createElement('button');b.type='button';b.className='settings-button secondary';b.textContent=label;b.addEventListener('click',()=>fn(b));controls.append(b);};
    if(kind==='support')button('Inspect and update',opener=>editTicket(item.id,opener));
    else{
      if(item.status==='draft'){button('Edit draft',opener=>showForm({kind,mode:'edit',item},'Edit notice draft',draftFields(item),'Save changes',opener));button('Publish notice',opener=>showForm({kind,mode:'publish',item},'Publish notice',`<p>${esc(item.title)}</p><p>This notice will appear publicly on the support page during its publication window.</p>`,'Publish notice',opener));}
      if(item.status!=='archived')button('Archive notice',opener=>showForm({kind,mode:'archive',item},'Archive notice',`<p>${esc(item.title)}</p><p>This removes the notice from public display.</p>`,'Archive notice',opener));
    }
    article.append(controls);root.append(article);
  }
}
async function loadList(kind,page=1){
  const state=lists[kind],sequence=++state.sequence;const filter=kind==='support'&&$('#ticket-status').value?`&status=${encodeURIComponent($('#ticket-status').value)}`:'';
  const result=await api(`/api/admin/${kind}?page=${page}&pageSize=20${filter}`);if(sequence!==state.sequence)return;
  state.items=result.items;state.page=result.page;renderList(kind);$(`#${kind}-page`).textContent=`Page ${result.page}`;$(`#${kind}-previous`).disabled=page<=1;$(`#${kind}-next`).disabled=!result.hasMore;$(`#${kind}-export`).disabled=!result.items.length;
}
function renderMarkets(){
  const q=$('#market-search').value.trim().toLowerCase(),root=$('#market-list');root.replaceChildren();const matches=marketRows.filter(row=>(view!=='sources'||row.kind==='source')&&(view!=='events'||row.kind==='event')&&`${row.label} ${row.kind}`.toLowerCase().includes(q));
  for(const row of matches.slice(0,100)){const article=document.createElement('article');article.className='admin-account-row';article.innerHTML=`<header><h3>${esc(row.label)}</h3><span class="admin-account-status">${row.blocked?'Suppressed':'Allowed'}</span></header><p>${esc(row.kind)} · ${marketInventoryUnavailable?'Current quotes unavailable':`${esc(row.quoteCount??0)} current quotes`}</p>`;const button=document.createElement('button');button.type='button';button.className='settings-button secondary';button.textContent=row.blocked?'Restore distribution':'Suppress distribution';button.addEventListener('click',()=>showForm({kind:'market',item:row},button.textContent,`<p>${esc(row.label)}</p><p>${row.blocked?'Allow':'Exclude'} this ${esc(row.kind)} in new EV feed responses. Existing client views update on the next successful feed refresh. Upstream collection stays unchanged.</p>`,button.textContent,button));article.append(button);root.append(article);}
  const note=document.createElement('p');note.className='account-help';note.textContent=matches.length>100?`Showing 100 of ${matches.length} matches. Narrow the search.`:matches.length?'':'No matching sources or events.';root.append(note);
}
async function loadMarkets(){const sequence=++marketSequence;const data=await api('/api/admin/market-controls');if(sequence!==marketSequence)return;marketRows=[...data.sources,...data.events];marketInventoryUnavailable=Boolean(data.inventoryUnavailable);renderMarkets();if(data.inventoryUnavailable)message($('#market-status'),'The upstream EV feed is unavailable. Saved controls are shown; existing suppressions remain enforced.',true);else $('#market-status').hidden=true;}
async function refresh(){await Promise.all([visibleArea('support')?loadList('support',lists.support.page):null,visibleArea('content')?loadList('content',lists.content.page):null,visibleArea('data')?loadMarkets():null]);}
async function run(work){try{await work();$('#operations-status').hidden=true;}catch(error){message($('#operations-status'),error.userMessage||'Unable to load operations.',true);}}
document.querySelectorAll('[data-create]').forEach(b=>b.addEventListener('click',()=>create(b.dataset.create,b)));
for(const kind of ['support','content']){
  $(`#${kind}-previous`).addEventListener('click',()=>run(()=>loadList(kind,Math.max(1,lists[kind].page-1))));$(`#${kind}-next`).addEventListener('click',()=>run(()=>loadList(kind,lists[kind].page+1)));$(`#${kind}-export`).addEventListener('click',()=>downloadJson(`sportslab-${kind}-shown.json`,lists[kind].items));
}
$('#support-filter').addEventListener('submit',event=>{event.preventDefault();run(()=>loadList('support'));});$('#market-search').addEventListener('input',renderMarkets);$('#operations-refresh').addEventListener('click',()=>run(refresh));
$('#operation-cancel').addEventListener('click',()=>{if(!busy)$('#operation-dialog').close();});$('#operation-dialog').addEventListener('cancel',event=>{if(busy)event.preventDefault();});$('#operation-dialog').addEventListener('close',()=>{selected=null;$('#operation-form').reset();focusBefore?.isConnected&&focusBefore.focus();});
$('#operation-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;if(busy||!selected||!form.reportValidity())return;const chosen=selected,data=Object.fromEntries(new FormData(form)),body={reason:data.reason.trim()};let route,method;
  if(chosen.kind==='market'){route='/api/admin/market-controls';method='POST';Object.assign(body,{kind:chosen.item.kind,key:chosen.item.key,blocked:!chosen.item.blocked,expectedVersion:chosen.item.version||0});}
  else{
    route=`/api/admin/${chosen.kind}${chosen.item?'/'+encodeURIComponent(chosen.item.id):''}`;method=chosen.mode==='edit'?'PATCH':'POST';if(chosen.item)body.version=chosen.item.version;
    if(['publish','archive'].includes(chosen.mode))route+='/'+chosen.mode;
    else for(const [key,value] of Object.entries(data))if(!['reason','password'].includes(key)){if(['publishAt','expiresAt'].includes(key))body[key]=editedDate(value,chosen.item?.[key]);else if(key==='assigneeId')body[key]=value.trim()||null;else if(key==='note'){if(value.trim())body[key]=value.trim();}else body[key]=value.trim();}
    if(body.publishAt&&body.expiresAt&&Date.parse(body.expiresAt)<=Date.parse(body.publishAt)){message($('#operation-error'),'Expiration must be after publication.',true);return;}
  }
  busy=true;setBusy(form,true);$('#operation-cancel').disabled=true;
  try{await confirmAdminPassword(data.password);$('#operation-password').value='';await api(route,{method,body});$('#operation-dialog').close();message($('#operations-status'),'Change saved to the database and recorded in the audit log.');try{await refresh();}catch{message($('#operations-status'),'Change saved, but refresh failed. Reload before making another change.',true);}}
  catch(error){if(['REAUTHENTICATION_REQUIRED','REAUTH_REQUIRED'].includes(error.code)){invalidateAdminConfirmation();prepareAdminPassword($('#operation-password'));}message($('#operation-error'),error.userMessage||'Unable to save this change.',true);}
  finally{busy=false;setBusy(form,false);$('#operation-cancel').disabled=false;$('#operation-password').value='';}
});
try{
  const data=await staffContext;permissions=data.permissions;
  if($('#operations-actor'))$('#operations-actor').textContent=`${data.actor.name} · ${data.actor.role}`;
  $('#operations-support').hidden=!visibleArea('support');$('#operations-content-editor').hidden=!visibleArea('content');$('#operations-markets').hidden=!visibleArea('data');
  if(view==='sources'||view==='events'){
    const noun=view==='sources'?'sources':'events';$('#operations-markets h2').textContent=`Connected ${noun}`;
    $('label[for="market-search"]').textContent=`Find ${noun}`;$('#market-search').placeholder=view==='sources'?'Sportsbook or provider name':'Event name or sport';
  }
  $('#operations-content').hidden=false;
  if(!['support','content','data'].some(visibleArea)){message($('#operations-status'),'Your staff role does not include this operation. Choose an area available to your role in the navigation.',true);$('#operations-refresh').hidden=true;}
  else await run(refresh);
}catch(error){message($('#operations-status'),error.userMessage||'Staff operations are unavailable.',true);}

import { api, message, setBusy, readableDate, downloadJson } from './account-client.js';
import { prepareAdminPassword, confirmAdminPassword, invalidateAdminConfirmation } from './admin-confirmation.js';
import { staffContext } from './admin-shell.js';
const $ = selector => document.querySelector(selector);
const view = document.body.dataset.adminView || 'legacy';
const auditOnly = view === 'security';
const esc = value => String(value ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const actions = {
  suspend: {label:'Suspend account',explanation:'Suspend this account and revoke its active sessions.'},
  restore: {label:'Restore account',explanation:'Restore customer access after reviewing the suspension.'},
  'revoke-sessions': {label:'Revoke sessions',explanation:'Sign this customer out on all active devices.'},
  'grant-access': {label:'Grant access',explanation:'Grant a time-limited access plan. This does not charge the customer or change a paid subscription.'},
  'revoke-grants': {label:'Revoke manual access',explanation:'Remove manual access grants. This does not cancel a paid subscription.'},
  'set-role': {label:'Change role',explanation:'Change staff permissions and revoke sessions. Staff access requires verified email and MFA.'}
};
let selectedAction, currentUsers=[], currentAudit=[], currentPage=1, auditPage=1, searchSequence=0, auditSequence=0, detailSequence=0, mutationInFlight=false, actionFocus, detailFocus;

function openAction(user, action, opener=document.activeElement) {
  if(mutationInFlight || !user.allowedActions?.includes(action) || !actions[action])return;
  if($('#admin-details-dialog').open)$('#admin-details-dialog').close();
  actionFocus=opener; selectedAction={user,action};
  $('#admin-action-form').reset(); $('#admin-action-status').hidden=true;
  $('#admin-action-title').textContent=actions[action].label;
  $('#admin-action-description').textContent=`${user.email} — ${actions[action].explanation}`;
  $('#admin-grant-fields').hidden=action!=='grant-access'; $('#grant-expiration').required=action==='grant-access';
  $('#admin-role-fields').hidden=action!=='set-role'; $('#new-role').value=user.role||'customer';
  $('#admin-action-confirm').textContent=actions[action].label;
  prepareAdminPassword($('#admin-password'));
  $('#admin-action-dialog').showModal(); $('#action-reason').focus();
}
function actionButtons(user) {
  const controls=document.createElement('div');controls.className='settings-actions';
  for(const action of user.allowedActions||[]) {
    if(!actions[action])continue;
    if(view==='billing'&&!['grant-access','revoke-grants'].includes(action))continue;
    if(view==='admins'&&!['suspend','restore','revoke-sessions','set-role'].includes(action))continue;
    const button=document.createElement('button');button.type='button';button.className='settings-button secondary';button.textContent=actions[action].label;
    button.addEventListener('click',()=>openAction(user,action,button));controls.append(button);
  }
  return controls;
}
async function search(page=1) {
  const sequence=++searchSequence; $('#admin-results').setAttribute('aria-busy','true');
  try {
    const data=await api(`/api/admin/accounts?q=${encodeURIComponent($('#account-query').value.trim())}&page=${page}&pageSize=20${view==='admins'?'&scope=staff':''}`);
    if(sequence!==searchSequence)return;
    currentUsers=data.users||[];currentPage=data.page||1;
    $('#admin-results').replaceChildren();
    $('#admin-result-summary').textContent=`${currentUsers.length} accounts shown · page ${currentPage}${data.hasMore?' · more results available':''}`;
    $('#admin-previous').disabled=currentPage<=1;$('#admin-next').disabled=!data.hasMore;$('#admin-export-users').disabled=!currentUsers.length;
    if(!currentUsers.length)$('#admin-results').innerHTML='<p class="account-help">No matching accounts. Try a different name, email or account ID.</p>';
    if(currentUsers.length){
      const container=document.createElement('div');container.className='connected-table-scroll connected-account-table';container.tabIndex=0;container.setAttribute('role','region');container.setAttribute('aria-label','Account directory; scroll horizontally for all columns');
      container.innerHTML='<table><thead><tr><th>Account</th><th>Status</th><th>Role</th><th>Security</th><th>Created</th><th>Actions</th></tr></thead><tbody></tbody></table>';
      for(const user of currentUsers){
        const row=document.createElement('tr');row.innerHTML=`<td><strong>${esc(user.name||'Unnamed account')}</strong><small>${esc(user.email)}</small></td><td><span class="admin-account-status">${esc(user.status)}</span></td><td>${esc(user.role)}</td><td>${user.emailVerified?'Email verified':'Email unverified'}<small>${user.twoFactorEnabled?'MFA enabled':'MFA not enabled'}</small></td><td>${esc(readableDate(user.createdAt))}</td><td></td>`;
        const inspect=document.createElement('button');inspect.type='button';inspect.className='settings-button secondary';inspect.textContent='Inspect account';inspect.setAttribute('aria-label',`Inspect ${user.name||user.email}`);inspect.addEventListener('click',()=>inspectAccount(user.id,inspect));row.lastElementChild.append(inspect);container.querySelector('tbody').append(row);
      }
      $('#admin-results').append(container);
    }
  } finally {if(sequence===searchSequence)$('#admin-results').setAttribute('aria-busy','false');}
}
function auditTable(events) {
  return events.length?`<div class="connected-table-scroll" tabindex="0" role="region" aria-label="Account audit records; scroll horizontally for all columns"><table><thead><tr><th>Action</th><th>Account</th><th>Actor</th><th>Reason / details</th><th>Time</th></tr></thead><tbody>${events.map(event=>`<tr><td>${esc(event.action)}</td><td>${esc(event.userId)}</td><td>${esc(event.actorId||'System')}</td><td>${esc(event.detail?.reason||JSON.stringify(event.detail||{}))}</td><td>${esc(readableDate(event.createdAt))}</td></tr>`).join('')}</tbody></table></div>`:'<p class="account-help">No recorded activity matches this view.</p>';
}
async function loadAudit(page=1) {
  const sequence=++auditSequence,data=await api(`/api/admin/audit?page=${page}&pageSize=20`);if(sequence!==auditSequence)return;
  currentAudit=data.events||[];auditPage=data.page||1;
  $('#connected-audit-records').innerHTML=auditTable(currentAudit);$('#admin-audit-page').textContent=`Page ${auditPage}`;
  $('#admin-audit-previous').disabled=auditPage<=1;$('#admin-audit-next').disabled=!data.hasMore;$('#admin-export-audit').disabled=!currentAudit.length;
}
async function loadOverview() {
  const data=await api('/api/admin/overview');if($('#connected-actor'))$('#connected-actor').textContent=`${data.actor.name||data.actor.email} · ${data.actor.role}`;
  const labels={totalUsers:'Accounts',activeUsers:'Active accounts',suspendedUsers:'Suspended accounts',activeSessions:'Active sessions',subscriptions:'Subscription records',activeGrants:'Active access grants'};
  $('#connected-metrics').innerHTML=Object.entries(labels).map(([key,label])=>`<article><span>${label}</span><strong>${typeof data.counts[key]==='number'?data.counts[key].toLocaleString():'Unavailable'}</strong></article>`).join('');
  $('#connected-service-status').innerHTML=`<div><strong>Account database</strong><span>Connected · retrieved ${esc(new Date().toLocaleTimeString())}</span></div><div><strong>Transactional email</strong><span>${data.services.mail.configured?'Configured':'Not configured'}</span></div><div><strong>Subscription billing</strong><span>${data.services.billing.configured?'Configured':'Not configured'}</span></div>`;
}
async function inspectAccount(id,opener=document.activeElement) {
  const sequence=++detailSequence;
  detailFocus=opener;$('#admin-details-title').textContent='Account details';$('#admin-details-body').textContent='Loading account records…';$('#admin-details-actions').replaceChildren();$('#admin-details-dialog').showModal();
  try {
    const data=await api(`/api/admin/accounts/${encodeURIComponent(id)}`);if(sequence!==detailSequence||!$('#admin-details-dialog').open)return;
    const user=data.user;$('#admin-details-title').textContent=user.name||user.email;
    const collection=(name,items,render,more)=>`<section class="connected-detail-section"><h3>${esc(name)}</h3>${items.length?items.map(render).join(''):'<p class="account-help">No records.</p>'}${more?'<p class="account-help">Only the first 100 records are shown.</p>':''}</section>`;
    $('#admin-details-body').innerHTML=`<p>${esc(user.email)} · ${esc(user.id)}</p><p>${esc(user.status)} · ${esc(user.role)}</p>${collection('Session records',data.sessions,item=>`<p>${esc(readableDate(item.createdAt))} · expires ${esc(readableDate(item.expiresAt))}<br><small>${esc(item.userAgent||'Device unavailable')}</small></p>`,data.hasMore?.sessions)}${collection('Manual access grants',data.grants,item=>`<p><strong>${esc(({free:'Free',premium:'Basic',premium_plus:'Pro',pro:'Premium'})[item.plan] || item.plan)}</strong> · ${item.revokedAt?'Revoked':new Date(item.expiresAt)<=new Date()?'Expired':'Active'} · expires ${esc(readableDate(item.expiresAt))}<br><small>${esc(item.reason)}</small></p>`,data.hasMore?.grants)}${collection('Subscriptions',data.subscriptions,item=>`<p><strong>${esc(({free:'Free',premium:'Basic',premium_plus:'Pro',pro:'Premium'})[item.plan] || item.plan)}</strong> · ${esc(item.status)} · period ends ${esc(readableDate(item.currentPeriodEnd))}</p>`,data.hasMore?.subscriptions)}${collection('Saved collection counts',data.dataKinds,item=>`<p>${esc(item.kind)}: ${esc(item.count)} stored collection${item.count===1?'':'s'}</p>`)}<p class="account-help">Collection counts are stored documents, not individual bets or notes. Private saved content is not shown.</p><section class="connected-detail-section"><h3>Account activity</h3>${auditTable(data.audit||[])}${data.hasMore?.audit?'<p class="account-help">Showing the 25 most recent account events. Older events remain available in the audit history.</p>':''}</section>`;
    $('#admin-details-actions').append(actionButtons(user));
  } catch(error) {if(sequence===detailSequence&&$('#admin-details-dialog').open)$('#admin-details-body').textContent=error.userMessage||'Unable to load this account.';}
}
async function updatePanel(operation) {
  try {await operation();$('#admin-status').hidden=true;}catch(error){message($('#admin-status'),error.userMessage||'Unable to refresh this view.',true);}
}
async function refreshPage(resetAudit=false) {
  if(auditOnly)return loadAudit(resetAudit?1:auditPage);
  const requests=[['Account totals and service status',loadOverview()],['Account directory',search(currentPage)]];
  if(view==='legacy')requests.push(['Audit history',loadAudit(resetAudit?1:auditPage)]);
  const results=await Promise.allSettled(requests.map(([,request])=>request));
  const failed=results.flatMap((result,index)=>result.status==='rejected'?[requests[index][0]]:[]);
  if(failed.length) {
    const available=results.some(result=>result.status==='fulfilled');
    throw Object.assign(new Error('Some account panels could not be refreshed'),{userMessage:`Could not refresh: ${failed.join('; ')}. ${available?'The available records are shown.':'Try Refresh data again.'}`});
  }
}
$('#admin-search').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget;setBusy(form,true);try{await updatePanel(()=>search(1));}finally{setBusy(form,false);}});
$('#admin-previous').addEventListener('click',()=>updatePanel(()=>search(Math.max(1,currentPage-1))));
$('#admin-next').addEventListener('click',()=>updatePanel(()=>search(currentPage+1)));
$('#admin-audit-previous').addEventListener('click',()=>updatePanel(()=>loadAudit(Math.max(1,auditPage-1))));
$('#admin-audit-next').addEventListener('click',()=>updatePanel(()=>loadAudit(auditPage+1)));
$('#admin-refresh').addEventListener('click',()=>updatePanel(()=>refreshPage()));
$('#admin-export-audit').addEventListener('click',()=>downloadJson('visualodds-admin-visible-audit.json',currentAudit));
$('#admin-export-users').addEventListener('click',()=>{
  const cell=value=>{let text=String(value??'');if(/^[\s]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const keys=['id','name','email','status','role','createdAt'];const csv=[keys.map(cell).join(','),...currentUsers.map(user=>keys.map(key=>cell(user[key])).join(','))].join('\r\n');
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),anchor=document.createElement('a');anchor.href=url;anchor.download='visualodds-admin-shown-accounts.csv';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
$('#admin-details-close').addEventListener('click',()=>$('#admin-details-dialog').close());
$('#admin-details-dialog').addEventListener('close',()=>{if($('#admin-details-dialog').open)return;detailSequence++;if(detailFocus?.isConnected)detailFocus.focus();});
$('#admin-action-cancel').addEventListener('click',()=>{if(!mutationInFlight)$('#admin-action-dialog').close();});
$('#admin-action-dialog').addEventListener('cancel',event=>{if(mutationInFlight)event.preventDefault();});
$('#admin-action-dialog').addEventListener('close',()=>{$('#admin-action-form').reset();selectedAction=null;actionFocus?.isConnected&&actionFocus.focus();});
$('#admin-action-form').addEventListener('submit',async event=>{
  event.preventDefault();const form=event.currentTarget;if(mutationInFlight||!form.reportValidity()||!selectedAction)return;
  const target=selectedAction,data=new FormData(form),body={action:target.action,reason:data.get('reason').trim()};
  if(target.action==='grant-access'){
    const expiresAt=new Date(data.get('expiresAt'));
    if(expiresAt<=new Date()||expiresAt>Date.now()+366*86400_000||Number.isNaN(expiresAt.valueOf())){message($('#admin-action-status'),'Choose an expiration in the future, within the next year.',true);return;}
    body.plan=data.get('plan');body.expiresAt=expiresAt.toISOString();
  }
  if(target.action==='set-role')body.role=data.get('role');
  mutationInFlight=true;setBusy(form,true);$('#admin-action-cancel').disabled=true;
  try {
    await confirmAdminPassword(data.get('password'));$('#admin-password').value='';
    await api(`/api/admin/accounts/${encodeURIComponent(target.user.id)}/action`,{method:'POST',body});
    $('#admin-action-dialog').close();message($('#admin-status'),`${actions[target.action].label} completed in the account database. The reason has been recorded.`);
    try{await refreshPage(true);}catch{message($('#admin-status'),`${actions[target.action].label} completed, but the updated view could not be loaded. Refresh before taking another action.`,true);}
  }catch(error){if(['REAUTHENTICATION_REQUIRED','REAUTH_REQUIRED'].includes(error.code)){invalidateAdminConfirmation();prepareAdminPassword($('#admin-password'));}message($('#admin-action-status'),error.userMessage||'The action could not be completed.',true);}
  finally{mutationInFlight=false;setBusy(form,false);$('#admin-action-cancel').disabled=false;$('#admin-password').value='';}
});
try {
  const capabilities = await staffContext;
  if (!capabilities.permissions.includes('inspect')) message($('#admin-status'),'Your staff role does not include account inspection. Use the navigation to open an area available to your role.',true);
  else {
    if(view!=='legacy') {
      $('#connected-availability').hidden=true;
      $('#connected-overview').hidden=auditOnly;
      $('#connected-audit').hidden=!auditOnly;
      if($('#connected-directory'))$('#connected-directory').hidden=auditOnly;
      if(view==='admins')$('#connected-overview h2').textContent='All account totals (customers and staff)';
      if(auditOnly){const button=$('#admin-refresh');button.textContent='Refresh audit';$('#connected-audit header').append(button);}
    }
    $('#admin-content').hidden=false;
    await updatePanel(()=>refreshPage());
  }
}catch(error){
  message($('#admin-status'),error.status===403?'Staff access requires an authorized role, verified email, and a sign-in confirmed with your authenticator. Check your account security settings.':error.userMessage||'Account administration is unavailable.',true);
  const link=document.createElement('a');link.href=error.status===401?'/login?next=%2Fadmin%2Faccounts':'/account#security';link.textContent=error.status===401?'Sign in to staff access':'Open security settings';$('#admin-status').append(document.createElement('br'),link);
}

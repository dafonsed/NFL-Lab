import {api,message,readableDate,downloadJson} from './account-client.js';
import {staffContext} from './admin-shell.js';
import {icon} from './ui-icons.js';

const root=document.querySelector('#admin-overview-content');
const status=document.querySelector('#overview-status');
const reports=document.body.dataset.adminView==='reports';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=value=>typeof value==='number'?value.toLocaleString():'—';
let snapshot=null,busy=false;
const link=(href,text,className='ad-text-button')=>`<a class="${className}" href="${href}">${esc(text)}${icon('arrow')}</a>`;
const badge=(text,tone='')=>`<span class="ad-badge ${tone}">${esc(text)}</span>`;
const empty=text=>`<div class="adu-empty-state">${icon('info')}<p>${esc(text)}</p></div>`;
const panel=(title,subtitle,body,action='')=>`<section class="ad-panel"><header class="ad-panel-heading"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div>${action}</header>${body}</section>`;
function domainMessage(data,permission,domain){return !data.permissions.includes(permission)?'This area requires a different staff permission.':data.errors.some(error=>error.domain===domain)?'This service could not be loaded. Refresh to try again.':'No records yet.';}
function statistic(label,value,detail,glyph,href){return `<${href?'a':'div'} ${href?`href="${href}"`:''} class="ad-stat"><span class="ad-stat-label">${esc(label)}${icon(glyph)}</span><strong class="ad-stat-number">${number(value)}</strong><p>${esc(detail)}</p></${href?'a':'div'}>`;}
function sourcePanel(data){
  const market=data.markets;
  if(!market)return panel('Feed control room','Connected EV sources',empty(domainMessage(data,'data','markets')));
  const sources=market.sources.slice(0,5),total=market.observedQuotes||0;
  const rows=sources.map((source,index)=>`<a href="/admin/sources" class="ad-feed-row"><span class="ad-source-logo source-${index%4}">${esc(source.label.slice(0,2).toUpperCase())}</span><span class="ad-feed-name"><strong>${esc(source.label)}</strong><small>${market.inventoryUnavailable?'Saved control · inventory unavailable':`${number(source.quoteCount)} quotes in current inventory`}</small></span><span class="adu-source-coverage" aria-hidden="true"><i style="width:${total?Math.round(source.quoteCount/total*100):0}%"></i></span><span class="ad-feed-status">${badge(source.blocked?'Suppressed':market.inventoryUnavailable?'Unverified':'Allowed',source.blocked?'warn':market.inventoryUnavailable?'':'good')}<small>${source.blocked?'Distribution paused':'Distribution rule'}</small></span>${icon('chevron')}</a>`).join('');
  return panel('Feed control room','Source inventory and distribution rules',`${market.inventoryUnavailable?'<p class="adu-inline-warning">The quote provider is unavailable. Saved controls remain enforced.</p>':''}<div class="ad-feed-list">${rows||empty(market.inventoryUnavailable?'Connect the EV provider to inspect source inventory.':'No sources are present in the current quote inventory.')}</div><footer class="ad-panel-footer"><span>Distribution rules apply on the next feed refresh.</span>${link('/admin/events','View events')}</footer>`,link('/admin/sources','Manage sources'));
}
function supportPanel(data){
  if(!data.support)return panel('Recent support reports','Customer reports and reviewed issues',empty(domainMessage(data,'support','support')));
  const rows=data.support.latest.map((ticket,index)=>`<a href="/admin/support" class="adu-attention-row"><span class="ad-priority priority-${index%3}">${icon('info')}</span><span><strong>${esc(ticket.title)}</strong><small>${esc(ticket.priority)} priority · ${esc(ticket.status.replaceAll('-',' '))}</small></span>${icon('chevron')}</a>`).join('');
  return panel('Recent support reports',`${number(data.support.open)} unresolved reports`,rows||empty('There are no reports to review.'),link('/admin/support','Open queue'));
}
function businessPanel(data){
  if(!data.accounts)return panel('Account activity','Current database snapshot',empty(domainMessage(data,'inspect','accounts')));
  const items=[['Total accounts',data.accounts.totalUsers],['Active sessions',data.accounts.activeSessions],['Suspended accounts',data.accounts.suspendedUsers],['Subscription records',data.accounts.subscriptions],['Active manual grants',data.accounts.activeGrants]];
  return panel('Account activity','Current database snapshot',`<dl class="adu-number-list">${items.map(([label,value])=>`<div><dt>${label}</dt><dd>${number(value)}</dd></div>`).join('')}</dl><footer class="ad-panel-footer"><span>Revenue reporting is not connected.</span>${link('/admin/billing','View billing access')}</footer>`,link('/admin/users','Manage users'));
}
function contentPanel(data){
  if(!data.content)return panel('Publication queue','Customer notices and scheduled content',empty(domainMessage(data,'content','content')));
  const states=[['Published now',data.content.published,'good'],['Scheduled',data.content.scheduled,''],['Drafts',data.content.draft,''],['Expired',data.content.expired,'warn'],['Archived',data.content.archived,'']];
  return panel('Publication queue','Customer notices and scheduled content',`<dl class="adu-number-list">${states.map(([label,value,tone])=>`<div><dt>${label}</dt><dd>${badge(number(value),tone)}</dd></div>`).join('')}</dl><footer class="ad-panel-footer"><span>Only current published notices reach customers.</span>${link('/support','Customer view')}</footer>`,link('/admin/content','Manage content'));
}
function auditPanel(data){
  const events=data.audit;
  return panel('Recent admin activity','Actions recorded by the account service',!events?empty(domainMessage(data,'inspect','audit')):!events.length?empty('No admin activity has been recorded.'): `<div class="ad-table-scroll" tabindex="0" role="region" aria-label="Recent admin activity; scroll to view all columns"><table><thead><tr><th>Action</th><th>Actor</th><th>Reason / details</th><th>Time</th></tr></thead><tbody>${events.map(event=>`<tr><td><strong>${esc(event.action)}</strong></td><td>${esc(event.actorId||'System')}</td><td>${esc(event.detail?.reason||'Recorded by the account service')}</td><td>${esc(readableDate(event.createdAt))}</td></tr>`).join('')}</tbody></table></div>`,data.permissions.includes('inspect')?link('/admin/security','View activity log'):'');
}
function overview(data){
  const hasMarket=data.markets&&!data.markets.inventoryUnavailable,market=data.markets;
  const suppressed=market?.sources.filter(source=>source.blocked).length;
  const stats=[
    statistic('Active user accounts',data.accounts?.activeUsers,data.accounts?'In the account database':domainMessage(data,'inspect','accounts'),'players',data.accounts?'/admin/users':null),
    statistic('Sources allowed',hasMarket?market.sources.filter(source=>!source.blocked&&source.observed).length:undefined,hasMarket?`${number(suppressed)} source rules suppressed`:domainMessage(data,'data','markets')==='No records yet.'?'Inventory unavailable':domainMessage(data,'data','markets'),'live',market?'/admin/sources':null),
    statistic('Open support reports',data.support?.open,data.support?`${number(data.support.urgent)} urgent · ${number(data.support.unassigned)} unassigned`:domainMessage(data,'support','support'),'bookmark',data.support?'/admin/support':null),
    statistic('Published notices',data.content?.published,data.content?`${number(data.content.scheduled)} scheduled · ${number(data.content.draft)} drafts`:domainMessage(data,'content','content'),'paper',data.content?'/admin/content':null)
  ].join('');
  const warnings=[];
  if(data.errors.length)warnings.push(`${data.errors.length} service${data.errors.length===1?'':'s'} could not be fully loaded. The available data is shown below.`);
  if(data.support?.urgent)warnings.push(`${number(data.support.urgent)} urgent support report${data.support.urgent===1?' needs':'s need'} review.`);
  const coverage=[['Sources observed',hasMarket?market.sources.filter(s=>s.observed).length:undefined],['Events observed',hasMarket?market.events.filter(e=>e.observed).length:undefined],['Quote rows',hasMarket?market.observedQuotes:undefined],['Source suppressions',suppressed],['Event suppressions',market?.events.filter(e=>e.blocked).length]];
  return `${warnings.length?`<div class="ad-incident"><span class="ad-incident-icon">${icon('info')}</span><div><strong>Needs attention</strong><p>${esc(warnings.join(' '))}</p></div></div>`:''}<div class="ad-stats">${stats}</div><section class="adu-coverage" aria-label="Current feed coverage"><div class="ad-coverage-title"><strong>Market coverage</strong><small>Connected EV inventory</small></div>${coverage.map(([label,value])=>`<div><strong>${number(value)}</strong><span>${label}</span></div>`).join('')}</section><div class="ad-overview-columns">${sourcePanel(data)}${supportPanel(data)}</div><div class="ad-overview-columns lower">${businessPanel(data)}${contentPanel(data)}</div>${auditPanel(data)}`;
}
function metrics(data){
  const rows=[];
  for(const [domain,values] of Object.entries({accounts:data.accounts,support:data.support,content:data.content}))if(values)for(const [key,value] of Object.entries(values))if(typeof value==='number')rows.push({domain,metric:key,value});
  if(data.markets){rows.push({domain:'markets',metric:'sourcesSuppressed',value:data.markets.sources.filter(row=>row.blocked).length},{domain:'markets',metric:'eventsSuppressed',value:data.markets.events.filter(row=>row.blocked).length});if(!data.markets.inventoryUnavailable)rows.push({domain:'markets',metric:'observedQuotes',value:data.markets.observedQuotes});}
  return rows;
}
function reportView(data){
  const rows=metrics(data),availability=[['Account database',data.accounts?'Available':domainMessage(data,'inspect','accounts')],['Support records',data.support?'Available':domainMessage(data,'support','support')],['Content records',data.content?'Available':domainMessage(data,'content','content')],['EV inventory',data.markets?(data.markets.inventoryUnavailable?'Provider unavailable':'Available'):domainMessage(data,'data','markets')],['Revenue, conversion & engagement','Not connected']];
  return panel('Operational snapshot','Counts from the connected services',`<div class="ad-table-scroll" tabindex="0" role="region" aria-label="Operational report metrics"><table><thead><tr><th>Area</th><th>Metric</th><th>Count</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${esc(row.domain)}</td><td>${esc(row.metric.replace(/([A-Z])/g,' $1').toLowerCase())}</td><td>${number(row.value)}</td></tr>`).join('')}</tbody></table></div>`,`<button id="overview-export-csv" class="ad-button">${icon('download')}Export CSV</button>`)+panel('Report availability','Only authorized, retrieved data is included',`<dl class="adu-number-list">${availability.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`);
}
function exportCsv(){
  if(!snapshot)return;
  const cell=value=>{let text=String(value??'');if(/^[\s]*[=+\-@]/.test(text))text="'"+text;return `"${text.replaceAll('"','""')}"`;};
  const rows=[['Retrieved at','Area','Metric','Count'],...metrics(snapshot).map(row=>[snapshot.generatedAt,row.domain,row.metric,row.value])];
  const url=URL.createObjectURL(new Blob([rows.map(row=>row.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='visualodds-operational-snapshot.csv';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function refresh(){
  if(busy)return;busy=true;document.querySelector('#overview-refresh').disabled=true;
  try{
    await staffContext;const data=await api('/api/admin/dashboard');snapshot=data;
    document.querySelector('#overview-data').innerHTML=reports?reportView(data):overview(data);
    document.querySelector('#overview-timestamp').textContent=`Retrieved ${readableDate(data.generatedAt)}`;
    document.querySelector('#overview-export').disabled=false;
    document.querySelector('#overview-audit-link').hidden=!data.permissions.includes('inspect');
    status.hidden=true;
  }catch(error){message(status,error.userMessage||'The dashboard could not be loaded. Refresh to try again.',true);}
  finally{busy=false;document.querySelector('#overview-refresh').disabled=false;}
}
root.innerHTML=`<div class="adu-overview-actions"><button id="overview-export" class="ad-button" disabled>${icon('download')}Export snapshot</button><button id="overview-refresh" class="ad-button primary">${icon('refresh')}Refresh data</button></div><nav class="ad-page-tabs adu-page-tabs" aria-label="Overview views"><a href="/admin" ${!reports?'aria-current="page"':''}>Overview</a><a id="overview-audit-link" href="/admin/security" hidden>Activity log</a><a href="/admin/reports" ${reports?'aria-current="page"':''}>Reports</a><span id="overview-timestamp" class="ad-sample-note">Loading current data…</span></nav><div id="overview-data"><div class="adu-empty-state">Loading connected services…</div></div>`;
root.addEventListener('click',event=>{const button=event.target.closest('button');if(button?.id==='overview-refresh')refresh();if(button?.id==='overview-export'&&snapshot)downloadJson('visualodds-admin-snapshot.json',snapshot);if(button?.id==='overview-export-csv')exportCsv();});
await refresh();

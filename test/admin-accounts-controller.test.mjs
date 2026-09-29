import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { renderConnectedAdminPage } from '../lib/admin-connected-page.mjs';
import { message, setBusy } from '../public/account-client.js';

// Exercise the real controller with a small DOM surface, without running a
// browser or confusing these response fixtures with authenticated API coverage.
class Element {
  constructor() { this.hidden=false; this.disabled=false; this.dataset={}; this.children=[]; this.handlers=new Map(); this.attributes=new Map(); this.value=''; this.textContent=''; this.innerHTML=''; }
  addEventListener(type, handler) { this.handlers.set(type, handler); }
  setAttribute(name, value) { this.attributes.set(name, value); }
  replaceChildren(...nodes) { this.children=nodes; this.innerHTML=''; }
  append(...nodes) { this.children.push(...nodes); }
  querySelector() { return this.child ||= new Element(); }
  get lastElementChild() { return this.child ||= new Element(); }
}
const source=(await readFile(new URL('../public/admin-accounts.js',import.meta.url),'utf8')).replace(/^import .*\r?\n/gm,'');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const execute=new AsyncFunction('api','message','setBusy','readableDate','downloadJson','prepareAdminPassword','confirmAdminPassword','invalidateAdminConfirmation','staffContext','document',source);
const user={id:'account-1',name:'Saved account',email:'saved@example.test',status:'active',role:'customer',emailVerified:true,twoFactorEnabled:false,createdAt:'2026-09-27T00:00:00.000Z'};
const overview={actor:{name:'Staff',role:'owner'},counts:{totalUsers:12,activeUsers:11,suspendedUsers:1,activeSessions:3,subscriptions:5,activeGrants:2},services:{mail:{configured:true},billing:{configured:false}}};
function controller(view,api,permissions=['inspect']) {
  const html=load(renderConnectedAdminPage(new URL(`/admin/${view}`,'https://example.test'))),nodes=new Map();
  html('[id]').each((_,element)=>{const node=new Element();node.hidden=html(element).is('[hidden]');node.disabled=html(element).is('[disabled]');nodes.set(`#${html(element).attr('id')}`,node);});
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,new Element());return nodes.get(selector);};
  const document={body:{dataset:{adminView:view}},querySelector:node,createElement:()=>new Element(),createTextNode:text=>text};
  return {node,run:()=>execute(api,message,setBusy,value=>value,()=>{},()=>{},async()=>{},()=>{},Promise.resolve({permissions}),document)};
}

test('account directory stays visible and exportable when totals fail, then Refresh recovers the totals',async()=>{
  let totalsUnavailable=true,searchFinished=false;
  const calls=[];
  const page=controller('users',async url=>{
    calls.push(url);
    if(url==='/api/admin/overview') { if(totalsUnavailable)throw new Error('Billing summary unavailable');return overview; }
    if(url.startsWith('/api/admin/accounts?')) {await Promise.resolve();searchFinished=true;return {users:[user],page:1,hasMore:true};}
    throw new Error(`Unexpected API request ${url}`);
  });
  await page.run();
  assert.equal(searchFinished,true);
  assert.equal(page.node('#admin-content').hidden,false);
  assert.equal(page.node('#admin-export-users').disabled,false);
  assert.equal(page.node('#admin-next').disabled,false);
  assert.match(page.node('#admin-result-summary').textContent,/1 accounts shown/);
  assert.match(page.node('#admin-status').textContent,/Account totals and service status.*available records are shown/);
  assert.equal(page.node('#admin-status').dataset.tone,'error');
  assert.equal(page.node('#admin-status').children.length,0,'A service failure does not add an irrelevant security-settings link.');
  totalsUnavailable=false;
  await page.node('#admin-refresh').handlers.get('click')();
  assert.equal(page.node('#admin-status').hidden,true);
  assert.match(page.node('#connected-metrics').innerHTML,/>12</);
  assert.equal(calls.length,4);
});

test('staff-scoped directory failure leaves global totals and retry visible with accurate scope labels',async()=>{
  const calls=[];
  const page=controller('admins',async url=>{
    calls.push(url);
    if(url==='/api/admin/overview')return overview;
    throw new Error('Directory is temporarily unavailable');
  });
  await page.run();
  assert.equal(page.node('#admin-content').hidden,false);
  assert.equal(page.node('#connected-overview').hidden,false);
  assert.match(page.node('#connected-metrics').innerHTML,/>12</);
  assert.equal(page.node('#connected-overview h2').textContent,'All account totals (customers and staff)');
  assert.ok(calls.some(url=>url.includes('scope=staff')));
  assert.match(page.node('#admin-status').textContent,/Account directory.*available records are shown/);
  assert.equal(page.node('#admin-export-users').disabled,true);
});

test('audit-only view retrieves only audit and describes customer and system activity without a staff-only label',async()=>{
  const calls=[];
  const page=controller('security',async url=>{
    calls.push(url);return {events:[{action:'support.created',userId:user.id,actorId:user.id,detail:{},createdAt:user.createdAt},{action:'system.event',actorId:null,detail:{},createdAt:user.createdAt}],page:1,hasMore:false};
  });
  await page.run();
  assert.equal(calls.length,1);assert.match(calls[0],/^\/api\/admin\/audit\?/);
  assert.equal(page.node('#connected-directory').hidden,true);
  assert.equal(page.node('#connected-overview').hidden,true);
  assert.match(page.node('#connected-audit-records').innerHTML,/<th>Actor<\/th>/);
  assert.match(page.node('#connected-audit-records').innerHTML,/>System</);
  assert.doesNotMatch(page.node('#connected-audit-records').innerHTML,/Staff actor/);
});

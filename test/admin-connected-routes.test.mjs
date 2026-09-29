import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { load } from 'cheerio';
import { renderConnectedAdminPage, CONNECTED_ADMIN_SECTIONS } from '../lib/admin-connected-page.mjs';
import { fixture } from './helpers/admin-api-fixture.mjs';
import { configureAccountTestRuntime } from '../lib/accounts/runtime.mjs';

const render = route => renderConnectedAdminPage(new URL(route, 'http://localhost'));

test('all 21 connected admin areas share the original visual shell without sandbox code or data', () => {
  assert.equal(CONNECTED_ADMIN_SECTIONS.length, 21);
  for (const section of CONNECTED_ADMIN_SECTIONS) {
    const $ = load(render(`/admin/${section.id}`));
    assert.equal($('body').attr('data-admin-view'), section.id);
    assert.equal($('body.admin-app.admin-connected-app').length, 1);
    assert.equal($('#admin-sidebar .ad-nav-group a[data-admin-section]').length, 21);
    assert.equal($('#admin-sidebar [aria-current="page"]').attr('data-admin-section'), section.id);
    assert.equal($('.ad-workspace > .ad-topbar').length, 1);
    assert.equal($('#admin-main[tabindex="-1"]').length, 1);
    assert.equal($('#admin-main h1').text(), section.title);
    assert.equal($('.settings-heading, .settings-sidebar, .account-header, .site-header').length, 0);
    assert.equal($('#admin-role, [name="role"][aria-label="Sandbox role"]').length, 0);
    assert.equal($('#admin-actor-name, #admin-actor-role, #admin-actor-avatar').length, 3);
    assert.equal($('#admin-area-search #admin-area-query').length, 1);
    assert.equal($('[data-admin-menu][aria-controls="admin-sidebar"]').length, 1);
    assert.equal($('meta[name="robots"]').attr('content'), 'noindex, nofollow');
    assert.equal($('link[href="/admin.css"],link[href="/admin-unified.css"]').length, 2);
    assert.equal($('script[src="/admin-shell.js"]').length, 1);
    assert.equal($('script[src="/admin.js"],script[src="/admin-catalog.js"],script[src="/admin-store.js"]').length, 0);
    const ids = $('[id]').map((_, element) => $(element).attr('id')).get();
    assert.equal(new Set(ids).size, ids.length, `${section.id} has unique element IDs`);
  }
  assert.equal(load(render('/admin'))('body').attr('data-admin-view'), 'overview');
  assert.equal(load(render('/admin/'))('body').attr('data-admin-view'), 'overview');
  assert.equal(load(render('/admin/accounts'))('body').attr('data-admin-view'), 'users');
  for (const path of ['/admin/no-such-area', '/admin/users/delete', '/admin//users', '/admin/USERS', '/admin-sandbox', '/administrator']) assert.equal(render(path), null, path);
});

test('live templates retain main and dialog controller IDs while account directory and operation views stay separable', async () => {
  for (const [file, paths, script] of [
    ['admin-accounts.html', ['/admin/users', '/admin/accounts', '/admin/admins', '/admin/billing', '/admin/security'], 'admin-accounts.js'],
    ['admin-operations.html', ['/admin/support', '/admin/content', '/admin/sources', '/admin/events', '/admin/operations'], 'admin-operations.js'],
  ]) {
    const source = load(await readFile(new URL(`../public/${file}`, import.meta.url), 'utf8'));
    const expectedIds = source('main [id], body > dialog, body > dialog [id]').map((_, node) => source(node).attr('id')).get();
    for (const path of paths) {
      const $ = load(render(path));
      assert.equal($(`script[src="/${script}"]`).length, 1, path);
      for (const id of expectedIds) assert.equal($(`[id="${id}"]`).length, 1, `${path} preserves ${id}`);
      assert.equal($('main dialog').length, 0, 'Modal dialogs remain outside the main workspace.');
      if (script === 'admin-accounts.js') {
        for (const id of ['admin-search', 'admin-result-summary', 'admin-previous', 'admin-next', 'admin-export-users', 'admin-results']) assert.equal($(`#connected-directory #${id}`).length, 1);
      } else assert.equal($('#operations-content > section:not([id])').length, 0, 'The legacy catch-all service panel is not mixed into each live area.');
    }
  }
});

test('overview uses the real overview controller and unavailable areas have explanatory status without synthetic controls', () => {
  for (const path of ['/admin', '/admin/reports']) {
    const $ = load(render(path));
    assert.equal($('#admin-overview-content').text(), 'Loading overview…');
    assert.equal($('#overview-status[role="status"]').length, 1);
    assert.equal($('script[src="/admin-overview.js"]').length, 1);
    assert.equal($('link[href="/admin-overview.css"]').length, 1);
  }
  for (const section of CONNECTED_ADMIN_SECTIONS.filter(item => item.availability === 'unavailable')) {
    const $ = load(render(`/admin/${section.id}`));
    assert.equal($('#unavailable-heading').text(), 'Not connected');
    assert.equal($('#admin-main form, #admin-main button, #admin-main table').length, 0, section.id);
    assert.equal($('script').length, 1, 'Only navigation shell logic loads for missing integrations.');
  }
});

test('connected HTTP pages stay behind staff MFA and return no-store HTML through the production route hook', async t => {
  const prior = { VERCEL: process.env.VERCEL, NODE_ENV: process.env.NODE_ENV };
  process.env.VERCEL = '1'; process.env.NODE_ENV = 'test';
  t.after(() => { for (const [key, value] of Object.entries(prior)) if (value === undefined) delete process.env[key]; else process.env[key] = value; });
  const { server } = await import('../server.mjs');
  const app = await fixture(t, { staffMfa: false, server, configureSystem: configureAccountTestRuntime });
  const routes = ['/admin', ...CONNECTED_ADMIN_SECTIONS.map(item => `/admin/${item.id}`), '/admin/accounts', '/admin/operations', '/admin.html', '/admin-accounts.html'];
  for (const route of ['/admin', '/admin/users', '/admin/content', '/admin/sources', '/admin/security']) {
    const anonymous = await app.client().request(route);
    assert.equal(anonymous.status, 302); assert.ok(anonymous.headers.get('location').startsWith('/login?next='));
    assert.equal((await app.customer.client.request(route)).status, 403);
    const noMfa = await app.owner.client.request(route);
    assert.equal(noMfa.status, 302); assert.match(noMfa.headers.get('location'), /ADMIN_MFA_REQUIRED/);
    assert.ok(!anonymous.text.includes('id="admin-main"'));
  }
  await app.mfa(app.owner);
  for (const route of routes) {
    const response = await app.owner.client.request(route);
    assert.equal(response.status, 200, route); assert.equal(response.headers.get('cache-control'), 'no-store', route);
    assert.match(response.headers.get('x-robots-tag'), /noindex/); assert.match(response.headers.get('content-type'), /^text\/html/);
    assert.equal(load(response.text)('#admin-main').length, 1, route);
  }
  const head = await app.owner.client.request('/admin/users', undefined, {}, 'HEAD');
  assert.equal(head.status, 200); assert.equal(head.text, '');
  for (const route of ['/admin/unknown', '/admin/users/delete']) assert.equal((await app.owner.client.request(route)).status, 404);
  assert.equal((await app.owner.client.request('/admin/users', {}, {}, 'POST')).status, 405);
  for (const asset of ['admin-shell.js', 'admin-unified.css', 'admin-overview.js', 'admin-overview.css']) {
    const response = await app.client().request(`/${asset}`);
    assert.equal(response.status, 200, asset); assert.ok(response.text.length > 0);
  }
});

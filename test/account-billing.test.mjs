import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import Stripe from 'stripe';
import { createBilling, migrateBilling } from '../lib/accounts/billing.mjs';
import { PLAN_CATALOG, entitlementsFor, requiredFeature } from '../lib/accounts/entitlements.mjs';

const secret = 'whsec_local_contract_verification';
const sdk = new Stripe('sk_test_contract_adapter');
const clock = () => Math.floor(Date.now() / 1000);
const future = () => new Date(Date.now() + 86_400_000).toISOString();
const env = {
  STRIPE_SECRET_KEY: 'sk_test_contract_adapter', STRIPE_WEBHOOK_SECRET: secret,
  STRIPE_PRICE_PREMIUM_MONTHLY: 'price_premium', STRIPE_PRICE_PREMIUM_PLUS_MONTHLY: 'price_plus',
  STRIPE_PRICE_PRO_MONTHLY: 'price_pro', PUBLIC_SITE_URL: 'http://127.0.0.1:3100',
};

async function fixture(t, options = {}) {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = new Kysely({ dialect: new SqliteDialect({ database: sqlite }) });
  t.after(() => db.destroy());
  await db.schema.createTable('user').addColumn('id', 'text', c => c.primaryKey()).addColumn('name', 'text').addColumn('email', 'text').execute();
  await db.insertInto('user').values([{ id: 'alice', name: 'Alice', email: 'alice@example.test' }, { id: 'bob', name: 'Bob', email: 'bob@example.test' }]).execute();
  await db.schema.createTable('testMail').addColumn('id', 'text', c => c.primaryKey()).addColumn('to', 'text').addColumn('template', 'text').execute();
  await db.schema.createTable('testAudit').addColumn('id', 'integer', c => c.primaryKey().autoIncrement()).addColumn('userId', 'text').addColumn('action', 'text').execute();
  await migrateBilling(db);
  await db.insertInto('billingCustomer').values([{ userId: 'alice', stripeCustomerId: 'cus_alice' }, { userId: 'bob', stripeCustomerId: 'cus_bob' }]).execute();
  const state = {
    subscriptions: [],
    invoice: { id: 'in_current', status: 'paid', customer: 'cus_alice', amount_paid: 7999, post_payment_credit_notes_amount: 0 },
    charge: { id: 'ch_current', customer: 'cus_alice', amount: 7999, amount_refunded: 0, disputed: false },
    sessions: new Map(), calls: [], mailFail: false,
  };
  const stripe = {
    webhooks: sdk.webhooks,
    prices: { retrieve: async id => ({ id, active: true, type: 'recurring', unit_amount: id === 'price_pro' ? 7999 : 1999, currency: 'usd', recurring: { interval: 'month', interval_count: 1, usage_type: 'licensed' } }) },
    subscriptions: { list: async args => { state.calls.push(['subscriptions.list', args]); return { data: state.subscriptions.filter(s => s.customer === args.customer), has_more: false }; } },
    invoices: { retrieve: async id => ({ ...state.invoice, id }) },
    invoicePayments: { list: async () => ({ data: [{ id: 'inpay_current', amount_paid: state.invoice.amount_paid, payment: { type: 'payment_intent', payment_intent: 'pi_current' } }], has_more: false }) },
    paymentIntents: { retrieve: async () => ({ id: 'pi_current', latest_charge: { ...state.charge } }) },
    charges: { retrieve: async () => ({ ...state.charge }) },
    customers: { create: async (body, opts) => { state.calls.push(['customers.create', body, opts]); return { id: `cus_${body.metadata.sportslabUserId}` }; } },
    checkout: { sessions: {
      create: async (body, opts) => { state.calls.push(['checkout.create', body, opts]); const session = { id: `cs_${state.sessions.size + 1}`, url: `https://checkout.stripe.com/c/pay/test-${state.sessions.size + 1}`, status: 'open', metadata: body.metadata, expires_at: clock() + 86400 }; state.sessions.set(session.id, session); return session; },
      retrieve: async id => state.sessions.get(id),
      expire: async id => { state.calls.push(['checkout.expire', id]); state.sessions.get(id).status = 'expired'; },
    } },
    billingPortal: { sessions: { create: async body => { state.calls.push(['portal.create', body]); return { url: 'https://billing.stripe.com/p/session/test' }; } } },
  };
  const billing = createBilling({ db, env: { ...env, ...options.env }, stripe,
    audit: async (event, executor) => executor.insertInto('testAudit').values({ userId: event.userId, action: event.action }).execute(),
    mail: { send: async (event, executor) => { if (state.mailFail) throw new Error('Outbox unavailable'); await executor.insertInto('testMail').values({ id: event.dedupeKey, to: event.to, template: event.template }).execute(); } },
  });
  const subscription = overrides => ({
    id: 'sub_alice', customer: 'cus_alice', status: 'active', cancel_at_period_end: false,
    latest_invoice: 'in_current', trial_end: null,
    items: { data: [{ id: 'si_one', price: { id: 'price_pro' }, current_period_end: clock() + 86400 }], has_more: false },
    ...overrides,
  });
  const send = async (id, type = 'customer.subscription.updated', object = { id: 'sub_alice', customer: 'cus_alice' }, overrides = {}) => {
    const payload = JSON.stringify({ id, type, created: clock(), livemode: false, data: { object }, ...overrides });
    return billing.webhook(Buffer.from(payload), sdk.webhooks.generateTestHeaderString({ payload, secret }));
  };
  return { db, billing, state, stripe, subscription, send };
}

test('approved display names and monthly prices preserve stable billing and authorization IDs', () => {
  assert.deepEqual(Object.keys(PLAN_CATALOG), ['free', 'premium', 'premium_plus', 'pro']);
  assert.deepEqual(['premium', 'premium_plus', 'pro'].map(id => [PLAN_CATALOG[id].id, PLAN_CATALOG[id].name, PLAN_CATALOG[id].previewMonthly]), [
    ['premium', 'Basic', 14.99], ['premium_plus', 'Pro', 24.99], ['pro', 'Premium', 49.99],
  ]);
  assert.ok(PLAN_CATALOG.pro.features.includes('arbitrage'));
  assert.ok(!PLAN_CATALOG.premium.features.includes('arbitrage'));
  assert.ok(!PLAN_CATALOG.premium.features.includes('odds-screen'));
  assert.ok(!PLAN_CATALOG.pro.features.includes('alerts'));
  assert.equal(PLAN_CATALOG.premium_plus.checkoutEnabled, false);
  assert.equal(entitlementsFor({ subscription: { plan: 'premium', status: 'active', currentPeriodEnd: future() } }).plan, 'premium');
  assert.equal(entitlementsFor({ subscription: { plan: 'pro', status: 'active', currentPeriodEnd: future() } }).plan, 'pro');
  assert.equal(entitlementsFor({ grants: [{ plan: 'premium_max', expiresAt: future() }] }).plan, 'free');
});

test('access expires at period/trial boundary and fails closed on unpaid/refunded/unknown plans', () => {
  const now = Date.now();
  const active = { plan: 'pro', status: 'active', currentPeriodEnd: new Date(now + 1000).toISOString(), paymentConfirmed: 1 };
  assert.equal(entitlementsFor({ subscription: active, now }).plan, 'pro');
  for (const override of [
    { status: 'canceled' }, { status: 'past_due' }, { status: 'unpaid' }, { status: 'incomplete' },
    { status: 'paused' }, { refunded: 1 }, { paymentConfirmed: 0 }, { plan: 'founder' },
    { currentPeriodEnd: new Date(now).toISOString() }, { currentPeriodEnd: null },
    { status: 'trialing', trialEnd: new Date(now - 1).toISOString() },
  ]) assert.equal(entitlementsFor({ subscription: { ...active, ...override }, now }).plan, 'free', JSON.stringify(override));
  assert.equal(entitlementsFor({ subscription: { ...active, cancelAtPeriodEnd: 1 }, now }).plan, 'pro');
  assert.equal(entitlementsFor({ subscription: { ...active, status: 'trialing', trialEnd: future() }, now }).source, 'trial');
});

test('only unrevoked finite staff grants confer access; higher plan wins', () => {
  assert.equal(entitlementsFor({ grants: [{ plan: 'pro' }] }).plan, 'free');
  assert.equal(entitlementsFor({ grants: [{ plan: 'pro', expiresAt: future(), revokedAt: future() }] }).plan, 'free');
  assert.equal(entitlementsFor({ grants: [{ plan: 'pro', expiresAt: future() }] }).source, 'manual-grant');
  assert.equal(entitlementsFor({ subscription: { plan: 'premium', status: 'active', currentPeriodEnd: future() }, grants: [{ plan: 'pro', expiresAt: future() }] }).plan, 'pro');
});

test('live data routes, HTML aliases and unknown API routes cannot bypass access using query flags', () => {
  for (const route of ['/api/ev/quotes', '/api/ev/health', '/api/ev/matches', '/api/ev/status']) assert.equal(requiredFeature(route, new URL(`${route}?demo=1&isPremium=1`, 'http://localhost')), 'ev-feed');
  for (const route of ['/ev', '/ev.html', '/ev/dashboard']) assert.equal(requiredFeature(route), 'ev-feed');
  for (const route of ['/api/board', '/api/mlb/board', '/api/sports/board', '/api/nfl/research', '/index.html', '/mlb.html', '/nba/live']) assert.equal(requiredFeature(route), 'research');
  assert.equal(requiredFeature('/api/not-yet-reviewed'), '__deny__');
  assert.equal(requiredFeature('/api/bets/catalog'), 'bet-tracker');
  assert.equal(requiredFeature('/ev', new URL('http://localhost/ev?demo=1')), 'ev-feed', 'no demo bypass');
  assert.equal(requiredFeature('/api/landing/research'), null);
  assert.equal(requiredFeature('/betting-calculators/arbitrage'), null);
});

test('billing without credentials stays unavailable and has no pretend checkout URLs', async t => {
  const { db } = await fixture(t);
  const billing = createBilling({ db, env: { PUBLIC_SITE_URL: 'http://127.0.0.1:3100' } });
  assert.equal((await billing.plans()).configured, false);
  assert.equal((await billing.plans()).plans.filter(p => p.prices.length).length, 0);
  await assert.rejects(billing.checkout({ id: 'alice', emailVerified: true }, { plan: 'pro' }), { status: 503, code: 'BILLING_UNAVAILABLE' });
});

test('real Stripe SDK rejects forged, expired, and wrong-environment webhook signatures', async t => {
  const { billing, send, db } = await fixture(t);
  const payload = JSON.stringify({ id: 'evt_expired', type: 'invoice.paid', created: clock(), livemode: false, data: { object: { customer: 'cus_alice' } } });
  await assert.rejects(billing.webhook(Buffer.from(payload), 't=1,v1=not-a-signature'), { status: 400, code: 'INVALID_WEBHOOK_SIGNATURE' });
  const expired = sdk.webhooks.generateTestHeaderString({ payload, secret, timestamp: clock() - 600 });
  await assert.rejects(billing.webhook(Buffer.from(payload), expired), { code: 'INVALID_WEBHOOK_SIGNATURE' });
  await assert.rejects(send('evt_live', 'invoice.paid', { customer: 'cus_alice' }, { livemode: true }), { code: 'WEBHOOK_ENVIRONMENT_MISMATCH' });
  assert.equal((await db.selectFrom('billingEvent').selectAll().execute()).length, 0);
});

test('verified events grant canonical paid access and duplicates have one audit/outbox effect', async t => {
  const { state, subscription, send, billing, db } = await fixture(t);
  state.subscriptions = [subscription()];
  assert.equal((await billing.summary('alice')).entitlements.plan, 'free');
  assert.deepEqual(await send('evt_paid'), { received: true });
  assert.equal((await billing.summary('alice')).entitlements.plan, 'pro');
  assert.deepEqual(await send('evt_paid'), { received: true, duplicate: true });
  assert.equal((await db.selectFrom('billingEvent').selectAll().execute()).length, 1);
  assert.equal((await db.selectFrom('testMail').selectAll().execute()).length, 1);
  assert.equal((await db.selectFrom('testAudit').selectAll().where('action', '=', 'billing.webhook.processed').execute()).length, 1);
});

test('out-of-order activation payload cannot revive canonical canceled subscription', async t => {
  const { state, subscription, send, billing } = await fixture(t);
  state.subscriptions = [subscription()];
  await send('evt_initial');
  state.subscriptions = [subscription({ status: 'canceled' })];
  await send('evt_cancel', 'customer.subscription.deleted');
  await send('evt_old_activation', 'customer.subscription.created', { customer: 'cus_alice', status: 'active', metadata: { plan: 'pro' } }, { created: clock() - 3600 });
  assert.equal((await billing.summary('alice')).entitlements.plan, 'free');
  assert.equal((await billing.summary('alice')).subscription.status, 'canceled');
});

test('concurrent duplicate deliveries still produce one committed activation', async t => {
  const { state, subscription, send, db } = await fixture(t);
  state.subscriptions = [subscription()];
  const results = await Promise.all([send('evt_concurrent'), send('evt_concurrent')]);
  assert.equal(results.filter(result => result.duplicate).length, 1);
  assert.equal((await db.selectFrom('billingEvent').selectAll().execute()).length, 1);
  assert.equal((await db.selectFrom('testMail').selectAll().execute()).length, 1);
});

test('unmapped customer, metadata and unknown price cannot assign another user paid access', async t => {
  const { state, subscription, send, billing, db } = await fixture(t);
  state.subscriptions = [subscription({ customer: 'cus_other', metadata: { sportslabUserId: 'alice' } })];
  assert.equal((await send('evt_unknown', 'checkout.session.completed', { customer: 'cus_other', client_reference_id: 'alice', metadata: { sportslabUserId: 'alice' } })).ignored, true);
  assert.equal((await db.selectFrom('subscription').selectAll().execute()).length, 0);
  state.subscriptions = [subscription({ items: { data: [{ price: { id: 'price_unconfigured' }, current_period_end: clock() + 86400 }], has_more: false } })];
  await send('evt_unknown_price');
  assert.equal((await billing.summary('alice')).entitlements.plan, 'free');
  assert.equal((await billing.summary('bob')).subscription, null);
});

test('payment failure denies access and a verified paid canonical invoice restores it', async t => {
  const { state, subscription, send, billing } = await fixture(t);
  state.subscriptions = [subscription()];
  await send('evt_paid');
  state.invoice.status = 'open';
  state.subscriptions = [subscription({ status: 'past_due' })];
  await send('evt_fail', 'invoice.payment_failed', { customer: 'cus_alice', id: 'in_current' });
  assert.equal((await billing.summary('alice')).entitlements.plan, 'free');
  state.subscriptions = [subscription()];
  await send('evt_active_but_unpaid');
  assert.equal((await billing.summary('alice')).entitlements.plan, 'free');
  state.invoice.status = 'paid';
  await send('evt_retry_paid', 'invoice.paid', { customer: 'cus_alice', id: 'in_current' });
  assert.equal((await billing.summary('alice')).entitlements.plan, 'pro');
});

test('partial refund preserves access; full current-invoice refund/dispute revokes it', async t => {
  const { state, subscription, send, billing } = await fixture(t);
  state.subscriptions = [subscription()];
  await send('evt_paid');
  state.charge.amount_refunded = 1000;
  await send('evt_partial', 'charge.refunded', { customer: 'cus_alice', id: 'ch_current' });
  assert.equal((await billing.summary('alice')).entitlements.plan, 'pro');
  state.charge.amount_refunded = 7999;
  await send('evt_full', 'refund.updated', { charge: 'ch_current' });
  assert.equal((await billing.summary('alice')).entitlements.plan, 'free');
  await send('evt_old_active', 'customer.subscription.updated', { customer: 'cus_alice', status: 'active' });
  assert.equal((await billing.summary('alice')).entitlements.plan, 'free');
  state.charge.amount_refunded = 0;
  state.invoice.id = 'in_next';
  state.subscriptions = [subscription({ latest_invoice: 'in_next' })];
  await send('evt_next_invoice');
  assert.equal((await billing.summary('alice')).entitlements.plan, 'pro');
  state.charge.disputed = true;
  await send('evt_dispute', 'charge.dispute.created', { charge: 'ch_current' });
  assert.equal((await billing.summary('alice')).entitlements.plan, 'free');
});

test('webhook subscription, audit, event receipt and notification commit atomically', async t => {
  const { state, subscription, send, db, billing } = await fixture(t);
  state.subscriptions = [subscription()];
  state.mailFail = true;
  await assert.rejects(send('evt_retry'), /Outbox unavailable/);
  assert.equal((await db.selectFrom('billingEvent').selectAll().execute()).length, 0);
  assert.equal((await db.selectFrom('testAudit').selectAll().execute()).length, 0);
  assert.equal((await billing.summary('alice')).entitlements.plan, 'free');
  state.mailFail = false;
  await send('evt_retry');
  assert.equal((await billing.summary('alice')).entitlements.plan, 'pro');
  assert.equal((await db.selectFrom('testMail').selectAll().execute()).length, 1);
});

test('checkout requires verification and allowlisted prices, reuses pending session, and never grants access on redirect', async t => {
  const { billing, state } = await fixture(t);
  const user = { id: 'alice', email: 'alice@example.test', emailVerified: true };
  await assert.rejects(billing.checkout({ ...user, emailVerified: false }, { plan: 'pro' }), { code: 'EMAIL_VERIFICATION_REQUIRED' });
  await assert.rejects(billing.checkout(user, { plan: 'founder', priceId: 'price_pro' }), { code: 'PRICE_UNAVAILABLE' });
  const first = await billing.checkout(user, { plan: 'pro', customerId: 'cus_bob', amount: 1, success_url: 'https://attacker.test' });
  assert.deepEqual(await billing.checkout(user, { plan: 'pro' }), first);
  const calls = state.calls.filter(([name]) => name === 'checkout.create');
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].customer, 'cus_alice');
  assert.equal(calls[0][1].success_url, 'http://127.0.0.1:3100/account?billing=processing');
  assert.deepEqual(calls[0][1].line_items, [{ price: 'price_pro', quantity: 1 }]);
  assert.equal((await billing.summary('alice')).entitlements.plan, 'free');
  await billing.checkout(user, { plan: 'premium' });
  assert.equal(state.calls.filter(([name]) => name === 'checkout.expire').length, 1);
});

test('existing canonical subscriptions block duplicate checkout even before webhook arrival', async t => {
  const { billing, state, subscription } = await fixture(t);
  state.subscriptions = [subscription()];
  await assert.rejects(billing.checkout({ id: 'alice', emailVerified: true }, { plan: 'pro' }), { status: 409, code: 'SUBSCRIPTION_EXISTS' });
  assert.equal(state.calls.filter(([name]) => name === 'checkout.create').length, 0);
});

test('renamed Pro retains the premium_plus purchase restriction despite a configured provider price', async t => {
  const { billing, state } = await fixture(t);
  const plans = await billing.plans();
  const plus = plans.plans.find(plan => plan.id === 'premium_plus');
  assert.equal(plus.name, 'Pro');
  assert.equal(plus.previewMonthly, 24.99);
  assert.equal(plus.checkoutEnabled, false);
  assert.match(plus.unavailableReason, /under review/);
  assert.ok(plus.prices.every(price => !price.available));
  await assert.rejects(billing.checkout({ id: 'alice', emailVerified: true }, { plan: 'premium_plus' }), { code: 'PRICE_UNAVAILABLE' });
  assert.equal(state.calls.filter(([name]) => name === 'checkout.create').length, 0);
});

test('display renaming neither changes provider prices nor creates a Premium Max checkout', async t => {
  const { billing, state } = await fixture(t);
  const result = await billing.plans();
  const basic = result.plans.find(plan => plan.id === 'premium');
  const premium = result.plans.find(plan => plan.id === 'pro');
  assert.equal(basic.name, 'Basic'); assert.equal(premium.name, 'Premium');
  assert.equal(premium.previewMonthly, 49.99);
  // This adapter deliberately has a different provider amount; display values
  // must never override an immutable configured Stripe price or charge amount.
  assert.equal(premium.prices.find(price => price.interval === 'monthly').amount, 7999);
  assert.ok(!result.plans.some(plan => ['premium_max', 'basic'].includes(plan.id)));
  await assert.rejects(billing.checkout({ id: 'alice', emailVerified: true }, { plan: 'premium_max' }), { code: 'PRICE_UNAVAILABLE' });
  assert.equal(state.calls.filter(([name]) => name === 'checkout.create').length, 0);
});

test('portal and account summary derive ownership only from the authenticated user', async t => {
  const { billing, state, subscription, send } = await fixture(t);
  state.subscriptions = [subscription()];
  await send('evt_paid');
  await billing.portal({ id: 'bob', stripeCustomerId: 'cus_alice' });
  assert.equal(state.calls.find(([name]) => name === 'portal.create')[1].customer, 'cus_bob');
  assert.equal((await billing.summary('bob')).subscriptions.length, 0);
  assert.equal((await billing.summary('bob')).entitlements.plan, 'free');
});

test('expired/canceled canonical periods lose access without requiring a new webhook', async t => {
  const { db, billing } = await fixture(t);
  await db.insertInto('subscription').values({ id: 'sub_expired', userId: 'alice', stripeCustomerId: 'cus_alice', plan: 'pro', status: 'active', paymentConfirmed: 1, currentPeriodEnd: new Date(Date.now() - 1).toISOString(), updatedAt: new Date().toISOString() }).execute();
  assert.equal((await billing.summary('alice')).entitlements.plan, 'free');
});

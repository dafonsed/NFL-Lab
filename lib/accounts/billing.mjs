import Stripe from 'stripe';
import { sql } from 'kysely';
import { PLAN_CATALOG, entitlementsFor } from './entitlements.mjs';

const BILLING_EVENTS = new Set([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'customer.subscription.paused', 'customer.subscription.resumed', 'customer.subscription.trial_will_end',
  'invoice.paid', 'invoice.payment_succeeded', 'invoice.payment_failed', 'invoice.marked_uncollectible',
  'charge.refunded', 'refund.created', 'refund.updated', 'credit_note.created', 'credit_note.voided',
  'charge.dispute.created', 'charge.dispute.closed',
]);
const iso = seconds => Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
const objectId = value => typeof value === 'string' ? value : value?.id || null;
const error = (message, status = 400, code = 'BILLING_ERROR') => Object.assign(new Error(message), { status, code });

export async function migrateBilling(db) {
  await db.schema.createTable('billingCustomer').ifNotExists()
    .addColumn('userId', 'text', c => c.primaryKey().references('user.id').onDelete('cascade'))
    .addColumn('stripeCustomerId', 'text', c => c.unique())
    .addColumn('checkoutSessionId', 'text')
    .addColumn('checkoutExpiresAt', 'text')
    .addColumn('lockVersion', 'integer', c => c.notNull().defaultTo(0)).execute();
  await db.schema.createTable('subscription').ifNotExists()
    .addColumn('id', 'text', c => c.primaryKey())
    .addColumn('userId', 'text', c => c.notNull().references('user.id').onDelete('cascade'))
    .addColumn('stripeCustomerId', 'text', c => c.notNull())
    .addColumn('priceId', 'text')
    .addColumn('plan', 'text', c => c.notNull())
    .addColumn('status', 'text', c => c.notNull())
    .addColumn('currentPeriodEnd', 'text')
    .addColumn('trialEnd', 'text')
    .addColumn('cancelAtPeriodEnd', 'integer', c => c.notNull().defaultTo(0))
    .addColumn('refunded', 'integer', c => c.notNull().defaultTo(0))
    .addColumn('paymentConfirmed', 'integer', c => c.notNull().defaultTo(0))
    .addColumn('latestInvoiceId', 'text')
    .addColumn('lastEventCreated', 'integer', c => c.notNull().defaultTo(0))
    .addColumn('updatedAt', 'text', c => c.notNull()).execute();
  await db.schema.createIndex('subscription_user_idx').ifNotExists().on('subscription').column('userId').execute();
  await db.schema.createTable('billingEvent').ifNotExists()
    .addColumn('id', 'text', c => c.primaryKey())
    .addColumn('type', 'text', c => c.notNull())
    .addColumn('created', 'integer', c => c.notNull())
    .addColumn('processedAt', 'text', c => c.notNull()).execute();
  await db.schema.createTable('accessGrant').ifNotExists()
    .addColumn('id', 'text', c => c.primaryKey())
    .addColumn('userId', 'text', c => c.notNull().references('user.id').onDelete('cascade'))
    .addColumn('plan', 'text', c => c.notNull())
    .addColumn('reason', 'text', c => c.notNull())
    .addColumn('expiresAt', 'text', c => c.notNull())
    .addColumn('revokedAt', 'text')
    .addColumn('createdAt', 'text', c => c.notNull())
    .addColumn('createdBy', 'text', c => c.references('user.id').onDelete('set null')).execute();
  await db.schema.createIndex('access_grant_user_idx').ifNotExists().on('accessGrant').column('userId').execute();
}

function priceConfiguration(env) {
  const mapping = new Map();
  for (const plan of ['premium', 'premium_plus', 'pro']) {
    for (const interval of ['monthly', 'annual']) {
      const value = env[`STRIPE_PRICE_${plan.toUpperCase()}_${interval.toUpperCase()}`]?.trim();
      if (!value) continue;
      if (!/^price_[A-Za-z0-9]+$/.test(value) || mapping.has(value)) throw error('Billing price configuration requires review.', 503, 'BILLING_CONFIGURATION');
      mapping.set(value, { plan, interval });
    }
  }
  return mapping;
}

function siteOrigin(env) {
  let origin;
  try { origin = new URL(env.AUTH_BASE_URL || env.BETTER_AUTH_URL || env.PUBLIC_SITE_URL || 'http://127.0.0.1:3100'); }
  catch { throw error('Billing URL configuration requires review.', 503); }
  if ((origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname))) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw error('Billing URL configuration requires review.', 503);
  return origin.origin;
}

/** stripe injection is for a local contract test adapter; production always uses the SDK. */
export function createBilling({ db, env = process.env, mail, audit, stripe: providedStripe } = {}) {
  let prices = new Map(), configurationError;
  try { prices = priceConfiguration(env); } catch (failure) { configurationError = failure; }
  const configured = Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET && !configurationError);
  const stripe = providedStripe || (configured ? new Stripe(env.STRIPE_SECRET_KEY, { maxNetworkRetries: 2, timeout: 12_000 }) : null);
  const origin = siteOrigin(env);
  function requireProvider() {
    if (configurationError) throw configurationError;
    if (!configured || !stripe) throw error('Billing is not connected yet. Your account and saved data remain available.', 503, 'BILLING_UNAVAILABLE');
    return stripe;
  }

  async function record(action, userId, detail, trx, actorId = null) {
    if (audit) await audit({ userId, actorId, action, detail }, trx);
  }

  async function validPrice(priceId, configuration) {
    const price = await requireProvider().prices.retrieve(priceId);
    const recurring = price.recurring;
    if (!price.active || price.type !== 'recurring' || !Number.isInteger(price.unit_amount) || price.unit_amount <= 0 || recurring?.interval_count !== 1 || recurring?.interval !== (configuration.interval === 'annual' ? 'year' : 'month') || recurring?.usage_type !== 'licensed') {
      throw error('This plan is not available for checkout. Please choose another plan or contact support.', 503, 'PRICE_UNAVAILABLE');
    }
    return { interval: configuration.interval, amount: price.unit_amount, currency: price.currency, available: true };
  }

  // The public pricing endpoint is hit on every homepage view. Cache it (successes 10 minutes,
  // failures 1 minute) so page traffic cannot run Stripe's API rate limit down.
  let plansCache = null;
  async function plans() {
    if (plansCache && plansCache.expires > Date.now()) return plansCache.value;
    const pending = loadPlans();
    plansCache = { expires: Date.now() + 60_000, value: pending };
    const value = await pending;
    const complete = value.plans.every(plan => !plan.checkoutEnabled || plan.prices.every(price => price.available !== false));
    plansCache = { expires: Date.now() + (complete ? 600_000 : 60_000), value: Promise.resolve(value) };
    return value;
  }
  async function loadPlans() {
    const plans = await Promise.all(Object.values(PLAN_CATALOG).map(async plan => {
      const options = [];
      for (const [id, configuration] of prices) {
        if (configuration.plan !== plan.id) continue;
        if (!plan.checkoutEnabled) { options.push({ interval: configuration.interval, amount: null, currency: null, available: false }); continue; }
        try { options.push(await validPrice(id, configuration)); }
        catch { options.push({ interval: configuration.interval, amount: null, currency: null, available: false }); }
      }
      return { id: plan.id, name: plan.name, features: plan.features, previewMonthly: plan.previewMonthly, checkoutEnabled: plan.checkoutEnabled, unavailableReason: plan.unavailableReason || null, prices: options };
    }));
    return { configured, plans };
  }

  async function summary(userId) {
    const [customer, subscriptions, grants] = await Promise.all([
      db.selectFrom('billingCustomer').selectAll().where('userId', '=', userId).executeTakeFirst(),
      db.selectFrom('subscription').selectAll().where('userId', '=', userId).orderBy('updatedAt', 'desc').execute(),
      db.selectFrom('accessGrant').selectAll().where('userId', '=', userId).execute(),
    ]);
    return { configured, customer: Boolean(customer?.stripeCustomerId), subscription: subscriptions[0] || null, subscriptions, grants, entitlements: entitlementsFor({ subscriptions, grants }) };
  }

  async function lockCustomer(trx, userId) {
    await trx.updateTable('billingCustomer').set({ lockVersion: sql`"lockVersion" + 1` }).where('userId', '=', userId).execute();
    return trx.selectFrom('billingCustomer').selectAll().where('userId', '=', userId).executeTakeFirstOrThrow();
  }

  async function subscriptionList(customerId) {
    const all = [];
    let after;
    do {
      const page = await requireProvider().subscriptions.list({ customer: customerId, status: 'all', limit: 100, ...(after ? { starting_after: after } : {}) });
      all.push(...page.data);
      after = page.has_more && page.data.length ? page.data.at(-1).id : null;
    } while (after);
    return all;
  }

  async function checkout(user, body = {}) {
    requireProvider();
    if (!user?.id || !user.emailVerified) throw error('Verify your email before starting checkout.', 403, 'EMAIL_VERIFICATION_REQUIRED');
    if (!PLAN_CATALOG[body.plan]?.checkoutEnabled) throw error(PLAN_CATALOG[body.plan]?.unavailableReason || 'This plan is not available for checkout.', 400, 'PRICE_UNAVAILABLE');
    const interval = body.interval || 'monthly';
    const configuredPrice = [...prices].find(([, item]) => item.plan === body.plan && item.interval === interval);
    if (!configuredPrice) throw error('This plan is not available for checkout.', 400, 'PRICE_UNAVAILABLE');
    const [priceId, configuration] = configuredPrice;
    await validPrice(priceId, configuration);
    return db.transaction().execute(async trx => {
      await trx.insertInto('billingCustomer').values({ userId: user.id, lockVersion: 0 }).onConflict(c => c.column('userId').doNothing()).execute();
      const customer = await lockCustomer(trx, user.id);
      if (!customer.stripeCustomerId) {
        const created = await stripe.customers.create({ email: user.email, metadata: { sportslabUserId: user.id } }, { idempotencyKey: `sportslab-customer-${user.id}` });
        customer.stripeCustomerId = created.id;
        await trx.updateTable('billingCustomer').set({ stripeCustomerId: created.id }).where('userId', '=', user.id).execute();
      }
      const subscriptions = await subscriptionList(customer.stripeCustomerId);
      if (subscriptions.some(sub => !['canceled', 'incomplete_expired'].includes(sub.status))) throw error('You already have a subscription. Use Manage billing to change your plan or payment method.', 409, 'SUBSCRIPTION_EXISTS');
      if (customer.checkoutSessionId) {
        const pending = await stripe.checkout.sessions.retrieve(customer.checkoutSessionId);
        if (pending.status === 'open' && pending.metadata?.plan === body.plan && pending.metadata?.interval === interval) return { url: pending.url };
        if (pending.status === 'open') await stripe.checkout.sessions.expire(pending.id);
      }
      const session = await stripe.checkout.sessions.create({
        customer: customer.stripeCustomerId, client_reference_id: user.id,
        mode: 'subscription', payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/account?billing=processing`, cancel_url: `${origin}/account?billing=canceled`,
        metadata: { plan: body.plan, interval, sportslabUserId: user.id },
        subscription_data: { metadata: { sportslabUserId: user.id } },
      }, { idempotencyKey: `sportslab-checkout-${user.id}-${customer.lockVersion}` });
      if (!session.url) throw error('Checkout could not be opened. Please try again.', 503);
      await trx.updateTable('billingCustomer').set({ checkoutSessionId: session.id, checkoutExpiresAt: iso(session.expires_at) }).where('userId', '=', user.id).execute();
      await record('billing.checkout.created', user.id, { plan: body.plan, interval }, trx, user.id);
      return { url: session.url };
    });
  }

  async function portal(user) {
    requireProvider();
    if (!user?.id) throw error('Sign in to manage billing.', 401);
    const customer = await db.selectFrom('billingCustomer').select('stripeCustomerId').where('userId', '=', user.id).executeTakeFirst();
    if (!customer?.stripeCustomerId) throw error('There is no billing account to manage yet.', 409, 'NO_BILLING_ACCOUNT');
    const session = await stripe.billingPortal.sessions.create({ customer: customer.stripeCustomerId, return_url: `${origin}/account` });
    await record('billing.portal.opened', user.id, {}, db, user.id);
    return { url: session.url };
  }

  async function invoiceState(invoiceId) {
    if (!invoiceId) return { paid: false, refunded: false, disputed: false };
    const invoice = await stripe.invoices.retrieve(invoiceId);
    let refunded = 0, disputed = false, after;
    // Current Stripe versions expose payments on InvoicePayment, not invoice.charge.
    do {
      const page = await stripe.invoicePayments.list({ invoice: invoiceId, status: 'paid', limit: 100, ...(after ? { starting_after: after } : {}) });
      for (const item of page.data) {
        let charge;
        if (item.payment?.type === 'payment_intent') {
          const intent = await stripe.paymentIntents.retrieve(objectId(item.payment.payment_intent), { expand: ['latest_charge'] });
          charge = intent.latest_charge;
        } else if (item.payment?.type === 'charge') charge = item.payment.charge;
        if (typeof charge === 'string') charge = await stripe.charges.retrieve(charge);
        if (charge) {
          refunded += Math.min(Number(item.amount_paid) || 0, Number(charge.amount_refunded) || 0);
          disputed ||= Boolean(charge.disputed);
        }
      }
      after = page.has_more && page.data.length ? page.data.at(-1).id : null;
    } while (after);
    // A full credit note has the same access outcome as a full refund. Partial
    // refunds preserve service; a successful new billing period restores service.
    return { paid: invoice.status === 'paid', refunded: invoice.amount_paid > 0 && Math.max(refunded, invoice.post_payment_credit_notes_amount || 0) >= invoice.amount_paid, disputed };
  }

  async function customerForEvent(event) {
    const object = event.data.object;
    if (object.customer) return objectId(object.customer);
    if (object.charge) return objectId((await stripe.charges.retrieve(objectId(object.charge))).customer);
    if (object.invoice) return objectId((await stripe.invoices.retrieve(objectId(object.invoice))).customer);
    return null;
  }

  async function syncSubscription(sub, customer, event, trx) {
    // An unrecognised price or multi-item subscription cannot accidentally become Pro.
    const item = sub.items?.data?.length === 1 && !sub.items.has_more ? sub.items.data[0] : null;
    const priceId = objectId(item?.price);
    const mapped = prices.get(priceId);
    const invoiceId = objectId(sub.latest_invoice);
    const payment = sub.status === 'trialing' ? { paid: true, refunded: false, disputed: false } : await invoiceState(invoiceId);
    const existing = await trx.selectFrom('subscription').selectAll().where('id', '=', sub.id).executeTakeFirst();
    if (existing && existing.userId !== customer.userId) throw error('Subscription ownership requires review.', 409);
    const row = {
      id: sub.id, userId: customer.userId, stripeCustomerId: customer.stripeCustomerId,
      priceId, plan: mapped?.plan || 'free', status: sub.status,
      currentPeriodEnd: iso(item?.current_period_end ?? sub.current_period_end), trialEnd: iso(sub.trial_end),
      cancelAtPeriodEnd: Number(Boolean(sub.cancel_at_period_end)),
      refunded: Number(payment.refunded || payment.disputed), paymentConfirmed: Number(payment.paid),
      latestInvoiceId: invoiceId, lastEventCreated: Math.max(existing?.lastEventCreated || 0, event.created), updatedAt: new Date().toISOString(),
    };
    await trx.insertInto('subscription').values(row).onConflict(c => c.column('id').doUpdateSet(row)).execute();
    const changed = !existing || ['plan', 'status', 'currentPeriodEnd', 'trialEnd', 'cancelAtPeriodEnd', 'refunded', 'paymentConfirmed'].some(key => existing[key] !== row[key]);
    if (changed) await record('billing.subscription.synced', customer.userId, { subscriptionId: sub.id, plan: row.plan, status: row.status, refunded: Boolean(row.refunded), paymentConfirmed: Boolean(row.paymentConfirmed), eventType: event.type }, trx);
    const beforeAccess = entitlementsFor({ subscription: existing });
    const afterAccess = entitlementsFor({ subscription: row });
    let template;
    if (event.type === 'customer.subscription.trial_will_end' && row.status === 'trialing' && Date.parse(row.trialEnd) > Date.now()) template = 'trial-ending';
    else if (changed && existing?.status === 'trialing' && !['active', 'trialing'].includes(row.status)) template = 'trial-expired';
    else if (changed && row.status === 'trialing' && existing?.status !== 'trialing') template = 'trial-started';
    else if (changed && (['past_due', 'unpaid'].includes(row.status) || !row.paymentConfirmed && row.status === 'active')) template = 'payment-failed';
    else if (changed && (row.status === 'canceled' || row.cancelAtPeriodEnd && !existing?.cancelAtPeriodEnd || beforeAccess.plan !== 'free' && afterAccess.plan === 'free')) template = 'subscription-canceled';
    else if (changed && afterAccess.plan !== 'free') template = beforeAccess.plan === 'free' ? 'subscription-activated' : 'subscription-changed';
    if (template && mail?.send) {
      const user = await trx.selectFrom('user').select(['email', 'name']).where('id', '=', customer.userId).executeTakeFirst();
      if (user) await mail.send({ to: user.email, template, data: { name: user.name, plan: PLAN_CATALOG[row.plan].name, status: row.status, expiresAt: afterAccess.expiresAt || row.currentPeriodEnd, date: afterAccess.expiresAt || row.currentPeriodEnd, url: `${origin}/account` }, dedupeKey: `stripe-${event.id}-${sub.id}-${template}` }, trx);
    }
  }

  async function webhook(rawBody, signature) {
    requireProvider();
    let event;
    try { event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET, 300); }
    catch { throw error('Invalid billing webhook signature.', 400, 'INVALID_WEBHOOK_SIGNATURE'); }
    const expectedLive = /^(?:sk|rk)_live_/.test(env.STRIPE_SECRET_KEY);
    if (Boolean(event.livemode) !== expectedLive) throw error('Billing webhook environment mismatch.', 400, 'WEBHOOK_ENVIRONMENT_MISMATCH');
    if (!BILLING_EVENTS.has(event.type)) return { received: true, ignored: true };
    if (await db.selectFrom('billingEvent').select('id').where('id', '=', event.id).executeTakeFirst()) return { received: true, duplicate: true };
    const customerId = await customerForEvent(event);
    return db.transaction().execute(async trx => {
      const inserted = await trx.insertInto('billingEvent').values({ id: event.id, type: event.type, created: event.created, processedAt: new Date().toISOString() }).onConflict(c => c.column('id').doNothing()).executeTakeFirst();
      if (!Number(inserted.numInsertedOrUpdatedRows)) return { received: true, duplicate: true };
      const mapped = customerId && await trx.selectFrom('billingCustomer').selectAll().where('stripeCustomerId', '=', customerId).executeTakeFirst();
      // Never attach Stripe records to users by email, browser metadata or an
      // unrecognised customer. The server-created ownership mapping is authoritative.
      if (!mapped) return { received: true, ignored: true };
      const customer = await lockCustomer(trx, mapped.userId);
      // Lock first, then retrieve canonical state. Event payload order/timestamps
      // cannot revive old access, even across concurrent serverless workers.
      const subscriptions = await subscriptionList(customerId);
      for (const sub of subscriptions) await syncSubscription(sub, customer, event, trx);
      const currentIds = subscriptions.map(sub => sub.id);
      let missing = trx.selectFrom('subscription').selectAll().where('userId', '=', mapped.userId);
      if (currentIds.length) missing = missing.where('id', 'not in', currentIds);
      for (const old of await missing.execute()) {
        await trx.updateTable('subscription').set({ status: 'canceled', paymentConfirmed: 0, updatedAt: new Date().toISOString() }).where('id', '=', old.id).execute();
        await record('billing.subscription.removed', mapped.userId, { subscriptionId: old.id, eventType: event.type }, trx);
      }
      await record('billing.webhook.processed', mapped.userId, { eventId: event.id, eventType: event.type }, trx);
      return { received: true };
    });
  }

  return { plans, summary, checkout, portal, webhook };
}

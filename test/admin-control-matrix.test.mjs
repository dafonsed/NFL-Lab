import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { ADMIN_SECTIONS, ADMIN_ROLES, createAdminSeed } from '../public/admin-catalog.js';
import { ADMIN_STORAGE_KEY, createAdminStore } from '../public/admin-store.js';

// These are the agreed sandbox persona boundaries, independent of store.can().
// They model local workflow access, not authentication or real account identities.
const ACCESS = {
  Owner: { view: '*', write: '*', review: true },
  Developer: { view: '*', write: ['sources', 'events', 'quality', 'ev', 'arbitrage', 'fantasy', 'grading', 'clv', 'wallets', 'lineups', 'notifications', 'system', 'security', 'admins', 'links', 'content'], review: true },
  'Data Operator': { view: ['overview', 'reports', 'sources', 'events', 'quality', 'ev', 'arbitrage', 'fantasy', 'grading', 'clv', 'wallets', 'lineups', 'notifications', 'system', 'links'], write: ['sources', 'events', 'quality', 'ev', 'arbitrage', 'fantasy', 'grading', 'clv', 'wallets', 'lineups', 'notifications'], review: false },
  Support: { view: ['overview', 'reports', 'users', 'support', 'grading', 'notifications', 'billing', 'quality', 'events'], write: ['users', 'support', 'grading'], review: false },
  'Content Editor': { view: ['overview', 'reports', 'content', 'links'], write: ['content', 'links'], review: false },
};
const SENSITIVE_AREAS = new Set(['billing', 'admins', 'security', 'ev', 'arbitrage', 'fantasy', 'clv']);
const recordSections = ADMIN_SECTIONS.filter(section => section.fields.length);
const timestamp = '2026-09-28T18:00:00.000Z';
const checks = [];
const expectedAccess = (role, kind, section) => ACCESS[role][kind] === '*' || ACCESS[role][kind].includes(section);

function memoryStorage(raw) {
  return {
    raw, writes: 0,
    getItem(key) { assert.equal(key, ADMIN_STORAGE_KEY); return this.raw; },
    setItem(key, value) { assert.equal(key, ADMIN_STORAGE_KEY); this.raw = value; this.writes += 1; },
  };
}
function fixture(role = 'Owner', adjust) {
  const records = createAdminSeed().records;
  adjust?.(records);
  const storage = memoryStorage(JSON.stringify({ version: 1, revision: 0, role, records, audit: [], approvals: [], updatedAt: timestamp }));
  return { store: createAdminStore({ storage, now: () => timestamp }), storage };
}
function reloadMatches(store, storage) {
  assert.deepEqual(createAdminStore({ storage, now: () => timestamp }).getState(), store.getState(), 'Reload must retain the exact local records, approval state, persona, and audit.');
}
function unchanged(store, storage, before, raw) {
  assert.deepEqual(store.getState(), before, 'Denied or invalid actions must not alter memory.');
  assert.equal(storage.raw, raw, 'Denied or invalid actions must not alter persistence.');
}
function recordValues(section, record) {
  return Object.fromEntries(section.fields.map(field => [field.key, field.key === 'name' ? `${record.name} · matrix copy` : record[field.key] ?? '']));
}
function actionRecord(store, section, action) {
  const candidates = store.getState().records[section.id].filter(record => Object.entries(action?.appliesTo || {}).every(([key, allowed]) => allowed.includes(record[key])));
  return candidates.find(record => action?.requestOnly || record.status !== action?.targetStatus) || candidates[0];
}
function check(meta, run) {
  test(`${meta.kind}: ${meta.role || 'Owner'} / ${meta.section || 'workspace'} / ${meta.control}`, () => {
    try { checks.push({ ...meta, ...run(), result: 'passed', externalEffect: 'None; browser-local sandbox only' }); }
    catch (error) { checks.push({ ...meta, result: 'failed', error: error.message, externalEffect: 'Not assessed' }); throw error; }
  });
}
function assertAudit(store, role, section, action, before, after, reason) {
  const entry = store.getState().audit[0];
  assert.equal(entry.actor, role);
  assert.equal(entry.section, section);
  assert.equal(entry.action, action);
  assert.equal(entry.reason, reason);
  assert.deepEqual(entry.before, before);
  assert.deepEqual(entry.after, after);
}

function exerciseMutation(role, section, control) {
  const { store, storage } = fixture(role);
  const action = section.actions.find(item => item.id === control);
  const target = actionRecord(store, section, action);
  assert.ok(target, 'Every editable area must have a fixture to exercise.');
  if (action) assert.notEqual(target.status, action.targetStatus, 'Use a fixture whose status actually changes, rather than counting an already-completed action as functional.');
  const creating = control === 'create';
  const values = creating ? recordValues(section, target) : control === 'edit' ? { name: `${target.name} · reviewed` } : {};
  const input = { section: section.id, id: target.id, action: control, values, reason: `Matrix verification for ${role}: ${control}.` };
  const before = store.getState();
  const raw = storage.raw;
  const allowed = expectedAccess(role, 'write', section.id);
  assert.equal(store.can(section.id, control), allowed, 'Rendered permission indication must agree with the required persona contract.');
  if (action) assert.equal(store.canForRecord(section.id, target.id, control), allowed);
  const run = () => creating ? store.create(input) : store.perform(input);
  if (!allowed) {
    assert.throws(run, /sandbox persona cannot/);
    unchanged(store, storage, before, raw);
    return { localOutcome: 'denied', permission: 'denied' };
  }
  const beforeRecord = creating ? null : target;
  const result = run();
  const effect = !action ? {} : action.requestOnly ? { requestStatus: action.targetStatus, lastRequestAction: action.id } : { status: action.targetStatus };
  const expectedRecord = creating ? { id: result.record?.id || result.approval.recordId, ...values } : { ...target, ...values, ...effect };
  const sensitiveStatus = creating && section.actions.some(item => item.sensitive && item.targetStatus === values.status);
  const expectedPending = SENSITIVE_AREAS.has(section.id) || action?.sensitive || sensitiveStatus || (section.id === 'grading' && role === 'Support');
  assert.equal(result.outcome, expectedPending ? 'pending' : action?.requestOnly ? 'requested' : 'applied');
  assert.equal(store.requiresApproval(input), Boolean(expectedPending));
  assertAudit(store, role, section.id, expectedPending ? `request:${control}` : control, beforeRecord, expectedRecord, input.reason);
  reloadMatches(store, storage);
  if (!expectedPending) {
    assert.deepEqual(result.record, expectedRecord);
    assert.deepEqual(store.getState().records[section.id].find(record => record.id === expectedRecord.id), expectedRecord);
    assert.equal(store.getState().records[section.id].length, before.records[section.id].length + Number(creating));
    return { localOutcome: action?.requestOnly ? 'request_recorded' : 'applied', permission: 'allowed', finalStatus: expectedRecord.status, requestStatus: expectedRecord.requestStatus, auditVerified: true, persistenceVerified: true };
  }
  assert.deepEqual(store.getState().records, before.records, 'Pending requests must not change any target record.');
  assert.equal(result.approval.requestedBy, role);
  assert.equal(result.approval.status, 'Pending');
  const pendingRaw = storage.raw;
  const reviewer = role === 'Owner' ? 'Developer' : 'Owner';
  store.setRole(reviewer);
  const approved = store.reviewApproval(result.approval.id, 'approve', 'Matrix reviewer accepted this local change.');
  assert.deepEqual(approved.record, expectedRecord);
  assert.equal(approved.approval.reviewedBy, reviewer);
  assert.equal(approved.approval.status, 'Approved');
  assert.equal(approved.outcome, action?.requestOnly ? 'requested' : 'applied');
  assertAudit(store, reviewer, section.id, `approve:${control}`, beforeRecord, expectedRecord, 'Matrix reviewer accepted this local change.');
  reloadMatches(store, storage);
  const rejectedStorage = memoryStorage(pendingRaw);
  const rejectingStore = createAdminStore({ storage: rejectedStorage, now: () => timestamp });
  rejectingStore.setRole(reviewer);
  const rejected = rejectingStore.reviewApproval(result.approval.id, 'reject', 'Matrix reviewer rejected this local change.');
  assert.equal(rejected.approval.status, 'Rejected');
  assert.equal(rejected.approval.reviewedBy, reviewer);
  assert.deepEqual(rejectingStore.getState().records, before.records, 'Rejected requests must retain the original records.');
  assert.equal(rejectingStore.getState().audit[0].action, `reject:${control}`);
  reloadMatches(rejectingStore, rejectedStorage);
  return { localOutcome: 'pending_then_approved_and_rejected_on_separate_copies', permission: 'allowed', finalStatus: expectedRecord.status, approvalVerified: true, rejectionVerified: true, auditVerified: true, persistenceVerified: true };
}

for (const role of ADMIN_ROLES) {
  for (const section of ADMIN_SECTIONS) {
    check({ kind: 'visibility', role, section: section.id, control: 'view-and-approve-affordance' }, () => {
      const { store, storage } = fixture(role);
      assert.equal(store.can(section.id), expectedAccess(role, 'view', section.id));
      assert.equal(store.can(section.id, 'approve'), ACCESS[role].review);
      assert.equal(store.can(section.id, 'invented-operation'), false);
      assert.equal(storage.writes, 0);
      return { viewAllowed: expectedAccess(role, 'view', section.id), reviewerAllowed: ACCESS[role].review, localOutcome: 'read_only_permission_check' };
    });
    check({ kind: 'export', role, section: section.id, control: 'csv' }, () => {
      const { store, storage } = fixture(role);
      const before = store.getState(), raw = storage.raw;
      if (!expectedAccess(role, 'view', section.id)) assert.throws(() => store.exportCsv(section.id), /cannot export/);
      else {
        const csv = store.exportCsv(section.id);
        const records = before.records[section.id];
        assert.ok(csv.startsWith('"'));
        for (const record of records) assert.ok(csv.includes(record.name.replaceAll('"', '""')), `The export must contain ${record.id}.`);
      }
      unchanged(store, storage, before, raw);
      return { localOutcome: expectedAccess(role, 'view', section.id) ? 'csv_generated' : 'denied' };
    });
  }
  for (const section of recordSections) {
    for (const control of ['create', 'edit', ...section.actions.map(action => action.id)]) {
      check({ kind: ['create', 'edit'].includes(control) ? control : 'catalog_action', role, section: section.id, control }, () => exerciseMutation(role, section, control));
    }
  }
  check({ kind: 'reset', role, control: 'explicit-reset' }, () => {
    const { store, storage } = fixture('Owner');
    const source = store.getState().records.sources[0];
    store.perform({ section: 'sources', id: source.id, action: 'edit', values: { name: 'Changed matrix source' }, reason: 'Prepare reset with a real saved local edit.' });
    store.setRole(role);
    const reset = store.reset();
    assert.deepEqual(reset.records, createAdminSeed().records);
    assert.deepEqual(reset.audit, []);
    assert.deepEqual(reset.approvals, []);
    assert.equal(reset.role, 'Owner');
    reloadMatches(store, storage);
    return { localOutcome: 'local_sample_data_reset', persistenceVerified: true };
  });
}

// Review both decisions under every persona for every area that can naturally
// produce a sensitive request. Owner requests also prove self-review rejection.
for (const section of recordSections) {
  const sensitiveAction = section.actions.find(action => action.sensitive);
  if (!sensitiveAction && !SENSITIVE_AREAS.has(section.id)) continue;
  for (const role of ADMIN_ROLES) for (const decision of ['approve', 'reject']) {
    check({ kind: 'review_boundary', role, section: section.id, control: decision }, () => {
      const { store, storage } = fixture('Owner');
      const target = actionRecord(store, section, sensitiveAction);
      const result = store.perform({ section: section.id, id: target.id, action: sensitiveAction?.id || 'edit', values: sensitiveAction ? {} : { name: `${target.name} · pending` }, reason: 'Create a request to verify reviewer boundaries.' });
      assert.equal(result.outcome, 'pending');
      store.setRole(role);
      const before = store.getState(), raw = storage.raw;
      if (role !== 'Developer') {
        assert.throws(() => store.reviewApproval(result.approval.id, decision, 'Test review authority on a sample request.'), role === 'Owner' ? /cannot review your own/ : /cannot approve/);
        unchanged(store, storage, before, raw);
        return { localOutcome: role === 'Owner' ? 'self_review_denied' : 'review_denied' };
      }
      const reviewed = store.reviewApproval(result.approval.id, decision, 'Test review authority on a sample request.');
      assert.equal(reviewed.approval.status, decision === 'approve' ? 'Approved' : 'Rejected');
      reloadMatches(store, storage);
      return { localOutcome: decision === 'approve' ? 'approved' : 'rejected', persistenceVerified: true };
    });
  }
}

for (const section of recordSections) {
  for (const field of section.fields) {
    const invalid = [];
    if (field.required) invalid.push(['required', '']);
    if (field.type === 'select') invalid.push(['invalid-choice', '__not_a_catalog_option__']);
    else if (field.type === 'number' || field.type === 'integer') {
      invalid.push(['not-a-number', 'NaN']);
      if (field.type === 'integer') invalid.push(['fractional-count', Number(field.min || 0) + 0.5]);
      if (field.min !== undefined) invalid.push(['below-minimum', Number(field.min) - 1]);
      if (field.max !== undefined) invalid.push(['above-maximum', Number(field.max) + 1]);
    } else if (field.type === 'date') invalid.push(['invalid-calendar-date', '2026-02-30']);
    else if (field.type === 'email') invalid.push(['invalid-email', 'not an email']);
    else if (field.type === 'url') invalid.push(['invalid-url', 'not a URL'], ['unsafe-url-scheme', 'javascript:alert(1)']);
    else invalid.push(['wrong-type', { text: 'Objects must not masquerade as text.' }]);
    for (const [boundary, value] of invalid) {
      check({ kind: 'field_validation', section: section.id, control: `${field.key}:${boundary}` }, () => {
        const { store, storage } = fixture();
        const before = store.getState(), raw = storage.raw;
        assert.throws(() => store.perform({ section: section.id, id: before.records[section.id][0].id, action: 'edit', values: { [field.key]: value }, reason: 'Attempt an invalid field value.' }));
        unchanged(store, storage, before, raw);
        return { localOutcome: 'invalid_input_rejected' };
      });
    }
  }
  check({ kind: 'field_validation', section: section.id, control: 'unknown-field' }, () => {
    const { store, storage } = fixture();
    const before = store.getState(), raw = storage.raw;
    assert.throws(() => store.perform({ section: section.id, id: before.records[section.id][0].id, action: 'edit', values: { unknownSetting: 'not permitted' }, reason: 'Attempt a field outside the catalog.' }), /cannot be changed/);
    unchanged(store, storage, before, raw);
    return { localOutcome: 'unknown_field_rejected' };
  });
}

for (const section of recordSections) for (const action of section.actions) {
  if (action.appliesTo) check({ kind: 'record_applicability', section: section.id, control: action.id }, () => {
    const { store, storage } = fixture();
    const record = store.getState().records[section.id].find(item => Object.entries(action.appliesTo).some(([key, allowed]) => !allowed.includes(item[key])));
    if (!record) return { localOutcome: 'all_fixture_types_supported' };
    const before = store.getState(), raw = storage.raw;
    assert.equal(store.canForRecord(section.id, record.id, action.id), false);
    assert.throws(() => store.perform({ section: section.id, id: record.id, action: action.id, reason: 'Attempt an operation on the wrong record type.' }), /does not apply/);
    unchanged(store, storage, before, raw);
    return { localOutcome: 'inapplicable_action_denied' };
  });
  if (!action.requestOnly) check({ kind: 'no_op_control', section: section.id, control: action.id }, () => {
    const { store, storage } = fixture('Owner', records => {
      const record = records[section.id].find(item => Object.entries(action.appliesTo || {}).every(([key, allowed]) => allowed.includes(item[key])));
      assert.ok(record);
      record.status = action.targetStatus;
    });
    const record = store.getState().records[section.id].find(item => item.status === action.targetStatus && Object.entries(action.appliesTo || {}).every(([key, allowed]) => allowed.includes(item[key])));
    const before = store.getState(), raw = storage.raw;
    assert.equal(store.canForRecord(section.id, record.id, action.id), false);
    assert.throws(() => store.perform({ section: section.id, id: record.id, action: action.id, reason: 'An already completed state must not look actionable.' }), /does not apply/);
    unchanged(store, storage, before, raw);
    return { localOutcome: 'already_at_target_action_denied' };
  });
}

check({ kind: 'lifecycle_regression', section: 'users', control: 'export-keeps-account-active' }, () => {
  const { store, storage } = fixture();
  const beforeActive = store.getState().records.users.filter(record => record.status === 'Active').length;
  const user = store.getState().records.users.find(record => record.status === 'Active');
  const result = store.perform({ section: 'users', id: user.id, action: 'export', reason: 'Record a sample account export request.' });
  assert.equal(result.outcome, 'requested');
  assert.equal(result.record.status, 'Active');
  assert.equal(result.record.requestStatus, 'Export requested');
  assert.equal(result.record.lastRequestAction, 'export');
  assert.equal(store.getState().records.users.filter(record => record.status === 'Active').length, beforeActive);
  reloadMatches(store, storage);
  return { localOutcome: 'export_request_recorded_account_lifecycle_unchanged' };
});
check({ kind: 'lifecycle_regression', section: 'support', control: 'notify-keeps-ticket-resolved' }, () => {
  const { store, storage } = fixture();
  const ticket = store.getState().records.support.find(record => record.status === 'Resolved');
  const openBefore = store.getState().records.support.filter(record => record.status !== 'Resolved').length;
  const result = store.perform({ section: 'support', id: ticket.id, action: 'notify', reason: 'Record a resolution notification request.' });
  assert.equal(result.outcome, 'requested');
  assert.equal(result.record.status, 'Resolved');
  assert.equal(result.record.requestStatus, 'Notification requested');
  assert.equal(store.getState().records.support.filter(record => record.status !== 'Resolved').length, openBefore);
  reloadMatches(store, storage);
  return { localOutcome: 'notification_request_recorded_ticket_lifecycle_unchanged' };
});
check({ kind: 'review_applicability', section: 'billing', control: 'reject-obsolete-record-type-request' }, () => {
  const { store, storage } = fixture();
  const subscription = store.getState().records.billing.find(record => record.kind === 'Subscription');
  const pending = store.perform({ section: 'billing', id: subscription.id, action: 'credit', reason: 'Prepare a legitimate subscription credit request.' });
  const saved = JSON.parse(storage.raw);
  // Simulate a previously stored request whose action is incompatible with the
  // current action policy, without changing the target record fingerprint.
  saved.approvals.find(approval => approval.id === pending.approval.id).action = 'payout';
  saved.role = 'Developer';
  const reviewedStorage = memoryStorage(JSON.stringify(saved));
  const reviewedStore = createAdminStore({ storage: reviewedStorage });
  const before = reviewedStore.getState(), raw = reviewedStorage.raw;
  assert.throws(() => reviewedStore.reviewApproval(pending.approval.id, 'approve', 'Recheck the action policy at approval time.'), /does not apply/);
  unchanged(reviewedStore, reviewedStorage, before, raw);
  return { localOutcome: 'inapplicable_approval_denied' };
});
for (const [section, values] of [
  ['content', { publishDate: '2026-12-01', expires: '2026-01-01' }],
  ['wallets', { backtestStart: '2027-01-01', forwardStart: '2026-01-01' }],
]) check({ kind: 'date_ordering', section, control: 'create-and-partial-edit' }, () => {
  const { store, storage } = fixture();
  const record = store.getState().records[section][0];
  const before = store.getState(), raw = storage.raw;
  assert.throws(() => store.create({ section, values: { ...recordValues(ADMIN_SECTIONS.find(item => item.id === section), record), ...values }, reason: 'Reject contradictory scheduling dates.' }), /must be on or after/);
  unchanged(store, storage, before, raw);
  const endField = section === 'content' ? 'expires' : 'forwardStart';
  assert.throws(() => store.perform({ section, id: record.id, action: 'edit', values: { [endField]: '1900-01-01' }, reason: 'Validate a partial date edit against existing dates.' }), /must be on or after/);
  unchanged(store, storage, before, raw);
  return { localOutcome: 'contradictory_dates_rejected' };
});
check({ kind: 'filtered_export', section: 'users', control: 'validated-ids-and-specified-order' }, () => {
  const { store, storage } = fixture();
  const users = store.getState().records.users;
  const ids = [users[2].id, users[0].id];
  const before = store.getState(), raw = storage.raw;
  const lines = store.exportCsv('users', { ids }).split('\r\n');
  assert.equal(lines.length, 3);
  assert.ok(lines[1].includes(users[2].name));
  assert.ok(lines[2].includes(users[0].name));
  assert.ok(!lines.join('\n').includes(users[1].name));
  assert.equal(store.exportCsv('users', { ids: [] }).split('\r\n').length, 1);
  for (const invalidIds of [[users[0].id, users[0].id], ['unknown-user'], [42], 'not-an-array']) assert.throws(() => store.exportCsv('users', { ids: invalidIds }), /valid ordered list|no longer exist/);
  unchanged(store, storage, before, raw);
  return { localOutcome: 'filtered_ordered_csv_generated_and_invalid_ids_rejected' };
});
check({ kind: 'legacy_storage', section: 'users', control: 'old-request-lifecycle-never-silently-reinterpreted' }, () => {
  const records = createAdminSeed().records;
  records.users[0].status = 'Export requested';
  const storage = memoryStorage(JSON.stringify({ version: 1, revision: 0, role: 'Owner', records, audit: [], approvals: [], updatedAt: timestamp }));
  const raw = storage.raw;
  const store = createAdminStore({ storage });
  assert.match(store.getState().storageError, /older or unsupported workflow status/);
  assert.equal(storage.raw, raw);
  assert.equal(storage.writes, 0);
  assert.equal(store.can('users', 'edit'), false);
  assert.throws(() => store.setRole('Support'), /older or unsupported workflow status/);
  return { localOutcome: 'legacy_state_preserved_read_only_until_explicit_reset' };
});

after(async () => {
  if (process.env.ADMIN_MATRIX_REPORT !== '1') return;
  const counts = checks.reduce((result, item) => {
    result.total += 1;
    result[item.result] = (result[item.result] || 0) + 1;
    result.byKind[item.kind] = (result.byKind[item.kind] || 0) + 1;
    result.byOutcome[item.localOutcome || 'failed'] = (result.byOutcome[item.localOutcome || 'failed'] || 0) + 1;
    if (item.approvalVerified) result.approvalBranches += 1;
    if (item.rejectionVerified) result.rejectionBranches += 1;
    return result;
  }, { total: 0, passed: 0, failed: 0, byKind: {}, byOutcome: {}, approvalBranches: 0, rejectionBranches: 0 });
  const report = {
    generatedAt: new Date().toISOString(),
    scope: 'Executable local admin-store control matrix. This report does not assert DOM click coverage or any real-world administrative integration.',
    inventory: { sections: ADMIN_SECTIONS.length, editableSections: recordSections.length, catalogActions: ADMIN_SECTIONS.reduce((total, section) => total + section.actions.length, 0), sandboxPersonas: ADMIN_ROLES.length },
    counts,
    limitations: [
      'All fixture records are synthetic and all administrative mutations affect only browser-local JSON.',
      'Role selection is a sandbox persona simulation; no identity provider, server-enforced access control, or two-factor verification runs.',
      'Approving refunds, credits, payouts, deletion/export requests, notifications, regrades, job replays, deployments, publications, or credential/session changes does not execute those operations externally.',
      'Status transitions do not recalculate betting profit, ROI, CLV, payouts, queue counts, source latency, provider health, or embedded evidence snapshots.',
      'Overview revenue, tool usage, historical charts, and seeded diagnostic details are illustrative fixtures.',
      'This matrix tests store contracts; browser interaction, focus, rendering, filtering, sorting, navigation, and download clicks require separate UI verification.',
      'Field validation covers configured types, email/URL syntax, required values, select choices, dates, numeric bounds, integer counts, content expiry order, and wallet test-date order. It does not validate real provider credentials, bookmaker URL correctness, settlement rules, pricing formulas, or service availability.',
    ],
    checks,
  };
  await writeFile(new URL('../reports/admin-control-matrix.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
});

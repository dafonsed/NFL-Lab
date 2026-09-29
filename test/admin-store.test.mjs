import test from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_SECTIONS } from '../public/admin-catalog.js';
import { ADMIN_STORAGE_KEY, createAdminStore } from '../public/admin-store.js';

function memoryStorage(initial = null) {
  let raw = initial;
  return {
    writes: 0,
    failWrites: false,
    getItem(key) { assert.equal(key, ADMIN_STORAGE_KEY); return raw; },
    setItem(key, value) {
      assert.equal(key, ADMIN_STORAGE_KEY);
      if (this.failWrites) throw new Error('Storage quota exceeded');
      raw = value;
      this.writes += 1;
    },
    read() { return raw; },
    replace(value) { raw = value; },
  };
}
function makeStore(storage = memoryStorage()) {
  return { storage, store: createAdminStore({ storage, now: () => '2026-09-28T12:00:00.000Z' }) };
}
const firstRecord = (store, section) => store.getState().records[section][0];
const edit = (store, section, id, name) => store.perform({ section, id, action: 'edit', values: { name }, reason: 'Correct the synthetic fixture' });
function creationValues(store, sectionId) {
  const section = ADMIN_SECTIONS.find(item => item.id === sectionId);
  const record = firstRecord(store, sectionId);
  return Object.fromEntries(section.fields.map(field => [field.key, field.key === 'name' ? 'New synthetic record' : record[field.key] ?? (field.options?.[0]?.value || field.options?.[0] || (field.type === 'number' ? 1 : 'Example'))]));
}

test('local edits persist, audit exact before and after, and returned snapshots cannot mutate store', () => {
  const { store, storage } = makeStore();
  const before = firstRecord(store, 'sources');
  const result = edit(store, 'sources', before.id, 'Demonstration feed');
  assert.equal(result.outcome, 'applied');
  assert.equal(result.record.name, 'Demonstration feed');
  assert.equal(result.state.audit[0].before.name, before.name);
  assert.equal(result.state.audit[0].after.name, 'Demonstration feed');
  result.state.records.sources[0].name = 'Mutated outside';
  result.state.audit[0].after.name = 'Mutated outside';
  result.record.name = 'Mutated outside';
  assert.equal(firstRecord(store, 'sources').name, 'Demonstration feed');
  assert.equal(store.getState().audit[0].after.name, 'Demonstration feed');
  assert.deepEqual(createAdminStore({ storage }).getState(), store.getState());
});

test('quota failures never commit record changes, approval decisions, or persona changes in memory', () => {
  const { store, storage } = makeStore();
  const source = firstRecord(store, 'sources');
  edit(store, 'sources', source.id, 'Saved feed');
  const before = store.getState();
  const persisted = storage.read();
  storage.failWrites = true;
  assert.throws(() => edit(store, 'sources', source.id, 'Unsaved feed'), /could not be saved.*No changes were applied/);
  assert.deepEqual(store.getState(), before);
  assert.equal(storage.read(), persisted);
  assert.throws(() => store.setRole('Support'), /could not be saved/);
  assert.deepEqual(store.getState(), before);

  storage.failWrites = false;
  const request = edit(store, 'billing', firstRecord(store, 'billing').id, 'Reviewed plan');
  store.setRole('Developer');
  const pending = store.getState();
  storage.failWrites = true;
  assert.throws(() => store.reviewApproval(request.approval.id, 'approve', 'Reviewed synthetic proposal'), /could not be saved/);
  assert.deepEqual(store.getState(), pending);
});

test('sandbox personas restrict both visibility and writes at the store boundary', () => {
  const { store } = makeStore();
  const user = firstRecord(store, 'users');
  store.setRole('Data Operator');
  assert.equal(store.can('overview'), true);
  assert.equal(store.can('reports'), true);
  assert.equal(store.can('sources', 'edit'), true);
  assert.equal(store.can('users', 'view'), false);
  assert.throws(() => edit(store, 'users', user.id, 'Unauthorized change'), /cannot edit/);
  assert.throws(() => store.exportCsv('users'), /cannot export/);
  store.setRole('Developer');
  assert.equal(store.can('billing', 'view'), true);
  assert.equal(store.can('billing', 'edit'), false);
  assert.equal(store.can('billing', 'approve'), true);
  assert.throws(() => edit(store, 'users', user.id, 'Unauthorized change'), /cannot edit/);
  store.setRole('Content Editor');
  assert.equal(store.can('content', 'edit'), true);
  assert.equal(store.can('links', 'edit'), true);
  assert.equal(store.can('security'), false);
  assert.equal(store.can('sources', 'approve'), false);
  assert.throws(() => store.setRole('Pretend owner'), /valid sandbox persona/);
  assert.equal(store.can('unknown', 'view'), false);
  assert.equal(store.can('links', 'unknown-action'), false);
});

test('sensitive edits queue exact proposals; a different reviewer applies and audits the change', () => {
  const { store, storage } = makeStore();
  const before = firstRecord(store, 'billing');
  const result = edit(store, 'billing', before.id, 'New demonstration plan');
  assert.equal(result.outcome, 'pending');
  assert.deepEqual(firstRecord(store, 'billing'), before);
  assert.equal(result.approval.status, 'Pending');
  assert.equal(result.approval.requestedBy, 'Owner');
  assert.throws(() => store.reviewApproval(result.approval.id, 'approve', 'Reviewed proposed plan'), /cannot review your own/);
  assert.throws(() => edit(store, 'billing', before.id, 'New demonstration plan'), /already has a pending approval/);
  store.setRole('Developer');
  const reviewed = store.reviewApproval(result.approval.id, 'approve', 'Reviewed proposed plan');
  assert.equal(reviewed.outcome, 'applied');
  assert.equal(reviewed.approval.status, 'Approved');
  assert.equal(reviewed.approval.reviewedBy, 'Developer');
  assert.equal(reviewed.record.name, 'New demonstration plan');
  assert.equal(store.getState().audit[0].action, 'approve:edit');
  assert.equal(store.getState().audit[0].actor, 'Developer');
  assert.throws(() => store.reviewApproval(result.approval.id, 'approve', 'Reviewed it again'), /already been reviewed/);
  assert.deepEqual(createAdminStore({ storage }).getState(), store.getState());
});

test('creating a source adds one record while creating a billing configuration waits for review', () => {
  const { store } = makeStore();
  const sourceCount = store.getState().records.sources.length;
  const source = store.create({ section: 'sources', values: creationValues(store, 'sources'), reason: 'Add a synthetic feed configuration' });
  assert.equal(source.outcome, 'applied');
  assert.equal(store.getState().records.sources.length, sourceCount + 1);
  assert.ok(source.record.id);
  assert.ok(source.record.status);
  const billingCount = store.getState().records.billing.length;
  const billing = store.create({ section: 'billing', values: creationValues(store, 'billing'), reason: 'Add a synthetic plan configuration' });
  assert.equal(billing.outcome, 'pending');
  assert.equal(store.getState().records.billing.length, billingCount);
  store.setRole('Developer');
  const approved = store.reviewApproval(billing.approval.id, 'approve', 'Reviewed the new synthetic plan');
  assert.equal(approved.outcome, 'applied');
  assert.equal(approved.record.id, billing.approval.recordId);
  assert.equal(store.getState().records.billing.length, billingCount + 1);
});

test('stale approval cannot overwrite a record changed by a different approved request', () => {
  const { store } = makeStore();
  const record = firstRecord(store, 'billing');
  const one = edit(store, 'billing', record.id, 'First proposal');
  const two = edit(store, 'billing', record.id, 'Second proposal');
  store.setRole('Developer');
  store.reviewApproval(one.approval.id, 'approve', 'Accept the first proposal');
  const saved = store.getState();
  assert.throws(() => store.reviewApproval(two.approval.id, 'approve', 'Attempt stale proposal'), /request is stale/);
  assert.deepEqual(store.getState(), saved);
  const rejected = store.reviewApproval(two.approval.id, 'reject', 'Superseded by the first proposal');
  assert.equal(rejected.outcome, 'rejected');
  assert.equal(firstRecord(store, 'billing').name, 'First proposal');
});

test('support grading edits require review even when ordinary edits have no sensitive action flag', () => {
  const { store } = makeStore();
  const record = firstRecord(store, 'grading');
  store.setRole('Support');
  const request = edit(store, 'grading', record.id, 'Corrected synthetic bet');
  assert.equal(request.outcome, 'pending');
  assert.deepEqual(firstRecord(store, 'grading'), record);
  assert.throws(() => store.reviewApproval(request.approval.id, 'approve', 'Review the correction'), /cannot approve/);
  store.setRole('Owner');
  assert.equal(store.reviewApproval(request.approval.id, 'approve', 'Review the correction').outcome, 'applied');
});

test('grading record reasons remain separate from request and reviewer audit reasons', () => {
  const { store } = makeStore();
  const values = { ...creationValues(store, 'grading'), reason: 'The official result settled this sample selection as a push.' };
  store.setRole('Support');
  const request = store.create({ section: 'grading', values, reason: 'Open a sample grading correction for review.' });
  assert.equal(request.outcome, 'pending');
  assert.equal(request.approval.values.reason, values.reason);
  assert.equal(request.approval.reason, 'Open a sample grading correction for review.');
  assert.equal(store.getState().audit[0].after.reason, values.reason);
  assert.equal(store.getState().audit[0].reason, request.approval.reason);
  store.setRole('Owner');
  const approved = store.reviewApproval(request.approval.id, 'approve', 'Confirmed the official sample result.');
  assert.equal(approved.record.reason, values.reason);
  assert.equal(store.getState().audit[0].reason, 'Confirmed the official sample result.');
  assert.equal(store.getState().audit[0].after.reason, values.reason);
});

test('editing a status directly cannot bypass a sensitive catalog action approval', () => {
  const { store } = makeStore();
  const user = firstRecord(store, 'users');
  const request = store.perform({ section: 'users', id: user.id, action: 'edit', values: { status: 'Suspended' }, reason: 'Suspend a synthetic account' });
  assert.equal(request.outcome, 'pending');
  assert.deepEqual(firstRecord(store, 'users'), user);
});

test('unchanged sensitive status permits ordinary edits while transitions and creation require approval', () => {
  const { store, storage } = makeStore();
  const user = firstRecord(store, 'users');
  assert.equal(user.status, 'Active');
  const editInput = { section: 'users', id: user.id, action: 'edit', values: { status: 'Active', notes: 'Reviewed the sample onboarding notes.' } };
  assert.equal(store.requiresApproval(editInput), false);
  assert.equal(storage.writes, 0, 'Approval previews must not persist changes.');
  assert.equal(store.perform({ ...editInput, reason: 'Update the ordinary support notes.' }).outcome, 'applied');
  const transitionInput = { ...editInput, values: { status: 'Suspended' } };
  assert.equal(store.requiresApproval(transitionInput), true);
  assert.equal(store.perform({ ...transitionInput, reason: 'Request a sample account suspension.' }).outcome, 'pending');
  assert.equal(firstRecord(store, 'users').status, 'Active');
  const createInput = { section: 'users', action: 'create', values: creationValues(store, 'users') };
  assert.equal(store.requiresApproval(createInput), true);
  assert.equal(store.create({ ...createInput, reason: 'Create a sample account with sensitive access.' }).outcome, 'pending');
  assert.equal(store.requiresApproval({ section: 'ev', id: firstRecord(store, 'ev').id, action: 'disable' }), true);
  assert.equal(store.requiresApproval({ section: 'sources', id: firstRecord(store, 'sources').id, action: 'pause' }), false);
});

test('mutation validation rejects unknown actions, unknown fields, missing reasons, empty edits, and invalid field values', () => {
  const { store, storage } = makeStore();
  const section = ADMIN_SECTIONS.find(item => item.id === 'sources');
  const record = firstRecord(store, 'sources');
  assert.throws(() => store.perform({ section: 'sources', id: record.id, action: 'drop-database', reason: 'Invalid action request' }), /cannot drop-database/);
  assert.throws(() => store.perform({ section: 'sources', id: record.id, action: 'edit', values: { name: 'Renamed' }, reason: 'x' }), /at least 5/);
  assert.throws(() => store.perform({ section: 'sources', id: record.id, action: 'edit', values: {}, reason: 'Nothing to change' }), /at least one field/);
  assert.throws(() => store.perform({ section: 'sources', id: record.id, action: 'edit', values: { id: 'rewritten' }, reason: 'Attempt identity rewrite' }), /cannot be changed/);
  assert.throws(() => edit(store, 'sources', record.id, '  '), /required/);
  assert.throws(() => store.create({ section: 'sources', values: {}, reason: 'Create without required values' }), /required/);
  const select = section.fields.find(field => field.options?.length);
  if (select) assert.throws(() => store.perform({ section: 'sources', id: record.id, action: 'edit', values: { [select.key]: 'not-an-option' }, reason: 'Try unsupported option' }), /Choose a valid/);
  const numberSection = ADMIN_SECTIONS.find(item => item.fields.some(field => field.type === 'number'));
  assert.ok(numberSection, 'The catalog should include numeric configuration fields.');
  const numeric = numberSection.fields.find(field => field.type === 'number');
  assert.throws(() => store.perform({ section: numberSection.id, id: firstRecord(store, numberSection.id).id, action: 'edit', values: { [numeric.key]: 'NaN' }, reason: 'Try invalid number' }), /must be a number/);
  assert.equal(storage.writes, 0);
});

test('numeric configuration bounds and calendar dates are validated before saving', () => {
  const { store, storage } = makeStore();
  for (const [section, values, expected] of [
    ['sources', { interval: 0 }, /must be at least 1/],
    ['billing', { amount: -1 }, /must be at least 0/],
    ['ev', { vigLimit: 101 }, /must be at most 100/],
    ['users', { trialEnds: '2026-02-30' }, /must be a valid date/],
  ]) {
    assert.throws(() => store.perform({ section, id: firstRecord(store, section).id, action: 'edit', values, reason: 'Validate the configuration input' }), expected);
  }
  assert.equal(storage.writes, 0);
});

test('catalog actions change the target status while sensitive actions remain pending', () => {
  const { store } = makeStore();
  const sourceSection = ADMIN_SECTIONS.find(section => section.id === 'sources');
  const action = sourceSection.actions.find(item => item.targetStatus && !item.sensitive);
  assert.ok(action, 'Sources should include an immediate operational action.');
  const source = firstRecord(store, 'sources');
  const result = store.perform({ section: 'sources', id: source.id, action: action.id, reason: 'Exercise the operational workflow' });
  assert.equal(result.outcome, 'applied');
  assert.equal(result.record.status, action.targetStatus);
  const sensitiveSection = ADMIN_SECTIONS.find(section => section.actions.some(item => item.sensitive));
  assert.ok(sensitiveSection);
  const sensitive = sensitiveSection.actions.find(item => item.sensitive);
  const record = firstRecord(store, sensitiveSection.id);
  assert.equal(store.perform({ section: sensitiveSection.id, id: record.id, action: sensitive.id, reason: 'Request a sensitive workflow' }).outcome, 'pending');
  assert.deepEqual(firstRecord(store, sensitiveSection.id), record);
});

test('CSV escapes quotes, commas and line breaks and neutralizes spreadsheet formulas', () => {
  const { store } = makeStore();
  const record = firstRecord(store, 'sources');
  edit(store, 'sources', record.id, '=HYPERLINK("https://example.invalid"),\nDemo');
  const csv = store.exportCsv('sources');
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.invalid""),\nDemo"'));
  assert.ok(csv.includes('\r\n'));
});

test('corrupt and unsupported saved data are preserved, read-only, and recoverable only by explicit reset', () => {
  for (const raw of ['{broken-json', JSON.stringify({ version: 99 }), JSON.stringify({ version: 1 })]) {
    const { store, storage } = makeStore(memoryStorage(raw));
    assert.match(store.getState().storageError, /could not be loaded/);
    assert.equal(storage.read(), raw);
    assert.equal(storage.writes, 0);
    assert.equal(store.can('sources', 'edit'), false);
    assert.throws(() => store.setRole('Support'), /saved data has been preserved/i);
    assert.equal(storage.read(), raw);
    const reset = store.reset();
    assert.equal(reset.storageError, null);
    assert.equal(reset.role, 'Owner');
    assert.equal(JSON.parse(storage.read()).version, 1);
    assert.ok(reset.records.sources.length);
  }
});

test('blocked storage returns a readable load error and reset errors without pretending to save', () => {
  const storage = { getItem() { throw new Error('Storage access denied'); }, setItem() { throw new Error('Storage access denied'); } };
  const { store } = makeStore(storage);
  assert.match(store.getState().storageError, /Storage access denied/);
  assert.throws(() => store.reset(), /could not be saved/);
  assert.match(store.getState().storageError, /Storage access denied/);
});

test('a stale browser tab cannot silently overwrite newer stored data', () => {
  const { store, storage } = makeStore();
  const other = createAdminStore({ storage });
  const record = firstRecord(store, 'sources');
  edit(store, 'sources', record.id, 'First tab update');
  const firstSaved = storage.read();
  assert.throws(() => edit(other, 'sources', record.id, 'Second tab update'), /changed in another tab/);
  assert.equal(storage.read(), firstSaved);
  assert.notEqual(firstRecord(other, 'sources').name, 'Second tab update');
});

import { ADMIN_SECTIONS, ADMIN_ROLES, createAdminSeed } from './admin-catalog.js';

export const ADMIN_STORAGE_KEY = 'sportslab-admin-sandbox-v1';

const clone = value => structuredClone(value);
const roleNames = ADMIN_ROLES.map(role => typeof role === 'string' ? role : role.id || role.name || role.label);
const sectionMap = new Map(ADMIN_SECTIONS.map(section => [section.id, section]));
const tradingSections = new Set(['sources', 'events', 'quality', 'ev', 'arbitrage', 'fantasy', 'grading', 'clv', 'wallets', 'lineups', 'notifications']);
const sensitiveSections = new Set(['billing', 'admins', 'security', 'ev', 'arbitrage', 'fantasy', 'clv']);
const commonSections = new Set(['overview', 'reports']);

function fail(message) { throw new Error(message); }
function getSection(id) { return sectionMap.get(id) || fail('Unknown admin section.'); }
function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key])).join(',') + '}';
  return JSON.stringify(value);
}
function reasonText(reason) {
  if (typeof reason !== 'string' || reason.trim().length < 5) fail('Enter a reason of at least 5 characters.');
  if (reason.length > 2000) fail('Keep the reason under 2,000 characters.');
  return reason.trim();
}
function optionValues(field) {
  return (field.options || []).map(option => typeof option === 'object' ? option.value ?? option.id ?? option.label : option);
}
function validateValues(section, values, { creating = false } = {}) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) fail('Enter valid field values.');
  const fields = new Map((section.fields || []).map(field => [field.key, field]));
  if (!fields.has('name')) fields.set('name', { key: 'name', label: 'Name', type: 'text', required: true });
  const cleaned = {};
  for (const [key, value] of Object.entries(values)) {
    const field = fields.get(key);
    if (!field || ['__proto__', 'constructor', 'prototype', 'id'].includes(key)) fail(`The field "${key}" cannot be changed.`);
    const label = field.label || key;
    const empty = value === '' || value === null || value === undefined || (typeof value === 'string' && !value.trim());
    if (empty) {
      if (field.required || key === 'name') fail(`${label} is required.`);
      cleaned[key] = '';
      continue;
    }
    if (field.type === 'number' || field.type === 'integer') {
      if ((typeof value !== 'number' && typeof value !== 'string') || !Number.isFinite(Number(value))) fail(`${label} must be a number.`);
      const number = Number(value);
      if (field.type === 'integer' && !Number.isInteger(number)) fail(`${label} must be a whole number.`);
      if (field.min !== undefined && number < Number(field.min)) fail(`${label} must be at least ${field.min}.`);
      if (field.max !== undefined && number > Number(field.max)) fail(`${label} must be at most ${field.max}.`);
      cleaned[key] = number;
    } else if (field.type === 'boolean' || field.type === 'checkbox') {
      if (![true, false, 'true', 'false'].includes(value)) fail(`${label} must be true or false.`);
      cleaned[key] = value === true || value === 'true';
    } else {
      if (typeof value !== 'string') fail(`${label} must be text.`);
      const text = value.trim();
      if (text.length > (field.maxLength || 10000)) fail(`${label} is too long.`);
      if (field.options?.length && !optionValues(field).includes(text)) fail(`Choose a valid ${label.toLowerCase()}.`);
      if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) fail(`${label} must be a valid email address.`);
      if (field.type === 'url') {
        let url;
        try { url = new URL(text); } catch { fail(`${label} must be a valid URL.`); }
        if (!['http:', 'https:'].includes(url.protocol)) fail(`${label} must use http or https.`);
      }
      if (field.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text)) || new Date(text).toISOString().slice(0, 10) !== text)) fail(`${label} must be a valid date.`);
      if (field.type === 'datetime-local' && Number.isNaN(Date.parse(text))) fail(`${label} must be a valid date and time.`);
      cleaned[key] = text;
    }
  }
  if (creating) {
    for (const field of fields.values()) {
      if ((field.required || field.key === 'name') && !(field.key in cleaned)) fail(`${field.label || field.key} is required.`);
    }
  }
  return cleaned;
}

function validateRecordDomain(section, record) {
  if (section.id === 'content' && record.publishDate && record.expires && record.expires < record.publishDate) fail('Expiration date must be on or after the publication date.');
  if (section.id === 'wallets' && record.backtestStart && record.forwardStart && record.forwardStart < record.backtestStart) fail('Forward-test start must be on or after the backtest start.');
}

function seedState(now) {
  const seed = createAdminSeed();
  const records = clone(seed.records || seed);
  for (const section of ADMIN_SECTIONS) records[section.id] ||= [];
  return { version: 1, revision: 0, role: 'Owner', records, audit: [], approvals: [], updatedAt: now() };
}

function validateLoaded(value) {
  if (!value || value.version !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 || !roleNames.includes(value.role) || !value.records || typeof value.records !== 'object' || Array.isArray(value.records) || !Array.isArray(value.audit) || !Array.isArray(value.approvals) || typeof value.updatedAt !== 'string') fail('The saved sandbox has an unsupported or invalid format.');
  for (const section of ADMIN_SECTIONS) {
    const records = value.records[section.id];
    if (!Array.isArray(records)) fail(`Saved ${section.label} records are invalid.`);
    const ids = new Set();
    const allowedStatuses = optionValues(section.fields?.find(field => field.key === 'status') || {});
    for (const record of records) {
      if (!record || typeof record !== 'object' || typeof record.id !== 'string' || !record.id || typeof record.name !== 'string' || typeof record.status !== 'string' || ids.has(record.id)) fail(`Saved ${section.label} records are invalid.`);
      if (allowedStatuses.length && !allowedStatuses.includes(record.status)) fail(`Saved ${section.label} records use an older or unsupported workflow status. Reset explicitly to load the current sample workflows.`);
      ids.add(record.id);
    }
  }
  const approvalIds = new Set();
  for (const approval of value.approvals) {
    if (!approval || typeof approval.id !== 'string' || !approval.id || approvalIds.has(approval.id) || !sectionMap.has(approval.section) || typeof approval.recordId !== 'string' || !['Pending', 'Approved', 'Rejected'].includes(approval.status) || !roleNames.includes(approval.requestedBy) || typeof approval.reason !== 'string' || typeof approval.requestedAt !== 'string' || !approval.values || typeof approval.values !== 'object' || Array.isArray(approval.values) || (approval.expectedRecord !== null && typeof approval.expectedRecord !== 'string')) fail('Saved approval records are invalid.');
    approvalIds.add(approval.id);
    const section = getSection(approval.section);
    if (approval.action !== 'create' && approval.action !== 'edit' && !section.actions?.some(action => action.id === approval.action)) fail('Saved approval actions are invalid.');
  }
  for (const audit of value.audit) {
    if (!audit || typeof audit.id !== 'string' || typeof audit.at !== 'string' || typeof audit.actor !== 'string' || typeof audit.action !== 'string' || typeof audit.reason !== 'string') fail('Saved audit history is invalid.');
  }
  return value;
}

/** A local demonstration store. Personas are workflow previews, never authentication. */
export function createAdminStore({ storage, now = () => new Date().toISOString() } = {}) {
  let state = seedState(now);
  let storageError = null;
  let persistedRaw = null;
  let idSequence = 0;
  try {
    storage ??= globalThis.localStorage;
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') fail('Browser storage is unavailable.');
    persistedRaw = storage.getItem(ADMIN_STORAGE_KEY);
    if (persistedRaw !== null) state = clone(validateLoaded(JSON.parse(persistedRaw)));
  } catch (error) {
    storageError = `Saved sandbox could not be loaded: ${error.message} Your saved data has been preserved. Reset the sandbox to start again.`;
  }

  function getState() { return clone({ ...state, storageError }); }
  function can(sectionId, action = 'view') {
    if (!sectionMap.has(sectionId)) return false;
    const section = getSection(sectionId);
    if (!['view', 'create', 'edit', 'approve'].includes(action) && !section.actions?.some(item => item.id === action)) return false;
    if (action !== 'view' && storageError) return false;
    if (state.role === 'Owner') return true;
    if (action === 'approve') return state.role === 'Developer';
    if (commonSections.has(sectionId)) return action === 'view';
    if (state.role === 'Developer') {
      if (action === 'view') return true;
      return tradingSections.has(sectionId) || ['system', 'security', 'admins', 'links', 'content'].includes(sectionId);
    }
    if (state.role === 'Data Operator') return tradingSections.has(sectionId) || (action === 'view' && ['system', 'links'].includes(sectionId));
    if (state.role === 'Support') return ['users', 'support', 'grading'].includes(sectionId) || (action === 'view' && ['notifications', 'billing', 'quality', 'events'].includes(sectionId));
    if (state.role === 'Content Editor') return ['content', 'links'].includes(sectionId);
    return false;
  }
  function writable() {
    if (storageError) fail(storageError);
  }
  function requirePermission(section, action) {
    writable();
    getSection(section);
    if (!can(section, action)) fail(`The ${state.role} sandbox persona cannot ${action} in this section.`);
  }
  function uniqueId(prefix) {
    idSequence += 1;
    return `${prefix}-${Date.now().toString(36)}-${idSequence.toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }
  function addAudit(draft, { section, action, target, reason, before, after }) {
    draft.audit.unshift({ id: uniqueId('audit'), at: now(), actor: state.role, section, action, target, reason, before: clone(before ?? null), after: clone(after ?? null) });
  }
  function commit(draft, { resetting = false } = {}) {
    draft.revision = state.revision + 1;
    draft.updatedAt = now();
    try {
      if (!storage || typeof storage.setItem !== 'function') fail('Browser storage is unavailable.');
      if (!resetting && storage.getItem(ADMIN_STORAGE_KEY) !== persistedRaw) fail('The sandbox changed in another tab. Reload before saving.');
      const raw = JSON.stringify(draft);
      storage.setItem(ADMIN_STORAGE_KEY, raw);
      persistedRaw = raw;
    } catch (error) {
      fail(`The sandbox could not be saved: ${error.message} No changes were applied.`);
    }
    state = draft;
    storageError = null;
    return getState();
  }
  function setRole(role) {
    writable();
    if (!roleNames.includes(role)) fail('Choose a valid sandbox persona.');
    if (role === state.role) return getState();
    const draft = clone(state);
    draft.role = role;
    return commit(draft);
  }
  function recordFor(section, id, source = state) {
    return source.records[section].find(record => record.id === id) || fail('This record no longer exists. Reload the section.');
  }
  function actionFor(section, action) {
    if (action === 'edit' || action === 'create') return { id: action };
    return section.actions?.find(item => item.id === action) || fail('This action is not available for the section.');
  }
  function matchesAction(record, action) {
    return Object.entries(action.appliesTo || {}).every(([key, allowed]) => Array.isArray(allowed) && allowed.includes(record[key]));
  }
  function canForRecord(sectionId, id, actionId) {
    if (!can(sectionId, actionId)) return false;
    const record = state.records[sectionId]?.find(item => item.id === id);
    if (!record) return false;
    if (actionId === 'view' || actionId === 'edit') return true;
    const action = getSection(sectionId).actions?.find(item => item.id === actionId);
    return Boolean(action && matchesAction(record, action) && (action.requestOnly || !action.targetStatus || record.status !== action.targetStatus));
  }
  function needsApproval(section, action, values, before = null) {
    const changesStatus = action.id === 'create' || values.status !== before?.status;
    const sensitiveStatus = changesStatus && values.status && section.actions?.some(item => item.sensitive && item.targetStatus === values.status);
    return sensitiveSections.has(section.id) || action.sensitive === true || sensitiveStatus || (section.id === 'grading' && state.role === 'Support');
  }
  function requiresApproval({ section: sectionId, id, action: actionId, values = {} } = {}) {
    const section = getSection(sectionId);
    const action = actionFor(section, actionId);
    const before = actionId === 'create' || !id ? null : recordFor(sectionId, id);
    return Boolean(needsApproval(section, action, values, before));
  }
  function proposedRecord(section, before, action, values, id) {
    if (action.id === 'create') {
      const statusField = section.fields?.find(field => field.key === 'status');
      const status = values.status || (statusField && optionValues(statusField)[0]) || 'Draft';
      return { id, name: values.name, status, ...clone(values) };
    }
    const transition = action.requestOnly
      ? { requestStatus: action.targetStatus, lastRequestAction: action.id }
      : action.targetStatus ? { status: action.targetStatus } : {};
    return { ...clone(before), ...clone(values), ...transition };
  }
  function submit({ section: sectionId, id, action: actionId, values = {}, reason }) {
    requirePermission(sectionId, actionId);
    const section = getSection(sectionId);
    const action = actionFor(section, actionId);
    const cleanReason = reasonText(reason);
    const cleanValues = validateValues(section, values, { creating: actionId === 'create' });
    if (actionId !== 'edit' && actionId !== 'create' && Object.keys(cleanValues).length) fail('Edit the record separately before running this action.');
    if (actionId === 'edit' && !Object.keys(cleanValues).length) fail('Enter at least one field to update.');
    const before = actionId === 'create' ? null : recordFor(sectionId, id);
    if (before && actionId !== 'edit' && !canForRecord(sectionId, id, actionId)) fail('This action does not apply to the current record type or status.');
    const recordId = actionId === 'create' ? uniqueId(sectionId) : id;
    const after = proposedRecord(section, before, action, cleanValues, recordId);
    validateRecordDomain(section, after);
    const draft = clone(state);
    if (needsApproval(section, action, cleanValues, before)) {
      const expectedRecord = before === null ? null : stable(before);
      if (draft.approvals.some(item => item.status === 'Pending' && item.section === sectionId && item.recordId === recordId && item.action === actionId && stable(item.values) === stable(cleanValues) && item.expectedRecord === expectedRecord)) fail('This change already has a pending approval.');
      const approval = { id: uniqueId('approval'), section: sectionId, recordId, action: actionId, values: cleanValues, reason: cleanReason, status: 'Pending', requestedBy: state.role, requestedAt: now(), expectedRecord };
      draft.approvals.unshift(approval);
      addAudit(draft, { section: sectionId, action: `request:${actionId}`, target: recordId, reason: cleanReason, before, after });
      return { outcome: 'pending', approval: clone(approval), state: commit(draft) };
    }
    if (before === null) draft.records[sectionId].unshift(after);
    else draft.records[sectionId] = draft.records[sectionId].map(record => record.id === id ? after : record);
    addAudit(draft, { section: sectionId, action: actionId, target: recordId, reason: cleanReason, before, after });
    return { outcome: action.requestOnly ? 'requested' : 'applied', record: clone(after), state: commit(draft) };
  }
  function perform(input) {
    if (input?.action === 'create') fail('Use the create workflow to add a record.');
    return submit(input || {});
  }
  function create({ section, values = {}, reason } = {}) { return submit({ section, action: 'create', values, reason }); }
  function reviewApproval(id, decision, reason) {
    writable();
    const approval = state.approvals.find(item => item.id === id) || fail('This approval no longer exists.');
    requirePermission(approval.section, 'approve');
    if (approval.status !== 'Pending') fail('This approval has already been reviewed.');
    if (approval.requestedBy === state.role) fail('Switch to another reviewer persona. You cannot review your own request.');
    const normalizedDecision = String(decision).toLowerCase();
    if (!['approve', 'approved', 'reject', 'rejected'].includes(normalizedDecision)) fail('Choose approve or reject.');
    const approving = normalizedDecision.startsWith('approve');
    const cleanReason = reasonText(reason);
    const draft = clone(state);
    const reviewed = draft.approvals.find(item => item.id === id);
    reviewed.status = approving ? 'Approved' : 'Rejected';
    reviewed.reviewedBy = state.role;
    reviewed.reviewedAt = now();
    reviewed.reviewReason = cleanReason;
    if (!approving) {
      addAudit(draft, { section: approval.section, action: `reject:${approval.action}`, target: approval.recordId, reason: cleanReason, before: approval, after: reviewed });
      return { outcome: 'rejected', approval: clone(reviewed), state: commit(draft) };
    }
    const section = getSection(approval.section);
    const action = actionFor(section, approval.action);
    const existing = state.records[approval.section].find(record => record.id === approval.recordId) || null;
    if ((existing === null ? null : stable(existing)) !== approval.expectedRecord) fail('This request is stale because the record changed. Reject it and submit a new request.');
    if ((approval.action === 'create') !== (existing === null)) fail('This request no longer matches the target record.');
    if (existing && !matchesAction(existing, action)) fail('This action does not apply to the current record type.');
    const values = validateValues(section, approval.values, { creating: approval.action === 'create' });
    const after = proposedRecord(section, existing, action, values, approval.recordId);
    validateRecordDomain(section, after);
    if (existing === null) draft.records[approval.section].unshift(after);
    else draft.records[approval.section] = draft.records[approval.section].map(record => record.id === approval.recordId ? after : record);
    addAudit(draft, { section: approval.section, action: `approve:${approval.action}`, target: approval.recordId, reason: cleanReason, before: existing, after });
    return { outcome: action.requestOnly ? 'requested' : 'applied', record: clone(after), approval: clone(reviewed), state: commit(draft) };
  }
  function reset() { return commit(seedState(now), { resetting: true }); }
  function exportCsv(sectionId, { ids } = {}) {
    const section = getSection(sectionId);
    if (!can(sectionId, 'view')) fail(`The ${state.role} sandbox persona cannot export this section.`);
    let records = state.records[sectionId];
    if (ids !== undefined) {
      if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string') || new Set(ids).size !== ids.length) fail('Choose a valid ordered list of unique record IDs to export.');
      const byId = new Map(records.map(record => [record.id, record]));
      if (ids.some(id => !byId.has(id))) fail('One or more export records no longer exist in this section.');
      records = ids.map(id => byId.get(id));
    }
    const columns = section.columns?.length ? section.columns : [{ key: 'id', label: 'ID' }, { key: 'name', label: 'Name' }, { key: 'status', label: 'Status' }];
    const quote = value => {
      let text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
      if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
      return '"' + text.replaceAll('"', '""') + '"';
    };
    return [columns.map(column => quote(column.label)).join(','), ...records.map(record => columns.map(column => quote(record[column.key])).join(','))].join('\r\n');
  }
  return Object.freeze({ getState, can, canForRecord, requiresApproval, setRole, perform, create, reviewApproval, reset, exportCsv });
}

import { pathToFileURL } from 'node:url';
import { sql } from 'kysely';
import { AccountError, createAccountSystem, normalizeEmail } from '../lib/accounts/auth.mjs';
import { sweepTrialNotices } from '../lib/accounts/trials.mjs';

const usage = `SportsLab account operations
  node --env-file-if-exists=.env.local scripts/accounts.mjs migrate
  node --env-file-if-exists=.env.local scripts/accounts.mjs bootstrap-owner EMAIL
  node --env-file-if-exists=.env.local scripts/accounts.mjs mail-drain

Run bootstrap-owner only from a privileged deployment console with database
administrator access. The account must already have verified email and verified
authenticator MFA. This command never creates accounts or sets passwords.`;

export async function bootstrapOwner(system, email) {
  const normalized = normalizeEmail(email);
  return system.db.transaction().execute(async tx => {
    // Serialize the one-time bootstrap on a migration row present in every DB.
    // Recheck all conditions under this lock, including concurrent CLI invocations.
    const locked = await tx.updateTable('accountMigration').set({ appliedAt: sql.ref('appliedAt') })
      .where('version', '=', '2026-09-28-accounts-v1').executeTakeFirst();
    if (!Number(locked.numUpdatedRows)) throw new AccountError('Run the account migration before bootstrapping an owner.', 409);
    const target = await tx.selectFrom('user').select(['id', 'emailVerified', 'twoFactorEnabled', 'role', 'status']).where('email', '=', normalized).executeTakeFirst();
    if (!target || target.status !== 'active' || !target.emailVerified || !target.twoFactorEnabled) throw new AccountError('Use an existing active account with verified email and enabled authenticator MFA.', 409);
    const mfa = await tx.selectFrom('twoFactor').select(['id', 'verified']).where('userId', '=', target.id).executeTakeFirst();
    if (!mfa?.verified) throw new AccountError('Complete authenticator verification before granting owner access.', 409);
    const owners = await tx.selectFrom('user').select('id').where('role', '=', 'owner').execute();
    if (owners.some(owner => owner.id !== target.id)) throw new AccountError('An owner already exists. Bootstrap cannot replace or add owners; use the documented controlled ownership-transfer procedure.', 409);
    if (target.role === 'owner') return { userId: target.id, alreadyOwner: true };
    await tx.updateTable('user').set({ role: 'owner' }).where('id', '=', target.id).execute();
    await tx.deleteFrom('session').where('userId', '=', target.id).execute();
    await system.audit({ userId: target.id, actorId: null, action: 'admin.owner.bootstrapped', detail: { source: 'privileged-deployment-cli', reason: 'Explicit initial owner bootstrap after email and authenticator verification.' } }, tx);
    return { userId: target.id, alreadyOwner: false, sessionsRevoked: true };
  });
}

export async function runAccountCommand(args, { env = process.env, createSystem = createAccountSystem, write = message => process.stdout.write(`${message}\n`) } = {}) {
  const [command, ...rest] = args;
  if (!command || command === '--help' || command === 'help') { write(usage); return; }
  if (!['migrate', 'bootstrap-owner', 'mail-drain'].includes(command) || (command === 'bootstrap-owner' ? rest.length !== 1 : rest.length !== 0)) throw new AccountError('Unknown command or arguments. Run scripts/accounts.mjs --help.');
  const system = await createSystem({ env, migrate: command === 'migrate' });
  try {
    if (command === 'migrate') write(JSON.stringify({ ok: true, command, database: system.type, message: 'Account migrations completed. Existing records were preserved.' }));
    else if (command === 'bootstrap-owner') write(JSON.stringify({ ok: true, command, ...await bootstrapOwner(system, rest[0]) }));
    else {
      if (!system.mail.configured) throw new AccountError('Configure RESEND_API_KEY and EMAIL_FROM before draining transactional email.', 503);
      const trials = await sweepTrialNotices(system);
      write(JSON.stringify({ ok: true, command, trials, delivery: await system.mail.drain(100) }));
    }
  } finally { await system.close(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runAccountCommand(process.argv.slice(2)).catch(failure => {
    process.stderr.write(`${JSON.stringify({ ok: false, error: failure instanceof AccountError ? failure.message : 'Account operation failed. Check database availability and account configuration; no credentials or stack trace were printed.' })}\n`);
    process.exitCode = 1;
  });
}

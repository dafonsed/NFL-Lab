import { createHash } from 'node:crypto';
import { symmetricEncrypt, symmetricDecrypt } from 'better-auth/crypto';
import { kyselyAdapter } from '@better-auth/kysely-adapter';

export const tokenHash = value => createHash('sha256').update(value).digest('hex');

// Keep Better Auth's supported adapter and cryptography; protect bearer tokens at rest.
// A hash serves lookups and the library's authenticated encryption supports token rotation.
export function secureSessionAdapter(db, type, secret, transactionContext) {
  return options => {
    const wrap = executor => {
      const base = kyselyAdapter(executor, { type, transaction: false })(options);
      const output = async result => {
        if (Array.isArray(result)) return Promise.all(result.map(output));
        if (!result || typeof result !== 'object' || result instanceof Date) return result;
        const row = { ...result };
        if (row.encryptedToken) {
          row.token = await symmetricDecrypt({ key: secret, data: row.encryptedToken });
          delete row.encryptedToken;
        }
        for (const key of Object.keys(row)) if (row[key] && typeof row[key] === 'object' && !(row[key] instanceof Date)) row[key] = await output(row[key]);
        return row;
      };
      const adapter = { ...base };
      for (const method of ['create', 'findOne', 'findMany', 'update', 'updateMany', 'delete', 'deleteMany', 'consumeOne', 'incrementOne', 'count']) {
        if (typeof base[method] !== 'function') continue;
        adapter[method] = async args => {
          let next = { ...args };
          if (next.model === 'session') {
            if (next.where) next.where = next.where.map(w => w.field === 'token' ? { ...w, value: Array.isArray(w.value) ? w.value.map(tokenHash) : tokenHash(w.value) } : w);
            for (const key of ['data', 'update', 'set']) if (next[key]?.token) next[key] = {
              ...next[key], token: tokenHash(next[key].token),
              encryptedToken: await symmetricEncrypt({ key: secret, data: next[key].token }),
            };
          }
          return output(await base[method](next));
        };
      }
      // Hooks and the mail outbox must use the same SQL transaction as auth.
      adapter.transaction = fn => executor.isTransaction ? fn(adapter) : executor.transaction().execute(tx =>
        transactionContext ? transactionContext.run(tx, () => fn(wrap(tx))) : fn(wrap(tx)));
      return adapter;
    };
    return wrap(db);
  };
}

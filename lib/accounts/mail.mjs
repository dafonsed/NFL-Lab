import { randomUUID } from 'node:crypto';
import { symmetricEncrypt, symmetricDecrypt } from 'better-auth/crypto';

const escape = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const copy = {
  'verify-email': ['Verify your VisualOdds email', 'Confirm your email to start saving your research across devices.', 'Verify email'],
  'reset-password': ['Reset your VisualOdds password', 'Use this single-use link within 30 minutes. If you did not request it, you can ignore this email.', 'Reset password'],
  'password-changed': ['Your VisualOdds password changed', 'Your password was changed and other sessions have been signed out. If this was not you, reset your password immediately.', 'Secure your account'],
  'email-changed': ['Your VisualOdds email changed', 'Your account email was changed. Sign in with your new address. If this was not you, contact your account administrator.', 'Account security'],
  'new-sign-in': ['New VisualOdds sign-in', 'A new sign-in completed for your account. Review your active sessions if you do not recognize it.', 'Review sessions'],
  'subscription-activated': ['Your VisualOdds subscription is active', 'Your plan features are now available. Review billing and renewal details in your account.', 'Manage subscription'],
  'subscription-changed': ['Your VisualOdds subscription changed', 'Review your current features and renewal details in your account.', 'Manage subscription'],
  'subscription-canceled': ['Your VisualOdds subscription was canceled', 'Your account shows when paid access ends. Your saved research stays with your account.', 'Review subscription'],
  'payment-failed': ['Your VisualOdds payment needs attention', 'Update your payment method in the billing portal to restore paid access.', 'Manage billing'],
  'trial-started': ['Your VisualOdds access trial started', 'Review the features and expiration date in your account.', 'Review access'],
  'trial-ending': ['Your VisualOdds trial ends soon', 'Review your access expiration and available plans in your account.', 'Review access'],
  'trial-expired': ['Your VisualOdds trial ended', 'Your free account and saved research remain available.', 'Review plans'],
  'alert-matches': ['New matches for your VisualOdds alerts', 'Your saved alerts found new matches:', 'Open your alerts', 'You get these emails because email alerts are on. Turn them off from the alerts screen in VisualOdds.'],
};
export function renderAccountEmail(template, data = {}, origin = 'http://127.0.0.1:3100') {
  const [subject, body, action, footer = 'VisualOdds account security'] = copy[template] || copy['subscription-changed'];
  const link = new URL(data.url || '/account', origin);
  if (link.origin !== new URL(origin).origin) throw new Error('Email links must use the configured account origin.');
  const name = String(data.name || 'there').slice(0, 100);
  // Optional short list (alert matches): plain strings only, escaped, at most 10 shown.
  const lines = Array.isArray(data.lines) ? data.lines.slice(0, 10).map(line => String(line).slice(0, 200)) : [];
  const more = Array.isArray(data.lines) && data.lines.length > 10 ? `…and ${data.lines.length - 10} more.` : '';
  const textList = lines.length ? `\n${lines.map(line => `- ${line}`).join('\n')}${more ? `\n${more}` : ''}\n` : '';
  const htmlList = lines.length ? `<ul style="margin:0 0 8px;padding-left:20px;line-height:1.6">${lines.map(line => `<li>${escape(line)}</li>`).join('')}</ul>${more ? `<p style="color:#b9c3be">${escape(more)}</p>` : ''}` : '';
  return { subject, text: `Hi ${name},\n\n${body}\n${textList}\n${action}: ${link.href}\n\n${footer}`, html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;background:#07090b;color:#edf2ee;font-family:Arial,sans-serif"><table role="presentation" width="100%"><tr><td style="padding:24px 12px"><table role="presentation" style="max-width:560px;width:100%;margin:auto;background:#0e1215;border:1px solid #1f262b;border-radius:16px"><tr><td style="padding:32px"><p style="color:#a3f06b;font-size:22px;font-weight:bold;margin:0 0 8px">VisualOdds</p><h1 style="font-size:24px;line-height:1.3">${escape(subject)}</h1><p>Hi ${escape(name)},</p><p style="line-height:1.65">${escape(body)}</p>${htmlList}<p style="padding:16px 0"><a href="${escape(link.href)}" style="display:inline-block;background:#a3f06b;color:#0a200f;padding:14px 22px;border-radius:999px;font-weight:bold;text-decoration:none">${escape(action)}</a></p><p style="font-size:12px;line-height:1.6;overflow-wrap:anywhere">If the button does not work, copy this link:<br>${escape(link.href)}</p><p style="font-size:12px;color:#7e8a86">${escape(footer)}</p></td></tr></table></td></tr></table></body></html>` };
}

export function createAccountMail({ db, env, secret, transport }) {
  const origin = env.BETTER_AUTH_URL;
  const configured = Boolean(transport || (env.RESEND_API_KEY && env.EMAIL_FROM));
  return {
    configured,
    async send({ to, template, data = {}, dedupeKey }, executor = db) {
      if (!configured) throw Object.assign(new Error('Email delivery is unavailable.'), { status: 503 });
      const message = { to, ...renderAccountEmail(template, data, origin) };
      const id = dedupeKey || randomUUID();
      await executor.insertInto('accountMail').values({ id, payload: await symmetricEncrypt({ key: secret, data: JSON.stringify(message) }), status: 'pending', attempts: 0, nextAttemptAt: new Date().toISOString(), createdAt: new Date().toISOString() }).onConflict(c => c.column('id').doNothing()).execute();
      return id;
    },
    async drain(limit = 10) {
      if (!configured) return { sent: 0, failed: 0 };
      const now = new Date().toISOString();
      const rows = await db.selectFrom('accountMail').selectAll().where('status', '!=', 'sent').where('nextAttemptAt', '<=', now).limit(limit).execute();
      let sent = 0, failed = 0;
      for (const row of rows) {
        const lease = await db.updateTable('accountMail').set({ status: 'sending', nextAttemptAt: new Date(Date.now() + 120_000).toISOString() }).where('id', '=', row.id).where('nextAttemptAt', '<=', now).executeTakeFirst();
        if (!Number(lease.numUpdatedRows)) continue;
        try {
          const message = JSON.parse(await symmetricDecrypt({ key: secret, data: row.payload }));
          if (transport) await transport(message);
          else {
            const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': row.id }, body: JSON.stringify({ from: env.EMAIL_FROM, ...message }), signal: AbortSignal.timeout(15_000) });
            if (!response.ok) throw new Error('Email provider declined delivery.');
          }
          await db.updateTable('accountMail').set({ status: 'sent', payload: '', sentAt: new Date().toISOString() }).where('id', '=', row.id).execute();
          sent++;
        } catch {
          await db.updateTable('accountMail').set({ status: 'pending', attempts: row.attempts + 1, nextAttemptAt: new Date(Date.now() + Math.min(3_600_000, 60_000 * 2 ** Math.min(row.attempts, 6))).toISOString() }).where('id', '=', row.id).execute();
          failed++;
        }
      }
      return { sent, failed };
    },
  };
}

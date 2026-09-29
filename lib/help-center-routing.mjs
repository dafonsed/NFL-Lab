function hostname(value) {
  if (typeof value !== 'string' || value.length > 253) return null;
  const host = value.trim().toLowerCase();
  if (!host || !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  return host;
}

function requestHostname(value) {
  // Use the actual Host header only. Forwarded headers cannot activate a site.
  if (typeof value !== 'string') return null;
  const match = /^([a-z0-9.-]+)(?::([0-9]{1,5}))?$/i.exec(value);
  if (!match || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) return null;
  return hostname(match[1]);
}

function applicationOrigin(env) {
  const value = env.PUBLIC_SITE_URL || env.BETTER_AUTH_URL;
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

/** Returns renderer options only; it neither authorizes requests nor trusts hosts.
 * The server's existing local-host and account policies remain authoritative.
 * Unknown help paths are intentionally claimed so their renderer returns 404.
 */
export function resolveHelpCenterRequest(url, { host = '', env = process.env } = {}) {
  const underHelp = url.pathname === '/help' || url.pathname.startsWith('/help/');
  const configuredHost = hostname(env.HELP_CENTER_HOST);
  const onHelpHost = Boolean(configuredHost && requestHostname(host) === configuredHost);
  const appOrigin = onHelpHost ? applicationOrigin(env) : null;
  const distinctOrigin = appOrigin && new URL(appOrigin).hostname.toLowerCase() !== configuredHost;

  if (underHelp) {
    // A configured help host must send sign-in and support to the app host.
    // Without a valid app origin, do not serve a cross-host help experience.
    if (onHelpHost && !distinctOrigin) return null;
    return { url, basePath: '/help', appOrigin: onHelpHost ? appOrigin : '' };
  }
  if (!onHelpHost || !distinctOrigin) return null;
  if (url.pathname !== '/' && !/^\/(?:collections|articles)(?:\/|$)/.test(url.pathname)) return null;
  return { url, basePath: '', appOrigin };
}

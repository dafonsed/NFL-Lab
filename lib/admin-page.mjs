const sections = new Set([
  'overview', 'users', 'billing', 'sources', 'events', 'quality', 'ev',
  'arbitrage', 'fantasy', 'links', 'grading', 'clv', 'wallets', 'lineups',
  'notifications', 'content', 'support', 'system', 'admins', 'security', 'reports',
]);

// The sandbox is deliberately separate from the customer product layout.
// This route does not grant access to accounts, billing, or production systems.
export function renderAdminPage(url) {
  const match = /^\/admin-sandbox(?:\/([a-z]+))?\/?$/.exec(url.pathname);
  if (!match || (match[1] && !sections.has(match[1]))) return null;
  const section = match[1] || 'overview';
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="description" content="VisualOdds local admin sandbox with synthetic operational data.">
  <title>VisualOdds Admin</title>
  <link rel="preload" href="/assets/fonts/InterVariable.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/admin.css">
  <script type="module" src="/admin.js"></script>
</head>
<body class="admin-app" data-admin-section="${section}">
  <a class="admin-skip-link" href="#admin-main">Skip to admin workspace</a>
  <div id="admin-root"><p>Loading admin workspace…</p></div>
  <div id="admin-toast" role="status" aria-live="polite"></div>
  <dialog id="admin-dialog"></dialog>
  <noscript><p>The local admin sandbox requires JavaScript. Enable JavaScript to explore synthetic data and save sandbox changes in this browser.</p></noscript>
</body>
</html>`;
}

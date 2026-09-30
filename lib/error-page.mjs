// Designed error pages for browser requests. API and non-HTML requests keep JSON errors.
const COPY = {
  404: {
    title: 'Page not found',
    heading: 'This page is off the board.',
    body: 'The link may be old, or the page moved when the workspace was reorganised.',
  },
  500: {
    title: 'Something went wrong',
    heading: 'We hit a snag loading this page.',
    body: 'It is on our side, not yours. Try again in a moment; if it keeps happening, the help center can point you to the right place.',
  },
};

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

/** True when the client is a browser navigating to a page (not fetch/XHR or an API path). */
export function wantsHtml(req, url) {
  if (url.pathname.startsWith('/api/')) return false;
  const accept = String(req.headers?.accept || '');
  return accept.includes('text/html');
}

export function renderErrorPage(status = 404) {
  const copy = COPY[status] || COPY[status >= 500 ? 500 : 404];
  const code = status >= 500 ? 500 : 404;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${esc(copy.title)} · VisualOdds</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <style>
    :root{color-scheme:dark;--lime:#a3f06b;--ink:#0a200f;--text:#edf2ee;--text2:#b9c3be;--muted:#7e8a86;--line:rgb(255 255 255/.09)}
    *{box-sizing:border-box}
    body{display:grid;min-height:100dvh;margin:0;place-items:center;padding:24px;background:#07090b;color:var(--text);font:16px/1.5 Inter,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif}
    main{display:grid;justify-items:center;gap:18px;width:min(520px,100%);text-align:center}
    .brand{display:inline-flex;align-items:center;gap:10px;color:var(--text);font-weight:700;font-size:19px;letter-spacing:-.02em;text-decoration:none}
    .brand em{color:var(--lime);font-style:normal}
    .card{display:grid;gap:12px;width:100%;padding:34px 28px;border:1px solid var(--line);border-radius:18px;background:#0e1215}
    .code{color:var(--lime);font:600 13px/1 ui-monospace,'SF Mono',Menlo,Consolas,monospace;letter-spacing:.12em}
    h1{margin:0;font-size:clamp(26px,5vw,34px);line-height:1.15;letter-spacing:-.03em}
    p{margin:0;color:var(--text2)}
    .actions{display:flex;flex-wrap:wrap;justify-content:center;gap:10px;margin-top:10px}
    .actions a{display:inline-flex;align-items:center;min-height:44px;padding:0 20px;border-radius:999px;font-weight:650;font-size:15px;text-decoration:none}
    .primary{background:var(--lime);color:var(--ink)}
    .ghost{border:1px solid rgb(255 255 255/.14);color:var(--text)}
    .primary:hover{background:#c4f79c}.ghost:hover{border-color:rgb(163 240 107/.45)}
    small{color:var(--muted);font-size:13px}
  </style>
</head>
<body>
  <main>
    <a class="brand" href="/" aria-label="VisualOdds home"><img src="/favicon.svg" width="30" height="30" alt=""><span>Visual<em>Odds</em></span></a>
    <section class="card" aria-labelledby="error-title">
      <span class="code">ERROR ${code}</span>
      <h1 id="error-title">${esc(copy.heading)}</h1>
      <p>${esc(copy.body)}</p>
      <div class="actions"><a class="primary" href="/research">Open the workspace</a><a class="ghost" href="/">Back to home</a><a class="ghost" href="/help">Help center</a></div>
    </section>
    <small>Gambling problem? Call 1-800-GAMBLER. 21+ where applicable.</small>
  </main>
</body>
</html>`;
}

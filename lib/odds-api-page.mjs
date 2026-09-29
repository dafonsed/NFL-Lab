const esc = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

export function renderOddsApiPage(origin = 'https://visualodds.com') {
  const base = String(origin).replace(/\/+$/, '');
  const canonical = `${base}/odds-api`;
  const description = 'Explore the VisualOdds sports betting API preview for schedules, player research, model context, results, and source metadata across six sports.';
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Sports Betting Data API | VisualOdds',
    description,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'VisualOdds', url: base },
  };

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#080d12">
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="index,follow,max-image-preview:large">
  <link rel="canonical" href="${esc(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="VisualOdds">
  <meta property="og:title" content="Sports Betting Data API | VisualOdds">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(canonical)}">
  <title>Sports Betting Data API | VisualOdds</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="/assets/fonts/InterVariable.woff2" as="font" type="font/woff2" crossorigin>
  <link rel="stylesheet" href="/odds-api.css">
  <script type="application/ld+json">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>
<link rel="stylesheet" href="/content-2026.css?v=1"></head>
<body>
  <a class="api-skip" href="#main">Skip to content</a>
  <header class="api-header">
    <div class="api-wrap api-header-inner">
      <a class="api-brand" href="/" aria-label="VisualOdds home"><img src="/favicon.svg" width="34" height="34" alt=""><span>Visual<span>Odds</span></span></a>
      <nav class="api-nav" aria-label="Main navigation">
        <a href="/#product">Product</a><a href="#coverage">Data coverage</a><a href="#endpoints">API reference</a><a href="/betting-education">Education</a>
      </nav>
      <a class="api-nav-cta" href="/api/sports/catalog?sport=nba&amp;market=points">Open preview <span aria-hidden="true">↗</span></a>
      <details class="api-mobile-menu"><summary aria-label="Open navigation">Menu</summary><nav aria-label="Mobile navigation"><a href="/#product">Product</a><a href="#coverage">Data coverage</a><a href="#endpoints">API reference</a><a href="/betting-education">Education</a><a href="/api/sports/catalog?sport=nba&amp;market=points">Open preview</a></nav></details>
    </div>
  </header>

  <main id="main">
    <section class="api-hero">
      <div class="api-wrap api-hero-grid">
        <div class="api-hero-copy">
          <p class="api-overline"><span></span>VisualOdds developer API · preview</p>
          <h1>Sports betting research, ready for your workflow.</h1>
          <p class="api-hero-lede">Connect schedules, player research, experimental model context, and source receipts through straightforward JSON endpoints. Keep the data and the assumptions that shape it together.</p>
          <div class="api-hero-actions"><a class="api-button" href="#endpoints">Explore the API <span aria-hidden="true">↓</span></a><a class="api-secondary-link" href="/research">Open the research workspace</a></div>
          <p class="api-hero-note">Public preview routes · JSON responses · inspectable source and freshness metadata</p>
        </div>
        <div class="api-console" aria-label="Example VisualOdds API request and response">
          <div class="api-console-bar"><span class="api-console-dots" aria-hidden="true"><i></i><i></i><i></i></span><span>REQUEST PREVIEW</span><span class="api-console-status"><i></i>HTTP · GET</span></div>
          <div class="api-console-request"><b>GET</b><code>/api/sports/catalog?sport=nba&amp;market=points</code></div>
          <pre class="api-code"><code><span class="api-code-muted">// response shape</span>
{
  <span class="api-code-key">"sport"</span>: <span class="api-code-string">"nba"</span>,
  <span class="api-code-key">"date"</span>: <span class="api-code-string">"YYYY-MM-DD"</span>,
  <span class="api-code-key">"games"</span>: [],
  <span class="api-code-key">"source"</span>: {
    <span class="api-code-key">"fetchedAt"</span>: <span class="api-code-string">"ISO 8601 timestamp"</span>,
    <span class="api-code-key">"stale"</span>: <span class="api-code-bool">false</span>
  },
  <span class="api-code-key">"markets"</span>: { <span class="api-code-muted">…</span> }
}</code></pre>
          <div class="api-console-foot"><span>Illustrative shape; results depend on sport, date, and source availability.</span><a href="/api/sports/catalog?sport=nba&amp;market=points">Try this endpoint ↗</a></div>
        </div>
      </div>
      <div class="api-wrap api-facts" aria-label="API preview details"><div><strong>6</strong><span>sports covered across current research tools</span></div><div><strong>JSON</strong><span>simple HTTP read endpoints</span></div><div><strong>Source aware</strong><span>timestamps and stale markers where available</span></div><div><strong>Research first</strong><span>estimates arrive with their limitations</span></div></div>
    </section>

    <section class="api-intro api-wrap" aria-labelledby="api-intro-title">
      <div><p class="api-label">A more inspectable data layer</p><h2 id="api-intro-title">Use the number.<br>Keep its context.</h2></div>
      <div class="api-intro-copy"><p>VisualOdds is building around a practical sports betting data API: event schedules, player and matchup research, experimental projections, historical results, and the records that explain where a value came from.</p><p>That context matters when a source is delayed, a sample is small, or a model is still being evaluated. Responses identify source and freshness details where the underlying feed provides them, so your application can decide how to handle missing or stale data.</p></div>
    </section>

    <section class="api-coverage" id="coverage" aria-labelledby="coverage-title">
      <div class="api-wrap">
        <div class="api-section-heading"><div><p class="api-label">Data coverage</p><h2 id="coverage-title">The inputs behind a useful view.</h2></div><p>Coverage varies by league, market, date, and upstream source. The API returns what is available and identifies important limits.</p></div>
        <div class="api-data-list">
          <article><span class="api-data-index">01</span><div><h3>Schedules and matchups</h3><p>Browse event catalogs, available dates, league context, and supported market definitions for NFL, NBA, WNBA, MLB, NHL, and soccer research.</p></div><span class="api-data-tag">EVENT DATA</span></article>
          <article><span class="api-data-index">02</span><div><h3>Player and team research</h3><p>Request research boards with historical samples, player context, source metadata, and experimental estimates where a sport and market support them.</p></div><span class="api-data-tag">RESEARCH</span></article>
          <article><span class="api-data-index">03</span><div><h3>Game state and results</h3><p>Read current or completed game context for supported live views. Public feeds can lag, fail, or omit an event; check the response status and freshness markers.</p></div><span class="api-data-tag">LIVE VIEWS</span></article>
          <article><span class="api-data-index">04</span><div><h3>Captured price comparisons</h3><p>Some research views include captured comparison lines when available. They are timestamped references, not a complete real-time sportsbook odds feed or a guaranteed available price.</p></div><span class="api-data-tag">LIMITED AVAILABILITY</span></article>
        </div>
        <p class="api-coverage-note">A sports betting API should make missing, delayed, or experimental information visible. VisualOdds does not place wagers or promise a profitable result.</p>
      </div>
    </section>

    <section class="api-endpoints api-wrap" id="endpoints" aria-labelledby="endpoints-title">
      <div class="api-section-heading"><div><p class="api-label">Endpoint reference</p><h2 id="endpoints-title">Start with a GET request.</h2></div><p>These preview endpoints return JSON from the VisualOdds app. Parameters shown are examples; accepted values vary by route.</p></div>
      <div class="api-endpoint-table" role="table" aria-label="VisualOdds API preview endpoints">
        <div class="api-endpoint-row api-endpoint-head" role="row"><span role="columnheader">Resource</span><span role="columnheader">Method and path</span><span role="columnheader">What it returns</span><span role="columnheader">Example</span></div>
        <div class="api-endpoint-row" role="row"><div class="api-endpoint-name" role="cell"><strong>Sport catalog</strong><small>Schedules and market definitions</small></div><code role="cell"><b>GET</b> /api/sports/catalog?sport=nba&amp;market=points</code><p role="cell">Matchups, dates, source receipt, and supported markets.</p><a role="cell" href="/api/sports/catalog?sport=nba&amp;market=points">Open response ↗</a></div>
        <div class="api-endpoint-row" role="row"><div class="api-endpoint-name" role="cell"><strong>Player research board</strong><small>Supported non-NFL research sports</small></div><code role="cell"><b>GET</b> /api/sports/board?sport=nba&amp;market=points</code><p role="cell">Player research, historical context, and model fields where supported.</p><a role="cell" href="/api/sports/board?sport=nba&amp;market=points">Open response ↗</a></div>
        <div class="api-endpoint-row" role="row"><div class="api-endpoint-name" role="cell"><strong>NFL board</strong><small>Player data and research views</small></div><code role="cell"><b>GET</b> /api/board?view=board&amp;market=rec_yds</code><p role="cell">NFL research results with samples, sources, and experimental fields.</p><a role="cell" href="/api/board?view=board&amp;market=rec_yds">Open response ↗</a></div>
        <div class="api-endpoint-row" role="row"><div class="api-endpoint-name" role="cell"><strong>MLB board</strong><small>Baseball schedule and research</small></div><code role="cell"><b>GET</b> /api/mlb/board</code><p role="cell">MLB game and player research in the current supported view.</p><a role="cell" href="/api/mlb/board">Open response ↗</a></div>
        <div class="api-endpoint-row" role="row"><div class="api-endpoint-name" role="cell"><strong>Live game context</strong><small>Feed-backed game views</small></div><code role="cell"><b>GET</b> /api/nfl/live</code><p role="cell">NFL live game state and available model context; source cadence varies.</p><a role="cell" href="/live">Explore live views ↗</a></div>
      </div>
      <div class="api-request-notes"><div><h3>Make a request</h3><p>Use a command-line client or your server-side HTTP client to call the preview URL. Responses use JSON; invalid query values return an error response.</p><pre><code>curl "${esc(base)}/api/sports/catalog?sport=nba&amp;market=points"</code></pre></div><div><h3>Read the response carefully</h3><p>Inspect each endpoint’s sport, date, status, source, and stale fields. Experimental probability and projection fields are research outputs, not verified accuracy or a prediction guarantee.</p><a href="/research">Review the methodology in the workspace ↗</a></div></div>
    </section>

    <section class="api-fit" aria-labelledby="api-fit-title"><div class="api-wrap api-fit-grid"><div><p class="api-label">Designed for data-aware teams</p><h2 id="api-fit-title">Bring the research into your own tools.</h2><p>Use VisualOdds’s preview responses to explore integrations for internal dashboards, research notebooks, prototypes, and model evaluation workflows.</p></div><div class="api-fit-list"><div><span>01</span><p><strong>Choose a sport and market</strong><small>Start with the catalog route to see supported options.</small></p></div><div><span>02</span><p><strong>Request the view you need</strong><small>Use the board or game endpoint for that sport.</small></p></div><div><span>03</span><p><strong>Retain source context</strong><small>Keep timestamps, warnings, and method notes alongside values.</small></p></div></div></div></section>

    <section class="api-faq api-wrap" aria-labelledby="api-faq-title"><div><p class="api-label">Good to know</p><h2 id="api-faq-title">API questions, plainly answered.</h2></div><div class="api-faq-list">
      <details><summary>Is this a real-time sportsbook odds API?<span aria-hidden="true">+</span></summary><p>No. This preview focuses on schedules, research, game context, and source metadata. It may include selected captured price comparisons, but it is not a comprehensive real-time feed from sportsbooks.</p></details>
      <details><summary>Which sports are covered?<span aria-hidden="true">+</span></summary><p>VisualOdds’s current research tools cover NFL, NBA, WNBA, MLB, NHL, and soccer. Individual API routes, markets, historical depth, and live data availability vary by sport.</p></details>
      <details><summary>Do I need an API key?<span aria-hidden="true">+</span></summary><p>The preview routes linked on this page are publicly readable in the current deployment. There is no API-key provisioning, published rate-limit policy, production SLA, or commercial data license advertised here.</p></details>
      <details><summary>Can I use the model outputs as betting picks?<span aria-hidden="true">+</span></summary><p>No. Estimates are experimental research outputs. Past results and model values are not guaranteed probabilities, betting advice, or evidence of future profit. Inspect the method, sample, and sources.</p></details>
    </div></section>

    <section class="api-closing"><div class="api-wrap api-closing-inner"><div><p class="api-label">Explore the data</p><h2>Start with a response.<br>Check every source.</h2></div><div><p>Open a public catalog response, then use the workspace to inspect the data behind each research view.</p><a class="api-button" href="/api/sports/catalog?sport=nba&amp;market=points">Open the NBA catalog <span aria-hidden="true">↗</span></a></div></div></section>
  </main>

  <footer class="api-footer"><div class="api-wrap api-footer-inner"><a class="api-brand" href="/" aria-label="VisualOdds home"><img src="/favicon.svg" width="30" height="30" alt=""><span>Visual<span>Odds</span></span></a><nav aria-label="Footer navigation"><a href="/research">Research workspace</a><a href="/betting-education">Betting Education</a><a href="/odds-api" aria-current="page">Sports betting API</a><a href="/online-sports-betting">State guides</a></nav><p>Independent sports research. Data coverage and freshness vary by source. VisualOdds does not place bets.</p></div></footer>
</body>
</html>`;
}

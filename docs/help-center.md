# Help center

The help center is public and works without signing in. The default routes are:

- `/help` — collections and article search (`?q=...`).
- `/help/collections/:id` — a collection of related articles.
- `/help/articles/:slug` — an individual article.

Unknown help collections, articles, and nested paths return 404. The existing application home, authentication, API, account, and support routes keep their existing behavior. Search terms remain URL query parameters; they do not become HTML or executable code.

Run the normal local app and open `/help`. No domain or DNS setup is required for this preview. Help assets are served from `/help.css`, `/help.js`, and `/help-search.js`. The renderer also supports a future dedicated host, but **no domain, DNS record, hosting domain, or deployment has been activated by this work**.

## Optional future help subdomain

After choosing and owning a domain, configure these values on the deployment that serves this application:

```dotenv
# Example placeholders only; replace them with domains you control.
HELP_CENTER_HOST=help.your-domain.example
PUBLIC_SITE_URL=https://your-domain.example
```

`HELP_CENTER_HOST` must be one hostname, without a scheme, port, path, wildcard, or comma-separated list. Matching is case-insensitive and exact; a similar suffix, arbitrary request host, or forwarded host does not enable the help site. `PUBLIC_SITE_URL` must be the canonical main application origin. If it is unset, routing uses `BETTER_AUTH_URL`. The help host and application host must differ. HTTPS is required except for an explicit loopback HTTP origin used in local tests. Invalid or incomplete subdomain configuration does not activate host-root help routing.

On that configured host the help routes become `/`, `/collections/:id`, and `/articles/:slug`. Assets remain at their existing absolute paths. Authentication, API, and support paths are not remapped into help content. The `/help` routes remain available as a preview; on the configured help host their app links also use the canonical main origin.

Account cookies remain scoped to their existing host. The help renderer receives the canonical application origin so its sign-in, support-ticket, account, and product links go back to the main application. No cookie-domain expansion, trusted-origin addition, authentication bypass, or localhost-binding relaxation is needed.

To activate the subdomain later:

1. Add the chosen help hostname to the hosting project's domain configuration for this application and complete its ownership verification.
2. At the DNS provider, create exactly the DNS record and target supplied by that hosting project. Do not invent an IP address or copy a target from another project.
3. Set the two application variables above, keeping the main account origin aligned with the deployed application.
4. Deploy the reviewed code, wait for the hosting platform to confirm DNS and HTTPS, then verify the help home, one collection, one article, and search.
5. Verify support and sign-in links return to the main app and that the main app home, authenticated APIs, and staff MFA still work normally.

This configuration prepares routing only. Purchasing a domain, editing DNS, adding hosting domains, and deploying remain separate actions.

## Verification

`node --test test/help-center-routes.test.mjs` checks renderer routing, public HTTP access, query escaping, unknown-page responses, exact-host activation, canonical app links, unchanged main-home routing, asset serving, and preservation of existing authentication and local host restrictions. Tests use loopback servers and mock domains; they do not contact a DNS provider or publish a site.

The catalog contains 26 original SportsLab articles in five collections. Search covers titles, summaries, collection names, and article text; titles rank first. Typing filters immediately, and submitting the search form produces a shareable `?q=` URL. Server-rendered collections, articles, and submitted search results also work without JavaScript.

On 2026-09-27, 30 targeted tests passed across help routing/search, connected admin routes, support operations, and site layout. Browser verification covered live search, submitted search, a full article and its collection, empty results and clearing search, and 390-pixel mobile layouts without document overflow.

The header ticket link was followed while signed out, through genuine sign-in and MFA, back to `/support#new-report`. A disposable ticket was submitted, appeared in My reports, and was then verified in `/admin/support`. This used the isolated in-memory fixture database, not a production customer account. The public help center itself does not require sign-in; creating or following a ticket requires an account. Support updates are shown in the account and do not claim email delivery.

Visual evidence is saved in `reports/help-center-desktop.png`, `reports/help-center-mobile.png`, and `reports/help-ticket-admin-verified.png`.

# Sportslab on Sites

This is the Sites-owned copy of the current Sportslab experience. Edit `public/` for the pages, styles, and browser behavior. The build renders the shared navigation from `lib/site-layout.mjs` and packages the site as a Cloudflare Worker.

The `/api/*` endpoints and OCR files are fetched from the existing NFL Lab service at `https://nfl-lab-xi.vercel.app`. That service remains responsible for live analytics and data storage. Future changes to those calculations still need to be made in that service until they are migrated into Sites.

Run `npm run build` to prepare `dist/server/index.js` and `npm run check` to verify the rendered routes and local assets. The Sites publishing workflow saves this directory as the Site source.

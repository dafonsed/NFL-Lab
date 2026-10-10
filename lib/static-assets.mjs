// Public code, styles, images and fonts. Each file is read, hashed and compressed once per change (not on
// every request), carries an ETag so a browser that has it gets a 304, and is cacheable:
//   - images and fonts, and code or styles requested with a version (?v=...), stay fresh in the browser
//     for a day and are revalidated in the background after that;
//   - unversioned code and styles are revalidated on every load (one module from an older deploy beside
//     newer ones would break the page), which costs a 304 when nothing changed;
//   - Vercel's CDN keeps every file until the next deployment replaces its cache, so a visit doesn't run
//     the function once per asset.
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { promisify } from 'node:util';
import { brotliCompress, gzip, constants as zlib } from 'node:zlib';
import { acceptsGzip } from './http-compression.mjs';

const brotli = promisify(brotliCompress), gzipped = promisify(gzip);
const files = new Map();
const COMPRESSIBLE = /^(text\/|application\/(json|javascript|manifest\+json)|image\/svg\+xml)/;
const LONG_LIVED = /^(image|font)\//;

const acceptsBrotli = (value = '') => String(value).toLowerCase().split(',').some(part => {
  const [name, ...params] = part.trim().split(';');
  const quality = params.find(item => item.trim().startsWith('q='));
  return name === 'br' && (quality === undefined || Number(quality.trim().slice(2)) > 0);
});

async function load(file, type) {
  const stat = await fs.stat(file);
  const known = files.get(file);
  if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size) return known;
  const raw = await fs.readFile(file);
  const entry = { mtimeMs: stat.mtimeMs, size: stat.size, raw, etag: `"${createHash('sha1').update(raw).digest('base64url').slice(0, 22)}"`, encoded: new Map() };
  // Vercel's edge compresses function responses itself.
  entry.compressible = !process.env.VERCEL && raw.length >= 1024 && COMPRESSIBLE.test(type);
  files.set(file, entry);
  return entry;
}

async function encoded(entry, encoding) {
  if (!entry.encoded.has(encoding)) {
    const body = encoding === 'br'
      ? await brotli(entry.raw, { params: { [zlib.BROTLI_PARAM_QUALITY]: 9, [zlib.BROTLI_PARAM_SIZE_HINT]: entry.raw.length } })
      : await gzipped(entry.raw, { level: 9 });
    entry.encoded.set(encoding, body.length < entry.raw.length ? body : entry.raw);
  }
  return entry.encoded.get(encoding);
}

export function staticCacheControl(type, versioned) {
  return LONG_LIVED.test(type) || versioned ? 'public, max-age=86400, stale-while-revalidate=604800' : 'no-cache';
}

/** Sends a public static file (`type` is its Content-Type without charset). */
export async function sendStaticAsset(req, res, file, type, { versioned = false } = {}) {
  const entry = await load(file, type);
  const headers = {
    'Content-Type': type.startsWith('text/') || type.endsWith('javascript') || type.endsWith('json') ? `${type}; charset=utf-8` : type,
    'Cache-Control': staticCacheControl(type, versioned),
    'Vercel-CDN-Cache-Control': 'max-age=31536000',
    ETag: entry.etag,
    ...(entry.compressible ? { Vary: 'Accept-Encoding' } : {}),
  };
  const wanted = String(req.headers['if-none-match'] || '').split(',').map(tag => tag.trim().replace(/^W\//, ''));
  if (wanted.includes(entry.etag) || wanted.includes('*')) { res.writeHead(304, headers); return res.end(); }
  let body = entry.raw;
  if (entry.compressible) {
    const encoding = acceptsBrotli(req.headers['accept-encoding']) ? 'br' : acceptsGzip(req.headers['accept-encoding']) ? 'gzip' : '';
    if (encoding) {
      const compressed = await encoded(entry, encoding);
      if (compressed !== entry.raw) { body = compressed; headers['Content-Encoding'] = encoding; }
    }
  }
  if (res.destroyed) return;
  res.writeHead(200, { ...headers, 'Content-Length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
}

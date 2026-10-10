import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { sendStaticAsset, staticCacheControl } from '../lib/static-assets.mjs';

function respond(headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const res = { destroyed: false, status: 0, headers: {}, writeHead(status, values) { this.status = status; this.headers = values; }, end(body) { resolve({ status: this.status, headers: this.headers, body }); } };
    respond.send({ method, headers }, res).catch(reject);
  });
}

test('a static file carries an ETag, answers 304 when the browser has it, and is compressed once', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'static-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'app.js');
  await fs.writeFile(file, 'export const x = 1;\n'.repeat(200));
  respond.send = (req, res) => sendStaticAsset(req, res, file, 'text/javascript');
  const first = await respond({ 'accept-encoding': 'br, gzip' });
  assert.equal(first.status, 200);
  assert.equal(first.headers['Content-Encoding'], 'br');
  assert.equal(brotliDecompressSync(first.body).toString(), 'export const x = 1;\n'.repeat(200));
  assert.equal(first.headers['Cache-Control'], 'no-cache', 'unversioned code is revalidated on every load');
  assert.match(first.headers.ETag, /^"[\w-]+"$/);
  const cached = await respond({ 'if-none-match': `W/${first.headers.ETag}` });
  assert.equal(cached.status, 304);
  assert.equal(cached.body, undefined);
  await fs.writeFile(file, 'export const x = 22;\n'.repeat(200));
  const changed = await respond({ 'if-none-match': first.headers.ETag });
  assert.equal(changed.status, 200, 'a changed file is sent again');
  assert.notEqual(changed.headers.ETag, first.headers.ETag);
  assert.equal(changed.headers['Content-Encoding'], undefined, 'no encoding unless the browser accepts one');
});

test('images, fonts and versioned code stay fresh in the browser for a day', () => {
  assert.match(staticCacheControl('image/png', false), /max-age=86400/);
  assert.match(staticCacheControl('font/woff2', false), /max-age=86400/);
  assert.match(staticCacheControl('text/javascript', true), /max-age=86400/);
  assert.equal(staticCacheControl('text/css', false), 'no-cache');
});

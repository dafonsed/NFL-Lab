import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('homepage league artwork and typography are served as local assets', async () => {
  const script = `
    import assert from 'node:assert/strict';
    import server from './server.mjs';
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    try {
      for (const league of ['nfl', 'nba', 'wnba', 'mlb', 'nhl', 'premier']) {
        const response = await fetch(base + '/assets/leagues/' + league + '.png');
        assert.equal(response.status, 200, league);
        assert.ok(response.headers.get('content-type').startsWith('image/png'));
        const bytes = new Uint8Array(await response.arrayBuffer());
        assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      }
      const font = await fetch(base + '/assets/fonts/InterVariable.woff2');
      assert.equal(font.status, 200);
      assert.ok(font.headers.get('content-type').startsWith('font/woff2'));
      assert.equal(Buffer.from(await font.arrayBuffer()).subarray(0, 4).toString(), 'wOF2');
      const license = await fetch(base + '/assets/fonts/Inter-LICENSE.txt');
      assert.equal(license.status, 200);
      assert.match(await license.text(), /SIL OPEN FONT LICENSE/);
      for (const unknown of ['/assets/leagues/unknown.png', '/assets/fonts/unknown.woff2']) {
        assert.equal((await fetch(base + unknown)).status, 404);
      }
    } finally {
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    cwd: new URL('../', import.meta.url), env: { ...process.env, VERCEL: '1' }, windowsHide: true,
  });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  assert.equal(code, 0, output);
});

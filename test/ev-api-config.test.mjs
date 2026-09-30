import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEvApiConfig } from '../lib/ev-api-proxy.mjs';

test('the quote API can be local, private, or a public HTTPS IP or domain', () => {
  for (const address of ['http://127.0.0.1:8000/', 'http://192.168.1.20:8000', 'https://api.example.com', 'https://203.0.113.10:8443']) {
    assert.equal(parseEvApiConfig({ address, apiKey: 'k' }).apiKey, 'k', address);
  }
});

test('public plain HTTP needs an explicit opt-in; unsafe addresses are refused', () => {
  assert.throws(() => parseEvApiConfig({ address: 'http://203.0.113.10:8000', apiKey: 'k' }), /must use HTTPS/);
  assert.ok(parseEvApiConfig({ address: 'http://203.0.113.10:8000', apiKey: 'k', allowHttp: '1' }));
  for (const address of ['http://169.254.169.254', 'https://api.example.com/v1', 'https://user:pw@api.example.com', 'ftp://api.example.com']) {
    assert.throws(() => parseEvApiConfig({ address, apiKey: 'k', allowHttp: '1' }), undefined, address);
  }
  assert.throws(() => parseEvApiConfig({ address: 'https://api.example.com', apiKey: ' ' }), /EV_TOOL_API_KEY/);
});

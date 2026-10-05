import test from 'node:test';
import assert from 'node:assert/strict';
import { toolDataLabel } from '../public/ev-feed.js';

// The data label beside each tool says what the member is looking at: loading, failed, partial or current.
test('DFS tools label loading, failed, partial and complete feed answers', () => {
  const feedLine = { id: 'a', source: 'local-api' };
  assert.equal(toolDataLabel('fantasy', { dfs: [], dfsLoading: true }, 'API snapshot'), 'Loading DFS lines');
  assert.equal(toolDataLabel('fantasy', { dfs: [], dfsError: 'The DFS lines could not be loaded.' }, 'API snapshot'), 'DFS lines unavailable');
  assert.equal(toolDataLabel('optimizer', { dfs: [feedLine], dfsError: 'timed out' }, 'API snapshot'), 'DFS lines (last update failed)', 'the last lines stay, marked');
  assert.equal(toolDataLabel('slip', { dfs: [feedLine], dfsWarning: 'Payout tables are unavailable.' }, 'API snapshot'), 'Feed DFS lines (partial)');
  assert.equal(toolDataLabel('slip', { dfs: [feedLine] }, 'API snapshot'), 'Feed DFS lines');
  assert.equal(toolDataLabel('fantasy', { dfs: [] }, 'API snapshot'), 'No DFS props', 'an empty answer is empty, not an error');
  assert.equal(toolDataLabel('ev-pre', { dfs: [] }, 'API snapshot'), 'API snapshot', 'quote tools use the snapshot label');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanString, json, error } from '../src/http.js';
import { buildLeadFilters } from '../src/db.js';

test('cleanString trims, limits and normalizes empty values', () => {
  assert.equal(cleanString('  hello  '), 'hello');
  assert.equal(cleanString('abcdef', 3), 'abc');
  assert.equal(cleanString('   '), null);
  assert.equal(cleanString(undefined), null);
});

test('JSON helpers return JSON responses with expected status', async () => {
  const response = json({ ok: true });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
  const failure = error('bad request', 422);
  assert.equal(failure.status, 422);
  assert.deepEqual(await failure.json(), { error: 'bad request' });
});

test('lead filters bind values instead of interpolating user input', () => {
  const url = new URL('https://example.test/api/leads?q=alice&status=new&quality=high&segment_id=12');
  const result = buildLeadFilters(url);
  assert.match(result.where, /telegram_id LIKE/);
  assert.match(result.where, /status = \?/);
  assert.match(result.where, /quality = \?/);
  assert.match(result.where, /segment_id=\?/);
  assert.deepEqual(result.values, ['%alice%','%alice%','%alice%','%alice%','new','high',12]);
});

test('lead filters omit invalid segment IDs and empty filters', () => {
  const result = buildLeadFilters(new URL('https://example.test/api/leads?segment_id=abc'));
  assert.equal(result.where, '');
  assert.deepEqual(result.values, []);
});

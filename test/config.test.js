import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULTS, LIMITS, parseIntEnv, readConfig, publicConfig, parseMetadataQuery }
  from '../lib/config.js';

/** parseMetadataQuery takes a getter, so tests can pass a plain object. */
const query = (params, config = readConfig({})) =>
  parseMetadataQuery((key) => params[key], config);

test('numeric env vars fall back rather than accepting nonsense', () => {
  assert.equal(parseIntEnv(undefined, 30), 30);
  assert.equal(parseIntEnv('', 30), 30);
  assert.equal(parseIntEnv('abc', 30), 30);
  assert.equal(parseIntEnv('45', 30), 45);
  // THEWALL_IMAGE_INTERVAL=0 previously reached setInterval(fn, 0).
  assert.equal(parseIntEnv('0', 30, { min: 1 }), 30);
  assert.equal(parseIntEnv('-5', 30, { min: 1 }), 30);
  assert.equal(parseIntEnv('0', 2, { min: 0 }), 0, 'zero is valid where min allows it');
});

test('readConfig applies documented defaults and honours overrides', () => {
  const defaults = readConfig({});
  assert.equal(defaults.provider, 'unsplash');
  assert.equal(defaults.imageQuery, DEFAULTS.imageQuery);
  assert.equal(defaults.imageInterval, 30);
  assert.equal(defaults.metadataCount, 30);
  assert.equal(defaults.prefetchCount, 2);

  const overridden = readConfig({
    THEWALL_PROVIDER: 'pexels',
    THEWALL_IMAGE_INTERVAL: '10',
    THEWALL_IMAGE_QUERY: 'mountains',
    THEWALL_PROVIDER_KEY: 'K'
  });
  assert.equal(overridden.provider, 'pexels');
  assert.equal(overridden.imageInterval, 10);
  assert.equal(overridden.imageQuery, 'mountains');
  assert.equal(overridden.providerKey, 'K');
});

test('publicConfig never exposes the provider key', () => {
  const config = readConfig({ THEWALL_PROVIDER_KEY: 'SUPERSECRET' });
  const exposed = publicConfig(config);
  assert.ok(!('providerKey' in exposed));
  assert.ok(!JSON.stringify(exposed).includes('SUPERSECRET'));
  assert.deepEqual(Object.keys(exposed).sort(),
    ['imageInterval', 'imageQuery', 'metadataCount', 'prefetchCount', 'provider']);
});

test('count is bounded by the largest page any provider supports', () => {
  // Pexels per_page maxes at 80 and Unsplash /photos/random at 30; the previous
  // ceiling of 100 was above both.
  assert.equal(LIMITS.countMax, 80);
  assert.ok(query({ count: '1' }).ok);
  assert.ok(query({ count: '80' }).ok);
  assert.equal(query({ count: '81' }).field, 'count');
  assert.equal(query({ count: '100' }).field, 'count');
  assert.equal(query({ count: '0' }).field, 'count');
  assert.equal(query({ count: 'abc' }).field, 'count');
  assert.equal(query({}).params.count, 30, 'defaults to THEWALL_METADATA_COUNT');
});

test('start, width, orientation and query are validated', () => {
  assert.equal(query({ start: '-1' }).field, 'start');
  assert.equal(query({ start: '0' }).params.start, 0);
  assert.equal(query({ start: '999' }).params.start, 999);

  assert.equal(query({ width: '100' }).field, 'width', 'below LIMITS.widthMin');
  assert.equal(query({ width: '5000' }).field, 'width', 'above LIMITS.widthMax');
  assert.equal(query({ width: '1920' }).params.width, 1920);
  assert.equal(query({}).params.width, LIMITS.widthDefault);

  assert.equal(query({ orientation: 'squarish' }).field, 'orientation');
  assert.equal(query({ orientation: 'landscape' }).params.orientation, 'landscape');
  assert.equal(query({ orientation: 'portrait' }).params.orientation, 'portrait');
  assert.equal(query({}).params.orientation, 'landscape');

  assert.equal(query({ query: 'x'.repeat(201) }).field, 'query');
  assert.ok(query({ query: 'x'.repeat(200) }).ok);
  assert.equal(query({}).params.query, DEFAULTS.imageQuery);
});

test('an unset query parameter is not confused with an empty one', () => {
  assert.equal(query({ count: undefined }).params.count, 30);
  assert.equal(query({ count: '' }).params.count, 30);
});

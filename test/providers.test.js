import test from 'node:test';
import assert from 'node:assert/strict';

import { createUnsplashProvider } from '../providers/unsplash.js';
import { createPexelsProvider } from '../providers/pexels.js';

const silent = { info: () => {}, error: () => {} };

/** Swap in a fake fetch, capture what the provider asked for, restore after. */
function withFetch(handler, fn) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    return handler(url, options);
  };
  return Promise.resolve(fn(calls)).finally(() => { globalThis.fetch = real; });
}

const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });

const UNSPLASH_PHOTO = {
  id: 'abc',
  urls: { raw: 'https://images.unsplash.com/photo-1?ixid=X&ixlib=rb-4.0.3' },
  color: '#ffffff',
  user: { name: 'Ada', links: { html: 'https://unsplash.com/@ada' } },
  created_at: '2020-01-01T00:00:00Z',
  location: { name: 'Rome' },
  links: { download_location: 'https://api.unsplash.com/photos/abc/download?ixid=X' }
};

const PEXELS_PHOTO = {
  id: 7,
  src: { original: 'https://images.pexels.com/photos/7/x.jpeg' },
  avg_color: '#000000',
  photographer: 'Grace',
  photographer_url: 'https://www.pexels.com/@grace'
};

test('missing key is rejected at construction, not at request time', () => {
  assert.throws(() => createUnsplashProvider({ accessKey: '' }), /THEWALL_PROVIDER_KEY/);
  assert.throws(() => createPexelsProvider({ apiKey: undefined }), /THEWALL_PROVIDER_KEY/);
});

test('image URLs are sized to the requested width', async () => {
  await withFetch(ok([UNSPLASH_PHOTO]), async () => {
    const provider = createUnsplashProvider({ accessKey: 'K', logger: silent });
    const [image] = await provider.getMetadata({ width: 1920 });
    // fit=max never upscales, so a small original passes through untouched.
    assert.equal(image.url, `${UNSPLASH_PHOTO.urls.raw}&w=1920&q=80&fm=jpg&fit=max`);
  });

  await withFetch(ok({ photos: [PEXELS_PHOTO] }), async () => {
    const provider = createPexelsProvider({ apiKey: 'K', logger: silent });
    const [image] = await provider.getMetadata({ width: 3840 });
    assert.equal(image.url, `${PEXELS_PHOTO.src.original}?auto=compress&cs=tinysrgb&w=3840`);
  });
});

test('count is clamped to each provider documented maximum', async () => {
  // Unsplash /photos/random documents max 30; Pexels per_page documents max 80.
  await withFetch(ok([UNSPLASH_PHOTO]), async (calls) => {
    const provider = createUnsplashProvider({ accessKey: 'K', logger: silent });
    await provider.getMetadata({ count: 80 });
    assert.equal(new URL(calls[0].url).searchParams.get('count'), '30');
  });

  await withFetch(ok({ photos: [PEXELS_PHOTO] }), async (calls) => {
    const provider = createPexelsProvider({ apiKey: 'K', logger: silent });
    await provider.getMetadata({ count: 80 });
    assert.equal(new URL(calls[0].url).searchParams.get('per_page'), '80');
  });
});

test('the Unsplash access key never appears in the request URL', async () => {
  // It used to be passed as `client_id=`, and the URL is logged -- which put the
  // secret into Fastify stdout and `wrangler tail`.
  await withFetch(ok([UNSPLASH_PHOTO]), async (calls) => {
    const provider = createUnsplashProvider({ accessKey: 'SUPERSECRET', logger: silent });
    await provider.getMetadata({});
    assert.ok(!calls[0].url.includes('SUPERSECRET'), 'key leaked into the URL');
    assert.equal(calls[0].options.headers.Authorization, 'Client-ID SUPERSECRET');
  });
});

test('provider failures throw so the route can answer 503, never resolve to []', async () => {
  // An empty array is indistinguishable from "this query matched nothing", which
  // is what drove the client into an unbounded retry loop.
  const cases = [
    ['transport', async () => { throw new Error('boom'); }, /Unsplash request failed: boom/],
    ['non-2xx', async () => ({ ok: false, status: 429 }), /Unsplash API error: 429/],
    ['bad json', async () => ({ ok: true, json: async () => { throw new Error('nope'); } }),
      /Failed to parse Unsplash response: nope/]
  ];

  for (const [name, handler, expected] of cases) {
    await withFetch(handler, async () => {
      const provider = createUnsplashProvider({ accessKey: 'K', logger: silent });
      await assert.rejects(() => provider.getMetadata({}), expected, name);
    });
  }
});

test('download_location is carried through for Unsplash and absent elsewhere', async () => {
  await withFetch(ok([UNSPLASH_PHOTO]), async () => {
    const provider = createUnsplashProvider({ accessKey: 'K', logger: silent });
    const [image] = await provider.getMetadata({});
    assert.equal(image.download_location, UNSPLASH_PHOTO.links.download_location);
  });

  await withFetch(ok({ photos: [PEXELS_PHOTO] }), async () => {
    const provider = createPexelsProvider({ apiKey: 'K', logger: silent });
    const [image] = await provider.getMetadata({});
    assert.equal(image.download_location, undefined);
  });
});

test('download tracking refuses any host but api.unsplash.com', async () => {
  // The location arrives from the browser and the outbound request carries the
  // access key, so an unchecked URL here is an SSRF that leaks the key.
  const refused = [
    'https://evil.example.com/steal',
    'https://api.unsplash.com.evil.com/photos/x',
    'http://api.unsplash.com/photos/x/download',
    'https://attacker/api.unsplash.com/photos/',
    '//api.unsplash.com/photos/x',
    ''
  ];

  await withFetch(ok({ url: 'x' }), async (calls) => {
    const provider = createUnsplashProvider({ accessKey: 'SECRET', logger: silent });

    for (const location of refused) {
      await assert.rejects(() => provider.trackDownload(location), /Refusing to track/, location);
    }
    assert.equal(calls.length, 0, 'a refused location must not produce any request');

    await provider.trackDownload('https://api.unsplash.com/photos/abc/download?ixid=X');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].options.headers.Authorization, 'Client-ID SECRET');
  });
});

test('Pexels pagination maps start onto its 1-indexed pages', async () => {
  await withFetch(ok({ photos: [PEXELS_PHOTO] }), async (calls) => {
    const provider = createPexelsProvider({ apiKey: 'K', logger: silent });
    await provider.getMetadata({ count: 30, start: 0 });
    await provider.getMetadata({ count: 30, start: 30 });
    await provider.getMetadata({ count: 30, start: 60 });
    const pages = calls.map(c => new URL(c.url).searchParams.get('page'));
    assert.deepEqual(pages, ['1', '2', '3']);
  });
});

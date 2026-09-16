import test from 'node:test';
import assert from 'node:assert/strict';
import { before, after } from 'node:test';
import { once } from 'node:events';
import { createHmac } from 'node:crypto';
import { accessToken, server } from './server.js';

let origin;

before(async () => {
  server.listen(0);
  await once(server, 'listening');
  const address = server.address();
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  server.close();
  await once(server, 'close');
});

async function request(path, options) {
  const response = await fetch(new URL(path, origin), options);
  return { response, data: await response.json() };
}

test('access tokens are deterministic and email-normalized', () => {
  assert.equal(accessToken('USER@example.com'), accessToken('user@example.com'));
  assert.notEqual(accessToken('one@example.com'), accessToken('two@example.com'));
});

test('malformed JSON returns a controlled 400 response', async () => {
  const { response, data } = await request('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"email":'
  });

  assert.equal(response.status, 400);
  assert.deepEqual(data, { error: 'Invalid JSON body.' });
});

test('non-object JSON bodies return a controlled 400 response', async () => {
  const { response, data } = await request('/api/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(['user@example.com'])
  });

  assert.equal(response.status, 400);
  assert.deepEqual(data, { error: 'Request body must be a JSON object.' });
});

test('missing Stripe signature headers return an invalid signature response', async () => {
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = 'test-webhook-secret';

  try {
    const { response, data } = await request('/api/stripe/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'checkout.session.completed', data: { object: {} } })
    });

    assert.equal(response.status, 400);
    assert.deepEqual(data, { error: 'Invalid webhook signature.' });
  } finally {
    if (originalSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
  }
});

test('valid webhook signatures still return a controlled 400 response for malformed JSON', async () => {
  const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
  process.env.STRIPE_WEBHOOK_SECRET = 'test-webhook-secret';
  const raw = '{"type":';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', process.env.STRIPE_WEBHOOK_SECRET)
    .update(`${timestamp}.${raw}`)
    .digest('hex');

  try {
    const { response, data } = await request('/api/stripe/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': `t=${timestamp},v1=${signature}`
      },
      body: raw
    });

    assert.equal(response.status, 400);
    assert.deepEqual(data, { error: 'Invalid JSON body.' });
  } finally {
    if (originalSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET;
    else process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
  }
});

test('repository-root static file fallback still serves existing assets', async () => {
  const response = await fetch(new URL('/styles.css', origin));
  const text = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^text\/css; charset=utf-8$/);
  assert.match(text, /body/i);
});

test('path traversal attempts are rejected', async () => {
  const { response, data } = await request('/..%2Fpackage.json');

  assert.equal(response.status, 404);
  assert.deepEqual(data, { error: 'Not found' });
});

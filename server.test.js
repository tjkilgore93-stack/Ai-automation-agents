import test from 'node:test';
import assert from 'node:assert/strict';
import { accessToken } from '../server.js';

test('access tokens are deterministic and email-normalized', () => {
  assert.equal(accessToken('USER@example.com'), accessToken('user@example.com'));
  assert.notEqual(accessToken('one@example.com'), accessToken('two@example.com'));
});

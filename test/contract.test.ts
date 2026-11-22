import assert from 'node:assert/strict';
import { test } from 'node:test';
import spec from '@twforge/developer-api/openapi.json' with { type: 'json' };
import { API_VERSION, apiBaseUrl } from '../src/api/client.ts';

test('the contract major version is the API version the client speaks', () => {
  assert.equal(Number(spec.info.version.split('.')[0]), API_VERSION);
});

test('the default API base URL is the server the contract declares', () => {
  assert.deepEqual(
    spec.servers.map((server) => server.url),
    [apiBaseUrl(undefined)],
  );
});

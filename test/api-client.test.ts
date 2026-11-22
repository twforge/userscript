import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type ApiClient, ApiError, type ErrorResponse, apiBaseUrl, createApiClient } from '../src/api/client.ts';

/** A fetch that answers with `body`: sent as is if it's a string or null, as JSON otherwise. */
function stubFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn: typeof fetch = async (input, init = {}) => {
    calls.push({ url: String(input), init });
    return typeof body === 'string' || body === null
      ? new Response(body, { status })
      : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetchFn, calls };
}

function client(fetchFn: typeof fetch, getApiKey: () => string | null = () => null) {
  return createApiClient('https://api.test', getApiKey, fetchFn);
}

function requestDossier(api: ApiClient) {
  return api.request('get', '/reports/tw/worlds/{world}/villages/{villageId}/dossier', {
    path: { world: 'de250', villageId: 42 },
  });
}

test('fills path parameters and sends the API key', async () => {
  const { fetchFn, calls } = stubFetch(200, {});
  await requestDossier(createApiClient('https://api.test/', () => 'key', fetchFn));

  assert.equal(calls[0]?.url, 'https://api.test/api/v1/reports/tw/worlds/de250/villages/42/dossier');
  assert.equal(new Headers(calls[0]?.init.headers).get('Authorization'), 'key');
});

test('sends a JSON body', async () => {
  const { fetchFn, calls } = stubFetch(200, {});
  await client(fetchFn).request('post', '/reports/tw/worlds/{world}/report-import-tasks', {
    path: { world: 'de250' },
    body: { text: 'slug' },
  });

  assert.equal(calls[0]?.init.method, 'POST');
  assert.equal(calls[0]?.init.body, '{"text":"slug"}');
  assert.equal(new Headers(calls[0]?.init.headers).get('Content-Type'), 'application/json');
});

test('throws an ApiError with the error response', async () => {
  const errorResponse: ErrorResponse = {
    timestamp: '2026-11-22T10:00:00Z',
    code: 'unauthorized',
    message: 'Invalid API key',
    rejectedArguments: [],
    args: {},
  };
  const { fetchFn } = stubFetch(401, errorResponse);

  await assert.rejects(
    requestDossier(client(fetchFn)),
    (error) =>
      error instanceof ApiError &&
      error.status === 401 &&
      error.message === 'Invalid API key' &&
      error.body?.code === 'unauthorized',
  );
});

test('an error body that is not an API error response is not passed on as one', async () => {
  for (const body of ['Bad Gateway', 'null', '{"error":"rate limited"}']) {
    const { fetchFn } = stubFetch(503, body);
    await assert.rejects(
      requestDossier(client(fetchFn)),
      (error) => error instanceof ApiError && error.status === 503 && error.body === undefined,
    );
  }
});

test('a 204 response resolves with undefined', async () => {
  const { fetchFn } = stubFetch(204, null);
  const result = await client(fetchFn).request(
    'delete',
    '/planner/tw/worlds/{world}/support-boosts/players/{playerId}/tribe-skill-activations/{id}',
    { path: { world: 'de250', playerId: 1, id: 2 } },
  );
  assert.equal(result, undefined);
});

test('sends array query parameters comma-separated', async () => {
  const { fetchFn, calls } = stubFetch(200, []);
  await client(fetchFn).request('get', '/analyser/tw/worlds/{world}/incoming-attacks', {
    path: { world: 'de250' },
    query: { 'defender-id': [1, 2] },
  });

  const url = new URL(calls[0]?.url ?? '');
  assert.equal(url.searchParams.get('defender-id'), '1,2');
  assert.equal(url.searchParams.has('village-id'), false);
});

test('apiBaseUrl appends the API path and defaults empty base URLs', () => {
  assert.equal(apiBaseUrl('https://twforge.net'), 'https://twforge.net/api/v1');
  assert.equal(apiBaseUrl('http://localhost:4200/'), 'http://localhost:4200/api/v1');
  assert.equal(apiBaseUrl(''), 'https://twforge.net/api/v1');
  assert.equal(apiBaseUrl(undefined), 'https://twforge.net/api/v1');
});

// Type-level only: the client can't send multipart/form-data, so operations with such a body aren't offered.
export function multipartOperationsAreNotOffered(api: ApiClient) {
  // @ts-expect-error The body of POST /db-info/userscript is multipart/form-data.
  void api.request('post', '/db-info/userscript', { query: { action: 'tribalwars' } });
}

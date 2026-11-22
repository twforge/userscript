// Client for the TW Forge Developer API, typed with the published contract (@twforge/developer-api).
// The contract package only provides types, which are erased at build time: no third-party code ends up in the
// bundle (game script rules). `npm run typecheck` fails if the script uses a path, parameter, body or field the
// contract doesn't have.

import type { components, paths } from '@twforge/developer-api';

/** The API path version this script speaks. Must match the major version of @twforge/developer-api. */
export const API_VERSION = 1;

/** Where TW Forge runs, unless the loader config (`TWForgeConfig.baseUrl`) points elsewhere. */
export const DEFAULT_BASE_URL = 'https://twforge.net';

/** The TW Forge base URL without trailing slash: `DEFAULT_BASE_URL` if `baseUrl` is empty or missing. */
export function twforgeBaseUrl(baseUrl: string | undefined): string {
  return (baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

/** The API base URL under a TW Forge base URL. The version lives here, not in the loader config. */
export function apiBaseUrl(baseUrl: string | undefined): string {
  return `${twforgeBaseUrl(baseUrl)}/api/v${API_VERSION}`;
}

type Method = 'get' | 'post' | 'put' | 'delete';

/** The paths that have an operation for the method. */
type PathsWith<M extends Method> = { [P in keyof paths]: paths[P][M] extends undefined ? never : P }[keyof paths];

type Operation<P extends keyof paths, M extends Method> = NonNullable<paths[P][M]>;

/**
 * Path and query parameters as the contract declares them, plus the JSON body if the operation has one. A body that
 * isn't JSON (multipart/form-data) makes this `never`, so such operations can't be called. Header parameters are left
 * out: the only one is `Origin`, which the browser sets itself.
 */
type RequestOptions<O> = (O extends { parameters: infer P } ? Pick<P, Extract<keyof P, 'path' | 'query'>> : object) &
  (O extends { requestBody: infer B }
    ? B extends { content: { 'application/json': infer J } }
      ? { body: J }
      : never
    : object);

/** The JSON body of the 200 response; `undefined` for operations that answer 204. */
type SuccessBody<O> = O extends { responses: { 200: { content: { 'application/json': infer R } } } } ? R : undefined;

export type ErrorResponse = components['schemas']['ErrorResponse'];

/** An HTTP error response from the API (network failures reject with fetch's own error). */
export class ApiError extends Error {
  readonly status: number;
  /** The API's error response; `undefined` if the body isn't one (e.g. an error page from a proxy). */
  readonly body: ErrorResponse | undefined;

  constructor(status: number, body: ErrorResponse | undefined) {
    super(body?.message || `TW Forge API responded with HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * A client for the API under the TW Forge base URL `baseUrl` (empty or missing: the default). `getApiKey` is read on
 * every request, so a key entered later applies at once.
 */
export function createApiClient(
  baseUrl: string | undefined,
  getApiKey: () => string | null,
  fetchFn: typeof fetch = fetch,
) {
  const apiBase = apiBaseUrl(baseUrl);

  async function request<M extends Method, P extends PathsWith<M>>(
    method: M,
    path: P,
    options: RequestOptions<Operation<P, M>>,
  ): Promise<SuccessBody<Operation<P, M>>> {
    const {
      path: pathParams = {},
      query = {},
      body,
    } = options as {
      path?: Record<string, string | number>;
      query?: Record<string, string | number | boolean | readonly (string | number)[] | undefined>;
      body?: unknown;
    };

    const url = new URL(
      apiBase + path.replace(/\{(\w+)\}/g, (_, name: string) => encodeURIComponent(pathParams[name]!)),
    );
    for (const [name, value] of Object.entries(query)) {
      // Arrays comma-separated: all array parameters in the contract are `explode: false`.
      if (value !== undefined) url.searchParams.set(name, Array.isArray(value) ? value.join(',') : String(value));
    }

    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const key = getApiKey();
    if (key) headers['Authorization'] = key;

    const response = await fetchFn(url, {
      method: method.toUpperCase(),
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      // Error responses may come from a proxy rather than the API: only an actual error response becomes `body`.
      const error = await response.json().catch(() => undefined);
      throw new ApiError(response.status, typeof error?.code === 'string' ? error : undefined);
    }
    return response.status === 204 ? (undefined as SuccessBody<Operation<P, M>>) : response.json();
  }

  return { request };
}

export type ApiClient = ReturnType<typeof createApiClient>;

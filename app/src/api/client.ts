import { getConfig } from '../config.js';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string };
}

/**
 * One place that knows how to reach the API. Callers pass the access token
 * explicitly rather than reading it from a module-level singleton, so a stale
 * token cannot leak in from somewhere unexpected.
 */
export async function apiFetch<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${getConfig().apiUrl}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
      ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
  });

  if (!res.ok) {
    // A non-JSON body is possible (a CloudFront or gateway error page), so
    // parsing must never be what surfaces to the user.
    let code = 'request_failed';
    let message = `Request failed with ${res.status}`;
    try {
      const body = (await res.json()) as ErrorBody;
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // keep the defaults
    }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

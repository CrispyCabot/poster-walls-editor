import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { createMiddleware } from 'hono/factory';
import { ApiError } from './errors.js';

export interface AuthedUser {
  sub: string;
  username: string;
}

export type TokenVerifier = (token: string) => Promise<AuthedUser>;

export type AuthedEnv = { Variables: { user: AuthedUser } };

export function createAuthMiddleware(verify: TokenVerifier) {
  return createMiddleware<AuthedEnv>(async (c, next) => {
    const header = c.req.header('Authorization');
    if (header === undefined || !header.startsWith('Bearer ')) {
      throw new ApiError(401, 'unauthorized', 'Missing bearer token');
    }

    let user: AuthedUser;
    try {
      user = await verify(header.slice('Bearer '.length));
    } catch {
      // Deliberately opaque: the caller learns the token failed, not how.
      throw new ApiError(401, 'unauthorized', 'Invalid token');
    }

    c.set('user', user);
    await next();
  });
}

/**
 * Production verifier. `cognitoVerifier()` itself is called unconditionally by
 * `createApp` whenever no `verify` is injected — including in tests that never
 * hit `/me` — so the `CognitoJwtVerifier` instance must be built lazily, on the
 * first actual verification, not here. Building it eagerly would call
 * `CognitoJwtVerifier.create()` with an empty `userPoolId` in every test that
 * doesn't inject a fake verify, which throws synchronously before any request
 * is ever handled.
 */
export function cognitoVerifier(): TokenVerifier {
  let verifier: ReturnType<typeof buildVerifier> | undefined;

  function buildVerifier() {
    return CognitoJwtVerifier.create({
      userPoolId: process.env.USER_POOL_ID ?? '',
      tokenUse: 'access',
      clientId: process.env.USER_POOL_CLIENT_ID ?? '',
    });
  }

  return async (token) => {
    if (verifier === undefined) {
      try {
        verifier = buildVerifier();
      } catch (err) {
        // Misconfiguration, not a bad token. Make it findable in CloudWatch —
        // the caller still gets a generic 401, which is indistinguishable from
        // an invalid token without this log line.
        console.error('failed to construct Cognito verifier', err);
        throw err;
      }
    }
    const payload = await verifier.verify(token);
    return { sub: payload.sub, username: String(payload.username) };
  };
}

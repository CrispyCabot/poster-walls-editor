# @pwe/app

The frontend. A React 19 + Vite single-page app that signs in against Cognito
and talks to `@pwe/api`.

## Layout

```
src/
  main.tsx           entrypoint — router and providers
  config.ts          reads VITE_* env vars into a typed AppConfig
  auth/
    oidc.ts           the oidc-client-ts UserManager, configured for Cognito
    AuthProvider.tsx  React context exposing useAuth()
  routes/
    Home.tsx          sign in / sign out
    Callback.tsx      OIDC redirect target
```

## Running locally

```bash
cp app/.env.example app/.env.local
```

Fill in `app/.env.local` with the Cognito and API values from the stack
outputs (`VITE_API_URL`, `VITE_COGNITO_DOMAIN`, `VITE_USER_POOL_CLIENT_ID`) —
these are never hardcoded, since the app is built once per environment from
whatever CloudFormation produced. Then:

```bash
npm run dev --workspace app
```

## Auth flow

Signing in redirects to the Cognito Hosted UI using the OIDC authorization-code
flow with PKCE; Cognito redirects back to `/callback`, which exchanges the code
for tokens and hands control back to the app via `useAuth()`.

Once signed in, `Home` calls `GET /me` on `@pwe/api` with the access token as a
bearer credential, proving the token Cognito issued is one the API actually
accepts — not just one the browser holds.

## Testing

From the repo root:

```bash
npx vitest run app
```

## Theming

All colours, fonts, and textures live in `src/theme/themes.css`. No other
stylesheet and no component names a colour directly, so adding a theme means
adding one block there and nothing else.

Switch themes by changing one line in `src/theme/config.ts`:

```ts
export const ACTIVE_THEME: ThemeName = 'metal';
```

| Theme | Look |
|---|---|
| `metal` | Near-black, bone white, blood red. Condensed caps, fine grain. Default. |
| `minimal` | Black, white, and red. Nothing else. |

`applyTheme()` sets `data-theme` on `<html>` at boot, so a UI switcher later
just needs to call it with a different name.

**Two things are deliberately not themed** — the wall's own background colour
and each poster's frame colour and artwork. Those are the user's data, and they
must look the same whichever theme is active.

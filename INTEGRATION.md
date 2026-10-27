# Integration Notes (weslien/macro fork)

This repository is a fork of Macro (AGPL v3). It is published at
<https://github.com/weslien/macro> so that all modifications are source-available
to network users, as required by the AGPL v3. No code from this fork is imported
into any proprietary repository — the boundary is always HTTP.

## Modifications in this fork

### Gateway session handoff (option B: OIDC gateway → Macro session)

Macro's authentication service implements FusionAuth's admin REST contract,
which the platform's IdP (Authentik) does not. Instead of running FusionAuth,
the platform's orbit-gateway (a separate, Apache-2.0 Go service) issues
HS256 JWTs (kid `gateway`) matching Macro's `MacroAccessToken` claim struct
(`aud`, `iss`, `exp`, `tid`, `email`, `fusion_user_id`, `macro_user_id`,
`macro_organization_id`), signed with the same `JWT_SECRET_KEY` the Macro
services validate against. Macro's `macro_auth` crate routes any `kid != "macro"`
token down the HS256 `MacroAccessToken` path, so the services accept these
tokens unchanged.

The handoff to the web app is a redirect with the tokens in the URL fragment:

```
GET https://api.platform.weslien.org/auth/macro/login?redirect=<workspace URL>
  → 302 <workspace URL>#macro_access_token=<jwt>&macro_refresh_token=<jwt>
```

- `apps/web/src/lib/core/auth/gatewayHandoff.ts` (new): consumes the fragment
  once, stores the session as `macro-access-token` / `macro-refresh-token`
  cookies (and the environment-prefixed variants the services resolve from
  their ENVIRONMENT setting), and strips the fragment from the URL.
- `apps/web/src/lib/service-clients/service-auth/client.ts`: exports
  `applyGatewayHandoffTokens` — persists the handed-over tokens the same way
  the session-code login does.
- `apps/web/src/features/auth/Login.tsx`: consumes the handoff on the login
  route and runs the same post-login invalidation as the session-code path.

The fragment is used (rather than a query parameter) so the tokens never appear
in server logs or Referer headers.

## Deployment

See `deploy/BUILD_AND_DEPLOY.md` for the PoC deployment topology (services,
env-var discovery, and the JWT format).

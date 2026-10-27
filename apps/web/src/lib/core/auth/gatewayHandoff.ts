/**
 * Gateway session handoff for self-hosted Macro deployments.
 *
 * When the workspace web app is deployed behind a platform gateway that owns
 * SSO (e.g. an OIDC gateway in front of a self-hosted Macro backend), the
 * gateway can mint Macro session tokens for an already-logged-in user and
 * hand them to this app via a URL fragment redirect:
 *
 *   https://<web-host>/app/login#macro_access_token=<jwt>&macro_refresh_token=<jwt>
 *
 * Using the fragment keeps the tokens out of server logs and Referer headers.
 * This module consumes that fragment once, stores the session the same way the
 * in-app session-code login does (macro-access-token cookies + the persisted
 * token store), and strips the fragment from the URL.
 */

export type GatewayHandoffTokens = {
  accessToken: string;
  refreshToken: string;
};

const ACCESS_TOKEN_PARAM = 'macro_access_token';
const REFRESH_TOKEN_PARAM = 'macro_refresh_token';

function stripFragment() {
  if (typeof history !== 'undefined') {
    history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}`
    );
  }
}

/**
 * Reads and removes a gateway handoff from the current URL fragment.
 * Returns null when the fragment does not carry one.
 */
export function consumeGatewayHandoffFragment(): GatewayHandoffTokens | null {
  if (typeof window === 'undefined' || !window.location.hash) {
    return null;
  }

  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get(ACCESS_TOKEN_PARAM);
  const refreshToken = params.get(REFRESH_TOKEN_PARAM);

  if (!accessToken || !refreshToken) {
    if (accessToken !== null || refreshToken !== null) {
      stripFragment();
    }
    return null;
  }

  stripFragment();
  return { accessToken, refreshToken };
}

// The backend services resolve the session cookie name from their ENVIRONMENT
// setting (`macro-access-token` in Production, `local-macro-access-token` with
// ENVIRONMENT=local, `dev-…` in Develop). The web bundle cannot know which
// mode its backend runs in, so it writes every variant — each environment
// reads only the one that matches, and the extras are inert strings that
// fail signature validation everywhere else.
const COOKIE_NAME_VARIANTS = ['', 'local-', 'dev-'];
const COOKIE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

function writeSessionCookie(name: string, value: string) {
  const isoExpiry = new Date(
    Date.now() + COOKIE_MAX_AGE_SECONDS * 1000
  ).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(
    value
  )}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; expires=${isoExpiry}; secure; samesite=lax`;
}

/**
 * Persists handoff tokens the way the backend services expect them: as the
 * macro session cookies on the web origin (so same-origin API calls — which
 * carry `credentials: 'include'` — authenticate, and the collaboration
 * websocket upgrade does too).
 */
export function storeGatewayHandoffCookies(tokens: GatewayHandoffTokens) {
  for (const prefix of COOKIE_NAME_VARIANTS) {
    writeSessionCookie(`${prefix}macro-access-token`, tokens.accessToken);
    writeSessionCookie(`${prefix}macro-refresh-token`, tokens.refreshToken);
  }
}

/** Clears every session cookie variant written by storeGatewayHandoffCookies. */
export function clearGatewayHandoffCookies() {
  for (const prefix of COOKIE_NAME_VARIANTS) {
    document.cookie = `${prefix}macro-access-token=; path=/; max-age=0`;
    document.cookie = `${prefix}macro-refresh-token=; path=/; max-age=0`;
  }
}

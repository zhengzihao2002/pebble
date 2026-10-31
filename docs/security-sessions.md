# Security session access

Better Auth's session list requires `freshSessionMiddleware`. Its default
`freshAge` is 24 hours, measured from `createdAt`, independently of whether
the session remains active through regular use. An old, valid sign-in can
therefore use the app but receive `403 SESSION_NOT_FRESH` for the session list.
Refreshing cookies does not change that creation time.

Pebble handles this with password confirmation inside the Sessions card,
using the existing same-account email/password sign-in gate. It preserves
the freshness requirement and app state instead of signing out. On success,
it refreshes the SDK session cache, revokes the replaced session, and reloads
the list. No password is stored. Revocation uses the old session ID to obtain
its token from the newly authorized list: Neon's current-session hook can
contain a JWT instead of that revocation token.

Neon SDK 0.5.0-beta throws a normalized `AuthApiError` for HTTP errors. For
freshness it changes the code to `feature_not_supported`, but preserves the
403 status and `Session is not fresh` message. Both this shape and the
original provider code are recognized. Other failures remain retryable load
errors and do not imply that credentials expired.

`node --test tests/sessionAccess.test.cjs` verifies error classification and
the confirmation/revocation flow using Better Auth's in-memory adapter.
It never connects to Neon or uses production credentials.

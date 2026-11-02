# SSO Core Postman

Generated from `docs/openapi.json` using `node scripts/build-api-docs.cjs` then `node scripts/build-postman.cjs`.

1. Import `SSO_Core_2FA.postman_collection.json` and `SSO_Core_Local.postman_environment.json`.
2. Select the local environment. Fill `username`, `password`, `clientId`, `clientSecret` (confidential clients only), and the exact registered `redirectUri`. No real credentials are exported.
3. Use a dedicated test account and test client. Do **not** run the whole collection: requests include deletion, secret rotation, unpairing, recovery rotation, and session revocation.
4. Cookie authentication uses Postman's cookie jar. Browser login does not automatically sign Postman in. Login responses may set `sso_challenge`; polling an approved challenge sets `sso_session`.
5. Start a real end-to-end OAuth round trip from the relying party in a browser. It must retain its own state/verifier. The authorize pre-request script generates fresh state + S256 PKCE values for manual API testing, but does not establish the relying party's browser cookies. Inspect redirects without following them if you need the AuthSession ID; set `sessionId` yourself. Never bypass state validation.
6. For direct portal login remove `session_id` from the login body. For OAuth use the ID returned in the authorize redirect. Do not fabricate a session ID.
7. Response scripts capture IDs and tokens into environment variables only. Export a fresh blank environment before sharing. Capture scripts deliberately do not auto-store recovery codes or raw client secrets.
8. The generic `id` variable is the target database ID (session, user, or client depending on request). `clientId` is the public OAuth identifier, not its database UUID.
9. Mobile endpoints require actual Ed25519 signatures from the paired phone. Set timestamp/signature immediately before sending; a saved signature will expire. See `/docs#mobile` for exact payloads. No simulator bypass is provided.
10. Recovery generation requires current password and session cookie; use requires challenge cookie after password verification. Refresh rotates the refresh token; save the latest response.

Open `/docs`, `/docs/scalar`, `/docs/swagger`, and `/openapi.json` locally for guides, examples, schemas and limitations. Download links are available on the handbook page.

Security schemes: cookie session for browser APIs, challenge cookie for browser 2FA/recovery, Bearer access token for userinfo, Basic/body client credentials for confidential token exchange, signed JSON body for mobile APIs. Administrative operations also enforce ADMIN and client ownership.

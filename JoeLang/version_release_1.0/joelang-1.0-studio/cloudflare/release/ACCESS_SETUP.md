# JoeLang Studio Cloudflare Access setup

This release uses Cloudflare Access with email one-time PINs (OTP). There is no
application password database and no browser-side sign-in form. Cloudflare
checks the email domain before Studio is served, which keeps the restriction at
the edge rather than in JavaScript.

## Allowed school domains

Only these domains belong in the allow policy:

- `hamdenhall.org`
- `holycrosshs-ct.com`
- `united-taylors.org`
- `sstx.org`

## One-time Cloudflare configuration

1. Confirm that `derekli.dev` is an active Cloudflare zone. Before the first
   deployment, check whether `joelang-studio.derekli.dev` already has a CNAME
   record. A Workers Custom Domain cannot be created over an existing CNAME;
   do not remove a record until its current purpose is understood.
2. In **Zero Trust → Integrations → Identity providers**, add **One-time PIN**.
   School mail gateways may need to allowlist `noreply@notify.cloudflare.com`.
3. In **Zero Trust → Access → Applications**, create a self-hosted application:
   - Application domain: `joelang-studio.derekli.dev`
   - Session duration: `24 hours` (shorten it if shared computers are common)
   - Login method: the One-time PIN provider
4. Add one **Allow** policy named `Joe team school-email access`:
   - Include → Emails ending in → each of the four allowed domains above.
   - Require → Login methods → One-time PIN.
   - Do not add an `Everyone` rule or an unrestricted OTP rule.
5. Save the application. Test one allowed address and one address outside the
   four domains before announcing the URL.

The portable policy shape is recorded in `access-policy.template.json`. The
actual Cloudflare IDs and any API tokens must remain in Cloudflare, not Git.

## Deploy

From this Studio directory, after signing in to the intended Cloudflare account:

```bash
npm install
npm run check
npx wrangler login
npm run deploy
```

`wrangler.jsonc` deploys the static Studio and its Worker at the Custom Domain
`joelang-studio.derekli.dev`, with the public `workers.dev` address disabled.
Cloudflare creates the Custom Domain DNS record and certificate when the name
is available in the zone.

## What login protects now

The current Studio stores each user's workspace only in that user's browser.
Cloudflare Access prevents unauthorized visitors from opening the app; it does
not upload source files or make projects shared. This is intentional for the
first online release.

Cloud project sync is a later feature. It should add an authenticated API,
D1 project/file tables, owner checks on every request, revision conflict
handling, and an explicit local-workspace migration flow.

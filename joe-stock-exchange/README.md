# JOE Stock Exchange

JOE Stock Exchange (JOESE) is a closed, fictional Joe Universe market. It uses
non-redeemable Joellars (J$), scheduled market ticks, a permanent ledger, and a
separate operations console. It never accepts or pays real money.

## Repository layout

```text
joe-stock-exchange/
├── apps/
│   ├── exchange-web/          Member exchange
│   └── operations-console/    Operator console
├── workers/
│   ├── exchange-api/          Authentication and application API
│   └── market-engine/         Scheduled hourly market tick
├── packages/
│   ├── contracts/             Shared API and domain types
│   ├── market-rules/          Pure pricing and schedule rules
│   └── ui/                    Shared formatting and theme utilities
├── database/
│   ├── migrations/            Cloudflare D1 schema
│   └── seed/                  Non-secret reference data
├── docs/                      Product, API, security, and launch documentation
└── tests/                     Cross-package behavior tests
```

## Local development

1. Run `npm install` from this directory.
2. Copy each `.dev.vars.example` to `.dev.vars` in the two Worker folders and
   set local-only values.
3. Apply the D1 migration with `npm run db:migrate:local`.
4. Load the reference assets with `npm run db:seed:local`.
5. Start the API using `npm run dev:api`.
6. In separate terminals, start `npm run dev:exchange` and
   `npm run dev:console`. Start `npm run dev:engine` when testing scheduled
   ticks. Both Workers use the same ignored local D1 state under `.wrangler/`.

Both web apps can use `VITE_DEMO_MODE=true` for visual development without a
running API. Production builds must use `VITE_DEMO_MODE=false` and set
`VITE_API_BASE_URL=https://api.joese.derekli.dev/v1`.

The reference seed contains listings, public-float inventory in a suspended
non-human issuance account, and sample Joe Wire events. It contains no usable
password, invitation, member account, or secret.

## Quality checks

```sh
npm run check
```

The command type-checks all workspaces, runs the market-rule tests, and builds
both web applications and both Workers.

## Cloudflare deployment

Follow [docs/cloudflare-deployment.md](docs/cloudflare-deployment.md). The
Wrangler files intentionally contain a placeholder D1 database ID; replace it
with the ID returned by Cloudflare before the first remote migration or deploy.

The API surface is documented in [docs/openapi.yaml](docs/openapi.yaml) and is
also available from a running API at `GET /v1/openapi.json`.

Joe Bank recovery lending uses an operator-confirmed bankruptcy classification,
an operator-offered variable rate, explicit member acceptance, daily close
interest, and voluntary partial or full repayment. Its limits and rate bounds
are deployment variables in the API Worker configuration.


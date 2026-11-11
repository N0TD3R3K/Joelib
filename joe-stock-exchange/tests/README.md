# Test suites

- `market-rules/` contains deterministic unit tests that run in CI now.
- `authentication/`, `trading/`, `operations-console/`, and `end-to-end/` are
  reserved for the staged Cloudflare/D1 integration suites described in the
  launch checklist.

Local end-to-end smoke runs should use disposable D1 state and test-only
accounts; they must not commit credentials or session cookies.

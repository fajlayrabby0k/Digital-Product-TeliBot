# Database review — 26 November 2026

## Scope and result

Reviewed the database initialization, schema migrations, indexes, accounting triggers, payment claims, inventory allocation and existing database regression tests in `_worker.js`. Added `tests/database-integrity.cjs` and ran the worker test suite against local SQLite databases. These checks found no reproducible database defect requiring a production schema change.

This is a code and fixture-database audit. No live Cloudflare D1 database binding, account connector or production query access was available in this workspace. Production row integrity, capacity, orphan records, backup retention and restore readiness were not verified. No customer records were exported, deleted or changed by this audit.

## Verified

- Fresh schema creation and repeated forced migrations complete successfully.
- Repeated migrations preserve fixture wallet balances, ledger entries, stock, order IDs, saved product edits and custom settings.
- Upgrading a database missing the latest product override columns retains existing product data.
- SQLite `PRAGMA integrity_check` returns `ok` on the migrated fixture. `foreign_key_check` finds no violations of declared constraints; it does not establish relationships where the schema has no foreign key.
- Critical wallet, stock, customer-order, payment-review, order-ID, support-ticket and follower indexes exist. Query plans use the inventory and customer-order indexes.
- A financial batch deliberately failing on the completed-order deletion guard rolls back the preceding wallet change and its trigger-created audit record.
- Wallet ledger before/after amounts match the recorded deltas in integer minor units.
- Existing tests cover payment deduplication, receipt/invoice claims, repeated manual success, wallet credits/reset, concurrent purchases, inventory allocation, legacy order constraints and sales/referral calculations.

## Operational checks still needed on production

Use the Cloudflare account containing the actual D1 binding to inspect database health/size and the available D1 Time Travel recovery history. Confirm a restore procedure before any destructive operation. Review aggregate orphan/duplicate counts and wallet reconciliation using read-only queries on the actual database; local test results cannot certify existing production data.

Avoid clearing or rebuilding the production database as a performance measure. Existing payment claims, order snapshots and financial history are needed to prevent duplicate credit and retain accurate accounting.

## Reproduce

```sh
node tests/database-integrity.cjs
for test in tests/*.cjs; do node "$test" || exit 1; done
node --check _worker.js
```

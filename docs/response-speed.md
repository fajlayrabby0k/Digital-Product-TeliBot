# Bot response optimizations

The bot remains on Cloudflare Pages. No new service, scheduler or payment integration is needed for these changes.

- Persisted schema version: an already initialized database needs one version query in a new runtime instead of repeating the entire migration sequence. Concurrent initial requests share one initialization promise. The schema/default/index version must be bumped when those migrations change. `/api/setup` can still explicitly run setup.
- Initial installation batches table creation, missing-column migrations, indexes and default settings. Existing columns are discovered with PRAGMA instead of repeatedly issuing failing ALTER statements. Existing account balances/settings are retained.
- Covering indexes accelerate inventory counts, order/preorder history and payment-hash lookup.
- Settings memoization is scoped to a single customer update and shares pending queries. It never caches user balances or crosses requests. Admin settings reads remain uncached so same-update edits are visible.
- Dashboard statistics/settings are read concurrently. Text-message user/state reads also overlap.
- Successful Force Join checks may be reused for ordinary browsing for 15 seconds. Explicit Verify and payment-sensitive operations force fresh checks; failed checks are not cached. Channel/group configuration changes use a different cache key.
- Provider catalog data retains the existing five-second cache. A full cached snapshot is only applied once unless margin/rate changes. Explicit Refresh and checkout still bypass cached stock; single-product refreshes fetch only the relevant database row.
- Shop queries only ten active products per page, using an active-product index. Opening Shop sends a fresh first-page message; page navigation and Refresh edit that catalog view, and Back from a product returns to its containing page. Telegram controls actual client scroll position.
- Identical Telegram edits are treated as successful, avoiding duplicate fallback messages. Telegram requests have deadlines rather than hanging indefinitely.

## Evidence

Run `node tests/runtime-speed.cjs`, `node tests/shop-pagination.cjs`, `node tests/response-speed.cjs` and the existing payment/stock/icon tests. Runtime tests use actual SQLite plus simulated database round-trip latency. They verify initial installation batching, one-query subsequent cold initialization, migration deduplication, index usage, scoped setting reuse, parallel dashboard queries, membership cache invalidation/fresh checks, provider snapshot reuse and identical-edit handling.

These tests do not measure the deployed bot's Telegram/network response time. Provider API, Telegram, D1 placement and blockchain confirmations can still dominate latency. Deploy the latest Pages code and measure the live interaction before claiming a particular response time.

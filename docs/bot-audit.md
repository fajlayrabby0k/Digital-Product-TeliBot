# Audit repairs — 16 November 2026

Build: `2026-11-16-audit-repairs-1`.

- Recreated the private price-event trigger transactionally on upgrade. Previously `CREATE TRIGGER IF NOT EXISTS` retained the old followers-only predicate, so All Products subscribers missed price updates on products with no followers.
- Added user-scoped My Orders pagination with five records per page, total/page display and Previous/Next. Original order names and missing-catalog history remain accessible; downloads and support keep their existing internal references and public IDs.
- Unified local pre-order restock delivery with the durable product-event queue. There is no second direct preorder restock send. Successful Telegram delivery records cursor progress and marks the matching pre-order notified in one database batch; failed sends leave it pending.

All 45 local test files passed. Added regression coverage reproduces a legacy price trigger before upgrade, preserved settings/queued events on repeated migration, 12-order pagination, boundary requests, old downloads, user isolation, one restock message for a follower with a pre-order, and retry without prematurely marking notified. Syntax and whitespace checks passed. No live payment, supplier purchase or customer campaign was executed. Production health access from this workspace returned a proxy CONNECT 403, so live connectivity and settlement remain unverified.

---

# Bot review — 15 November 2026

Build: `2026-11-15-audit-fixes-1`.

## Corrections

- Local wallet purchases previously debited the wallet, inserted the order and assigned stock in separate writes. Concurrent checkouts could reuse stock or overdraw a stale balance, and a later write failure could leave a deduction behind. Order insertion, sufficient balance/stock checks, wallet debit, ledger entry and inventory allocation now execute in one D1 transaction. Local purchases now reference their order ID in balance history.
- Local wallet delivery credentials now escape Telegram HTML, so characters such as `<` and `&` do not invalidate the message.
- Binance deposit settlement now rechecks pending status in the atomic credit/update transaction. An invoice completed by another route during API verification cannot receive another credit.
- Add Stock, exchange rate, referral percentage, support contact, force-join usernames, external provider URL/key and manual deposit approval had callback states but missing text handlers. These now validate and save inputs instead of resetting the admin action. Exchange rate changes recalculate current product BDT prices, preserving old invoice amounts. Keys are not echoed back.
- Stock additions are transactional and session-guarded; repeating an already consumed input does not add the items again. Local preorder notifications are connected to stock additions; API preorders remain disabled.
- Manual deposit approval has a unique claim and atomic wallet/deposit/history writes. Completed or automatically claimed payments cannot receive another manual credit. Manual approval closes a pending mobile invoice so later SMS processing does not credit it again. Admins still need to check receipt evidence before approving a manual payment.
- Broadcast text now creates a preview rather than losing the input. The admin explicitly sends up to ten recipients per batch and can continue/pause. Cursor progress, sent/failed counts and a lease prevent simultaneous batch execution. A Telegram send followed by a database failure can still require reconciliation; broadcasting is not an exactly-once delivery service.
- Checkouts reject invalid quantities and unsupported payment methods. Customer quantity text no longer silently turns a negative or malformed number into a positive quantity.
- Current checkout quotes preserve the displayed total. If a saved quote changes or expires, wallet/direct checkout shows the new preview before payment. Older buttons without a stored quote remain compatible. API products still refresh live stock/cost for checkout.
- Missing, zero, negative or malformed provider prices no longer silently become a $1 cost. Invalid-price products are unavailable until a valid catalog price returns; their saved valid prices/history are preserved.
- Sales reports describe API profit as selling revenue minus the saved API catalog cost, matching the store's chosen calculation. Fees/commissions are outside this gross-profit definition.

## Verification

All **34** `tests/*.cjs` files passed, and `node --check _worker.js` and `git diff --check` passed. New regression coverage includes concurrent local stock/balance purchases, rollback of stock/order/debit/history, HTML-safe credentials, stock additions and restock alerts, admin setting saves, once-only manual credit, a competing Binance settlement, stale-price reconfirmation, invalid quantities/methods, broadcast preview/authorization and invalid provider prices. Existing tests cover provider recovery, payment claims, wallet history, legacy schema migration, margins/reports, support tickets, access controls, pagination, maintenance and startup/request performance.

The unchanged Android bridge v0.7 APK matches its published SHA-256 file and verifies with Android APK Signature Schemes v2 and v3. Existing Android parser/queue tests passed. These checks do not prove the receiving phone is currently online or forwarding real SMS.

Requests from this workspace to the production `/api/health` URL and supplier documentation were blocked by the network proxy with CONNECT 403. No real customer payment, supplier purchase, live broadcast or production database write was used in this review. Local tests use SQLite and simulated external responses. Live environment variables, Binance eligibility/IP permissions, BSC RPC access and receipt-phone connectivity still require production verification.

After GitHub deployment succeeds, `/start` performs the normal additive migration. No new environment secrets or Android APK installation are required for these corrections.

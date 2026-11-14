# VEXORIX reseller checkout

Protocol reference: user-supplied VEXORIX Reseller API v1.2.0 docs at `https://207-148-64-141.sslip.io/api/reseller/docs`. Direct access from this workspace is blocked by the network proxy (CONNECT 403); no real provider order was placed during verification.

- POST `/api/reseller/orders`: header `X-Reseller-Key`; JSON `{product_id,quantity,external_order_id}`. Quantity 1–100. External id 8–64 characters from `[A-Za-z0-9._:-]`.
- A random `shop-<UUID>` id is saved in `orders.provider_request_id` **before** the request. Both `external_order_id` and `Idempotency-Key` carry that same value for every retry. Old code used a timestamp on each attempt, so a retry could become another purchase. A short `shop-1` key is also invalid under the documented minimum length.
- Complete `items[].content` is the delivery evidence. The old three-value success-status whitelist rejected populated-code responses with other status labels. Explicit failed/cancelled/rejected/error statuses are still refused; returned external/product IDs must match when present. Credentials are saved before Telegram notifications.
- A lost response or `duplicate_external_order_id` triggers GET `/api/reseller/orders?external_order_id=...`. Matching order delivery is recovered by its exact external id. Safe retries read the old order first; a new POST with the **same id** occurs only after documented `order_not_found`. Accepted orders awaiting codes do not trigger another purchase.
- A provider API error is not a delivered order. Known terminal `error.code`s (invalid request/key/product, frozen/disabled account, insufficient provider funds, out of stock) refund a wallet-funded purchase exactly once. The provider wallet and the customer's local wallet are separate: VEXORIX must have sufficient USDT even when the customer has enough balance in this bot.
- Network interruption, unrecognized/uncertain errors, duplicate processing, HTTP 429/503 and incomplete delivery remain `paid_pending_delivery`. Errors and provider order IDs are retained. API keys/BOT_TOKEN are redacted from stored error descriptions. Rate-limit/maintenance cooldown is honored, with a minimum 30-second user retry interval.
- Pending orders offer **Check Delivery**. The order owner or admin can check/recover using the persisted provider id without a second wallet debit. Another user cannot retrieve the codes. Completed/refunded orders cannot be redelivered/refunded again through that button. Order History shows pending, completed and refunded orders.
- Local wallet order insertion and debit run in one D1 transaction with a sufficient-balance condition. A failed insert cannot leave a deduction behind; concurrent purchases cannot overdraw the wallet. Invalid quantity/amount requests never debit.

## Deploy and validate

GitHub deployment runs the schema migration on the next bot update (`/start`), adding `provider_request_id`, `provider_retry_at`, `provider_error`, `provider_order_id`. Keep existing API settings; no key should be shared in chat. Check VEXORIX Profile/API Access and reseller USDT wallet first. A connection/product-list success does not guarantee enough reseller funds or checkout permission.

Use a new small purchase after deployment. If rejected, the customer gets a wallet refund and admin gets the sanitized HTTP/error code. If accepted but incomplete, Check Delivery resumes the same order. Check API message `insufficient_funds` against the **VEXORIX** wallet, not the local customer's balance.

## Already stuck orders

Earlier pending orders may lack a persisted `provider_request_id`; the timestamp-based external id used originally cannot be reconstructed reliably. **Do not automatically place those again or blindly refund them.** Reconcile them against provider history and the local order/user/amount first. The retry button refuses to submit an older untracked order. Refunded/error changes apply to newly processed orders, not a retrospective assumption that every old pending purchase failed.

```sql
SELECT id,user_id,status,amount_usd,provider_request_id,
       provider_order_id,provider_error
FROM orders
WHERE status IN ('paid_pending_delivery','delivering','refunded')
ORDER BY id DESC LIMIT 20;
```

`node tests/provider-checkout.cjs` uses real SQLite and mocked documented provider responses: rejection refunds, duplicate refund attempts, insufficient funds/out-of-stock, timeout recovery, delayed delivery lookup, ownership, no repeat POST/charge after recovery, persisted credentials, concurrent balance guards and secret redaction. It does not certify live provider access.

## No message / no local order

Webhook background exceptions used to be written only to Cloudflare logs; schema initialization also swallowed failures. The current build reports failures to the user with an `ERR-...` reference, sends a sanitized stage/reason to the admin and persists `bot_runtime_errors`. Failed migrations now propagate instead of continuing into broken queries.

Admin can send `/diagnostics` or tap **API / Order Diagnostics** in Admin Panel. This works independently of stale text states and before normal migrations, reports missing order columns, performs a read-only provider `/me` request, and shows recent order errors/runtime references. It creates no purchase and does not alter wallet balances. API key/Telegram token values are never included.

Public `/api/health` returns the build identifier and binding-presence booleans only, without credentials or user/order data. If the production URL does not show the new build, first verify the deployment; repeated purchase attempts cannot diagnose stale deployed code. Diagnostics cannot guarantee a Telegram notification if BOT_TOKEN/network access itself is broken, so the public build check remains useful.

Buy Now now sends the order preview as a new message, rather than editing an old product message above later diagnostics/chat. Quantity changes edit that current preview. Buy Now alone does not charge or create an order; the user must confirm Wallet Payment (with sufficient local account balance) or choose Direct Payment. Diagnostics now distinguishes the invoking admin's local wallet from the separate VEXORIX reseller wallet. `tests/checkout-navigation.cjs` covers actual callbacks, provider stock refresh, no debit on preview and purchase/delivery on wallet confirmation with mocked provider responses.

## Historical preorder schema startup failure

Production reported `database.initialize — no such column: product_id at offset 65`. Offset 65 matches the `product_id` reference in `CREATE INDEX IF NOT EXISTS preorders_product_status ON preorders(product_id, status)`. Historical preorder tables can contain a product name without a numeric product ID; CREATE TABLE IF NOT EXISTS does not add missing columns to them. The migration now adds missing preorder fields before indexes, plus a missing orders.product_id if needed. It never drops/rebuilds the table or guesses links for historical rows. Existing names/accounts/status/timestamps remain intact; old unnamed product links stay NULL and need review before automatic stock notifications. New preorder writes supply both product ID and name, username and timestamp, including compatibility with a NOT NULL legacy product_name.

After deployment send `/start` to run migration, then `/diagnostics`: build `2026-11-14-legacy-preorders-1` and `preorders: columns OK` identify the repair. The recent-errors list intentionally retains historical failures; their continued display is not proof a new request failed. `tests/legacy-preorders-migration.cjs` reproduces the failing index with real SQLite, checks preservation/idempotency and exercises /start, new preorder registration, Buy Now and external wallet delivery against the repaired legacy database.

## Legacy required orders.amount

Production next reported `wallet.reserve — NOT NULL constraint failed: orders.amount`. A legacy column constraint still applies even when newer `amount_usd` / `amount_bdt` columns exist. The compatibility migration retains/adds `orders.amount` and `product_name`; all three order writers now explicitly provide amount (USD for new records), product name, transaction placeholder and creation timestamp, including the wallet INSERT...SELECT transaction. Historical amount values are neither converted nor overwritten, and legacy NOT NULL constraints remain intact. No table rebuild/data deletion is performed.

Build `2026-11-14-legacy-orders-amount-1` contains the fix. After deployment, `/start` runs the migration. `tests/legacy-orders-migration.cjs` reproduces the exact NOT NULL failure on a populated old table, verifies historical rows, and exercises real wallet/provider, direct-payment and local-wallet writes against the same strict schema. Live provider delivery still requires a genuine confirmed order; mocks do not certify it.

Production also required `orders.currency` with no default. Build `2026-11-14-legacy-order-currency-1` explicitly writes `USD` in every new order path (amount/amount_usd are USD; amount_bdt remains the BDT snapshot). Existing currencies/amounts are preserved. The strict legacy-schema regression now reproduces both missing amount and missing currency errors and checks all three order writers. Before wallet debit/provider dispatch, schema metadata is checked for all unsupported NOT NULL columns without a usable default; these are reported together instead of inventing values or debiting first. Diagnostics lists required/unmapped order fields. Tests cover unknown required columns, no financial/provider side effects, and preserved historical BDT records.

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

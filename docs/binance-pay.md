# Personal Binance Pay verification

The Worker uses the account-signed `GET https://api.binance.com/sapi/v1/pay/transactions` endpoint, not the Binance Pay Merchant order API. The implementation follows Binance's [official Pay SDK](https://github.com/binance/binance-connector-python/tree/master/clients/pay), including HMAC-SHA256 query signing and positive-income/negative-expenditure semantics.

## Cloudflare setup

1. Add `BINANCE_API_KEY` and `BINANCE_API_SECRET` as **Secrets** on the deployed Worker. They must be an HMAC API key for the personal account receiving payments. The account/key must be allowed to read Pay history. Trading and withdrawal access are not needed. Keep secrets out of chat, Git and logs.
2. Deploy the latest `_worker.js` with the existing D1 `DB` binding. Schema initialization adds `binance_payment_claims` without deleting existing data. The first webhook initializes the schema; the existing `/api/setup` route also initializes it.
3. In `/admin` → Payment Settings, set the correct **Binance Pay ID** and turn **Binance Auto-Verify ON**. The Pay ID is the recipient shown to customers; it is not an API key.
4. Create a new order in the bot, then send the stated amount in **USDT via Binance Pay**. Reply to that order's payment message with the **Pay Transaction ID** on the Binance receipt, not the bot's order number, blockchain hash or a Spot trade order ID.
5. Check one real payment after deployment. No live Binance access was validated in the development environment because those Secrets are only configured on Cloudflare.

## Verification and delivery

- The invoice must belong to the sender's Telegram account and still be pending.
- The matching transaction must be incoming USDT of type PAY or C2C, recorded after the invoice was created. Underpayment, outgoing transactions, refunds and rewards are rejected.
- A unique database claim prevents the same transaction or invoice being processed twice across orders and deposits, including concurrent submissions.
- Deposits credit the recorded received amount; order payments trigger fulfillment. Failed external delivery or insufficient local stock remains `paid_pending_delivery` and alerts admin instead of claiming delivery succeeded.
- If a payment was claimed but a process/database/provider operation failed, admin must reconcile that claim and delivery. Do not pay again or blindly retry a provider purchase; query provider order history first.
- Payment IDs are bearer proofs: keep receipts private. The history API does not necessarily expose a payer identifier that can be tied to a Telegram user.

## Limits and troubleshooting

- Only invoices created within the last seven days are verified automatically. At most 100 history records are requested in the invoice time window; high-volume accounts or unmatched IDs require admin review. There is no automatic approval when a transaction is missing.
- API rejection can mean invalid credentials, missing Read/Pay access, IP restrictions, account eligibility, regional restrictions or blocked Cloudflare egress. It does not prove that a payment was received. Confirm the precise error in Binance/Cloudflare through a secure troubleshooting flow; do not paste API keys, signed request URLs or full account history.
- Cloudflare egress must reach `api.binance.com`. This repository does not automatically deploy when pushed unless you configured a Cloudflare build integration.
- The old D1 merchant credential settings are no longer read by the personal verification path.

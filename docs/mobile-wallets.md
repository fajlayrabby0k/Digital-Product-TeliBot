# Personal bKash and Nagad automatic payments

Users choose bKash/Nagad, create an invoice, send the **exact displayed BDT amount**, then tap **Enter Transaction ID** and submit only the receipt's TrxID/TxnID within 60 minutes. Orders trigger direct delivery; deposits credit the wallet. Rocket remains manual because no Rocket SMS template was supplied.

The Android receiving-phone app sends a minimal signed receipt (no raw SMS/OTP). It must remain online with SMS permission/background execution, configured with the same receiving account as Admin → Payment Settings. Existing v0.2 APKs work; v0.3 only updates user guidance. Do not reinstall/clear data, which changes the key/device ID. [APK/setup](../android-bridge/README.md).

## Deployment

1. GitHub main deploys to the existing Cloudflare Pages project.
2. Keep existing production D1 `DB`, `BOT_TOKEN`, `ADMIN_ID`, `MOBILE_BRIDGE_SECRET` and `MOBILE_BRIDGE_DEVICE_ID`. No new Worker or Cron is required. Binance/BEP20 retain their existing settings.
3. After deployment, send `/start` in the bot. Schema migrations run automatically before bot processing. `mobile_bridge_receipts`, `mobile_payment_invoices`, `mobile_payment_claims` and `orders.delivery_data` are created as needed without deleting existing data.
4. Use a **new invoice** for the first live test. Old pending invoices issued before snapshots existed cannot be automatically verified; already-paid old invoices require admin review, never a second payment.
5. Confirm the receiving app's authenticated connection check passes, then make a small genuine payment on each enabled method and submit its TrxID. Live settlement cannot be certified by mocks or a connection check.

## Matching and concurrency

Each invoice snapshots method, receiving account, exact integer BDT poisha, USD cents, user, creation time and 60-minute expiry. Later exchange-rate changes do not reprice it. Required evidence: enrolled device, same method/account/TrxID, exact amount, payment timestamp within invoice window and timely submission. SMS time is only minute-precision; the invoice creation minute is the earliest accepted time. An SMS arriving after timely submission triggers background settlement without a Cron. A manual **Check Payment** button retries missing/late records. SMS received before the user submits remains unclaimed until an explicit TrxID is submitted; amount alone never identifies the user.

A single D1 batch rechecks current invoice/target/receipt eligibility and inserts a unique `(method,trx_id)` claim, unique invoice claim and unique receipt event before crediting a deposit or marking an order paid. Per-attempt tokens make simultaneous retries idempotent. Any write failure rolls back the entire batch. Already manually completed transactions cannot be claimed again. Invoice status and claims remain durable if network notifications fail.

Only the payment winner dispatches a direct order. A delivery reservation prevents concurrent admin/automatic duplicate dispatches. Confirmed external credentials are persisted in `orders.delivery_data` before notifications and available in order history. Unconfirmed API delivery or insufficient local inventory remains `paid_pending_delivery`, with customer/admin messaging. Never automatically redispatch an uncertain provider order. Stale rejection buttons cannot cancel a completed/paid order or credited deposit.

Maintenance pauses customer settlement; retries after reopening are supported. Fresh Force Join checks apply before settlement. If the phone's key/ID or receiving account changes, unmatched historic invoices may require review. Keep one receiving SIM for initial tests; app v0.3 does not implement per-SIM account mapping.

## Trust boundary

This is **SMS-based evidence, not payment-provider API confirmation**. HMAC proves the enrolled bridge supplied the record; it does not prove independent provider settlement. A compromised phone/key or spoofed company SMS remains a risk. Sender allowlisting alone is insufficient. No raw SMS, OTP, PIN, customer phone or message balance is uploaded. Use the dedicated receiving device previously discussed.

## Verification and operations

`node tests/mobile-payment-flow.cjs` uses real SQLite and simulated signed phone uploads/Telegram responses. It checks both arrival orders, concurrent same/different invoice claims, duplicate rejection, ownership, exact amounts, old payments, rate snapshots, expiry, rollback on balance-write failure, maintenance, device changes, prior manual credit, direct local delivery, pending API delivery, persisted external credentials and partial-stock retry allocation. `node tests/mobile-bridge.cjs` checks signature/timestamp/device/account validation and read-only setup checks. Binance/BEP20 verification/flow suites remain separate. No real payment was performed by these tests.

Useful D1 queries:

```sql
SELECT invoice_type, invoice_id, user_id, method, trx_id, status
FROM mobile_payment_invoices
ORDER BY created_ms DESC LIMIT 20;

SELECT method, trx_id, amount_minor, status, created_at
FROM mobile_bridge_receipts
ORDER BY created_at DESC LIMIT 20;

SELECT invoice_type, invoice_id, method, trx_id, user_id, amount_minor
FROM mobile_payment_claims
ORDER BY created_at DESC LIMIT 20;
```

`amount_minor` is BDT poisha (500 Tk = 50000). Wallet credits retain the invoice's USD cents. Do not edit claim/receipt rows to retry delivery or remove duplicates; review provider history and order inventory first.

## Payment windows

bKash/Nagad invoices allow payment and first TrxID submission within **60 minutes of invoice creation**. Pending invoices previously issued with a 10-minute window are extended to 60 minutes by the schema migration. A timely submission can still settle when its SMS arrives late. Rocket remains manual, with a 60-minute receipt-submission window. Binance Pay Order IDs and BEP20 TxHashes must be submitted within **10 minutes of payment**; BEP20 still requires 12 confirmations. Expired paid transactions require admin review; never ask the customer to pay twice.

Missing-SMS diagnostics: Android v0.6 reports capture/upload stages and keeps failed receipts while sending other pending items. Server `/diagnostics` now lists recent signed receipt metadata and waiting transaction submissions (admin only), without raw SMS/OTP/credentials or automatic balance changes. A missing receipt must be traced on both sides; do not repeatedly ask the customer to pay again.

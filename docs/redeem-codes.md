# Redeem codes

## Admin

Open `/admin` → **Redeem Codes** → **Generate Code**, then send the USD amount, for example `5` or `10.50`. Values from $0.01 to $1,000,000 with at most two decimal places are accepted. The bot returns an active code, Copy Code button, and a redeem link/Copy Link button when it can obtain the bot username through the existing `BOT_TOKEN`. `BOT_USERNAME` is an optional alternative.

Codes have no expiry and work once only. Creating a code does not debit the admin's wallet; it authorizes new wallet credit. Share privately: the first eligible account holding a valid code can redeem it. Copy the code when created; the database stores a hash, not a recoverable plaintext copy.

## Customer

Open **Deposit → Redeem Code**, then paste the code or full redeem link. A `https://t.me/<bot>?start=redeem_<code>` link can also register/start the bot and redeem directly. Normal Force Join requirements apply; after joining, resubmit/open the code if necessary. Successful redemption adds the assigned USD amount, updates the BDT balance at the configured exchange rate, and creates a completed `REDEEM` deposit record. Invalid/used codes do not change balances. Cancel or navigate away to end code entry.

## Database and one-use guarantee

The schema version is bumped to create `redeem_codes` on the existing D1 `DB` binding without resetting users or balances. Codes contain 128 random bits and are stored as SHA-256 hashes. A single D1 batch transaction:

1. Conditionally claims an unused code with a unique per-attempt redemption token.
2. Credits only the user linked to that exact claim token.
3. Inserts the completed deposit audit entry.

A unique REDEEM deposit index also prevents a second audit/credit transaction for the same code. Concurrent submissions, including the same user twice, cannot both credit the voucher. A failed batch rolls back the claim, balance and history together. No voucher amount is trusted from customer input.

## Trusted Telegram updates

Production webhook requests are checked against Telegram's `X-Telegram-Bot-Api-Secret-Token` header before any update is processed. If `TELEGRAM_WEBHOOK_SECRET` is already configured, its matching Telegram webhook setting must be retained.

Otherwise the bot derives a stable secret from the existing `BOT_TOKEN`. A missing/mismatched header receives HTTP 503 with Retry-After rather than a permanent rejection. The existing URL is read using `getWebhookInfo` and its secret is repaired in `ctx.waitUntil`, so registration does not block the incoming delivery connection. No unauthenticated update is processed. A successful repair is throttled for a minute; failed repairs can retry after three seconds. Configured explicit secrets can also be repaired without bypassing authentication.

Automatic repair always keeps the URL returned by Telegram, including a custom domain/path/query string. It never replaces it with the incoming request URL. Pending updates are retained. Telegram's authenticated retry then processes `/start` and other updates normally.

For an empty/stale registered webhook, after deploying open `https://digital-product-telibot.pages.dev/api/setup?repair_webhook=1`. It initializes the database, registers the production `/api/webhook` URL with the expected secret and returns `webhook_repaired: true` only on successful Telegram registration. The origin is pinned to this production domain; `BOT_PUBLIC_URL` can configure a different trusted production origin. Incoming request hosts cannot choose an arbitrary destination. Failed registration returns HTTP 502 with a safe message, never credentials.

No new secret is required for a normal existing Telegram deployment. A local instance without `BOT_TOKEN` remains usable for development and cannot send Telegram messages. Live registration must still be checked on the production account.

## Deployment and verification

Deploy the latest `_worker.js` to the existing Cloudflare Pages project with `DB`, `BOT_TOKEN` and `ADMIN_ID`. No Cron or companion Worker is needed. The schema initializes automatically. Create a small test voucher and redeem it once, then confirm a second submission is rejected.

`node tests/redeem-codes.cjs` exercises the complete UI, links, actual SQLite transactions, concurrent redemption, rollback, authorization and audit records. `node tests/webhook-auth.cjs` verifies authenticated updates, rejection of forged admin updates and safe bootstrap. Live Telegram/Cloudflare deployment has not been verified in this development environment.

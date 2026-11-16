# Force-channel notifications

The bot posts public updates to the existing **Force Channel** setting. The Force Group remains a membership requirement and does not receive these posts.

Open **Admin Panel → Channel Alerts**. All channel notifications default to ON, with individual controls for:

- New product.
- Stock added (including increases while already in stock).
- Stock finished.
- Low stock / last chance when quantity enters 1–5.
- Successfully completed purchase.
- Successfully completed deposit, including manual approvals and redeem credits.
- Selling price drops and increases.

These settings are independent of private product alerts. Muting private alerts does not disable public channel posts.

## Required channel permission

Add this same bot as a channel administrator and allow **Post Messages**. The Force Channel must be configured using its public @username, supported t.me link or an existing supported numeric channel setting. No Binance/API keys or customer secrets belong in the channel configuration.

Use **Check Channel Connection** to read the bot identity, chat and posting permission from Telegram. It does not send a test post. Channel Alerts shows pending/new-product counts, sent count, the last sent timestamp, and the full sanitized Telegram error when a post fails. After fixing permissions, use **Retry Pending Channel Posts**. A 403 commonly requires checking channel membership/admin posting permission. The bot retains failed posts for later attempts, with backoff for network errors and Telegram rate limits.

## Event correctness and privacy

SQLite triggers create queue records inside the product/stock/order/deposit transaction. Rolled-back operations do not post. Completed order/deposit IDs have unique event keys, so repeated settlement does not intentionally create multiple posts. Channel stock announcements retain separate event records. New rows snapshot the public product name, selling price and stock at event time; a later stock change no longer removes a legitimate earlier channel update. Posts label stock at update, event time and latest stock when different. Older unsnapshotted rows retain legacy stale-event handling. Private product campaigns retain their own coalescing policy.

Low-stock alerts fire on entry into 1–5, not on every 5→4→3 sale. Initial stock insertion can queue one; if more stock is added before sending, the original snapshot and latest stock are both shown instead of silently discarding the low-stock event. Local inventory and API stock are both covered. API changes are discovered on sync; this feature does not detect supplier changes without a sync request.

Purchase posts include product, quantity and total. Deposit posts include amount and payment method. Customer name/ID, phone, receiving account, transaction ID, email/password, license content and integration credentials are excluded. Product links use a public bot deep link (`?start=product_ID`) rather than channel callback buttons. Users still pass normal membership checks when opening the bot.

The queue snapshots the configured channel at event creation. Changing the force channel does not reroute historical posts into the new channel. Shared background time limits bound both channel/private drains. Remaining posts progress on later bot activity, sync/scheduled runs or an admin retry; no new Cron Trigger is configured automatically. Telegram sending followed by a database failure can still repeat a post on retry, so delivery is best effort rather than exactly once.

The additive migration adds immutable channel snapshots, enables every channel category once for this release, and preserves subsequent operator choices. **Enable All Channel Alerts** turns all categories back on in one action. It maintains `channel_notice_events`, indexes and transition triggers without broadcasting historical sales/deposits or altering wallet balances. No new Cloudflare binding or Android APK is needed. After deployment, `/start` performs normal initialization.

`node tests/channel-notifications.cjs` covers API/local stock, low-stock crossing, completed-only sale/deposit posts, duplicate settlement, rollback, privacy, deep links, independent private/channel switches, permission retry, target normalization and channel changes. Tests simulate Telegram responses and do not publish live channel posts.


## Price-change posts

Updates to a product's USD selling price queue a Price Drop or Price Increased channel post. This covers API sync, default/custom margin changes and manual local prices. Each event snapshots the old/new amounts in cents and has a per-product revision key. Unchanged prices, sub-cent changes that do not alter the displayed price, and rolled-back writes do not generate posts. New product insertion is a new-product alert rather than a price-change alert.

Price posts show product name, old/new USD prices, difference, percentage and change time in Dhaka, with the public product deep link. Quick successive changes retain their original amounts and order instead of rewriting old alerts to use today's price. Historical order prices/costs are not modified. A BDT exchange-rate-only change does not create a USD price alert.

**Channel Alerts → Price Drops / Price Increases** controls these types separately; both default ON. They use the same existing force channel, permission requirements, queue, retries and privacy rules. `node tests/price-notifications.cjs` covers API/manual/margin changes, immutable snapshots, repeated sync, rapid updates, rollback, toggles and unchanged historical order profit.


## API imports, backlog and recovery

New API product insertion, stock-state initialization and channel announcement creation share one D1 transaction. The explicit import enqueue uses the same unique `new:PRODUCT_ID` key as the trigger, so a missing/legacy trigger does not silently omit a post and normal triggers do not duplicate it. Unchanged imports do not re-announce products. If queue insertion fails, the new product insertion rolls back for retry.

A channel drain can inspect up to 100 obsolete rows while sending at most six successful messages within its time limit; skipped rows no longer consume the six-message budget. The remaining queue continues on subsequent activity or sync. Late receiving-phone SMS settlement also schedules channel/private draining after the payment completes, so payment posts do not require another Telegram interaction. Stock addition drains the channel before private product campaigns. This does not turn Pages into a continuously running background process or bypass Telegram permissions/rate limits.

**Queue Missed API Products** previews up to ten active API products with no existing new-product event. Some may have been imported before channel alerts were enabled. The admin can queue that exact preview; it is bound to the current channel, saved IDs and a ten-minute token. New imports after preview are not substituted, repeated old clicks cannot queue the next batch, and recorded announcements are not reposted. Existing failed pending events use **Retry Pending Channel Posts** instead.

Channel usernames and public t.me aliases are compared case-insensitively. A real target change still does not reroute old events. Invalid channel addresses leave the queue pending and are reported in the status screen. Customer private alert preferences and force-group membership settings do not suppress channel announcements.

`node tests/channel-pipeline.cjs` covers API fallback enqueue with a missing trigger, atomic rollback, deduplication, alias changes, exact recovery selection, permission diagnostics without test posts, redacted Telegram errors, retry, stale-backlog progress, retained quick stock transitions, late-SMS payment posting, once-only enable-all migration and admin authorization. No live Telegram channel was contacted by these tests.

# Force-channel notifications

The bot posts public updates to the existing **Force Channel** setting. The Force Group remains a membership requirement and does not receive these posts.

Open **Admin Panel → Channel Alerts**. All channel notifications default to ON, with individual controls for:

- New product.
- Stock added (including increases while already in stock).
- Stock finished.
- Low stock / last chance when quantity enters 1–5.
- Successfully completed purchase.
- Successfully completed deposit, including manual approvals and redeem credits.

These settings are independent of private product alerts. Muting private alerts does not disable public channel posts.

## Required channel permission

Add this same bot as a channel administrator and allow **Post Messages**. The Force Channel must be configured using its public @username, supported t.me link or an existing supported numeric channel setting. No Binance/API keys or customer secrets belong in the channel configuration.

If posting fails, Channel Alerts shows the last Telegram error code and pending count. After fixing permissions, use **Retry Pending Channel Posts**. A 403 commonly requires checking channel membership/admin posting permission. The bot retains failed posts for later attempts, with backoff for network errors and Telegram rate limits.

## Event correctness and privacy

SQLite triggers create queue records inside the product/stock/order/deposit transaction. Rolled-back operations do not post. Completed order/deposit IDs have unique event keys, so repeated settlement does not intentionally create multiple posts. Pending product alerts coalesce and stale stock alerts are skipped when current stock no longer matches them.

Low-stock alerts fire on entry into 1–5, not on every 5→4→3 sale. Initial stock insertion can queue one, but adding a larger stock batch supersedes it before sending if the final quantity exceeds five. Local inventory and API stock are both covered. API changes are discovered on sync; this feature does not detect supplier changes without a sync request.

Purchase posts include product, quantity and total. Deposit posts include amount and payment method. Customer name/ID, phone, receiving account, transaction ID, email/password, license content and integration credentials are excluded. Product links use a public bot deep link (`?start=product_ID`) rather than channel callback buttons. Users still pass normal membership checks when opening the bot.

The queue snapshots the configured channel at event creation. Changing the force channel does not reroute historical posts into the new channel. Shared background time limits bound both channel/private drains. Remaining posts progress on later bot activity, sync/scheduled runs or an admin retry; no new Cron Trigger is configured automatically. Telegram sending followed by a database failure can still repeat a post on retry, so delivery is best effort rather than exactly once.

The additive migration creates `channel_notice_events`, event indexes and transition triggers without broadcasting historical sales/deposits or altering wallet balances. No new Cloudflare binding or Android APK is needed. After deployment, `/start` performs normal initialization.

`node tests/channel-notifications.cjs` covers API/local stock, low-stock crossing, completed-only sale/deposit posts, duplicate settlement, rollback, privacy, deep links, independent private/channel switches, permission retry, target normalization and channel changes. Tests simulate Telegram responses and do not publish live channel posts.

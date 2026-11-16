# Product and stock notifications

**Admin Panel → Product Notifications** controls all private alerts and each event type separately: new products, stock added, stock finished, price drops and price increases. They default to ON. Customers manage their preferences from **My Profile → Product Alerts**, and each alert links to Notification Settings. The configured admin is excluded from customer campaigns.

Both local products and API products are supported. New product insertion creates a new-product event. Any available-stock increase creates a stock-added event, and positive stock becoming zero creates a stock-finished event. Local inventory additions, sales, deletions and allocation changes are covered; supplier stock is detected when API sync/detail/checkout observes a new quantity. An unchanged sync creates no event.

Events and stock state are recorded by SQLite triggers in the same transaction as the product/inventory change. A rollback also rolls back the event. Existing stock is baselined during migration without broadcasting the existing catalog. Pending stock updates of the same kind/product are coalesced; price changes retain separate immutable old/new cent snapshots; stale stock-return/stock-finished events are superseded if current stock no longer supports them. Notifications show product name, selling price, available stock, event time and View Product. They never include stock credentials, email accounts, passwords or license contents.

## Following products

Both local and API product details include **Follow Stock & Price / Unfollow Product**. Customers choose one of three preferences:

- **Followed Only**: private product alerts require following that product. With no follows, there are no private product campaigns.
- **All Products**: new-product, stock and price campaigns across the store, including products not followed.
- **Turn Off Alerts**: pause private campaigns without deleting follows or the saved scope.

New accounts default to Followed Only, including legacy databases whose column default previously used All Products. Existing choices are preserved. Following enables private alerts and retains the selected scope; it does not replace an explicit All Products choice. Unfollowing removes the favorite, but All Products still receives store-wide campaigns until the customer changes scope.

**Home / My Profile → Followed Products** lists ten favorites per page with full-width product buttons. Open an active product to unfollow it; unavailable products retain a removal button. Navigation and settings buttons use two columns. Every query and write uses the current Telegram chat ID; users cannot manage another customer's follows. Profile includes a count and preview of three followed products. Current scope, follows and mute settings are checked when selecting recipients for pending batches. Preferences survive schema initialization. Channel posts use their independent settings and queue, regardless of customer preferences.

Registering a local pre-order stock alert explicitly follows that product and enables private alerts. Pre-order restock alerts share the same durable stock-event queue and recipient cursor as normal product alerts, so following and pre-ordering the same product does not send a second direct restock message. A local pre-order is marked notified only after Telegram confirms the queue message; transient failures keep it pending for retry. Both notification scopes and mute preferences apply.

Selling-price changes enqueue events transactionally when followers or enabled All Products subscribers exist, independently of channel setup. Unchanged cent prices do not create events. Multiple changes while a campaign is pending retain individual old/new cent snapshots rather than overwriting the pending snapshot. Product, stock and price updates are detected when local changes or supplier sync occur; following itself does not run continuous supplier polling.

`node tests/product-follows.cjs` verifies both enabled scopes and Off, new-product updates, local/API stock and price updates, recipient filtering, follow/unfollow, saved choices, raw-stock privacy, exact rapid price snapshots, duplicate suppression, pagination and unchanged balances. Existing queue tests cover retry, batch limits and concurrency.

## Background delivery

Authenticated bot updates and API sync schedule a bounded background queue drain. It normally attempts up to 24 recipients and 18 seconds per pass; heavier stock/import actions use smaller passes. Per-event leases and recipient cursors prevent concurrent workers from intentionally sending the same recorded batch twice. Successful progress is saved after each recipient. Transient errors and Telegram rate limits defer the event for retry. Blocked/unavailable chats count as failed recipients rather than blocking everyone behind them.

Pending rows survive runtime restarts. Small queues finish automatically during normal bot activity. On Cloudflare Pages there is no persistent daemon: remaining batches require subsequent bot activity, sync requests or the admin's **Send Pending Batch** button. A scheduled sync trigger can provide unattended progress where configured. Likewise, a supplier change cannot be discovered until a sync is run. This feature does not add a new Worker or Cron Trigger automatically and does not promise instant delivery to an arbitrary number of inactive users.

Delivery is best effort: a Telegram send followed by a database failure can be repeated on retry, and a successful API response does not prove the person read it. No live customer campaign was sent during tests.

## Adding email stock

Use **Admin Panel → Add Stock → local product** and send one item per line, for example:

```text
bikpaz@umail.asia
another@example.com
```

The existing limit is 1–50 items per message. Single-column Markdown tables are also accepted: outer pipes, blank rows, separator lines and code fences are discarded; the actual email/key text is retained as one item. Stock contents remain private and only enter the order's delivery.

No extra secret, Android update or Cloudflare binding is required. Migration adds stock-state/event tables, a customer alert preference and indexes/triggers. `node tests/product-notifications.cjs` covers events, stock increases while already available, repeated updates, rollback, stale-event suppression, coalescing, batch continuation, concurrency, rate-limit retry, mute/admin controls and table parsing. Existing payment/checkout suites verify unchanged finances.

The price-event trigger is recreated transactionally during schema upgrades so older follower-only trigger definitions do not survive an All Products upgrade. Existing queued events, customer preferences and follow lists are preserved. `tests/audit-upgrade-history.cjs` covers migration from that deployed legacy trigger.

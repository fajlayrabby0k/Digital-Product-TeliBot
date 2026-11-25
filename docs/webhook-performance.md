# Webhook and browsing performance

The bot already receives Telegram updates through `/api/webhook` (also supports `/`). Authenticated requests acknowledge HTTP receipt immediately and process updates with Cloudflare `waitUntil`; no polling service is needed. Existing secret-token authentication and webhook recovery are unchanged.

Callback queries are acknowledged at the start of background update processing, before database initialization. A request-local flag prevents duplicate acknowledgements in normal, maintenance and diagnostics handlers.

Shop category and product-list navigation renders the saved catalog while a shared background supplier sync runs via the execution context. Concurrent browsing requests on the same isolate/database binding share the pending sync. API stock in category product lists is identified as the latest saved snapshot. Explicit Refresh Stock still awaits supplier sync. Product details and purchase validation retain their existing live checks. Without an execution context, browsing awaits sync as before.

This removes supplier latency from normal category navigation; it does not guarantee a fixed response time for Telegram, D1, provider calls, payment verification or delivery. Periodic sync and notification queues continue unchanged. Tests hold supplier responses unresolved to verify navigation is independent and confirm callbacks are acknowledged before database initialization finishes. Live deployment timing and actual webhook health require production access.

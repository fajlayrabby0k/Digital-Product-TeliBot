# Webhook and browsing performance

The bot already receives Telegram updates through `/api/webhook` (also supports `/`). Authenticated requests acknowledge HTTP receipt immediately and process updates with Cloudflare `waitUntil`; no polling service is needed. Existing secret-token authentication and webhook recovery are unchanged.

Callback queries are acknowledged at the start of background update processing, before database initialization. A request-local flag prevents duplicate acknowledgements in normal, maintenance and diagnostics handlers.

Shop category and product-list navigation renders the saved catalog while a shared background supplier sync runs via the execution context. Concurrent browsing requests on the same isolate/database binding share the pending sync. API stock in category product lists is identified as the latest saved snapshot. Explicit Refresh Stock still awaits supplier sync. Product details and purchase validation retain their existing live checks. Without an execution context, browsing awaits sync as before.

This removes supplier latency from normal category navigation; it does not guarantee a fixed response time for Telegram, D1, provider calls, payment verification or delivery. Periodic sync and notification queues continue unchanged. Tests hold supplier responses unresolved to verify navigation is independent and confirm callbacks are acknowledged before database initialization finishes. Live deployment timing and actual webhook health require production access.

## Live speed diagnostics and settings reads

The admin can send `/speed` or open Admin Panel → Speed Test. It measures three D1 SELECT reads, a Telegram getMe call, and getWebhookInfo; the report shows the expected production webhook configuration, pending-update count and sanitized last error. No webhook is changed. Timings are worker-to-service timings, not end-to-end Telegram delivery latency. The report is sent only to the configured admin.

Customer updates preload a fresh settings snapshot with one database read instead of serial lookups for maintenance, membership and exchange-rate settings. The snapshot is scoped to one update; admin settings writes are not cached across requests. Empty settings snapshots retain per-key fallback behavior. A local benchmark with a simulated 5 ms delay per read reduced home navigation from 6 reads to 3 (33.5 ms to 23.8 ms in that run). These are synthetic local measurements, not production latency.

On 26 November 2026 (Dhaka), a workspace attempt to measure the production health endpoint failed at the outbound CONNECT proxy with HTTP 403 before reaching the site. No valid live timing was obtained. Use `/speed` after deployment for worker-side live measurements.

# Periodic catalog sync

The repository workflow **Store catalog sync** requests `POST https://digital-product-telibot.pages.dev/api/sync` approximately every five minutes and supports **Run workflow** for a manual test. It uses the bot's existing public sync endpoint, so no bot token/API key, new GitHub secret, Android update or companion Worker is required. The workflow has read-only repository permissions and no third-party action dependencies.

The endpoint runs a fresh supplier catalog sync and resumes queued channel/private notifications in background batches. Existing prices, margins, categories and stock reconciliation rules remain in use. It does not purchase products, approve payments or modify wallet balances. A database lease prevents overlapping scheduled runs from repeating the same sync; failures release the lease and are recorded. A timed-out lease can expire for recovery.

**Admin Panel → Automatic Sync** shows whether scheduled processing is allowed, the last attempt, the last successful sync, running/idle state and the sanitized last issue, with Dhaka timestamps. ON permits processing; it is not proof that a scheduler is running. Pause Auto Sync makes periodic requests skip catalog updates; queued notifications may still drain. Run Now performs an explicit manual sync even while automatic processing is paused.

## After deployment

1. In GitHub open **Actions → Store catalog sync**. Enable Actions/workflows if the repository has them disabled.
2. Choose **Run workflow** once to verify the runner can reach Cloudflare. The scheduled workflow runs on the default branch.
3. Open the bot's **Automatic Sync** screen and check that Last successful sync advances. A failed GitHub job or a recorded error requires investigation rather than assuming the scheduler is active.

GitHub scheduled workflows are best effort: runs may be delayed, and GitHub may disable schedules on inactive public repositories. The workflow targets the known production Pages URL; update its `SYNC_URL` if the deployment URL changes. Small notification queues can finish in one pass; larger queues progress across subsequent passes. This is not a guarantee of exact five-minute detection or immediate delivery to every recipient.

The code also preserves the Cloudflare scheduled handler for deployments that support it. No Cloudflare Cron Trigger is provisioned by this change. Migration adds the periodic-sync status table and default setting without changing existing balances/orders. `node tests/periodic-sync.cjs` covers imports, pause/manual run, overlapping runs, failure/recovery status, HTTP method handling, background drain scheduling, workflow configuration and admin-only controls.

Tests simulate supplier/Telegram responses. Live GitHub workflow execution and production connectivity must be checked in Actions and the bot; they were not verified from the development environment.

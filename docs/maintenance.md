# Maintenance mode

Open `/admin`. The first button shows **Maintenance: OFF • Turn ON** or **Maintenance: ON • Turn OFF**. ON pauses customer use; OFF restores it. Actions explicitly set the desired state, so repeated clicks do not accidentally flip it back.

The `maintenance_mode` setting is stored in D1 and defaults to OFF. Schema/default migration adds it without overwriting an existing value. Customers read it afresh on each update, so separate Pages runtimes observe changes without a shared cache. Maintenance survives runtime restarts and deployment until an admin turns it off.

While ON, every customer message or callback receives:

```
🔧 Bot Under Maintenance
┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅

⚙️ We are currently performing scheduled maintenance to improve your experience.

🕐 The bot will be back online shortly. Thank you for your patience!
```

Old customer inline buttons are removed when the maintenance message replaces that view. The gate runs before registration, input handling, redeem, order creation and payment verification. Pending records are preserved. The configured `ADMIN_ID` bypasses this gate and can browse, edit settings, generate codes and turn maintenance off.

This pauses incoming customer actions, not the deployment or administrative background sync. Already-running transactions are not cancelled. If customers already paid before/during downtime, existing payment time limits still apply; admin may need to reconcile those payments. No extra Worker, Cron or Secret is needed.

`node tests/maintenance.cjs` uses actual SQLite to test the menu, exact notice, callback acknowledgement/button removal, blocked customer mutations, admin bypass, authorization, idempotent actions, persistence and successful use after OFF. Live deployment still requires the latest production Pages build.

# Payment and receiving-phone health

**Admin Panel → Payment & SMS Status** is admin-only. Payment Settings and Payment Dashboard also link to it. It shows authenticated last contact, last heartbeat, app version, the phone-reported forwarding/SMS-permission/battery state and pending queue count. It includes company-SMS capture outcomes, accepted SMS uploads, three recent enrolled-device receipt records, current pending mobile payments and recent unresolved verification issues with links to their invoices. Secrets and full account numbers are not displayed.

Payment method rows are configuration checks, not live Binance API or BSC RPC probes. Rocket remains manual. Existing invoice details include read-only SMS evidence: missing server receipt, amount/account/device mismatch, out-of-window timestamps, late ID submission or already-used transaction. Delayed receipt-triggered verification now saves its result too. These screens never approve, credit, debit, retry supplier orders or send test money.

## Bridge v0.8

Install [v1.1](../downloads/telibot-receipt-bridge-v1.1.apk) over the installed app with Update. Do not uninstall or clear data. The APK uses the same verified release certificate as v0.7; existing encrypted receipts, signing secret and device identity remain in the app's storage. No new Cloudflare variables or Worker are required. v1.0 adds visible foreground-service, notification and bounded upload wake-lock permissions; SMS inbox-reading and sending permissions are not added.

Open the app and use Save and Start / Connection Check, then open the admin status page. v0.8 signs a minimal `type: heartbeat` payload using the existing HMAC protocol, enrolled device ID and endpoint. It sends app version, forwarding/permission/battery flags, queue count, configured receiving numbers, last company-SMS capture time/method and an allowlisted capture result. It sends no raw SMS, OTP, PIN, sender number, contacts or inbox contents. A heartbeat cannot create a payment receipt or settle an invoice. Unknown fields and unauthenticated/wrong-device requests are rejected.

JobScheduler sends periodic reports at Android's minimum interval of 15 minutes, with network constraints and persistence across reboot. The app also attempts reports after capture/upload, opening an enabled app, connection checks and stopping forwarding. Stopping forwarding cancels the periodic report and attempts one final OFF report. Doze/battery restrictions, missing network and force-stop can delay or prevent jobs. A heartbeat older than 45 minutes is shown as stale, not proof that the phone is offline; a recent report does not guarantee current connectivity. Absence of payment SMS alone is never treated as an offline indicator.

v0.7 and earlier signed receipt/check formats remain accepted. Checks and receipt uploads update last contact; older apps do not provide permission/queue/periodic heartbeat fields, so those remain unknown. Historical receipt timestamps are labelled separately and do not fabricate phone presence.

## Storage and verification

`mobile_bridge_health` stores one row per enrolled device. Only authenticated checks, accepted receipts, or validated heartbeat/status failures update it; failed authentication does not create phone presence. Telemetry storage failures do not block accepted payment receipts; heartbeat requests require successful status storage before acknowledging the report. No financial tables are changed by health reports.

`node tests/payment-health.cjs` covers authentication, extra OTP-field rejection, wrong device, no receipt/credit from heartbeats, old checks/receipts, stale/off/permission/configuration states, exact invoice mismatch evidence, late-SMS verification reasons, historical persistence, masking and admin access. All payment suites still apply. Java parser/queue/config tests and APK compilation/signature checks are run separately. Background execution and real receiving-phone connectivity require checking the installed app on the actual phone; these were not live-tested here.

## Foreground relay in v1.0

The user starts a non-exported remoteMessaging foreground service from the Activity, with a persistent notification and Stop action. It uploads queued receipts directly while active, using a shared single-uploader lock with JobScheduler fallback. Pending rows are deleted only after a matching server acknowledgment. A short bounded partial wake-lock protects active upload, never an idle permanent lock. Boot/package-update receivers attempt to restore an enabled relay; Android may reject or delay background startup. Force Stop requires opening the app again. Main app status shows relay/capture/upload state. `android-bridge/tests/uploader-tests.sh` exercises the actual uploader against test Android/storage/network adapters, covering rejection retention, continued delivery, Stop/Off and concurrency; this does not emulate the Android service lifecycle.

## Simple status screen

Payment & SMS Status opens a compact overview: a colored readiness heading, recent connection, SMS collection/permission, upload queue, last authenticated contact and last accepted SMS. A single action message explains what to fix. Refresh updates this view; Details opens the existing technical configuration, evidence, recent issues and APK link. The details screen has a return-to-status button.

Green Ready requires configured bridge credentials, contact and heartbeat within 45 minutes, successful configuration report, forwarding enabled, SMS permission granted, no reported capture failure and no waiting upload. Unknown/stale contact or heartbeat stays yellow; permission/collection/setup/capture problems remain explicit. Ready describes the latest reported SMS relay readiness, not a live connectivity guarantee or a successful match for every payment. It does not claim that Rocket, Binance or BEP20 were live-tested. Individual payment verification still requires eligible SMS and matching method/account/amount/TrxID/time. No financial behavior changed.

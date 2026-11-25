# SMS-to-delivery readiness

## Supported flow

bKash and Nagad direct orders create a 60-minute invoice containing the method, receiving account, exact amount and time window. The receiving Android app captures a new incoming company SMS, parses the supplied template locally, stores the minimal receipt encrypted, and signs its upload. The buyer submits the receipt Transaction ID. The server checks the enrolled device, method, account, amount, time, submission and unique claim before delivering the local or API product as a text document. Receipts arriving after ID submission resume the invoice. Deposit invoices credit the wallet instead of delivering a product.

References are optional and their contents do not change matching. The app never scans inbox history; reading/marking a message as seen does not affect the SMS broadcast. The app must have been installed, enabled and permitted to receive SMS when the message arrived. A force-stopped app or Android restrictions can prevent capture/background upload; review Payment & SMS Status and the app report. Missed historical messages cannot be assumed to have been forwarded.

## Verification

Run the actual APK parser against synthetic copies of the supplied formats, then send its output through the signed worker endpoint and user Transaction ID flow:

```sh
# Requires Node with node:sqlite and a JDK. Without javac, set ECJ_JAR.
bash android-bridge/tests/payment-integration.sh
```

This verifies bKash with/without Ref and Nagad with/without Ref, SMS before/after ID submission, once-only local/API document delivery, a real dispatcher HTTP request to a simulated supplier, and refusal to reuse a payment for another account. Telegram and supplier HTTP responses are simulated. It does not test actual Android SMS broadcasts, the user's phone, production secrets, internet, real money or the live supplier.

The normal `tests/mobile-payment-flow.cjs` suite additionally covers bKash/Nagad deposits, concurrent/duplicate claims, exact amount and time mismatches, receiving-account changes, 60-minute expiry, delayed SMS, rollback, maintenance and delivery failures. `tests/payment-health.cjs` checks device reporting and diagnosis.

## Rocket remains pending

Rocket is manual. Its receiving account can be set, but the app parser and signed-receipt matcher deliberately accept only the administrator-supplied bKash/Nagad templates. An actual incoming Rocket Send Money receipt and original sender ID are required before implementing its parser and enabling automatic settlement. Do not infer a Rocket receipt from generic amount/TrxID keywords or treat the sender name alone as proof.

## Recovery update in v0.9

Save-and-Start schedules uploads and heartbeat reporting as soon as forwarding is enabled, even if the immediate setup check fails. Previously, changing settings could cancel an upload job, and a failed check could leave an existing queue unscheduled until the next SMS/app reopening. The heartbeat also restores a missing upload job when receipts remain, preserving any already scheduled retry/backoff. Android background execution still controls when jobs run. Receipt content, signatures and matching rules are unchanged; Rocket is not enabled without a supplied template.

## Required live check

Use the v1.0 APK as an update over the installed app; do not uninstall or clear data. Confirm the app connection check, enrolled-device heartbeat, SMS permission, receiving numbers and server account settings agree. Then check a fresh real direct-order payment for each supported method. Verify the receipt appears in Payment & SMS Status, the invoice completes, exactly one document arrives, and repeating Check Payment does not charge or deliver again. A genuine supplier order also requires sufficient supplier balance/stock and a live API connection. No live check was performed from this workspace.

## Foreground operation in v1.0

Start the app and grant SMS/notification access; verify the persistent Payment SMS bridge active notification. Use Unrestricted battery mode. The app now maintains a visible foreground relay and a direct encrypted-queue uploader, with persisted jobs as fallback. Capturing still requires a new SMS broadcast and correct sender/template/settings. This improves background operation but does not establish the cause of a specific live missing-receipt complaint without the app capture/upload report or server status. It does not recover never-captured historical inbox SMS or enable Rocket.

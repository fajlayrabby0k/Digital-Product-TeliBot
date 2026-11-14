# Android APK download

## Latest: v0.5 — সহজ সেটআপ

[Download TeliBot Receipt Bridge v0.5 APK](https://github.com/fajlayrabby0k/Digital-Product-TeliBot/raw/refs/heads/main/downloads/telibot-receipt-bridge-v0.5.apk)

Android 8+. Bengali four-step setup, default bot URL/senders, automatic private key generation, copy buttons, authenticated connection test and clear status/errors. Update over v0.1 without uninstalling to retain the existing key/Device ID.

[সহজ সেটআপ নির্দেশনা](../android-bridge/README.md) · [SHA-256 checksum](telibot-receipt-bridge-v0.5.sha256)

On GitHub's APK page, choose **Download raw file**. This folder contains downloads only; the bot does not import/execute APKs. No signing keystore, password, API key or device credentials are included.

Forwarding starts OFF; supports supplied bKash/Nagad receipts. Rocket is disabled. The new bot code matches signed receipt evidence to user-submitted TrxIDs and snapshotted invoices for one-time credit/direct delivery. This is SMS-based verification, not provider API settlement confirmation. Live phone testing remains necessary.

Older APKs remain for history. Update to v0.4: it fixes receipt detection for bKash SMS containing optional `Ref 2.` / other reference text. The old no-Ref format and Nagad remain supported. Install over the previous app without uninstalling; keys and settings are retained.

v0.5 ignores optional reference contents in both supplied receipt templates: references are not matching keys or forwarded fields. Default company senders are bKash and NAGAD (case-insensitive), with ordinary mobile-number senders rejected. Incoming-receipt structure, exact amount/TrxID/date parsing and server-side invoice checks remain required.

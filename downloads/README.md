# Android APK download

## Latest: v0.8 — Payment & SMS Bridge Status

[Download TeliBot Receipt Bridge v0.8 APK](https://github.com/fajlayrabby0k/Digital-Product-TeliBot/raw/refs/heads/main/downloads/telibot-receipt-bridge-v0.8.apk)

Adds authenticated periodic phone-status reports (about 15 minutes, subject to Android scheduling), forwarding/SMS-permission/battery status, pending queue count and structured company-SMS capture outcomes. Open **Admin Panel → Payment & SMS Status**. No raw SMS, OTPs, PINs, contacts or inbox history are sent. No additional Android permissions.

Android 8+. Update over the installed app without uninstalling; existing keys/Device ID/queue retained. One Save-and-Start action, automatic SMS permission request, clear enabled-method/server status, offline capture, queue-safe settings, retry on app opening and persisted jobs after reboot. First-time setup and reports are separate from the simple daily-use screen.

[সহজ সেটআপ নির্দেশনা](../android-bridge/README.md) · [SHA-256 checksum](telibot-receipt-bridge-v0.8.sha256)

Use **Download raw file** on GitHub. This folder contains downloads only; the bot does not execute APKs. No private signing keys/API credentials are included. Defaults bKash and NAGAD; optional reference fields ignored. Existing payment receipt protocol/settings remain compatible; deploy the updated backend before installing v0.8 for health reports. No new inbox-reading permission; normal boot permission restores pending jobs. Live receiving-phone behavior still requires verification. Older APKs retained for history.

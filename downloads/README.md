# Android APK download

## Latest: v1.0 — Payment & SMS Bridge Status

[Download TeliBot Receipt Bridge v1.0 APK](https://github.com/fajlayrabby0k/Digital-Product-TeliBot/raw/refs/heads/main/downloads/telibot-receipt-bridge-v1.0.apk)

v1.0 adds a visible foreground SMS relay with direct upload/retry, reboot/update restart attempts and JobScheduler fallback. Start it from the app, allow notifications and use Unrestricted battery mode. Force Stop and OEM restrictions can still prevent delivery.

v0.9 also schedules upload/health retries even if the initial connection check fails and uses heartbeat reports to recover a missing upload job without resetting an existing backoff. Rocket remains manual pending its actual SMS template.

Adds authenticated periodic phone-status reports (about 15 minutes, subject to Android scheduling), forwarding/SMS-permission/battery status, pending queue count and structured company-SMS capture outcomes. Open **Admin Panel → Payment & SMS Status**. No raw SMS, OTPs, PINs, contacts or inbox history are sent. v1.0 adds foreground-service, notification and bounded wake-lock permissions for the visible background relay; it does not add READ_SMS, SEND_SMS or contact access.

Android 8+. Update over the installed app without uninstalling; existing keys/Device ID/queue retained. One Save-and-Start action, automatic SMS permission request, clear enabled-method/server status, offline capture, queue-safe settings, retry on app opening and persisted jobs after reboot. First-time setup and reports are separate from the simple daily-use screen.

[সহজ সেটআপ নির্দেশনা](../android-bridge/README.md) · [SHA-256 checksum](telibot-receipt-bridge-v1.0.sha256)

Use **Download raw file** on GitHub. This folder contains downloads only; the bot does not execute APKs. No private signing keys/API credentials are included. Defaults bKash and NAGAD; optional reference fields ignored. Existing payment receipt protocol/settings remain compatible; deploy the updated backend before installing v0.8 for health reports. No new inbox-reading permission; normal boot permission restores pending jobs. Live receiving-phone behavior still requires verification. Older APKs retained for history.

# TeliBot Receipt Bridge 0.1 — enrollment build

Small, native Java Android application (Android 8+, API 26). No advertising, analytics, external runtime libraries, remote code updates or hardcoded credentials. Release APK is not debuggable and has Android v2/v3 signatures. Signing confirms the build's identity; it is not an independent security audit.

**This build is not a completed automatic payment verifier.** It captures enrolled receipt candidates and uploads evidence to the Pages endpoint. The endpoint stores `unverified_sms`; it never credits balances or delivers orders. Existing manual approval remains. The administrator supplied bKash and Nagad receipt examples; their exact full-message formats are implemented and tested with anonymized fixtures. Rocket is disabled until its real receipt sample is supplied. Live phone and invoice-matching tests are still required before enabling credit.

## Permissions and boundaries

- `RECEIVE_SMS`: receive future SMS broadcasts. No `READ_SMS`, inbox scan, contacts, call, SMS sending, Accessibility, overlay or storage permissions.
- `INTERNET` and `ACCESS_NETWORK_STATE`: HTTPS uploads and Android JobScheduler retries.
- Android's system-only `BROADCAST_SMS` permission protects the exported SMS receiver. The upload service requires system `BIND_JOB_SERVICE` permission.
- The app necessarily receives incoming SMS broadcasts, including OTPs, before filtering. Rejected messages are not stored or transmitted. It cannot make payments and never requests PINs.
- Only an exact configured sender and built-in full-message receipt template can produce a candidate. There is no user-entered regex or remote rule download. Ordinary mobile numbers cannot be configured as sender. A sender name remains spoofable; this is phone evidence, not independently verified provider settlement.
- Before template matching, credentials, outgoing transfers and debit/payment messages are rejected. Only amount, TrxID, method, receiving account, receipt capture time, SMS payment time, event ID and device ID leave the phone. No raw SMS, sender phone, balance, contact or OTP field is sent.
- Secret and queued metadata use Android Keystore AES-GCM encryption. Backups are disabled. Screenshots and autofill are disabled on settings. An unlocked compromised/rooted phone can still compromise the system. Use a dedicated receiving phone/SIM.
- HTTPS uses Android's standard trust store; cleartext and redirects are refused. The administrator chooses the endpoint. HMAC-SHA256 signs exact UTF-8 body followed by timestamp. No credentials in URLs.
- Forwarding defaults OFF. Stop clears queued receipts and cancels scheduled jobs. Changing settings also clears the queue, preventing old receipts from being rerouted. Already in-flight HTTP requests cannot be recalled.
- Jobs retry with exponential backoff; no polling/Cron. Battery/network/Android scheduling can delay delivery. Queue is capped at 200 records; records older than 24 hours are removed on queue activity. SMS received while forwarding is OFF is not recovered from the inbox.

## Phone setup (বাংলা)

1. APK ইনস্টল করুন। শুধু ইনস্টল করার সময় browser/file-manager-এর “Install unknown apps” প্রয়োজন হলে অনুমতি দিন; পরে বন্ধ করুন।
2. প্রথমবার forwarding OFF থাকবে। শুধু ইনস্টল করলেই SMS সার্ভারে যাবে না।
3. ফোনে screen lock দিন। মূল ব্যাংক/ব্যক্তিগত OTP-এর SIM থেকে আলাদা পেমেন্ট ফোন ব্যবহার করুন।
4. “নতুন SMS গ্রহণের permission দিন” বাটনে permission দিন। কিছু Android/OEM SMS permission সীমিত করতে পারে; বাস্তব ফোনে পরীক্ষা প্রয়োজন। Accessibility বা default SMS app হওয়ার দরকার নেই।
5. Cloudflare Pages → Settings → Variables and Secrets-এ production secret `MOBILE_BRIDGE_SECRET` রাখুন (নিজে তৈরি করা অন্তত ৩২ অক্ষরের random value)। সেটিই অ্যাপের Signing Key-তে দিন। চ্যাটে পাঠাবেন না। Telegram/Binance secret ব্যবহার করবেন না।
6. অ্যাপে দেখানো Device ID Cloudflare production variable `MOBILE_BRIDGE_DEVICE_ID` হিসেবে দিন। Reinstall/clear-data করলে ID বদলাবে। Cloudflare binding changes require a new deployment.
7. Endpoint: `https://digital-product-telibot.pages.dev/api/mobile-receipt`। এই কোড deploy এবং variables সেট না থাকলে endpoint বন্ধ (503) থাকবে। কোনো third-party URL দেবেন না।
8. বিকাশ/নগদের company sender এবং receiving account দিন। যে মাধ্যম ব্যবহার করবেন না, তার দুটি ঘর ফাঁকা রাখুন। Company sender একদম ফোনে দেখানো SMS sender-এর মতো হতে হবে (যেমন bKash); sender-এর আসল বানান ফোন থেকে নিশ্চিত করুন। রকেট এখন বন্ধ। প্রথম পরীক্ষায় শুধু একটি receiving SIM ব্যবহার করুন; dual-SIM account mapping এই build-এ নেই।
9. আপনার দেওয়া “You have received Tk … TrxID … at …” বিকাশ এবং multiline “Money Received. … TxnID: …” নগদ SMS format অ্যাপে দেওয়া আছে। Regex লিখতে হবে না। Fee/Balance জমার amount হিসেবে নেওয়া হয় না। তারিখ dd/MM/yyyy HH:mm, Asia/Dhaka হিসেবে পড়বে। অচেনা format বাদ যাবে।
10. “SMS format ফোনেই পরীক্ষা করুন” দিয়ে sample পরীক্ষা করুন; এতে কোনো network upload বা balance credit হয় না। OTP paste করবেন না। তারপর আসল ছোট পেমেন্ট দিয়ে receipt, queue ও server record মিলিয়ে পরীক্ষা করতে হবে।
11. যাচাই শেষে forwarding ON করে Save করুন। Battery settings-এ background execution অনুমতি প্রয়োজন হতে পারে। Strict OEM battery policies can prevent timely delivery.
12. এই build-এ user deposit/order approval স্বয়ংক্রিয় নয়; backend `unverified_sms` records রাখে। অটো-ক্রেডিট চালুর আগে invoice/amount/time/ownership checks ও atomic one-time settlement আলাদাভাবে implement/test করতে হবে।

## Server contract

`POST /api/mobile-receipt`, JSON under 4096 bytes. Headers `X-Timestamp` (Unix seconds, ±300 seconds) and `X-Signature` (lowercase hex HMAC-SHA256 of `rawBody + timestamp`). Server authenticates a single enrolled device and compares receiving account against admin payment settings. Incoming capture time must be within 24 hours; parsed payment time must be within 24 hours before capture (at most 5 minutes ahead for clock skew). `amountMinor` is integer BDT poisha, never floating USD.

Payload keys: `version:1`, `eventId` UUID, `deviceId`, `method` (bkash/nagad), `account`, `trxId`, `amountMinor`, `receivedAt` and `paidAt` Unix milliseconds. Unknown keys are refused, preventing accidental raw-SMS uploads. Same event+body is idempotent; conflicting event or transaction reuse is refused. Success: `{"accepted":true,"eventId":"...","status":"unverified_sms"}`. The phone removes queued data only after this explicit acknowledgement. Invalid/expired/conflicting receipts are not credited and may retry until queue expiry.

## Build and inspect

Use Android SDK platform 35/build-tools 35.0.0, JDK 17+ (or Java runtime with Eclipse ECJ 3.40.0), Python 3 and zip. No Gradle or dependency download during build.

Generate your own private release keystore, keep it outside Git, and supply `ANDROID_SDK_ROOT`, `BRIDGE_KEYSTORE`, and `BRIDGE_STORE_PASS` to `./build.sh`. The alias must be `bridge`. With only a Java runtime, also set `ECJ_JAR`. Output: `build/telibot-receipt-bridge.apk` plus printed certificate and file hashes. Do not commit keystores/passwords or share them in chat. The current session's release keystore lives outside this repository in `/workspace/.bridge-signing`; back it up privately for future updates. Losing it means future builds cannot update the installed APK in place.

Inspect permissions with `aapt2 dump permissions build/telibot-receipt-bridge.apk`; verify with `apksigner verify --verbose --print-certs`. Run `tests/ParserTest.java` with ReceiptParser on Java and `node ../tests/mobile-bridge.cjs` for real SQLite backend security/idempotency checks. APK compilation and signature checks do not replace installation, permission, SMS reception, JobScheduler and live HTTPS tests on an Android phone. Those phone tests have not been performed here.

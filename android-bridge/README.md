# TeliBot Receipt Bridge v0.2 — সহজ সেটআপ

[নতুন APK ডাউনলোড করুন](https://github.com/fajlayrabby0k/Digital-Product-TeliBot/raw/refs/heads/main/downloads/telibot-receipt-bridge-v0.2.apk)

Android 8+। পুরোনো v0.1 ইনস্টল থাকলে তার ওপর Update করুন; Uninstall করার দরকার নেই। একই release certificate ব্যবহার করা হয়েছে; আগের Device ID ও encrypted secret রাখা হবে। Uninstall করলে বা Clear data করলে নতুন চাবি/ID তৈরি হবে এবং Cloudflare-এ আবার দিতে হবে।

**বর্তমানে SMS থেকে পেমেন্টের রেকর্ড পৌঁছানো পর্যন্ত তৈরি। অটো ব্যালেন্স যোগ/ডেলিভারি এখনো চালু নয়।** এটি provider API verification নয়; sender name-ও spoof হতে পারে।

## আগে থেকেই দেওয়া আছে

- আপনার বটের HTTPS ঠিকানা: `https://digital-product-telibot.pages.dev/api/mobile-receipt`।
- বিকাশ sender: `bKash`; নগদ sender: `NAGAD` (বড়/ছোট অক্ষর সমস্যা নয়)। ফোনে sender ভিন্ন হলে advanced settings-এ বদলান।
- আপনার দেওয়া বিকাশ/নগদ incoming payment SMS format। Regex লিখতে হবে না। রকেট বন্ধ আছে।
- ফোনে নিজে তৈরি ৬৪ অক্ষরের random গোপন চাবি ও Device ID। চাবি APK বা GitHub-এ রাখা নেই।
- Forwarding প্রথমে বন্ধ। সফল authenticated server check-এর পরই Start বাটন থেকে চালু হয়।

## মাত্র চার ধাপ

### ১. SMS permission

অ্যাপে **SMS permission দিন** চাপুন → Allow। পুরোনো inbox পড়ার অনুমতি নেই। অ্যাপকে Default SMS app বা Accessibility permission দিতে হবে না।

### ২. নিজের নম্বর

**বিকাশ নম্বর** ঘরে আপনার টাকা পাওয়ার বিকাশ নম্বর দিন। **নগদ নম্বর** ঘরে আপনার টাকা পাওয়ার নগদ নম্বর দিন। যেটি ব্যবহার করবেন না ফাঁকা রাখুন। বাংলা অঙ্ক বা +880 prefix দিলে নিজে থেকে ১১ অঙ্কে সাজাবে।

বটের **Admin Panel → Payment Settings**-এও একই receiving number দিন। নমুনা SMS-এর “from” বা “Sender” নম্বর গ্রাহকের; সেটি এখানে দেবেন না। প্রথম বাস্তব পরীক্ষায় শুধু একটি receiving SIM ব্যবহার করুন; dual-SIM mapping এই সংস্করণে নেই।

### ৩. Cloudflare-এ দুটি তথ্য

Cloudflare → **Workers & Pages → আপনার Pages project → Settings → Variables and Secrets → Production**।

| Name | Type | Value কোথা থেকে পাবেন |
| --- | --- | --- |
| `MOBILE_BRIDGE_SECRET` | Secret | অ্যাপে **গোপন চাবি কপি** চাপুন; Paste করুন |
| `MOBILE_BRIDGE_DEVICE_ID` | Text | অ্যাপে **ফোনের ID কপি** চাপুন; Paste করুন |

একটি কপি করে Paste শেষ হলে অন্যটি কপি করুন। Secret চ্যাটে পাঠাবেন না। Binance/Telegram key ব্যবহার করবেন না।

Save করুন → **Deployments → সর্বশেষ deployment → Retry deployment / Redeploy**। সর্বশেষ GitHub কোড deploy হতে হবে; নতুন version-এ setup-check endpoint যুক্ত হয়েছে।

### ৪. পরীক্ষা করে চালু

অ্যাপে **সংযোগ পরীক্ষা করে চালু করুন** চাপুন। সফল হলে “সংযোগ ঠিক আছে। SMS পাঠানো চালু হয়েছে।” দেখাবে। ভুল key, ফোনের ID, receiving number বা deployment হলে বাংলায় কারণ দেখাবে।

এখন ফোনে ইন্টারনেট রাখুন। Settings → Apps → TeliBot Receipt Bridge → Battery → Unrestricted দিন। Auto-start থাকলে চালু করুন। Force stop করবেন না। Android/OEM background limits-এর কারণে দেরি হতে পারে।

## কীভাবে SMS যাবে?

নতুন SMS → company sender মেলানো → পুরো বিকাশ/নগদ receipt format মেলানো → OTP/outgoing message বাদ → amount/TrxID/time আলাদা করা → encrypted local queue → signed HTTPS upload → server acknowledgement। পুরো SMS, customer sender number, balance বা OTP পাঠায় না। পুরোনো inbox থেকে SMS তুলে পাঠায় না।

**অন্য সেটিং / পরীক্ষা → SMS format ফোনেই পরীক্ষা** দিয়ে পেমেন্ট SMS paste করতে পারেন। ফলাফল শুধু ফোনে দেখাবে; upload/credit হবে না। বাস্তব পরীক্ষার জন্য নতুন ছোট পেমেন্ট প্রয়োজন।

## বুঝবেন কাজ করছে কীভাবে?

Cloudflare → D1 database → Console:

```sql
SELECT method, trx_id, amount_minor, status, created_at
FROM mobile_bridge_receipts
ORDER BY created_at DESC
LIMIT 10;
```

`amount_minor` পয়সায়: ৫০০ টাকা = `50000`। `unverified_sms` মানে রেকর্ড পৌঁছেছে, পেমেন্ট অনুমোদিত নয়। Setup check কোনো receipt table/row তৈরি করে না; প্রথম valid SMS upload-এর আগে table না থাকতেও পারে। Setup success প্রমাণ করে signature, device ID ও receiving numbers মিলেছে; বাস্তব SMS reception প্রমাণ করে না।

সমস্যা হলে অ্যাপে **অন্য সেটিং / পরীক্ষা → Pending রেকর্ড আবার পাঠান**। **বন্ধ করুন** সঙ্গে সঙ্গে নতুন forwarding বন্ধ করে, pending queue রাখে। সেটিং সত্যিই বদলালে পুরোনো queue মুছে যায় যাতে অন্য account/server-এ reroute না হয়। একই সেটিং পুনরায় Save করলে queue থাকে। Pending আলাদা বাটন দিয়ে confirmation-এর পরে মোছা যায়।

## Security and technical details

Native Java; no advertising, analytics, external runtime libraries, remote code updates or hardcoded credentials. Permissions: `RECEIVE_SMS`, `INTERNET`, `ACCESS_NETWORK_STATE`. No `READ_SMS`, contacts, SMS sending, Accessibility, overlay or storage permissions. Android `BROADCAST_SMS` protects the exported receiver; `BIND_JOB_SERVICE` protects the upload service. The app receives new SMS broadcasts before local filtering, so it can encounter OTP messages; rejected messages are never stored/uploaded. Use a dedicated receiving phone/SIM.

Secret and queued metadata use Android Keystore AES-GCM. Backups and screenshots/autofill are disabled. Clipboard copy is explicitly user initiated and marked sensitive; clipboard sharing/access still depends on the keyboard and Android version. No credentials are logged. Rooted/compromised devices remain a risk. Signing identifies the build; it is not an independent security audit.

HTTPS uses Android's normal certificate validation, no cleartext/redirects. JobScheduler retries with exponential backoff; there is no polling/Cron. Queue is capped at 200 records, with 24-hour expiry cleaned on activity. Forwarding OFF does not recover SMS later from the inbox. Already in-flight HTTP requests cannot be recalled. Pending jobs are not guaranteed to survive reboot; open the app and retry pending records after restarting the phone.

`POST /api/mobile-receipt`: body <4096 bytes; `X-Timestamp` Unix seconds ±300; lowercase `X-Signature` HMAC-SHA256 of exact UTF-8 `rawBody + timestamp`. Requires production `MOBILE_BRIDGE_SECRET` (32+ chars), `MOBILE_BRIDGE_DEVICE_ID` and D1 DB. Setup check body: `{version:1,type:"check",deviceId,bkashAccount,nagadAccount}`. Authenticated check reads receiving-account settings, performs no credit or receipt insertion, and returns `{connected:true,deviceId}` only on exact account matches.

Receipt fields: `version:1,eventId,deviceId,method,account,trxId,amountMinor,receivedAt,paidAt`. Unknown fields are refused. Method is bkash/nagad only. Integer `amountMinor` is BDT poisha. SMS timestamp parsed as dd/MM/yyyy HH:mm in Asia/Dhaka. Capture within 24 hours; parsed payment within 24 hours before capture (up to 5 minutes ahead for skew). Signature/device/account validation precedes insert. Same event+body is idempotent; conflicting event or transaction reuse is refused. Successful receipt reply is `{accepted:true,eventId,status:"unverified_sms"}`. The phone deletes queued metadata only after this explicit acknowledgement. Rejected records may retry until expiry. **No balance mutation, order matching, automatic payment approval or delivery is implemented by this bridge.**

## Build and verification

Android SDK platform 35/build-tools 35.0.0, JDK 17+ (or Java runtime + Eclipse ECJ 3.40.0), Python 3 and zip. Supply `ANDROID_SDK_ROOT`, `BRIDGE_KEYSTORE`, `BRIDGE_STORE_PASS` to `./build.sh`; optional `ECJ_JAR`. Alias: `bridge`. Output: `build/telibot-receipt-bridge.apk`. No Gradle or dependency download during build.

Release keystore stays outside Git at `/workspace/.bridge-signing`; privately back it up to sign future updates. Never commit keystores/passwords or share them in chat. Run ParserTest.java with ReceiptParser for supplied receipt templates; `node ../tests/mobile-bridge.cjs` tests authenticated setup and receipt security/idempotency with real SQLite. Inspect permissions with aapt2; verify APK with apksigner. Build/signature/tests do not replace live Android installation, runtime permission, SMS reception and HTTPS delivery tests; these phone tests have not been performed here.

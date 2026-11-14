# TeliBot Receipt Bridge v0.7 — সহজ ব্যবহার

[APK ডাউনলোড করুন](https://github.com/fajlayrabby0k/Digital-Product-TeliBot/raw/refs/heads/main/downloads/telibot-receipt-bridge-v0.7.apk)

Android 8+। আগের অ্যাপের ওপর **Update** করুন। Uninstall/Clear data করবেন না: একই signing certificate-এ update করলে চাবি, Device ID এবং encrypted pending queue থাকবে। Backend protocol অপরিবর্তিত; নতুন Cloudflare variable লাগে না।

## আগে থেকেই সেটআপ থাকলে

1. অ্যাপ খুলে **সেটআপ / নম্বর বদলান** থেকে নিজের টাকা পাওয়ার বিকাশ/নগদ নম্বর দেখুন। বিকাশ চালাতে বিকাশ নম্বর এবং নগদের জন্য নগদ নম্বর আলাদাভাবে লাগবে। বটের Admin → Payment Settings-এ একই নম্বর রাখুন। যে মাধ্যম ব্যবহার করবেন না, ফাঁকা রাখুন। SMS-এর “from” / “Sender” গ্রাহকের নম্বর; সেটি এখানে নয়।
2. **সেভ করে চালু করুন / সংযোগ পরীক্ষা** চাপুন। SMS permission প্রয়োজন হলে অ্যাপ নিজেই চাইবে। Allow করলে শুরু হবে। আলাদা Save এবং Start করার দরকার নেই।
3. মূল স্ক্রিনে **সক্রিয়: বিকাশ, নগদ** এবং **সার্ভার: শেষ সংযোগ পরীক্ষা সফল** দেখুন। শুধু নগদ লেখা থাকলে বিকাশের নম্বর সেট হয়নি। SMS সংগ্রহ চালু মানে server যাচাই সফল নয়; দুটি অবস্থা আলাদা দেখা যায়।
4. নতুন কোম্পানির incoming payment SMS নিজে থেকে পাঠাবে। আগের queued রেকর্ড থাকলে app খোলার সময়ও retry করবে। প্রয়োজন হলে **অপেক্ষার রেকর্ড এখন পাঠান** চাপুন। নতুন করে টাকা পাঠিয়ে পরীক্ষা করবেন না।

## প্রথমবার Cloudflare সেটআপ

**সেটআপ / নম্বর বদলান** খুলুন। নিজের নম্বর লিখুন। অ্যাপ নিজে random গোপন চাবি ও Device ID তৈরি করে।

Cloudflare → Workers & Pages → Pages project → Settings → Variables and Secrets → Production:

| Name | Type | Value |
| --- | --- | --- |
| `MOBILE_BRIDGE_SECRET` | Secret | অ্যাপের **গোপন চাবি কপি** থেকে Paste |
| `MOBILE_BRIDGE_DEVICE_ID` | Text | অ্যাপের **ফোনের ID কপি** থেকে Paste |

Save করে latest deployment Redeploy করুন। একই key অ্যাপে আগে থেকেই encrypted রাখা আছে; নিজের আরেকটি key/Binance key বসাবেন না। চ্যাটে key দেবেন না। বটের ঠিকানা `https://digital-product-telibot.pages.dev/api/mobile-receipt` এবং sender bKash / NAGAD আগে থেকেই দেওয়া আছে।

নম্বর valid এবং permission থাকলে Start চাপার পর **offline capture-ও চালু হয়**। Cloudflare যাচাই ব্যর্থ হলেও নতুন valid payment SMS encrypted queue-তে থাকবে; error দেখাবে। সঠিক server response ছাড়া কিছু credited/delivered বলা হবে না। পরে settings ঠিক করে আবার একই button চাপলে queued records পাঠানোর চেষ্টা করবে।

## ফোনের সেটিং

**সমস্যার রিপোর্ট / কপি → ফোনের সেটিং** থেকে SMS permission ও Battery → Unrestricted দিন; Auto-start থাকলে চালু করুন। Force stop করলে Android নতুন SMS দিতে নাও পারে—অ্যাপ আবার খুলুন। Pending jobs ফোন reboot-এর পরেও restore করার জন্য Android-এর normal `RECEIVE_BOOT_COMPLETED` permission যোগ হয়েছে; নতুন inbox/contacts/SMS-sending permission নেই। Android/OEM background restrictions-এর কারণে delay হতে পারে; কোনো “সবসময় তাৎক্ষণিক” নিশ্চয়তা নেই।

## সমস্যা হলে এক রিপোর্ট

**সমস্যার রিপোর্ট / কপি → রিপোর্ট কপি** চাপুন। রিপোর্টে version, permission, সক্রিয় মাধ্যম, queue count, ফোনের Dhaka time, last connection/capture/upload result থাকবে। Raw SMS, OTP, account numbers, Device ID বা key থাকে না। Report মূল স্ক্রিন দখল করে রাখে না; সহজ status প্রতি ২ সেকেন্ডে foreground-এ refresh হয়। Cloudflare-এ admin `/diagnostics` shows signed SMS receipts / pending TrxID submissions, allowing both ends to be compared without paying again.

SMS format পরীক্ষা: **সেটআপ / নম্বর বদলান → অন্য সেটিং / পরীক্ষা → SMS format ফোনেই পরীক্ষা**। Paste করা text শুধু local preview; server-এ যাবে না। App পুরোনো inbox পড়ে না, তাই update করার আগে বাদ যাওয়া SMS নিজে থেকে উদ্ধার হয় না। SMS আগে পড়ে/seen করে ফেললে SMS_RECEIVED broadcast নষ্ট হয় না।

## Queue preservation fixes

Earlier versions silently deleted pending records whenever setup values changed and could leave forwarding OFF after Save. v0.7 has one Save-and-Start action and never automatically deletes a queue on setup change. Number/sender changes leave existing encrypted payloads/account snapshots untouched. A different endpoint cannot be saved while pending records exist (or storage is unreadable), preventing old evidence being rerouted; send/reconcile those records before changing URL. Explicit deletion remains under advanced settings with confirmation. The existing 24-hour expiry/200-record cap remains. This cannot recover records already deleted/missed by an older app.

Offline capture and server-connection state are distinct. Existing valid queues retry on opening the app and through persisted JobScheduler work. Failed records remain; batches rotate by attempted time so an old rejection cannot starve later valid payments. Only a server acknowledgement with the same event ID removes the queued record. Stop cancels work and disables capture while retaining records.

## Receipt security

Actual originating sender must match the configured company sender (defaults bKash/NAGAD, case-insensitive). Contact display names are not proof; ordinary 11-digit senders are rejected. Full incoming bKash/Nagad receipt structure is required. Ref is optional and ignored regardless of its value; neither Ref, raw SMS, sender/customer phone, balance nor OTP is uploaded. Amount, TrxID and dd/MM/yyyy HH:mm in Asia/Dhaka are extracted. OTP-only/outgoing messages do not match. Rocket remains unsupported.

Encrypted metadata and key use Android Keystore AES-GCM; backups/screenshots/autofill disabled. No analytics/ads/external runtime libraries/remote code updates. Permissions: RECEIVE_SMS, INTERNET, ACCESS_NETWORK_STATE and normal RECEIVE_BOOT_COMPLETED. HTTPS uses platform CA validation; redirects/cleartext refused. HMAC-SHA256 of exact UTF-8 body+timestamp authenticates the bridge. It proves enrolled-device evidence, not independent provider settlement; compromised devices/keys and spoofed sender IDs remain a risk. Use the receiving payment phone.

The server still requires device/account/method/TrxID/exact amount/time/invoice ownership and one-time atomic claim before credit/delivery. Mobile invoice/submission window: 60 minutes. A timely TrxID can wait for delayed SMS. Setup checking creates no order/credit. Delivery/provider/stock failures stay pending for review. See [mobile-wallets.md](../docs/mobile-wallets.md).

## Build and verification

SDK platform 35 / build-tools 35.0.0, JDK 17+ (or Java runtime + Eclipse ECJ 3.40), Python/zip. Set ANDROID_SDK_ROOT, BRIDGE_KEYSTORE, BRIDGE_STORE_PASS (alias bridge), optionally ECJ_JAR; run `./build.sh`. Private signing material stays outside Git in `/workspace/.bridge-signing`; back it up privately for future updates.

ParserTest.java covers screenshot receipt formats, optional refs, sender/amount/TrxID/time validation and OTP/outgoing exclusion. QueueTest.java covers failures/continuation/cancellation. ConfigTest.java covers copied/Bangla phone numbers and pending endpoint-change protection. `tests/android-queue-migration.cjs` validates queue upgrade/ordering with SQLite; mobile bridge/payment suites validate server signature checks and atomic settlement. APK build and v2/v3 signatures verified. Actual Android permissions, reboot/background execution and live SMS reception/upload require a receiving-phone check; these tests do not certify those device-specific paths.

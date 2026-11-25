# TeliBot Receipt Bridge v1.1 — সহজ ব্যবহার ও Admin Status

[APK ডাউনলোড করুন](https://github.com/fajlayrabby0k/Digital-Product-TeliBot/raw/refs/heads/main/downloads/telibot-receipt-bridge-v1.1.apk)

Android 8+। আগের অ্যাপের ওপর **Update** করুন। Uninstall/Clear data করবেন না: একই signing certificate-এ update করলে চাবি, Device ID এবং encrypted pending queue থাকবে। Payment receipt protocol অপরিবর্তিত; নতুন Cloudflare variable লাগে না।

## v1.0: দৃশ্যমান Background relay

1. ওপরের v1.1 APK আগের অ্যাপের ওপর **Update** করুন। Uninstall/Clear data করবেন না।
2. **সেভ করে চালু করুন / সংযোগ পরীক্ষা** চাপুন। SMS এবং Notification permission দিন।
3. ফোনের notification-এ **Payment SMS bridge active** এবং অ্যাপে **Foreground relay: active** দেখুন। Notification থেকে Stop করা যায়।
4. **ফোনের Background / Battery সেটিংস** খুলে অ্যাপের Battery mode **Unrestricted** রাখুন; ফোনে আলাদা Auto-start থাকলে সেটিও চালু করুন।
5. অ্যাপ নতুন bKash/Nagad payment SMS encrypted queue-তে রাখে, foreground relay দ্রুত পাঠানোর চেষ্টা করে এবং network ফিরে এলে retry করে। Scheduled job ব্যাকআপ হিসেবেও আছে। মূল স্ক্রিনে শেষ company SMS এবং upload-এর ফল দেখা যায়।

Foreground-service/notification/wake-lock permission যোগ হয়েছে; **READ_SMS, SEND_SMS বা contacts permission যোগ হয়নি**। এটি পুরোনো inbox পড়ে না, OTP বা raw SMS সার্ভারে পাঠায় না। Wake-lock কেবল upload-এর সময় সীমিত সময়ের জন্য নেওয়া হয়। রকেট এখনো manual। Android Force Stop, Doze/OEM বা internet restriction এড়ানোর নিশ্চয়তা নেই; restart-এর পর notification না দেখলে অ্যাপ খুলে Start দিন। v1.0-এর background আচরণ বাস্তব ফোনে পরীক্ষা করা প্রয়োজন।

## v0.9: সংযোগ ব্যর্থ হলেও স্বয়ংক্রিয় retry

ইন্টারনেট/সংযোগ পরীক্ষা ব্যর্থ হলেও forwarding চালু থাকলে encrypted queue upload এবং health report schedule হবে। ইন্টারনেট ফিরলে Android সুযোগ দিলে আবার চেষ্টা করবে। Heartbeat pending queue দেখলে হারিয়ে যাওয়া upload job-ও ফিরিয়ে আনবে। বিদ্যমান retry/backoff বারবার reset করবে না। রকেটের incoming SMS format না পাওয়া পর্যন্ত Rocket অটো নয়।

## v0.8 থেকে থাকা Admin Status

1. আগে বটের নতুন deploy শেষ হতে দিন। ওপরের v0.9 APK ডাউনলোড করে আগের অ্যাপের ওপর **Update** করুন—Uninstall বা Clear data করবেন না। একই release certificate ব্যবহার করা হয়েছে; পুরোনো চাবি, Device ID ও encrypted queue থাকবে।
2. অ্যাপ খুলে **সেভ করে চালু করুন / সংযোগ পরীক্ষা** চাপুন। নতুন কোনো Secret বা Cloudflare variable লাগবে না।
3. বটে **Admin Panel → Payment & SMS Status** খুলুন। Last contact, Last heartbeat, app version, forwarding, SMS permission, pending queue, battery restriction এবং শেষ company SMS capture-এর ফল দেখুন।
4. Android অনুমতি দিলে প্রায় ১৫ মিনিট পরপর background report যায়। Android battery/Doze-এর কারণে দেরি হতে পারে। Stale heartbeat মানেই নিশ্চিত offline নয়; ফোন খুলে internet, permission এবং battery settings দেখুন।
5. Report-এ শুধু অবস্থা, সংখ্যা, সময় ও নির্দিষ্ট error code যায়। পুরো SMS/OTP/PIN/contact বা inbox-এর পুরোনো SMS পাঠানো হয় না। Forwarding বন্ধ করলে periodic job বন্ধ হয়; বন্ধ হওয়ার একটি status report পাঠানোর চেষ্টা হয়।

পুরোনো v0.7 অ্যাপের payment SMS/check চালু থাকবে, তবে নিয়মিত phone status পেতে v0.8 প্রয়োজন। Backend update না হলে নতুন health report ব্যর্থ হতে পারে; payment receipt protocol বদলায়নি। Report-এর SMS format error দেখলে SMS format ফোনেই পরীক্ষা করুন।

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

## v1.1: Nagad Cash In Received

Supports the incoming company SMS format: `Cash In Received.`, `Amount: Tk …`, `Uddokta: 01…`, `TxnID: …`, `Balance: …`, and `DD/MM/YYYY HH:mm`. Balance may include the Tk prefix. Sender must still match the configured Nagad company sender. Only the incoming amount is used; agent number and balance are not uploaded. The app must be updated; changing only the bot worker cannot update the phone parser. Existing bKash and Nagad Money Received templates are retained. Rocket remains manual. Older inbox messages are not read automatically.

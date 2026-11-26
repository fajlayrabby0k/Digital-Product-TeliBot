# Admin payment dashboard

Open **Admin Panel → Payment Dashboard**. The landing page contains **Pending Payments**, **Completed Payments**, and Back to Admin Panel.

- **Pending Payments:** only unresolved invoices with a nonblank submitted TrxID in the payment, SMS invoice or verification event. Payment instructions without an ID are excluded. Each red payment button has Delete beside it.
- **Completed Payments:** only confirmed incoming payments: completed invoices and orders with payment recorded but delivery pending/processing. Delivery state remains available in payment details. Unpaid, rejected, cancelled and refunded invoices are excluded. Completed rows have no Delete button.

Lists contain ten records per page with Previous/Next when needed, Refresh and Back to Payment Dashboard. IDs Submitted, Cancelled and Paid / Delivery Pending remain hidden as separate dashboard filters. Verification reasons appear directly inside Pending Payments; no separate Verification Issues button is shown on the main dashboard. Pending and issue lists show the saved reason below each TrxID, and Payment Details retains complete SMS evidence, timestamps and attempt history. Historical callback links remain compatible. Wallet-funded purchases remain excluded. Successful redeem-code/link wallet credits are included in Completed Payments as Redeem Credit, with customer, amount, date and a redeem reference. Redeem credits never appear in Pending and have no Delete action. Times use Asia/Dhaka.

Open a record to see the customer, method, USD/BDT amount, transaction ID, current status, verification reason and SMS evidence. **View Customer** opens the user's profile and its separate **Add Balance** feature. Refresh reloads information without verification, credit or delivery.

## Delete pending only

Each pending payment row has a red payment-details button and a **Delete** button beside it. Paid/completed/cancelled rows have no list delete button. Pending payment details also show **Delete Pending**. There is no manual payment approval. Deletion requires a five-minute single-use confirmation bound to the invoice, submitted ID, amount and admin. It changes the pending invoice to cancelled and closes its SMS invoice, removing it from Pending. The audit record remains; no wallet credit, refund or product delivery is made. Consumed confirmations, changed details and payments reserved by automatic claims cannot be deleted. Returning to details cancels the confirmation. Successful deletion edits the original confirmation message into the refreshed Pending list, removes the old confirmation button and includes View Customer / Add Balance. Replaying an already successful delete or clicking an old delete link for a cancelled request simply shows the refreshed list. There is no invoice-age limit: historical pending requests, including old blank-ID instructions reached through existing links, can be deleted. Legacy NULL/zero amounts are handled without requiring payment approval. Paid/reserved invoices retain their financial guards.

After independently checking the received payment, delete the pending request first, then open **View Customer / Add Balance** and credit the desired amount. The wallet addition is a separate admin adjustment. It does not automatically complete or fulfill the deleted order. This prevents the original pending invoice from automatically settling after the manual wallet adjustment.

Old Approve Payment, Approve Order and Approve Deposit callbacks, stale approval confirmations and legacy deposit-amount input states cannot approve or credit payments. Old rejection callbacks open the new delete confirmation. Historical approval records and claim guards are retained to protect transactions processed before manual approval was removed. Automatic payment verification remains enabled according to existing method settings.

`payment_verification_events` retains submitted IDs and results; `admin_payment_reviews` retains cancellation audit details. Missing SMS is not proof of failed payment. Older attempts without records are not reconstructed. No new API credentials, APK, Cloudflare bindings or Cron configuration are required.

Tests: `node tests/admin-payment-review.cjs` checks delete-only UI, disabled legacy/stale approvals, authorization, cancel/expiry/replay, automatic-claim exclusion, unchanged wallet/delivery and separate Add Balance. Existing mobile, Binance and BEP20 tests cover automatic verification.

## Immediate pending-payment admin alerts

After a customer submits a valid-looking transaction ID and verification fails or remains pending, the bot immediately attempts a private message to the configured administrator. It includes order/deposit, customer ID, method, saved USD/BDT amount, submitted TrxID, a controlled verification explanation, and Payment Details / View Customer buttons. It does not approve, cancel, credit or deliver anything. Existing manual-method submission notices remain in place.

The alert is keyed by invoice type/ID, normalized submitted ID and failure reason. Concurrent/repeated attempts with the same information send once; a changed ID/reason may send a new alert. Success, closed invoices, admin review outcomes and blank IDs do not alert. Failed Telegram sends remain unsent and retry on another recorded verification attempt; there is no claim of guaranteed delivery during a Telegram outage. A short database lease guards concurrent sends. In webhook processing the notification runs in the execution context so user-facing responses do not wait on Telegram delivery.

Run `node tests/pending-payment-alerts.cjs` for notification content, links, concurrency/deduplication, retry after Telegram rejection, method coverage and unchanged financial state.

Each payment entry in Pending and Completed shows the customer name and Telegram user ID directly in the list. Names are loaded with a single left join, safely escaped and shortened to keep lists readable. Username is used when a first name is unavailable; missing user records retain the payment and its saved user ID. Redeem credits use the same customer display.

Telegram IDs in payment lists, payment details and pending-payment admin alerts are clickable profile links. A valid stored @username uses https://t.me/username; otherwise the link uses tg://user?id=ID. Payment details also include **Message User** beside View Customer. This opens Telegram for the admin; the bot does not send a private message on the admin's behalf. Opening or messaging remains subject to Telegram client behavior and user privacy restrictions.

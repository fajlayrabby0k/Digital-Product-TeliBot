# Admin payment dashboard

Open **Admin Panel → Payment Dashboard → IDs Submitted** to see pending order/deposit payments with their submitted TrxIDs, including failed automatic verification. Wallet-funded orders and redeem credits are excluded. Lists contain ten records per page; filters include Pending, IDs Submitted, Verification Issues, Completed, Paid / Delivery Pending and Cancelled. Times use Asia/Dhaka.

Open a record to see the customer, method, USD/BDT amount, transaction ID, current status, verification reason and SMS evidence. **View Customer** opens the user's profile and its separate **Add Balance** feature. Refresh reloads information without verification, credit or delivery.

## Delete pending only

Pending payment details show **Delete Pending**. There is no manual payment approval. Deletion requires a five-minute single-use confirmation bound to the invoice, submitted ID, amount and admin. It changes the pending invoice to cancelled and closes its SMS invoice, removing it from Pending. The audit record remains; no wallet credit, refund or product delivery is made. Consumed confirmations, changed details and payments reserved by automatic claims cannot be deleted. Returning to details cancels the confirmation.

After independently checking the received payment, delete the pending request first, then open **View Customer / Add Balance** and credit the desired amount. The wallet addition is a separate admin adjustment. It does not automatically complete or fulfill the deleted order. This prevents the original pending invoice from automatically settling after the manual wallet adjustment.

Old Approve Payment, Approve Order and Approve Deposit callbacks, stale approval confirmations and legacy deposit-amount input states cannot approve or credit payments. Old rejection callbacks open the new delete confirmation. Historical approval records and claim guards are retained to protect transactions processed before manual approval was removed. Automatic payment verification remains enabled according to existing method settings.

`payment_verification_events` retains submitted IDs and results; `admin_payment_reviews` retains cancellation audit details. Missing SMS is not proof of failed payment. Older attempts without records are not reconstructed. No new API credentials, APK, Cloudflare bindings or Cron configuration are required.

Tests: `node tests/admin-payment-review.cjs` checks delete-only UI, disabled legacy/stale approvals, authorization, cancel/expiry/replay, automatic-claim exclusion, unchanged wallet/delivery and separate Add Balance. Existing mobile, Binance and BEP20 tests cover automatic verification.

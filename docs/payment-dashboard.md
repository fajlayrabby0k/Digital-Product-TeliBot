# Admin payment dashboard

Open **Admin Panel → Payment Dashboard** after deployment. This is an admin-only view of direct order payments and wallet deposits. Wallet-funded orders and redeem credits are excluded because they are not incoming payment instructions.

- **Pending:** unpaid/unresolved invoices, including instructions where the customer has not yet sent a transaction ID.
- **IDs Submitted:** pending invoices with an ID in the invoice, receiving-phone invoice or new verification log.
- **Verification Issues:** pending invoices with a saved non-success verification result. Waiting for SMS/confirmations is an issue requiring attention, not proof of a failed transfer.
- **Completed:** completed invoices.
- **Cancelled:** deleted/cancelled pending requests retained for audit.
- **Paid / Delivery Pending:** order records with payment recorded but delivery not completed.

Lists have ten entries per page. Open a record to see its method, USD/BDT amount, customer, invoice status, submitted transaction ID, last verification reason, recorded attempt count and last attempt time in Asia/Dhaka. View Customer opens the existing customer management profile. Refresh only reloads information; it does not retry payment verification, debit a wallet, approve an invoice or deliver a product.

The new `payment_verification_events` table retains the latest submission result per invoice, separately keyed by order/deposit type and ID. Binance Pay and BEP20 submissions record success/rejection codes; mobile-wallet submissions record SMS verification outcomes, invalid ID formats and expired submission windows. Codes are displayed using controlled descriptions; raw provider error bodies, credentials and SMS bodies are not stored. Logging errors do not prevent the existing payment flow.

Existing payment records are preserved. Past attempts that predate this feature have no invented failure reason. The invoice's current completed/delivery status takes precedence over an old failure result, including payments settled later by receiving-phone SMS. Unsubmitted instructions are not counted as money received. Attempt counts represent recorded submissions, not every background operation or historical retry.

No new API credentials, Android setup, Cloudflare bindings or Cron Trigger are required. After the GitHub deployment succeeds, normal bot startup creates the table.

Run `node tests/payment-dashboard.cjs` for SQLite-backed checks of filters, pagination, invoice-type separation, current-status precedence, mobile/legacy IDs, admin authorization and unchanged wallet balances. Existing Binance, BEP20 and mobile payment tests exercise the integrated payment flows.

## Review pending payments

The pending list shows each submitted TrxID even when automatic verification failed. Open a payment for **Approve Payment** and **Delete Pending**. Each action has a five-minute single-use confirmation showing the customer, method, amount and submitted ID. Returning to details cancels the confirmation. Approval requires an existing positive invoice amount and submitted alphanumeric transaction ID; the admin must check actual receipt of funds. It is a manual override, not proof of automatic verification.

Approval credits the exact saved deposit amount once, or marks an order paid and starts its normal local/API document-delivery workflow. Stock/provider problems remain visible in Delivery Management. No second wallet debit is made for a direct-payment order. Deleting sets the unpaid invoice to cancelled and closes the SMS invoice. It removes the request from Pending and does not erase audit records, refund a transfer or permit cancellation of payments already claimed by automatic verification.

`admin_payment_reviews` records who approved/cancelled, method, amount, submitted ID and time. Database uniqueness, atomic state transitions and automatic-claim insert guards prevent transaction reuse and duplicate manual/automatic credits. Changed IDs/amounts, consumed confirmations and existing claims require review rather than approval. A failed credit rolls back the review and remains retryable. Approved transaction IDs are reserved case-insensitively by method across deposits/orders. Cancelled IDs are not reserved against a separate invoice.

Run `node tests/admin-payment-review.cjs` for approval/cancellation, exact-once credit/document delivery, admin authorization, expired/cancelled/stale confirmations, transaction reuse, automatic-claim exclusion and credit rollback tests. The Android parser-to-worker payment integration also remains passing.

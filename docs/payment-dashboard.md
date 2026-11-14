# Admin payment dashboard

Open **Admin Panel → Payment Dashboard** after deployment. This is an admin-only, read-only view of direct order payments and wallet deposits. Wallet-funded orders and redeem credits are excluded because they are not incoming payment instructions.

- **Pending:** unpaid/unresolved invoices, including instructions where the customer has not yet sent a transaction ID.
- **IDs Submitted:** pending invoices with an ID in the invoice, receiving-phone invoice or new verification log.
- **Verification Issues:** pending invoices with a saved non-success verification result. Waiting for SMS/confirmations is an issue requiring attention, not proof of a failed transfer.
- **Completed:** completed invoices.
- **Paid / Delivery Pending:** order records with payment recorded but delivery not completed.

Lists have ten entries per page. Open a record to see its method, USD/BDT amount, customer, invoice status, submitted transaction ID, last verification reason, recorded attempt count and last attempt time in Asia/Dhaka. View Customer opens the existing customer management profile. Refresh only reloads information; it does not retry payment verification, debit a wallet, approve an invoice or deliver a product.

The new `payment_verification_events` table retains the latest submission result per invoice, separately keyed by order/deposit type and ID. Binance Pay and BEP20 submissions record success/rejection codes; mobile-wallet submissions record SMS verification outcomes, invalid ID formats and expired submission windows. Codes are displayed using controlled descriptions; raw provider error bodies, credentials and SMS bodies are not stored. Logging errors do not prevent the existing payment flow.

Existing payment records are preserved. Past attempts that predate this feature have no invented failure reason. The invoice's current completed/delivery status takes precedence over an old failure result, including payments settled later by receiving-phone SMS. Unsubmitted instructions are not counted as money received. Attempt counts represent recorded submissions, not every background operation or historical retry.

No new API credentials, Android setup, Cloudflare bindings or Cron Trigger are required. After the GitHub deployment succeeds, normal bot startup creates the table.

Run `node tests/payment-dashboard.cjs` for SQLite-backed checks of filters, pagination, invoice-type separation, current-status precedence, mobile/legacy IDs, admin authorization and unchanged wallet balances. Existing Binance, BEP20 and mobile payment tests exercise the integrated payment flows.

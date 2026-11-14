# Admin delivery management

Open **Admin Panel → Delivery Management**. Pending Delivery, Processing and Completed lists contain ten orders per page. The order detail shows the customer, product, quantity, amount, current status, supplier order/request IDs and sanitized last provider error. View Customer opens the customer profile. Payment Dashboard order details also link here. Pending-delivery admin notifications include a Delivery Details shortcut.

**Check Delivery** is available for `paid_pending_delivery` orders:

- API orders use the existing persisted supplier request and existing idempotent recovery path. The supplier order is looked up first; a new POST is permitted only on the documented missing-order response and reuses the same idempotency key. The customer's wallet is never debited by this action. A known terminal rejection may refund a wallet purchase through the existing once-only refund rules.
- Local orders reuse previously allocated inventory and allocate only the missing quantity. Add stock before retrying if necessary. Successful recovery sends delivery to the order owner, not the admin.
- Orders without a supplier request ID, unpaid/closed orders and missing products cannot be automatically restarted. `delivering` orders remain visible in Processing for reconciliation; the dashboard does not reset in-flight delivery, invent a supplier request, approve payment or issue a manual refund.

Retries use the existing atomic status claims and 30-second cooldown (or a longer supplier cooldown). Repeated clicks do not create an additional customer charge. Refresh only reads the current order.

For completed orders, **Send Saved Delivery to Customer** sends the already saved API codes or allocated local inventory to the original customer. It does not purchase, allocate stock, credit a referral or change order status. Long delivery text is escaped and split into Telegram-sized messages. Resending has a 30-second cooldown. A failed Telegram send is reported to the admin; saved delivery data remains unchanged. This button is useful when the original message was missed, but does not prove the customer read a message.

Only the configured admin can use these controls. No new credentials, bindings or schema migration are needed for this feature. Existing user-facing Check Delivery remains available for supported pending API orders.

`node tests/delivery-management.cjs` checks SQLite-backed API lookup/recovery without another POST or debit, local partial-stock fulfillment, legacy/processing/unpaid guards, cooldown, pagination, saved content resend/chunking, access control and secret redaction. The provider and payment suites cover existing purchase and settlement rules. Tests use simulated provider responses; they do not validate the live supplier network.

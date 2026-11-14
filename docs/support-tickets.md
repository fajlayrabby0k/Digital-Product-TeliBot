# Order support tickets

Customers open **Your Orders → Get Help · Order #…**, then send one text message (1–500 characters). Completed, paid-pending-delivery, processing and refunded orders support tickets. The order must belong to the customer. One active ticket is allowed per customer/order; opening it again shows the existing conversation.

**Support → My Support Tickets** and the order-history ticket button show the customer's tickets. Customers can read messages and reply to active tickets. The newest message appears first; Older/Newer Message navigates the complete conversation. Closed tickets remain readable, and a new follow-up ticket can be created for the order.

Admins use **Admin Panel → Support Tickets** to browse Active/Closed tickets (ten per page), see the associated order status/product/amount/customer, reply and close the ticket. View Customer opens customer management, and Order Details opens delivery management. A customer message makes the ticket open; an admin reply marks it answered. Only the configured admin can close tickets.

New messages notify the other party with an Open Ticket button. Closing notifies the customer. Messages are stored before notification; if Telegram does not confirm a message, the sender is told that the saved ticket is still available. Notifications contain support text and an order reference, not product credentials. This feature accepts text, not attachments; users should never send PINs, OTPs or passwords.

Schema initialization adds `support_tickets`, `support_ticket_messages`, a unique active-ticket-per-order index and list/thread indexes. Submission tokens guard against repeated message insertion. Ownership, closed status and the active input session are checked again when saving. Closing a ticket does not refund, debit, approve payment or redeliver an order. Existing order and balance records remain unchanged. No extra credentials, Android setup or Cloudflare binding is required.

After deployment, `/start` runs normal schema setup. Run `node tests/support-tickets.cjs` for SQLite-backed coverage of creation, replies, closure, history, duplicate/cancel/close guards, access control, escaping, pagination and unchanged finances.

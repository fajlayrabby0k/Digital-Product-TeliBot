# Customer profile

Home includes **My Profile** and **Followed Products**. Browse Shop remains the first full-width row; Support stays below Wallet / Deposit; Admin Panel stays last for the configured admin.

My Profile shows the current customer's name, username, Telegram ID, membership date, USD wallet balance and BDT equivalent at the current rate. It counts all placed orders, completed orders, paid orders awaiting delivery and refunded orders separately. Spending totals sum the stored amounts of completed orders in cents; pending/refunded orders are excluded. These are order counts, not quantities of items.

Successful deposit count and total include only deposits marked completed. Pending requests do not count as received funds. Referral bonuses and manual balance changes are not presented as deposits; Balance History keeps those separately.

The profile previews up to three followed product names and the total count. Followed Products opens the paginated complete list. Notification Settings offers All Products, Followed Only and Off. New accounts default to All Products. Following while All Products is ON preserves that choice; following while alerts are OFF keeps them OFF until the user changes Notification Settings. Order History, Balance History, Deposit, referrals, guide and support remain available.

Aggregate queries use the current chat ID, and product/name text is escaped before rendering. Viewing a profile does not change funds or buy products. `node tests/profile-summary.cjs` checks per-user isolation, order statuses versus quantities, completed-only deposits/spending, cent totals, empty profiles, HTML escaping and home navigation.

My Orders lists all paid/completed/refunded order history in pages of five with Previous/Next. Page requests are scoped to the current chat and clamped to the available range. Old order IDs, downloads and support remain accessible. The stored product-name snapshot takes precedence over later catalog name changes, and a missing catalog product does not hide its historical order.

## Referral earnings

Home and My Profile show **Referral Commission Earned** immediately below the main wallet amount. Refer & Earn shows the same total. Referral commission continues to credit the main spendable wallet; the displayed earnings total is not a second balance. It sums positive USD cent entries with reason `referral` in the customer's wallet history. Purchases, deposits, refunds, redeem credits and other customers' earnings are excluded, and spending does not reduce total earned. Historical commission before wallet-history tracking cannot be reconstructed from an opening balance and is not guessed.

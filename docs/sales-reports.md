# Sales and profit reports

Open **Admin Panel → Sales & Profit Reports** after deployment. Choose Today, This Month or All Time; Refresh reloads the selected period. Only the configured admin can access reports.

Periods use Asia/Dhaka (UTC+6), measured by order creation date through the current time. Only completed orders count as sales. Pending, delivering, paid-pending-delivery, cancelled and refunded orders are excluded. Deposits and redeem wallet credits are not sales.

The report shows completed order count, item quantity, total sales and API/local sales. New orders snapshot the product origin and API unit cost with an SQLite insertion trigger, within the order insertion transaction. Subsequent product price changes do not alter that snapshot. A repeated schema migration preserves existing snapshots.

API gross profit is an estimate: completed order revenue minus recorded API unit cost multiplied by quantity. The recorded cost is the provider catalog price when the order was created, not a confirmed debit from the provider wallet. Fees, referral commissions and other operating expenses are not deducted. This is not net profit.

Old orders without saved origin/cost information are counted in total sales but excluded from profit. Their count is displayed. Current product costs are not used to invent historical costs. Local product revenue is displayed separately; local costs and profit are not recorded by this feature.

No new API credentials or Cloudflare bindings are needed. The initializer adds nullable `orders.sale_origin` and `orders.provider_unit_cost_usd` fields and a trigger. Existing orders, wallet balances, payment claims and delivery data are preserved.

Run `node tests/sales-reports.cjs` for SQLite-backed coverage of Dhaka period boundaries, snapshots, quantities, unknown costs, completed-only revenue, excluded deposits/refunds, admin authorization and repeated migration.

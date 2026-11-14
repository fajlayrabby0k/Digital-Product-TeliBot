# Sales and profit reports

Open **Admin Panel → Sales & Profit Reports** after deployment. Choose Today, Last 7 Days, Last 30 Days, This Month or All Time; Refresh reloads the selected period. Only the configured admin can access reports.

Periods use Asia/Dhaka (UTC+6). Last 7/30 Days includes today and the previous 6/29 calendar days, from local midnight through now; it is distinct from This Month. Reports are measured by order creation date through the current time. Only completed orders count as sales. Pending, delivering, paid-pending-delivery, cancelled and refunded orders are excluded. Deposits and redeem wallet credits are not sales.

The report shows completed order count, item quantity, total sales and API/local sales. New orders snapshot the product origin and API unit cost with an SQLite insertion trigger, within the order insertion transaction. Subsequent product price changes do not alter that snapshot. A repeated schema migration preserves existing snapshots.

API gross profit is an estimate: completed order revenue minus recorded API unit cost multiplied by quantity. The recorded cost is the provider catalog price when the order was created, not a confirmed debit from the provider wallet. Fees, referral commissions and other operating expenses are not deducted. This is not net profit.

Old orders without saved origin/cost information are counted in total sales but excluded from profit. Their count is displayed. Current product costs are not used to invent historical costs. Local product revenue, purchase cost and gross profit are displayed separately, with combined API/local gross profit. Local profit uses the purchase cost saved on the order; missing historical costs are excluded rather than assumed to be zero.

No new API credentials or Cloudflare bindings are needed. The initializer adds nullable `orders.sale_origin`, `orders.provider_unit_cost_usd`, `orders.purchase_unit_cost_usd` and `products.purchase_cost_usd` fields and insertion triggers. Existing orders, wallet balances, payment claims and delivery data are preserved.

Run `node tests/sales-reports.cjs` for SQLite-backed coverage of Dhaka period boundaries, snapshots, quantities, unknown costs, completed-only revenue, excluded deposits/refunds, admin authorization and repeated migration.

API profit uses saved selling totals and saved costs for each order, so both percentage and fixed-dollar markup rules are reflected without applying today’s margin to past sales. Order cost and profit are summed in cents to avoid floating-point artifacts at display precision.


## Local purchase and selling prices

**Admin Panel → Add New Product** asks for icon, name, description, purchase cost per item in USD and selling price per item in USD. Example: purchase $4, sale $5 gives $1 gross profit and 25% markup on cost. This markup is distinct from gross profit as a percentage of revenue (20% in this example).

Existing products: **Manage Products → product → Set Purchase Cost**. Selling price remains editable through Set Custom Price. Local percentage shortcut buttons use purchase cost when available. Purchase cost can be zero; selling price must be positive. Loss-making prices are accepted and show negative gross profit. Cost information is visible to the admin, not customer product details.

New local orders copy purchase cost at insertion within the order transaction. Quantity multiplies the saved unit cost. Changing the product cost or sale price affects future orders, not old ones. Existing orders without a cost snapshot are not backfilled from today's price. Free inventory has an explicitly entered zero cost, distinct from an unknown cost.

These figures are gross profit based on entered costs; fees, referral commissions and overheads remain outside the calculation. API profit still relies on the recorded catalog cost rather than a confirmed supplier debit.

`node tests/local-product-costs.cjs` covers the creation wizard, edits, historical snapshots, quantity totals, zero costs, losses, Bengali inputs, invalid inputs, access checks and cancellation. No extra configuration is needed.

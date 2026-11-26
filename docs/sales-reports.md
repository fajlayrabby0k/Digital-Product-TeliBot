# Sales and profit reports

Open **Admin Panel → Sales & Profit Reports**. Periods: Today, Last 7 Days, Last 30 Days, This Month, All Time. Asia/Dhaka boundaries and order creation dates are used. Only delivered (`completed`) orders count as sales/profit. Pending, processing, cancelled, refunded and wallet-credited/unfulfilled original orders are excluded.

## Customer wallets are separate

Current Wallet Funds is a current liability/informational balance across all users, including admin. It never enters revenue, cost or profit calculations. Deposits, redeem credits and administrator balance additions are not sales. Adding money to a wallet cannot increase sales or profit.

## Per-order accounting

New orders preserve origin, selling total, quantity, API provider unit cost or local purchase unit cost, referrer and commission percentage/amount. Cost and referral fields are captured in database insertion triggers. Product price/cost edits and later referral-rate changes cannot rewrite existing snapshots.

- Gross profit = saved selling total − saved unit purchase cost × quantity.
- Referral commission expense = saved per-order commission cents, for delivered orders only.
- Net profit = gross profit − referral commission expense.

Amounts are totaled as integer USD cents with per-order cost rounding. Negative profits are retained. API cost uses the saved catalog purchase price at checkout/order creation, not a guessed later catalog value. No additional operating costs are assumed.

The summary separates API/local sales and gross profits, total commission expense, actually credited commission, awaiting commission credit and net profit. Commission expense is deducted even if its wallet credit awaits retry, because it remains owed. Current wallet totals are displayed separately and never added to profit. **Order Breakdown** lists each delivered order's quantity, sale total, cost, referral expense and net result; an order button opens the existing order details.

## Referral credits

`order_referral_credits` is unique per order. The referral credit and its ledger entry are atomic; fresh tokens and database uniqueness prevent repeated/concurrent credit. Every production delivery path supplies the order ID. Wallet History references `order:ID`, making commission attributable to its originating order. Failed credits roll back and are retried in bounded batches after webhook activity or scheduled sync. Report rendering itself never credits wallets or mutates orders.

Historical commissions without an order reference are not guessed or re-linked. Existing orders without referral snapshots or cost records are explicitly excluded from net profit. Sales are still reported; gross profit excludes missing-cost orders. When records are incomplete, the report shows the included gross/referral subtotal and excluded count so the displayed net does not imply full historical coverage. Existing funds/history are not reset or retroactively credited.

## Validation

`tests/exact-sales-profit.cjs` verifies local/API quantity costs, immutable price/rate snapshots, completed-only figures, zero profit from deposits/wallet additions, commission concurrency/reuse/rollback/recovery, negative profits, breakdown and unknown historical records. `tests/sales-reports.cjs` covers period boundaries and historical costs; `tests/referral-earnings.cjs` covers actual main-wallet credits and lifetime earned display. All worker tests and Android parser-to-payment integration passed before release.

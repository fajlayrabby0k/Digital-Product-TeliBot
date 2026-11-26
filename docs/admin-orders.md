# Admin order list and search

Open **Admin Panel → Orders** (older Find Order buttons open the same list). All local order records, across all customers, products, payment methods and statuses, appear newest first. Ten orders are shown per page with Previous/Next. Orders are represented only by buttons below a compact title/count/page header; no per-order text summaries appear above them. Buttons show Order ID and status, never product names or catalog callbacks. Product information appears only after opening an order. Inactive/unavailable catalog products do not hide historical orders.

Open a row for order details. Refresh and Back preserve the list page. The existing delivery-management view keeps its own Delivery List navigation. Browsing does not charge, allocate stock or retry delivery.

**Find Order** inside the list accepts the public five-digit Order ID; legacy #number references remain accepted. A matching order opens directly, with a return link to the page where search started. Invalid/no-match IDs retain the search input; Back cancels search and returns to Orders. Empty lists still provide search. Only the configured admin can browse/search.

Validation: tests/admin-all-orders.cjs covers all customer/status records, newest-first ordering, pagination/empty/clamped pages, search, back navigation, authorization and unchanged funds/order records. Existing wallet-history and delivery-management tests remain passing.

Order details show the customer name and clickable Telegram ID, saved source (Supplier API or local inventory), product snapshot, quantity, unit/total USD price and saved BDT amount, payment method, TrxID, current status, Dhaka creation time, supplier order/request identifiers and delivery issue/status. Missing historical source is identified rather than invented; current-product fallback is labeled. View Customer and Message User shortcuts are available inside. Wallet-credited original orders explicitly state that no delivery will occur.

## Completed and pending lists

The Orders landing page now offers **Completed Orders** and **Pending Orders** with counts, plus Find Order and Admin Panel. Completed contains only delivered orders (`completed`). Pending contains unpaid, paid-awaiting-delivery and processing orders (`pending`, `paid_pending_delivery`, `delivering`). Closed/cancelled/refunded/wallet-credited records are not mislabeled pending or delivered; they remain available through global Order ID search and historical all-order callback links.

Each list uses order buttons only, ten per page. Details, Refresh, search results and Back preserve the selected list and page. Find Order checks all order records, including orders outside the currently selected list. No payment or delivery state changes are made by browsing.

## Pending reasons

Completed Orders remains delivered-only. Pending order buttons display a short reason instead of a technical status: payment pending, missing SMS, amount/method/time mismatch, payment not found/expired, stock unavailable, supplier issue, retry cooldown, or delivery processing. Opening the order shows **Why this order is pending**, the recorded verification explanation and saved supplier/delivery issue. No cause is invented when evidence is missing.

Local stock explanations count both unsold items and items already reserved for that order, so a partially allocated order is not reported as having zero usable stock. Refresh reflects restored stock and explains that delivery is still awaiting completion. API delivery is not called a stock shortage without evidence; its saved supplier issue is shown. Browsing never allocates stock, credits balances or starts delivery. tests/pending-order-reasons.cjs covers payment/SMS, insufficient/restored local stock, supplier failure, processing and completed details.

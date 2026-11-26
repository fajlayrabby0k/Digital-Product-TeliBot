# Admin order list and search

Open **Admin Panel → Orders** (older Find Order buttons open the same list). All local order records, across all customers, products, payment methods and statuses, appear newest first. Ten orders are shown per page with Previous/Next. Each entry shows only the five-digit public Order ID, amount, status and customer. Buttons show Order ID and status, never product names or catalog callbacks. Product information appears only after opening an order. Inactive/unavailable catalog products do not hide historical orders.

Open a row for order details. Refresh and Back preserve the list page. The existing delivery-management view keeps its own Delivery List navigation. Browsing does not charge, allocate stock or retry delivery.

**Find Order** inside the list accepts the public five-digit Order ID; legacy #number references remain accepted. A matching order opens directly, with a return link to the page where search started. Invalid/no-match IDs retain the search input; Back cancels search and returns to Orders. Empty lists still provide search. Only the configured admin can browse/search.

Validation: tests/admin-all-orders.cjs covers all customer/status records, newest-first ordering, pagination/empty/clamped pages, search, back navigation, authorization and unchanged funds/order records. Existing wallet-history and delivery-management tests remain passing.

Order details show the customer name and clickable Telegram ID, saved source (Supplier API or local inventory), product snapshot, quantity, unit/total USD price and saved BDT amount, payment method, TrxID, current status, Dhaka creation time, supplier order/request identifiers and delivery issue/status. Missing historical source is identified rather than invented; current-product fallback is labeled. View Customer and Message User shortcuts are available inside. Wallet-credited original orders explicitly state that no delivery will occur.

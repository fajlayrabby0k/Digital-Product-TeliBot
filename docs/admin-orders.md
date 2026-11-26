# Admin order list and search

Open **Admin Panel → Orders** (older Find Order buttons open the same list). All local order records, across all customers, products, payment methods and statuses, appear newest first. Ten orders are shown per page with Previous/Next. Each entry shows the saved product name, five-digit public Order ID, amount, status and customer. Inactive/unavailable catalog products do not hide historical orders.

Open a row for order details. Refresh and Back preserve the list page. The existing delivery-management view keeps its own Delivery List navigation. Browsing does not charge, allocate stock or retry delivery.

**Find Order** inside the list accepts the public five-digit Order ID; legacy #number references remain accepted. A matching order opens directly, with a return link to the page where search started. Invalid/no-match IDs retain the search input; Back cancels search and returns to Orders. Empty lists still provide search. Only the configured admin can browse/search.

Validation: tests/admin-all-orders.cjs covers all customer/status records, newest-first ordering, pagination/empty/clamped pages, search, back navigation, authorization and unchanged funds/order records. Existing wallet-history and delivery-management tests remain passing.

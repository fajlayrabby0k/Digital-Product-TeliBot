# Admin customer lookup

After GitHub deployment succeeds, send `/start`, open **Admin Panel → Users / Find Customer**.

- **Search Customer:** enter a Telegram User ID, @username, name or payment TrxID/TxnID/TxHash. Searches also work for historical records. `order:123` finds the customer owning Order #123; `deposit:123` finds Deposit #123. The two invoice types stay distinct.
- **All Users:** 10 customers per page, with name/ID and current USD wallet balance.
- **Recent Deposits:** customers with completed deposits, most recent credited deposit first; unpaid deposit instructions do not count as money received.
- **Recent Orders:** customers with order activity, newest order first, including pending orders for support.
- **Customer Profile:** identity, current USD wallet, total completed deposits, order count and total completed purchase value. Open Telegram Profile uses a known @handle or the exact numeric user ID; a display name is never guessed to be a Telegram username.
- **Deposit/Order History:** 10 records per page with invoice ID, method, amount, status, date and transaction ID; order history also shows the product. It does not expose delivery credentials or integration secrets.
- New admin payment/deposit/delivery notifications include **View Customer**, alongside existing approval/rejection buttons when present. Redeem credits and wallet purchases also notify admin. Normal webhook execution queues these notifications so they do not hold up the customer response.

Only the configured `ADMIN_ID` can search/list/open profiles/history. Customers cannot access another account by forging admin callbacks. This feature provides lookup and history, without balance editing, deleting, banning or messaging customers. It does not alter payment claims or wallet amounts. Telegram names/handles refresh when the account interacts with the bot.

No new credentials, Android configuration or Cloudflare bindings are needed. Migration adds optional username/first_name fields only if missing and non-unique transaction/user-history indexes; old balances, records and legacy order constraints are preserved.

`node tests/admin-users.cjs` checks real SQLite searches by identity/transaction/invoice, list/search/history pagination, profile totals, legacy user schema, HTML escaping/long receipts, authorization, notification buttons, safe identity links, cancellation and unchanged finances. Payment/provider/legacy-schema suites verify existing checkout behavior.

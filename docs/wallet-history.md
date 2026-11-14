# Balance history and order lookup

Customers open **Profile → Balance History**. Admins open **Users / Find Customer → customer → Balance History**. Each page shows ten entries with the change reason, reference, USD/BDT changes, USD before/after balances and Asia/Dhaka time. Customers can only view their own history; only the configured admin can view another customer's history.

The initial migration records each existing wallet as an **Opening balance**, with zero change. It does not invent old deposits or reconstruct history from current invoices. New accounts also receive an opening entry. Repeated migrations preserve one opening entry per user.

SQLite balance-update triggers record actual USD/BDT changes in `wallet_history` in the same transaction as the update. If that transaction rolls back, the history rolls back too. No-op updates and retries that make no balance change create no entry. Values are stored in integer cents/minor units. The ledger does not recalculate or replace the current wallet balance.

Existing payment paths attach reasons: deposit credit (Binance/BEP20/mobile), wallet purchase, provider rejection refund, redeem credit and referral commission. API wallet purchases and refunds reference their order ID. Local wallet purchases reference the product; deposits reference the deposit ID; referral entries reference the buyer. Unclassified direct balance updates are recorded as Other balance change. Metadata is cleared after recording (including no-op updates) so later changes cannot inherit a stale reason. Direct payments that never touch the wallet are not wallet entries.

No credentials or Cloudflare bindings are needed. The initializer adds history storage, optional context columns on users and transactional triggers. It preserves existing balances and batches initialization work to avoid adding unnecessary startup round trips.

## Find an order

Every order already has this store's unique numeric order ID. **Admin Panel → Find Order** accepts `123`, `#123` or `order:123`. It opens the order's product, user, amount, payment method, transaction ID, status and delivery information. This is the local order ID, not the provider order ID or payment transaction ID. Pending and closed orders are searchable too. Missing IDs keep the search open for correction; `/cancel` exits. Searching never charges or delivers an order.

`node tests/wallet-history.cjs` covers opening history, before/after amounts, reasons, precision, no-op handling, rollback, unknown changes, pagination, access and order lookup. Provider checkout tests verify one purchase/refund entry per corresponding order; BEP20 flow tests verify a single credit entry despite repeated submission. The full payment and runtime suites cover existing behavior and migration speed.

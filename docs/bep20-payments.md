# BEP20 USDT verification

## Current setup

Deploy the Pages bot with its existing D1 `DB` binding. The schema initializer adds `bep20_payment_claims`. In `/admin` → Payment Settings → Change BEP20 Address, enter the public receive address for **USDT on BNB Smart Chain (chain ID 56)**. Never enter a private key or seed phrase. Binance Pay API credentials are not used for blockchain payments.

The deposit flow is: select BEP20, choose a preset ($5, $10, $15, $20, $30, $50) or Custom Amount, copy the receive address, pay, tap **Enter TxHash**, and send the hash as the next chat message. Direct checkout uses the same Copy Wallet Address and Enter TxHash buttons. Reply submissions from older instructions also use the same verification path. Cancel/Back clears entry state without deleting payment records.

The receive address is saved on each invoice. Changing the admin address later does not change already displayed invoices. The initializer adds nullable `bep20_wallet` fields to orders/deposits for this snapshot.

No additional Worker, Cron Trigger, Binance API credential or scheduler secret is needed. Blockchain requests are made only when a user submits a TxHash. There is no periodic payment watcher.

The verifier checks the successful transaction receipt, canonical block, at least 12 confirmations, supported USDT contract `0x55d398326f99059ff775485246999027b3197955` (18 decimals), recipient, transfer time after invoice creation, and the full required amount. Matching transfer logs within the same transaction are added. No underpayment tolerance is applied; cover withdrawal fees separately.

A unique database claim blocks duplicate transaction or invoice submissions across orders and deposits, including simultaneous requests. TxHashes are normalized to lowercase. Wallet credit is transactional. Product orders use the existing fulfillment path; paid orders without confirmed delivery require admin reconciliation.

Public HTTPS BSC RPC endpoints are tried with timeouts. Optionally configure `BSC_RPC_URL` for a supported BSC mainnet HTTPS provider. Preserve any provider key securely in Cloudflare configuration. Public RPC service availability, network access and a real wallet payment still need live validation. Transactions are not approved when RPC verification fails.

## Deployment and live validation

BEP20 verification uses user-submitted TxHashes. No exact-cent amount allocator or scheduled payment scanner is enabled.

1. Deploy the latest `_worker.js` to the existing Cloudflare Pages project, preserving the `DB` binding and existing bot settings.
2. In `/admin` → Payment Settings → Change BEP20 Address, enter the public USDT receive address for BNB Smart Chain. Never enter a private key or seed phrase. The address must be a valid 20-byte `0x` address.
3. Open a new small deposit/order, pay the displayed USDT amount on BEP20, then use Enter TxHash. The receiving Binance/wallet minimum deposit and sender withdrawal fee must be checked before transferring.
4. Wait for 12 confirmations and retry the same hash if it is not confirmed yet. RPC availability and real payment delivery have not been validated on the user's deployment.

Development tests cover real SQLite invoice creation and credit, the complete button/input flow, successful/failed verification, confirmations, repeat hashes, ownership, address changes, cancellation and direct inventory delivery. They use simulated RPC responses and are not evidence of live funds received.

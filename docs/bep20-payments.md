# BEP20 USDT verification

## Current setup

Deploy the Worker with its existing D1 `DB` binding. The schema initializer adds `bep20_payment_claims`. In `/admin` → Payment Settings → Change BEP20 Address, enter the public receive address for **USDT on BNB Smart Chain (chain ID 56)**. Never enter a private key or seed phrase. Binance Pay API credentials are not used for blockchain payments.

The current flow accepts a TxHash in reply to the invoice. It verifies the successful transaction receipt, canonical block, at least 12 confirmations, supported USDT contract `0x55d398326f99059ff775485246999027b3197955` (18 decimals), recipient, transfer time after invoice creation, and the full required amount. Matching transfer logs within the same transaction are added. No underpayment tolerance is applied; cover withdrawal fees separately.

A unique database claim blocks duplicate transaction or invoice submissions across orders and deposits, including simultaneous requests. TxHashes are normalized to lowercase. Wallet credit is transactional. Product orders use the existing fulfillment path; paid orders without confirmed delivery require admin reconciliation.

Public HTTPS BSC RPC endpoints are tried with timeouts. Optionally configure `BSC_RPC_URL` for a supported BSC mainnet HTTPS provider. Preserve any provider key securely in Cloudflare configuration. Public RPC service availability, network access and a real wallet payment still need live validation. Transactions are not approved when RPC verification fails.

## Automatic detection without a TxHash

This is a separate workflow and is not enabled by the receipt verifier. It requires a scheduled/indexed blockchain watcher and reliable invoice identification: either unique receive addresses per invoice, or unique exact payable amounts with collision protection. A single shared wallet receiving equal amounts cannot reliably identify the buyer's invoice. Late payments, amount reuse, block finality/reorgs and duplicate delivery must be handled before enabling unattended fulfillment.

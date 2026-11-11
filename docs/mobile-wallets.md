# Personal bKash, Nagad and Rocket

The current implementation stores Send Money receipt submissions for review. It does **not** contain a provider-backed automatic verifier for these three methods. A valid-looking TrxID is never sufficient evidence to authorize automatic credit or delivery.

Admin → Payment Settings → Change bKash/Nagad/Rocket now saves the configured receiving account. Bangladesh country prefixes, separators and Bangla digits are normalized. bKash/Nagad accept 11-digit mobile numbers; Rocket accepts 11- or 12-digit account numbers. Invalid input retains the previous number. Customers' instructions use the saved value. These are public receiving numbers, not PINs or API credentials.

Automatic verification requires a chosen transaction source before integration: an appropriate gateway/provider API, or a deliberately selected receiving-phone bridge. Obtain API documentation and store any credentials securely in Cloudflare Secrets. A bridge's authenticated upload proves which bridge sent the record, not independently that the payment provider settled money; sender names alone are not proof.

A future verifier must match incoming successful transactions against provider/method, receiving account, exact BDT amount, TrxID, invoice time and ownership, then atomically reserve the transaction and credit/fulfill once. Its API paths, signatures and response format must come from the actual source's documentation, not an invented generic protocol. No such integration or external account access was configured in this change.

`node tests/mobile-wallet-settings.cjs` checks admin-only editing, number normalization/validation, customer instructions, cancellation and pending status for unverified deposits.

# User guide and FAQ

Customers can open **Guide / FAQ** from Home, **User Guide / FAQ** from Support, or `/help` (`/guide` is an alias). Sections cover payment rules, ordering/delivery, warranty, refunds and FAQ, with Shop/Support navigation.

Payment instructions follow the implemented bot rules: wallet versus direct payment, bKash/Nagad receiving-phone verification and 60-minute submission window, manual Rocket approval, Binance Pay USDT receipt ID and ten-minute submission limit ($10 deposit cap), BEP20 USDT network/amount/TxHash and twelve confirmations, plus one-use redeem codes. The displayed BDT exchange rate comes from current settings. They never ask for PINs, OTPs or private keys.

**Admin Panel → User Guide Settings** edits delivery, warranty, refund and FAQ text. These are plain-text fields, validated for Telegram message length and escaped when displayed. Payment verification instructions are not editable here because changing a policy description must not silently change financial verification logic.

Default warranty/refund guidance refers to the product's stated terms and support review; it does not invent an unconditional warranty period or guarantee refunds. The store owner should replace it with the actual terms they offer. Editing a guide does not approve/refund orders or alter funds. Only the configured admin can edit it. Navigation/cancellation clears the edit state so later messages cannot accidentally replace policy text.

Existing settings are preserved by additive defaults. No new credentials, bindings or Android changes are required. `node tests/user-guide.cjs` verifies public guide navigation, payment limits, policy editing, escaping, cancellation, addressed commands, authorization and unchanged wallet balances.

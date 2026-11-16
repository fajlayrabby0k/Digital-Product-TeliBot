# User guide and FAQ

Customers can open **Guide / FAQ** from Home, **User Guide / FAQ** from Support, or `/help` (`/guide` is an alias). Sections cover payment rules, ordering/delivery, warranty, refunds and FAQ, with Shop/Support navigation.

Payment instructions follow the implemented bot rules: wallet versus direct payment, bKash/Nagad receiving-phone verification and 60-minute submission window, manual Rocket approval, Binance Pay USDT receipt ID and ten-minute submission limit ($10 deposit cap), BEP20 USDT network/amount/TxHash and twelve confirmations, plus one-use redeem codes. The displayed BDT exchange rate comes from current settings. They never ask for PINs, OTPs or private keys.

**Admin Panel → User Guide Settings** edits the main title, introduction, payment instructions, delivery, warranty, refund and FAQ text. These are plain-text fields, validated for Telegram message length and escaped when displayed. Payment instructions are editable descriptions; changing them does not change the actual amounts, supported networks, time windows or verification logic. The payment text can use `{rate}` for the current configured BDT rate.

Default warranty/refund guidance refers to the product's stated terms and support review; it does not invent an unconditional warranty period or guarantee refunds. The store owner should replace it with the actual terms they offer. Editing a guide does not approve/refund orders or alter funds. Only the configured admin can edit it. Navigation/cancellation clears the edit state so later messages cannot accidentally replace policy text.

Existing settings are preserved by additive defaults. No new credentials, bindings or Android changes are required. `node tests/user-guide.cjs` verifies public guide navigation, payment limits, policy editing, escaping, cancellation, addressed commands, authorization and unchanged wallet balances.

Every guide field has a Reset to Default option. The title supports up to 80 characters, other sections up to 1200 (subject to escaped Telegram text length). Custom settings persist through restarts/deployment. Only the configured admin can edit or reset a field.

# Payment method custom emojis

Deposit methods are single-column, in this order: Binance Pay, BEP20 USDT, bKash, Nagad, Rocket, Redeem Code. Their labels have no default circular or ordinary emoji.

In `/admin` → **Payment & Auto-Verify** → **Payment Custom Emojis**, choose the method. Send its Telegram custom emoji or numeric Custom Emoji ID. The bot validates the ID using Telegram before saving it. Photos and ordinary Unicode emoji are not accepted for these method logos. Send `/remove` to clear the custom icon, or use Cancel.

Saved IDs live in D1 settings and apply to Deposit, direct checkout, top-up selection and the BEP20 alternative shown above Binance's deposit limit. Unset methods show names only. If Telegram rejects a custom icon because of bot eligibility or other emoji restrictions, the message retries once without custom icons, retaining the same labels/actions. The admin menu remains usable for removal.

No new credentials or services are required. Existing product icon settings are separate. Rendering actual custom emojis still depends on Telegram permissions and client support; live icon rendering has not been verified in the development environment.

`node tests/payment-icons.cjs` checks order/layout, all six methods, numeric/entity input, validation/removal, authorization, reuse across payment screens and plain-label fallback. Payment behavior is unchanged.

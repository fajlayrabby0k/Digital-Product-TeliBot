# API product profit margins

New installations use a default **20% markup on provider cost**. Existing configured defaults and fixed selling prices are preserved.

## Set the default

Open **Admin Panel → Custom Prices**. Below the product list, the current default margin is displayed:

- **Default: … · Change %**: enter `20` for a 20% profit on provider cost.
- **Default: Fixed +USD**: enter `0.50` to add $0.50 to provider cost.

The default applies to API products that have no individual override. Changing it immediately recalculates those products using their stored provider costs. Settings and recalculated prices are saved in one database batch.

## Apply one rule to all API products

Below the list, choose **All Products: %** or **All Products: Fixed +USD**, then enter the value. The prompt explains that this replaces existing individual overrides. The new rule becomes the default for current and newly imported API products. Override removal, default settings and recalculated prices are saved atomically. Local products are unaffected.

To keep individual rules, use the **Default** buttons instead.

## Set one product

Open **Admin Panel → Custom Prices → product** (the product list has ten items per page):

- **Custom Percentage %**: enter a percentage, such as `25` or `12.50`.
- **Fixed Profit +USD**: enter a dollar profit, such as `0.50`.
- **Use Default**: remove the individual override and use the current default.
- **Fixed Selling Price (USD)**: optionally set a constant final price instead of a profit rule.

For a provider cost of $5, 20% gives a selling price of $6; a fixed profit of $0.50 gives $5.50. Percentages here mean markup on cost. Zero profit is allowed. Inputs accept Bengali digits and up to two decimal places.

Percentage and fixed-profit rules follow provider cost changes during API sync and checkout refresh. Fixed selling prices stay constant. Rules persist across syncs and restarts. Existing fixed selling prices remain active until the admin chooses another rule or **Use Default**.

USD selling prices round to cents. BDT prices use the configured USD-to-BDT rate. Previously created orders retain their recorded totals. Only the configured admin can edit margins.

## Verification

Run `node tests/product-margins.cjs`. It checks default and individual pricing, provider cost changes, legacy overrides, reset, persistence, global repricing of more than 100 products, input validation, pagination and admin access controls against SQLite with mocked provider responses.

# Category-first shop

**Shop** and `/shop` now show categories first. Choosing a category opens only its active products, ten per page. Category selection itself also paginates when needed. Product buttons retain their icons, prices and stock styles. Back to Shop from a product returns to that product's category and page; Categories returns to the category selector.

## Admin setup

- **Admin Panel → Categories → Create New Category** creates a category.
- **Manage Products → product → Set Category** assigns any local or API product to a category. Create Category on this screen also assigns the new category to that product.
- After adding a local product, **Set Category** is available on its success screen. Until assigned, the product appears directly below the category buttons in Shop.
- **No Category** explicitly keeps a product without a category; it appears below the category buttons.
- **Use API Category / Default** removes the admin override. API products then use their latest recorded provider category; local products appear below the category buttons.

API sync imports a label from `category_name`, a string `category`, or `category.name`. A provider category ID without a readable name does not invent a label. Products without provider metadata appear directly below the category buttons. Admin overrides are stored separately and survive supplier price, stock and category updates. Provider metadata is still recorded while an override is active, so resetting to the API/default takes effect immediately. Existing products, margins, orders and balances are preserved.

All non-deleted categories are shown to customers, including empty categories with (0). There is no built-in অন্যান্য category button. Admins can select empty categories for product assignment. Admin create/assign/reset controls require the configured `ADMIN_ID`; customers cannot change categories by forging callbacks. No API key, Android update, Cron Trigger or extra Cloudflare binding is needed.

The additive migration creates `product_categories`, adds nullable product category/provider-category fields and an admin-override flag, plus a shop index. No existing products are deleted or assigned by guessing their names.

`node tests/shop-categories.cjs` verifies provider metadata/defaults, manual overrides across sync and restart, reset, creation/assignment, isolated listings, category pagination and access control. `node tests/shop-pagination.cjs` covers ten-product pages, return navigation, refresh and stock styles. The full suite also checks unchanged checkout, payment, pricing and report behavior.


## Delete a category

Open **Admin Panel → Categories → category → Delete Category**, then confirm. Products remain in the store and appear below the category buttons. Their prices, stock, orders and margins are preserved. Category removal is recorded internally so provider sync cannot recreate the deleted category automatically. Choosing Create New Category with the same name restores that category; moved products stay without a category until assigned again or reset to the API/default rule. There is no built-in miscellaneous category to manage.

The Create New Category button is at the top of the admin category list and product-category picker. Opening an admin category shows its active product count, View Products and Delete Category. Customers cannot delete categories. Deletion and product reassignment happen in one database transaction.


## Legacy foreign-key compatibility

Build `2026-11-15-category-foreign-key-fix-1` uses `products.shop_category_id` for this shop. A historical `products.category_id` may reference an older category table, so assigning a new product_categories ID there can fail with `SQLITE_CONSTRAINT_FOREIGNKEY`. The old column and all its constraints/values are left untouched.

On first upgrade, saved selections from a compatible previous category_id column are copied only if it has no conflicting foreign key and the destination category exists. Relationships to another legacy table are not guessed or remapped. Once shop_category_id exists, repeated migrations never copy old selections back over current choices. This is an additive migration; product/order/balance data is preserved.

`node tests/legacy-category-foreign-key.cjs` enables SQLite foreign keys, reproduces the failing old assignment, then verifies migration, assign/create/delete, preservation of the legacy relationship, compatible-selection upgrade and repeat initialization.


## Two-column buttons and optional icons

Customer category buttons use two columns and Telegram's primary button style. Existing names/counts are retained; no icon is assigned automatically. Native button colors/rendering depend on Telegram client support.

Set an icon from **Admin Panel → Categories → category → Set Category Icon**. Send a single ordinary emoji, a Telegram custom emoji, or its numeric Custom Emoji ID. Send `/remove` to clear it. Custom IDs remain strings and use the native `icon_custom_emoji_id` button field; ordinary emoji prefix the label. The existing Telegram fallback handles clients/API permissions that reject custom button icons. Uploaded image URLs are not button icons.

Icons persist independently of provider sync and category assignment. The migration adds a nullable `product_categories.custom_icon`; existing categories remain icon-free. Category tests cover two-column rows, ordinary/custom icons, removal and access checks.


## Products without a category

Shop shows the two-column category buttons first, followed by active products without a category as individual product buttons. These product buttons retain their prices, icons and stock styles. Unassigned products paginate ten per page with Next/Previous Products; this pagination is independent of category pagination. Refresh retains the current category and product pages. Returning from an unassigned product restores its page below the category list. Old links to category zero redirect to this Shop view. Empty named categories still display (0).

Unassigned products are separated from category buttons by a spacer row and an **Others Product** section label. Telegram inline keyboards do not support standalone text between button rows, so these are inert display rows; tapping them is acknowledged without navigation or purchase. The section is hidden when there are no unassigned products.

# Category-first shop

**Shop** and `/shop` now show categories first. Choosing a category opens only its active products, ten per page. Category selection itself also paginates when needed. Product buttons retain their icons, prices and stock styles. Back to Shop from a product returns to that product's category and page; Categories returns to the category selector.

## Admin setup

- **Admin Panel → Categories → Create New Category** creates a category.
- **Manage Products → product → Set Category** assigns any local or API product to a category. Create Category on this screen also assigns the new category to that product.
- After adding a local product, **Set Category** is available on its success screen. Until assigned, the product appears in **অন্যান্য**.
- **অন্যান্য** explicitly pins a product to the uncategorized group.
- **Use API Category / Default** removes the admin override. API products then use their latest recorded provider category; local products return to অন্যান্য.

API sync imports a label from `category_name`, a string `category`, or `category.name`. A provider category ID without a readable name does not invent a label. Missing metadata puts the product in অন্যান্য. Admin overrides are stored separately and survive supplier price, stock and category updates. Provider metadata is still recorded while an override is active, so resetting to the API/default takes effect immediately. Existing products, margins, orders and balances are preserved.

Only active categories with active products are shown to customers. Admins can select empty categories for product assignment. Admin create/assign/reset controls require the configured `ADMIN_ID`; customers cannot change categories by forging callbacks. No API key, Android update, Cron Trigger or extra Cloudflare binding is needed.

The additive migration creates `product_categories`, adds nullable product category/provider-category fields and an admin-override flag, plus a shop index. No existing products are deleted or assigned by guessing their names.

`node tests/shop-categories.cjs` verifies provider metadata/defaults, manual overrides across sync and restart, reset, creation/assignment, isolated listings, category pagination and access control. `node tests/shop-pagination.cjs` covers ten-product pages, return navigation, refresh and stock styles. The full suite also checks unchanged checkout, payment, pricing and report behavior.


## Delete a category

Open **Admin Panel → Categories → category → Delete Category**, then confirm. Products remain in the store and move to **অন্যান্য**. Their prices, stock, orders and margins are preserved. Category removal is recorded internally so provider sync cannot recreate the deleted category automatically. Choosing Create New Category with the same name restores that category; moved products stay in অন্যান্য until assigned again or reset to the API/default rule. The built-in অন্যান্য group cannot be deleted.

The Create New Category button is at the top of the admin category list and product-category picker. Opening an admin category shows its active product count, View Products and Delete Category. Customers cannot delete categories. Deletion and product reassignment happen in one database transaction.

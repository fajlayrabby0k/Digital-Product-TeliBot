// ====================================================================
// SMART SUBS STORE - Complete Cloudflare Pages / Worker _worker.js
// Features:
// 1. 100% Real-time Live Stock Sync with External Reseller / Provider Bot
// 2. Buy Now flow with 2 clear options under quantity: Direct Pay & Wallet Pay
// 3. Insufficient balance detection & 1-tap top-up / deposit missing funds
// 4. BEP20 USDT On-Chain Auto Payment Verification (BSC JSON-RPC)
// 5. Binance Pay Auto Verification (Instant Order ID / Binance Merchant API)
// 6. Force Join (Channel + Group membership gate)
// 7. Dynamic Pre-orders & Restock Instant Notification
// 8. Custom % Profit Margin Markup & Live Stock display
// 9. Referral program with automated instant commission
// ====================================================================

const BOT_BUILD="2026-11-26-speed-diagnostics-1";
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/api/mobile-receipt") return receiveMobileBridgeReceipt(request, env, ctx);

    if(url.pathname==='/api/health')return new Response(JSON.stringify({service:'telibot',build:BOT_BUILD,configured:{database:Boolean(env.DB),telegram:Boolean(env.BOT_TOKEN),admin:Boolean(env.ADMIN_ID)}}),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    // 1. Database Setup & Telegram Command Registration (/api/setup)
    if (url.pathname === "/api/setup") {
      try {
        if (!env.DB) return new Response(JSON.stringify({ error: "D1 DB not bound" }), { status: 500 });
        await setupDatabase(env.DB);
        await callTg(env, "setMyCommands", {
          commands: [
            { command: "start", description: "Open store dashboard" },
            { command: "shop", description: "Browse all products" },
            { command: "deposit", description: "Add funds to wallet" },
            { command: "profile", description: "My wallet & account" },
            { command: "orders", description: "My order history" },
            { command: "preorder", description: "My active pre-orders" },
            { command: "refer", description: "Refer & earn commission" },
            { command: "support", description: "24/7 Customer Helpdesk" },
            { command: "help", description: "Payment, delivery, warranty & refund guide" }
          ]
        });
        if (url.searchParams.get('repair_webhook') === '1') {
          const productionOrigin=new URL(env.BOT_PUBLIC_URL || 'https://digital-product-telibot.pages.dev').origin;
          if (url.origin!==productionOrigin) return new Response(JSON.stringify({success:false,error:'Use the production bot URL for webhook recovery.'}),{status:400,headers:{'Content-Type':'application/json'}});
          const repaired=await repairTelegramWebhook(env,`${productionOrigin}/api/webhook`);
          return new Response(JSON.stringify({success:repaired,webhook_repaired:repaired,message:repaired?'Webhook repaired. Send /start in Telegram.':'Webhook repair failed. Check BOT_TOKEN and Telegram API access.'}),{status:repaired?200:502,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
        }
        return new Response(JSON.stringify({ success: true, message: "Store configured and database migrated successfully!" }), {
          status: 200, headers: { "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }

    // 2. Live Sync Webhook / Cron Ping Endpoint (/api/sync)
    if (url.pathname === "/api/sync") {
      if(!['GET','POST'].includes(request.method))return new Response('Method not allowed',{status:405});
      const result=await runPeriodicSync(env);
      if(ctx?.waitUntil&&env.DB)ctx.waitUntil(drainAllNotices(env).catch(()=>console.error('Scheduled notification drain paused')));
      return new Response(JSON.stringify(result.body),{status:result.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    }

    // 3. Mock External Provider for instant testing (/api/mock-provider)
    if (url.pathname.startsWith("/api/mock-provider")) {
      let act = url.searchParams.get("action") || "";
      if (request.method === "POST") {
        try {
          const b = await request.clone().json().catch(() => ({}));
          if (b.action) act = b.action;
          if (b.product_id) act = "orders";
        } catch (_) {}
      }
      if (act === "me" || url.pathname.endsWith("/me")) {
        return new Response(JSON.stringify({ reseller: { id: "demo", username: "DemoReseller" }, wallet: { balance: 150.0, currency: "USDT" } }), {
          status: 200, headers: { "Content-Type": "application/json" }
        });
      }
      if (act === "products" || url.pathname.endsWith("/products")) {
        return new Response(JSON.stringify({
          products: [
            { id: "ext_prime", name: "🍿 Amazon Prime 6 Months", description: "Prime Video 6M Premium UHD", price: 3.50, stock: 150, available: true },
            { id: "ext_lovable", name: "🤖 Lovable Pro 12M", description: "Full Lovable Pro with credits", price: 35.00, stock: 45, available: true },
            { id: "ext_nord", name: "🛡️ NordVPN 1 Year", description: "Ultra-fast VPN access", price: 4.00, stock: 80, available: true }
          ]
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (act === "orders" || url.pathname.endsWith("/orders")) {
        return new Response(JSON.stringify({
          order_id: `MOCK-${Date.now()}`,
          status: "completed",
          items: [{ content: `KEY-${Date.now().toString(36).toUpperCase()}-VEXORIX-PRO` }],
          balance_after: 146.50
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }

    // 4. Telegram Webhook Handler
    if (request.method === "POST" && (url.pathname === "/api/webhook" || url.pathname === "/")) {
      try {
        if (!await authenticateTelegramWebhook(request,env)) {
          const repair=repairTelegramWebhook(env).catch(()=>{console.error('Telegram webhook repair failed; retry pending.');});
          if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(repair);
          else await repair;
          return new Response("Webhook configuration pending; please retry", {status:503,headers:{'Retry-After':'1'}});
        }
        const update = await request.json();
        if (ctx && typeof ctx.waitUntil === "function") {
          ctx.waitUntil(processBotUpdate(update, env, url.origin, ctx));
        } else {
          await processBotUpdate(update, env, url.origin, ctx);
        }
        return new Response("OK", { status: 200 });
      } catch (e) {
        console.error("Webhook error:", e);
        return new Response("ERROR", { status: 500 });
      }
    }

    return new Response("SMART SUBS STORE Bot Worker Active & Running.", { status: 200 });
  },

  // Cloudflare Scheduled Cron Handler (Periodic background live sync)
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async()=>{await runPeriodicSync(env);await drainAllNotices(env);})());
  }
};

// ====================================================================
// Database Setup & Migrations
// ====================================================================
// Bump this version whenever schema/default/index migrations change.
const DB_SCHEMA_VERSION = "2026-11-admin-order-delete-1";
let isDbInitialized = false;
let dbInitializationPromise = null;
async function ensureDbReady(db, force = false) {
  if (!db || (isDbInitialized && !force)) return;
  if (dbInitializationPromise) {
    await dbInitializationPromise;
    if (force) return await ensureDbReady(db, true);
    return;
  }
  dbInitializationPromise = initializeDatabase(db, force).finally(() => { dbInitializationPromise = null; });
  return await dbInitializationPromise;
}

async function initializeDatabase(db, force) {
  try {
    if (!force) {
      try {
        const saved = await db.prepare("SELECT value FROM settings WHERE key = '__schema_version'").first();
        if (saved?.value === DB_SCHEMA_VERSION) { isDbInitialized = true; return; }
      } catch (_) { /* First installation has no settings table yet. */ }
    }
    const schema = [
      `CREATE TABLE IF NOT EXISTS periodic_sync_status(id INTEGER PRIMARY KEY CHECK(id=1),lease_until INTEGER NOT NULL DEFAULT 0,lease_token TEXT,last_attempt_ms INTEGER,last_success_ms INTEGER,last_error TEXT);`,
      `CREATE TABLE IF NOT EXISTS channel_notice_events(id INTEGER PRIMARY KEY AUTOINCREMENT,event_key TEXT UNIQUE NOT NULL,product_id INTEGER,order_id INTEGER,deposit_id INTEGER,kind TEXT NOT NULL,channel_id TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',next_at INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,lease_token TEXT,attempts INTEGER NOT NULL DEFAULT 0,last_error TEXT,sent_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS product_follows(user_id INTEGER NOT NULL,product_id INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,product_id));`,
      `CREATE TABLE IF NOT EXISTS product_notice_state(product_id INTEGER PRIMARY KEY,stock INTEGER NOT NULL,revision INTEGER NOT NULL DEFAULT 0);`,
      `CREATE TABLE IF NOT EXISTS product_notice_events(id INTEGER PRIMARY KEY AUTOINCREMENT,event_key TEXT UNIQUE NOT NULL,product_id INTEGER NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',cursor INTEGER NOT NULL DEFAULT 0,max_user_id INTEGER NOT NULL,sent INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0,retries INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0,lease_token TEXT,lease_until INTEGER NOT NULL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS product_categories(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL COLLATE NOCASE UNIQUE);`,
      `CREATE TABLE IF NOT EXISTS category_name_aliases(name TEXT PRIMARY KEY COLLATE NOCASE,category_id INTEGER NOT NULL);`,
      `CREATE TABLE IF NOT EXISTS checkout_quotes(user_id INTEGER NOT NULL,product_id INTEGER NOT NULL,quantity INTEGER NOT NULL,total_usd REAL NOT NULL,created_ms INTEGER NOT NULL,PRIMARY KEY(user_id,product_id,quantity));`,
      `CREATE TABLE IF NOT EXISTS user_access_events(token TEXT PRIMARY KEY,user_id INTEGER NOT NULL,admin_id INTEGER NOT NULL,is_blocked INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS broadcast_jobs(id TEXT PRIMARY KEY,body TEXT NOT NULL,cursor INTEGER NOT NULL DEFAULT 0,max_user_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'ready',sent INTEGER NOT NULL DEFAULT 0,failed INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0);`,
      `CREATE TABLE IF NOT EXISTS manual_deposit_credits(deposit_id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,amount_usd REAL NOT NULL,amount_bdt REAL NOT NULL,token TEXT UNIQUE NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS wallet_history(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,reason TEXT NOT NULL,reference TEXT,usd_delta_cents INTEGER NOT NULL,bdt_delta_minor INTEGER NOT NULL,usd_before_cents INTEGER NOT NULL,usd_after_cents INTEGER NOT NULL,bdt_before_minor INTEGER NOT NULL,bdt_after_minor INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS support_tickets(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id INTEGER NOT NULL,user_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS support_ticket_messages(id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id INTEGER NOT NULL,sender_id INTEGER NOT NULL,is_admin INTEGER NOT NULL,body TEXT NOT NULL,submission_token TEXT UNIQUE NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS admin_payment_reviews(invoice_type TEXT NOT NULL,invoice_id INTEGER NOT NULL,user_id INTEGER NOT NULL,admin_id INTEGER NOT NULL,action TEXT NOT NULL,method TEXT NOT NULL,trx_key TEXT NOT NULL,trx_id TEXT NOT NULL,amount_usd REAL NOT NULL,amount_bdt REAL NOT NULL,token TEXT UNIQUE NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(invoice_type,invoice_id));`,
      `CREATE TABLE IF NOT EXISTS payment_pending_alerts(invoice_type TEXT NOT NULL,invoice_id INTEGER NOT NULL,trx_key TEXT NOT NULL,reason TEXT NOT NULL,sent INTEGER NOT NULL DEFAULT 0,lease_until INTEGER NOT NULL DEFAULT 0,lease_token TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(invoice_type,invoice_id,trx_key,reason));`,
      `CREATE TABLE IF NOT EXISTS payment_verification_events(invoice_type TEXT NOT NULL,invoice_id INTEGER NOT NULL,user_id INTEGER NOT NULL,method TEXT NOT NULL,trx_id TEXT,reason TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 1,updated_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(invoice_type,invoice_id));`,
      `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER UNIQUE NOT NULL, username TEXT, first_name TEXT, balance_usd REAL DEFAULT 0, balance_bdt REAL DEFAULT 0, referred_by INTEGER DEFAULT 0, total_referrals INTEGER DEFAULT 0, total_spent_usd REAL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, price_usd REAL NOT NULL, price_bdt REAL NOT NULL, is_active INTEGER DEFAULT 1, is_external INTEGER DEFAULT 0, external_id TEXT DEFAULT '', cost_price_usd REAL DEFAULT 0, custom_price_usd REAL DEFAULT 0, api_stock INTEGER DEFAULT 0);`,
      `CREATE TABLE IF NOT EXISTS restock_requests(user_id INTEGER NOT NULL,product_id INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'pending',created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,product_id));`,
      `CREATE TABLE IF NOT EXISTS inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, item_data TEXT NOT NULL, is_sold INTEGER DEFAULT 0, order_id INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id));`,
      `CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, username TEXT, product_id INTEGER NOT NULL, quantity INTEGER DEFAULT 1, payment_method TEXT NOT NULL, trx_id TEXT DEFAULT '', amount_usd REAL NOT NULL DEFAULT 0, amount_bdt REAL NOT NULL DEFAULT 0, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id));`,
      `CREATE TABLE IF NOT EXISTS preorders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, username TEXT, product_id INTEGER NOT NULL, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id));`,
      `CREATE TABLE IF NOT EXISTS deposits (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, username TEXT, method TEXT NOT NULL, amount_usd REAL NOT NULL DEFAULT 0, amount_bdt REAL NOT NULL DEFAULT 0, trx_id TEXT DEFAULT '', status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);`,
      `CREATE TABLE IF NOT EXISTS admin_states (user_id INTEGER PRIMARY KEY, state TEXT, data TEXT);`,
      `CREATE TABLE IF NOT EXISTS user_states (user_id INTEGER PRIMARY KEY, state TEXT, data TEXT);`,
      `CREATE TABLE IF NOT EXISTS redeem_codes (code_hash TEXT PRIMARY KEY, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), created_by INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, redeemed_by INTEGER DEFAULT NULL, redeemed_at DATETIME DEFAULT NULL, redemption_token TEXT UNIQUE DEFAULT NULL, redeemed_bdt INTEGER DEFAULT NULL);`,
      `CREATE TABLE IF NOT EXISTS bep20_payment_claims (tx_hash TEXT PRIMARY KEY, invoice_type TEXT NOT NULL, invoice_id INTEGER NOT NULL, user_id INTEGER NOT NULL, amount_wei TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(invoice_type, invoice_id));`,
      MOBILE_BRIDGE_HEALTH_SCHEMA,
      `CREATE TABLE IF NOT EXISTS mobile_bridge_receipts (event_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, method TEXT NOT NULL, account TEXT NOT NULL, trx_id TEXT NOT NULL, amount_minor INTEGER NOT NULL, received_at INTEGER NOT NULL, paid_at INTEGER NOT NULL, body_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unverified_sms', created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(method,trx_id));`,
      `CREATE TABLE IF NOT EXISTS mobile_payment_invoices (invoice_type TEXT NOT NULL, invoice_id INTEGER NOT NULL, user_id INTEGER NOT NULL, method TEXT NOT NULL, account TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK(amount_minor > 0), amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), created_ms INTEGER NOT NULL, expires_ms INTEGER NOT NULL, trx_id TEXT, submitted_at INTEGER, status TEXT NOT NULL DEFAULT 'pending', PRIMARY KEY(invoice_type,invoice_id));`,
      `CREATE TABLE IF NOT EXISTS mobile_payment_claims (method TEXT NOT NULL, trx_id TEXT NOT NULL, event_id TEXT NOT NULL UNIQUE, invoice_type TEXT NOT NULL, invoice_id INTEGER NOT NULL, user_id INTEGER NOT NULL, amount_minor INTEGER NOT NULL, amount_cents INTEGER NOT NULL, token TEXT NOT NULL UNIQUE, created_at TEXT DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(method,trx_id), UNIQUE(invoice_type,invoice_id));`,
      `CREATE TABLE IF NOT EXISTS binance_payment_claims (transaction_id TEXT PRIMARY KEY, invoice_type TEXT NOT NULL, invoice_id INTEGER NOT NULL, user_id INTEGER NOT NULL, amount_usdt TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(invoice_type, invoice_id));`
    ];
    if (typeof db.batch === "function") await db.batch(schema.map(q => db.prepare(q)));
    else for (const q of schema) await db.prepare(q).run();

    const alters = [
      "ALTER TABLE orders ADD COLUMN public_order_id TEXT DEFAULT NULL;",
      "ALTER TABLE orders ADD COLUMN user_order_number INTEGER DEFAULT NULL;",
      "ALTER TABLE channel_notice_events ADD COLUMN stock_snapshot INTEGER DEFAULT NULL;",
      "ALTER TABLE channel_notice_events ADD COLUMN price_snapshot_cents INTEGER DEFAULT NULL;",
      "ALTER TABLE channel_notice_events ADD COLUMN product_name_snapshot TEXT DEFAULT NULL;",
      "ALTER TABLE channel_notice_events ADD COLUMN old_price_cents INTEGER DEFAULT NULL;",
      "ALTER TABLE channel_notice_events ADD COLUMN new_price_cents INTEGER DEFAULT NULL;",
      "ALTER TABLE products ADD COLUMN price_notice_revision INTEGER DEFAULT 0;",
      "ALTER TABLE users ADD COLUMN product_alerts INTEGER DEFAULT 1;",
      "ALTER TABLE users ADD COLUMN product_alert_scope TEXT NOT NULL DEFAULT 'all';",
      "ALTER TABLE users ADD COLUMN is_blocked INTEGER NOT NULL DEFAULT 0;",
      "ALTER TABLE users ADD COLUMN product_alert_preference_set INTEGER NOT NULL DEFAULT 0;",
      "ALTER TABLE product_notice_events ADD COLUMN old_price_cents INTEGER DEFAULT NULL;",
      "ALTER TABLE product_notice_events ADD COLUMN new_price_cents INTEGER DEFAULT NULL;",
      "ALTER TABLE product_categories ADD COLUMN custom_icon TEXT DEFAULT NULL;",
      "ALTER TABLE product_categories ADD COLUMN is_deleted INTEGER DEFAULT 0;",
      "ALTER TABLE product_categories ADD COLUMN admin_managed INTEGER NOT NULL DEFAULT 0;",
      // Historical preorder tables stored product names without a numeric product_id.
      // Keep those rows intact and unlinked; never guess a product/account for an old request.
      "ALTER TABLE preorders ADD COLUMN details TEXT DEFAULT '';",
      "ALTER TABLE preorders ADD COLUMN username TEXT DEFAULT NULL;",
      "ALTER TABLE preorders ADD COLUMN product_name TEXT DEFAULT NULL;",
      "ALTER TABLE preorders ADD COLUMN created_at TEXT DEFAULT NULL;",
      "ALTER TABLE preorders ADD COLUMN product_id INTEGER DEFAULT NULL;",
      "ALTER TABLE preorders ADD COLUMN user_id INTEGER DEFAULT NULL;",
      "ALTER TABLE preorders ADD COLUMN status TEXT DEFAULT 'pending';",
      "ALTER TABLE users ADD COLUMN wallet_change_reason TEXT DEFAULT NULL;",
      "ALTER TABLE users ADD COLUMN wallet_change_ref TEXT DEFAULT NULL;",
      "ALTER TABLE products ADD COLUMN shop_category_id INTEGER DEFAULT NULL;",
      "ALTER TABLE products ADD COLUMN provider_category_id INTEGER DEFAULT NULL;",
      "ALTER TABLE products ADD COLUMN category_override INTEGER DEFAULT 0;",
      "ALTER TABLE products ADD COLUMN purchase_cost_usd REAL DEFAULT NULL;",
      "ALTER TABLE orders ADD COLUMN purchase_unit_cost_usd REAL DEFAULT NULL;",
      "ALTER TABLE orders ADD COLUMN admin_deleted INTEGER NOT NULL DEFAULT 0;",
      "ALTER TABLE orders ADD COLUMN admin_deleted_by TEXT;",
      "ALTER TABLE orders ADD COLUMN admin_deleted_at TEXT;",
      "ALTER TABLE orders ADD COLUMN admin_delete_token TEXT;",
      "ALTER TABLE orders ADD COLUMN sale_origin TEXT DEFAULT NULL;",
      "ALTER TABLE orders ADD COLUMN provider_unit_cost_usd REAL DEFAULT NULL;",
      "ALTER TABLE orders ADD COLUMN product_id INTEGER DEFAULT NULL;",
      "ALTER TABLE orders ADD COLUMN amount REAL DEFAULT NULL;",
      "ALTER TABLE orders ADD COLUMN currency TEXT DEFAULT 'USD';",
      "ALTER TABLE orders ADD COLUMN product_name TEXT DEFAULT NULL;",
      "ALTER TABLE orders ADD COLUMN created_at TEXT DEFAULT NULL;",
      "ALTER TABLE users ADD COLUMN username TEXT DEFAULT NULL;",
      "ALTER TABLE users ADD COLUMN first_name TEXT DEFAULT NULL;",
      "ALTER TABLE users ADD COLUMN balance_usd REAL DEFAULT 0;",
      "ALTER TABLE users ADD COLUMN balance_bdt REAL DEFAULT 0;",
      "ALTER TABLE users ADD COLUMN total_spent_usd REAL DEFAULT 0;",
      "ALTER TABLE products ADD COLUMN is_external INTEGER DEFAULT 0;",
      "ALTER TABLE products ADD COLUMN external_id TEXT DEFAULT '';",
      "ALTER TABLE products ADD COLUMN cost_price_usd REAL DEFAULT 0;",
      "ALTER TABLE products ADD COLUMN custom_price_usd REAL DEFAULT 0;",
      "ALTER TABLE products ADD COLUMN profit_margin_type TEXT DEFAULT 'global';",
      "ALTER TABLE products ADD COLUMN profit_margin_value REAL DEFAULT 0;",
      "ALTER TABLE products ADD COLUMN api_stock INTEGER DEFAULT 0;",
      "ALTER TABLE products ADD COLUMN custom_icon TEXT DEFAULT NULL;",
      "ALTER TABLE products ADD COLUMN provider_emoji_id TEXT DEFAULT NULL;",
      "ALTER TABLE orders ADD COLUMN provider_request_id TEXT DEFAULT NULL;",
      "ALTER TABLE orders ADD COLUMN provider_retry_at INTEGER DEFAULT 0;",
      "ALTER TABLE orders ADD COLUMN provider_error TEXT DEFAULT NULL;",
      "ALTER TABLE orders ADD COLUMN provider_order_id TEXT DEFAULT NULL;",
      "ALTER TABLE orders ADD COLUMN delivery_data TEXT DEFAULT NULL;",
      "ALTER TABLE orders ADD COLUMN bep20_wallet TEXT DEFAULT NULL;",
      "ALTER TABLE deposits ADD COLUMN bep20_wallet TEXT DEFAULT NULL;",
      "ALTER TABLE orders ADD COLUMN quantity INTEGER DEFAULT 1;",
      "ALTER TABLE orders ADD COLUMN amount_usd REAL DEFAULT 0;",
      "ALTER TABLE orders ADD COLUMN amount_bdt REAL DEFAULT 0;",
      "ALTER TABLE deposits ADD COLUMN amount_bdt REAL DEFAULT 0;"
    ];
    const tables = [...new Set(alters.map(sql => sql.match(/ALTER TABLE (\w+)/)[1]))];
    const columns = new Map(await Promise.all(tables.map(async table => {
      const {results} = await db.prepare(`PRAGMA table_info(${table})`).all();
      return [table, new Set(results.map(column => column.name))];
    })));
    const missing = alters.filter(sql => {
      const [, table, column] = sql.match(/ALTER TABLE (\w+) ADD COLUMN (\w+)/);
      return !columns.get(table).has(column);
    });
    if (missing.length) {
      if (typeof db.batch === "function") await db.batch(missing.map(sql => db.prepare(sql)));
      else for (const sql of missing) await db.prepare(sql).run();
    }
    // A historical category_id may reference a different legacy category table.
    // Keep that column and its foreign key untouched; only migrate compatible IDs.
    if(!columns.get('products').has('shop_category_id')&&columns.get('products').has('category_id')){
      const {results:links}=await db.prepare('PRAGMA foreign_key_list(products)').all();
      if(!links.some(link=>link.from==='category_id'&&link.table!=='product_categories')){
        await db.prepare('UPDATE products SET shop_category_id=category_id WHERE category_id IN (SELECT id FROM product_categories WHERE is_deleted=0)').run();
      }
    }
    const categoryPolicyGuard="NOT EXISTS(SELECT 1 FROM settings WHERE key='__admin_only_categories_v1')";
    const categoryPolicyWrites=[
      db.prepare(`UPDATE product_categories SET admin_managed=1 WHERE ${categoryPolicyGuard} AND (custom_icon IS NOT NULL OR id IN(SELECT category_id FROM category_name_aliases) OR id IN(SELECT shop_category_id FROM products WHERE COALESCE(is_external,0)=0 OR category_override=1) OR id NOT IN(SELECT provider_category_id FROM products WHERE provider_category_id IS NOT NULL))`),
      db.prepare(`UPDATE product_categories SET is_deleted=1 WHERE ${categoryPolicyGuard} AND admin_managed=0 AND id IN(SELECT provider_category_id FROM products WHERE is_external=1 AND provider_category_id IS NOT NULL)`),
      db.prepare(`UPDATE products SET shop_category_id=NULL WHERE ${categoryPolicyGuard} AND is_external=1 AND COALESCE(category_override,0)=0`),
      db.prepare(`UPDATE products SET provider_category_id=NULL WHERE ${categoryPolicyGuard} AND is_external=1`),
      db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('__admin_only_categories_v1','1')")
    ];
    const channelEvent=(product,kind,key,from='',condition='1=1',order='NULL',deposit='NULL')=>`INSERT OR IGNORE INTO channel_notice_events(event_key,product_id,order_id,deposit_id,kind,channel_id) SELECT ${key},${product},${order},${deposit},${kind},(SELECT value FROM settings WHERE key='force_channel_username') ${from} WHERE ${condition} AND COALESCE((SELECT value FROM settings WHERE key='force_channel_username'),'')<>'' AND COALESCE((SELECT value FROM settings WHERE key='channel_notifications_enabled'),'1')='1' AND COALESCE((SELECT value FROM settings WHERE key='channel_notice_'||${kind}),'1')='1';`;
    const noticeEvent=(product,kind,key)=>`INSERT OR IGNORE INTO product_notice_events(event_key,product_id,kind,max_user_id) SELECT ${key},${product},${kind},COALESCE((SELECT MAX(user_id) FROM users),0) WHERE COALESCE((SELECT MAX(user_id) FROM users),0)>0 AND COALESCE((SELECT value FROM settings WHERE key='product_notifications_enabled'),'1')='1' AND COALESCE((SELECT value FROM settings WHERE key='product_notice_'||${kind}),'1')='1';`+channelEvent(product,kind,key);
    const stockBody=(product,stock,condition='1=1')=>{
      const kind=`CASE WHEN ${stock}>stock THEN 'restock' ELSE 'sold_out' END`;
      return `INSERT OR IGNORE INTO product_notice_events(event_key,product_id,kind,max_user_id) SELECT 'stock:'||product_id||':'||(revision+1),product_id,${kind},COALESCE((SELECT MAX(user_id) FROM users),0) FROM product_notice_state WHERE product_id=${product} AND ${condition} AND (${stock}>stock OR (stock>0 AND ${stock}=0)) AND COALESCE((SELECT MAX(user_id) FROM users),0)>0 AND COALESCE((SELECT value FROM settings WHERE key='product_notifications_enabled'),'1')='1' AND COALESCE((SELECT value FROM settings WHERE key='product_notice_'||${kind}),'1')='1'; ${channelEvent('product_id',kind,"'stock:'||product_id||':'||(revision+1)",'FROM product_notice_state',`product_id=${product} AND ${condition} AND (${stock}>stock OR (stock>0 AND ${stock}=0))`)} UPDATE product_notice_state SET stock=${stock},revision=revision+1 WHERE product_id=${product} AND ${condition} AND stock<>${stock};`;
    };
    const localCondition=product=>`EXISTS(SELECT 1 FROM products WHERE id=${product} AND COALESCE(is_external,0)=0)`;
    const publicIdCandidate=`WITH RECURSIVE candidates(code,step) AS (SELECT 10000+ABS(RANDOM()%90000),0 UNION ALL SELECT 10000+((code-10000+1)%90000),step+1 FROM candidates WHERE step<89999) SELECT CAST(code AS TEXT) FROM candidates WHERE NOT EXISTS(SELECT 1 FROM orders WHERE public_order_id=CAST(code AS TEXT)) LIMIT 1`;
    const auditSetup=[
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS admin_review_transaction ON admin_payment_reviews(method,trx_key) WHERE action='approve' AND trx_key!=''"),
      ...[['mobile_payment_claims',"LOWER(NEW.method)",'NEW.trx_id'],['binance_payment_claims',"'binance'",'NEW.transaction_id'],['bep20_payment_claims',"'bep20'",'NEW.tx_hash']].map(([table,method,trx])=>db.prepare(`CREATE TRIGGER IF NOT EXISTS ${table}_manual_review_guard BEFORE INSERT ON ${table} WHEN EXISTS(SELECT 1 FROM admin_payment_reviews WHERE (invoice_type=NEW.invoice_type AND invoice_id=NEW.invoice_id) OR (action='approve' AND method=${method} AND trx_key=LOWER(${trx}))) BEGIN SELECT RAISE(ABORT,'Payment already reviewed by admin'); END`)),
      ...categoryPolicyWrites,
      ...['channel_notifications_enabled','channel_notice_new_product','channel_notice_restock','channel_notice_sold_out','channel_notice_low_stock','channel_notice_purchase','channel_notice_deposit','channel_notice_price_drop','channel_notice_price_increase'].map(key=>db.prepare("UPDATE settings SET value='1' WHERE key=? AND NOT EXISTS(SELECT 1 FROM settings WHERE key='__channel_all_events_20261117')").bind(key)),
      db.prepare("INSERT OR IGNORE INTO settings(key,value) VALUES('__channel_all_events_20261117','1')"),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS channel_notice_snapshot AFTER INSERT ON channel_notice_events WHEN NEW.product_id IS NOT NULL BEGIN UPDATE channel_notice_events SET product_name_snapshot=(SELECT name FROM products WHERE id=NEW.product_id),price_snapshot_cents=(SELECT ROUND(price_usd*100) FROM products WHERE id=NEW.product_id),stock_snapshot=(SELECT CASE WHEN is_external=1 THEN MAX(0,COALESCE(api_stock,0)) ELSE (SELECT COUNT(*) FROM inventory WHERE product_id=NEW.product_id AND is_sold=0) END FROM products WHERE id=NEW.product_id) WHERE id=NEW.id; END`),
      db.prepare('DROP TRIGGER IF EXISTS users_followed_alert_default'),
      db.prepare("UPDATE users SET product_alert_preference_set=1 WHERE product_alert_preference_set=0 AND (product_alerts=0 OR EXISTS(SELECT 1 FROM product_follows f WHERE f.user_id=users.user_id))"),
      db.prepare("UPDATE users SET product_alert_scope='all' WHERE product_alert_preference_set=0"),
      db.prepare("CREATE TRIGGER IF NOT EXISTS users_all_alert_default AFTER INSERT ON users WHEN NEW.product_alert_preference_set=0 BEGIN UPDATE users SET product_alert_scope='all' WHERE user_id=NEW.user_id; END"),
      db.prepare('CREATE INDEX IF NOT EXISTS product_follows_recipients ON product_follows(product_id,user_id)'),
      db.prepare('DROP INDEX IF EXISTS product_notice_coalesce'),
      db.prepare("CREATE UNIQUE INDEX product_notice_coalesce ON product_notice_events(product_id,kind) WHERE status='pending' AND kind NOT IN ('price_drop','price_increase')"),
      db.prepare('DROP TRIGGER IF EXISTS product_notice_price'),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS product_notice_price AFTER UPDATE OF price_usd ON products WHEN NEW.is_active=1 AND OLD.price_usd>0 AND NEW.price_usd>0 AND ROUND(OLD.price_usd*100)<>ROUND(NEW.price_usd*100) BEGIN
        INSERT OR IGNORE INTO product_notice_events(event_key,product_id,kind,max_user_id,old_price_cents,new_price_cents)
        SELECT 'price:'||NEW.id||':'||(COALESCE(OLD.price_notice_revision,0)+1),NEW.id,CASE WHEN NEW.price_usd<OLD.price_usd THEN 'price_drop' ELSE 'price_increase' END,COALESCE((SELECT MAX(user_id) FROM users),0),ROUND(OLD.price_usd*100),ROUND(NEW.price_usd*100)
        WHERE (EXISTS(SELECT 1 FROM product_follows WHERE product_id=NEW.id) OR EXISTS(SELECT 1 FROM users WHERE COALESCE(product_alert_scope,'all')='all' AND COALESCE(product_alerts,1)=1)) AND COALESCE((SELECT value FROM settings WHERE key='product_notifications_enabled'),'1')='1' AND COALESCE((SELECT value FROM settings WHERE key=CASE WHEN NEW.price_usd<OLD.price_usd THEN 'product_notice_price_drop' ELSE 'product_notice_price_increase' END),'1')='1'; END`),
      ...Object.entries(GUIDE_BENGALI_DEFAULTS).map(([key,value])=>db.prepare('UPDATE settings SET value=? WHERE key=? AND value=?').bind(GUIDE_DEFAULTS[key],key,value)),
      db.prepare('UPDATE settings SET value=? WHERE key=? AND value=?').bind(GUIDE_DEFAULTS.guide_intro,'guide_intro',GUIDE_PREVIOUS_INTRO),
      ...Object.entries(GUIDE_LEGACY_DEFAULTS).map(([key,value])=>db.prepare('UPDATE settings SET value=? WHERE key=? AND value=?').bind(GUIDE_DEFAULTS[key],key,value)),
      db.prepare('CREATE INDEX IF NOT EXISTS orders_user_sequence_lookup ON orders(user_id,id)'),
      db.prepare('UPDATE orders AS target SET user_order_number=(SELECT COUNT(*) FROM orders previous WHERE previous.user_id=target.user_id AND previous.id<=target.id) WHERE user_order_number IS NULL'),
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS orders_user_number_unique ON orders(user_id,user_order_number) WHERE user_order_number IS NOT NULL'),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS orders_user_number_assign AFTER INSERT ON orders WHEN NEW.user_order_number IS NULL BEGIN UPDATE orders SET user_order_number=(SELECT COALESCE(MAX(user_order_number),0)+1 FROM orders WHERE user_id=NEW.user_id) WHERE id=NEW.id; END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS orders_user_number_immutable BEFORE UPDATE OF user_order_number ON orders WHEN NEW.user_order_number IS NULL OR NEW.user_order_number<1 OR (OLD.user_order_number IS NOT NULL AND OLD.user_order_number<>NEW.user_order_number) BEGIN SELECT RAISE(ABORT,'User order number must be positive and immutable'); END`),
      db.prepare('CREATE UNIQUE INDEX IF NOT EXISTS orders_public_id_unique ON orders(public_order_id) WHERE public_order_id IS NOT NULL'),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS orders_public_id_validate BEFORE UPDATE OF public_order_id ON orders WHEN NEW.public_order_id IS NULL OR NEW.public_order_id NOT GLOB '[1-9][0-9][0-9][0-9][0-9]' OR (OLD.public_order_id IS NOT NULL AND OLD.public_order_id<>NEW.public_order_id) BEGIN SELECT RAISE(ABORT,'Order ID must be unique, immutable and five digits; ID space may be exhausted'); END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS orders_public_id_insert_validate BEFORE INSERT ON orders WHEN NEW.public_order_id IS NOT NULL AND NEW.public_order_id NOT GLOB '[1-9][0-9][0-9][0-9][0-9]' BEGIN SELECT RAISE(ABORT,'Order ID must be five digits'); END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS orders_public_id_assign AFTER INSERT ON orders WHEN NEW.public_order_id IS NULL BEGIN UPDATE orders SET public_order_id=(${publicIdCandidate}) WHERE id=NEW.id; END`),
      db.prepare(`UPDATE orders AS target SET public_order_id=(${publicIdCandidate.replace("RANDOM()%90000),0", "RANDOM()%90000),0 WHERE target.id IS NOT NULL")}) WHERE public_order_id IS NULL`),
      db.prepare("INSERT OR IGNORE INTO periodic_sync_status(id) VALUES(1)"),
      ...['product_notice_new','product_notice_api_stock','product_notice_inventory_add','product_notice_inventory_remove','product_notice_inventory_change'].map(name=>db.prepare(`DROP TRIGGER IF EXISTS ${name}`)),
      db.prepare(`INSERT OR IGNORE INTO product_notice_state(product_id,stock) SELECT id,CASE WHEN is_external=1 THEN MAX(0,COALESCE(api_stock,0)) ELSE (SELECT COUNT(*) FROM inventory WHERE product_id=products.id AND is_sold=0) END FROM products`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS product_notice_new AFTER INSERT ON products BEGIN INSERT OR IGNORE INTO product_notice_state(product_id,stock) VALUES(NEW.id,CASE WHEN NEW.is_external=1 THEN MAX(0,COALESCE(NEW.api_stock,0)) ELSE 0 END); ${noticeEvent('NEW.id',"'new_product'","'new:'||NEW.id")} END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS product_notice_api_stock AFTER UPDATE OF api_stock ON products WHEN NEW.is_external=1 AND NEW.is_active=1 BEGIN ${stockBody('NEW.id','MAX(0,COALESCE(NEW.api_stock,0))')} END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS product_notice_inventory_add AFTER INSERT ON inventory WHEN NEW.is_sold=0 BEGIN ${stockBody('NEW.product_id','stock+1',localCondition('NEW.product_id'))} END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS product_notice_inventory_remove AFTER DELETE ON inventory WHEN OLD.is_sold=0 BEGIN ${stockBody('OLD.product_id','MAX(0,stock-1)',localCondition('OLD.product_id'))} END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS product_notice_inventory_change AFTER UPDATE OF is_sold,product_id ON inventory WHEN OLD.is_sold<>NEW.is_sold OR OLD.product_id<>NEW.product_id BEGIN ${stockBody('OLD.product_id','MAX(0,stock-1)',`OLD.is_sold=0 AND ${localCondition('OLD.product_id')}`)} ${stockBody('NEW.product_id','stock+1',`NEW.is_sold=0 AND ${localCondition('NEW.product_id')}`)} END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS channel_notice_price AFTER UPDATE OF price_usd ON products WHEN NEW.is_active=1 AND OLD.price_usd>0 AND NEW.price_usd>0 AND ROUND(OLD.price_usd*100)<>ROUND(NEW.price_usd*100) BEGIN
        INSERT OR IGNORE INTO channel_notice_events(event_key,product_id,kind,channel_id,old_price_cents,new_price_cents)
        SELECT 'price:'||NEW.id||':'||(COALESCE(OLD.price_notice_revision,0)+1),NEW.id,CASE WHEN NEW.price_usd<OLD.price_usd THEN 'price_drop' ELSE 'price_increase' END,(SELECT value FROM settings WHERE key='force_channel_username'),ROUND(OLD.price_usd*100),ROUND(NEW.price_usd*100)
        WHERE COALESCE((SELECT value FROM settings WHERE key='force_channel_username'),'')<>'' AND COALESCE((SELECT value FROM settings WHERE key='channel_notifications_enabled'),'1')='1' AND COALESCE((SELECT value FROM settings WHERE key=CASE WHEN NEW.price_usd<OLD.price_usd THEN 'channel_notice_price_drop' ELSE 'channel_notice_price_increase' END),'1')='1';
        UPDATE products SET price_notice_revision=COALESCE(price_notice_revision,0)+1 WHERE id=NEW.id; END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS channel_notice_low_insert AFTER INSERT ON product_notice_state WHEN NEW.stock BETWEEN 1 AND 5 BEGIN ${channelEvent('NEW.product_id',"'low_stock'","'low:'||NEW.product_id||':'||NEW.revision")} END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS channel_notice_low_update AFTER UPDATE OF stock ON product_notice_state WHEN NEW.stock BETWEEN 1 AND 5 AND (OLD.stock=0 OR OLD.stock>5) BEGIN ${channelEvent('NEW.product_id',"'low_stock'","'low:'||NEW.product_id||':'||NEW.revision")} END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS channel_notice_order_insert AFTER INSERT ON orders WHEN NEW.status='completed' BEGIN ${channelEvent('NEW.product_id',"'purchase'","'purchase:'||NEW.id",'', '1=1','NEW.id')} END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS channel_notice_order_update AFTER UPDATE OF status ON orders WHEN NEW.status='completed' AND OLD.status<>'completed' BEGIN ${channelEvent('NEW.product_id',"'purchase'","'purchase:'||NEW.id",'','1=1','NEW.id')} END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS channel_notice_deposit_insert AFTER INSERT ON deposits WHEN NEW.status='completed' BEGIN ${channelEvent('NULL',"'deposit'","'deposit:'||NEW.id",'','1=1','NULL','NEW.id')} END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS channel_notice_deposit_update AFTER UPDATE OF status ON deposits WHEN NEW.status='completed' AND OLD.status<>'completed' BEGIN ${channelEvent('NULL',"'deposit'","'deposit:'||NEW.id",'','1=1','NULL','NEW.id')} END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS orders_capture_sale_cost AFTER INSERT ON orders BEGIN
      UPDATE orders SET sale_origin=(SELECT CASE WHEN is_external=1 THEN 'api' ELSE 'local' END FROM products WHERE id=NEW.product_id),
      provider_unit_cost_usd=(SELECT CASE WHEN is_external=1 AND cost_price_usd>0 THEN cost_price_usd ELSE NULL END FROM products WHERE id=NEW.product_id)
      WHERE id=NEW.id; END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS orders_capture_local_cost AFTER INSERT ON orders BEGIN
      UPDATE orders SET purchase_unit_cost_usd=(SELECT purchase_cost_usd FROM products WHERE id=NEW.product_id AND COALESCE(is_external,0)=0) WHERE id=NEW.id; END`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS wallet_opening_once ON wallet_history(user_id) WHERE reason='opening'"),
      db.prepare(`INSERT OR IGNORE INTO wallet_history(user_id,reason,usd_delta_cents,bdt_delta_minor,usd_before_cents,usd_after_cents,bdt_before_minor,bdt_after_minor)
      SELECT user_id,'opening',0,0,ROUND(COALESCE(balance_usd,0)*100),ROUND(COALESCE(balance_usd,0)*100),ROUND(COALESCE(balance_bdt,0)*100),ROUND(COALESCE(balance_bdt,0)*100) FROM users`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS wallet_history_new_user AFTER INSERT ON users BEGIN
      INSERT INTO wallet_history(user_id,reason,usd_delta_cents,bdt_delta_minor,usd_before_cents,usd_after_cents,bdt_before_minor,bdt_after_minor)
      VALUES(NEW.user_id,'opening',0,0,ROUND(COALESCE(NEW.balance_usd,0)*100),ROUND(COALESCE(NEW.balance_usd,0)*100),ROUND(COALESCE(NEW.balance_bdt,0)*100),ROUND(COALESCE(NEW.balance_bdt,0)*100)); END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS wallet_history_change AFTER UPDATE OF balance_usd,balance_bdt ON users
      WHEN ROUND(COALESCE(NEW.balance_usd,0)*100)<>ROUND(COALESCE(OLD.balance_usd,0)*100) OR ROUND(COALESCE(NEW.balance_bdt,0)*100)<>ROUND(COALESCE(OLD.balance_bdt,0)*100)
      BEGIN INSERT INTO wallet_history(user_id,reason,reference,usd_delta_cents,bdt_delta_minor,usd_before_cents,usd_after_cents,bdt_before_minor,bdt_after_minor)
      VALUES(NEW.user_id,COALESCE(NEW.wallet_change_reason,'unspecified'),NEW.wallet_change_ref,
      ROUND(COALESCE(NEW.balance_usd,0)*100)-ROUND(COALESCE(OLD.balance_usd,0)*100),ROUND(COALESCE(NEW.balance_bdt,0)*100)-ROUND(COALESCE(OLD.balance_bdt,0)*100),
      ROUND(COALESCE(OLD.balance_usd,0)*100),ROUND(COALESCE(NEW.balance_usd,0)*100),ROUND(COALESCE(OLD.balance_bdt,0)*100),ROUND(COALESCE(NEW.balance_bdt,0)*100));
      UPDATE users SET wallet_change_reason=NULL,wallet_change_ref=NULL WHERE user_id=NEW.user_id; END`),
      db.prepare(`CREATE TRIGGER IF NOT EXISTS wallet_history_clear_noop AFTER UPDATE OF balance_usd,balance_bdt ON users
        WHEN NEW.wallet_change_reason IS NOT NULL AND ROUND(COALESCE(NEW.balance_usd,0)*100)=ROUND(COALESCE(OLD.balance_usd,0)*100) AND ROUND(COALESCE(NEW.balance_bdt,0)*100)=ROUND(COALESCE(OLD.balance_bdt,0)*100)
        BEGIN UPDATE users SET wallet_change_reason=NULL,wallet_change_ref=NULL WHERE user_id=NEW.user_id; END`),
    ];
    if(typeof db.batch==="function")await db.batch(auditSetup);
    else for(const statement of auditSetup)await statement.run();
    orderWriteSchemaCache.delete(db);
    await db.prepare("UPDATE mobile_payment_invoices SET expires_ms=created_ms+3600000 WHERE status='pending' AND expires_ms=created_ms+600000").run();
    const indexes = [
      "CREATE INDEX IF NOT EXISTS channel_notice_pending ON channel_notice_events(status,next_at,id)",
      "CREATE UNIQUE INDEX IF NOT EXISTS channel_notice_coalesce ON channel_notice_events(product_id,kind) WHERE status='pending' AND product_id IS NOT NULL AND kind IN ('new_product','restock','sold_out','low_stock')",
      "CREATE UNIQUE INDEX IF NOT EXISTS product_notice_coalesce ON product_notice_events(product_id,kind) WHERE status='pending' AND kind NOT IN ('price_drop','price_increase')",
      "CREATE INDEX IF NOT EXISTS product_notice_pending ON product_notice_events(status,next_at,id)",
      "CREATE INDEX IF NOT EXISTS products_shop_category_v2 ON products(is_active,shop_category_id,id)",
      "CREATE INDEX IF NOT EXISTS wallet_user_history ON wallet_history(user_id,id DESC)",
      "CREATE UNIQUE INDEX IF NOT EXISTS support_one_active_order ON support_tickets(order_id,user_id) WHERE status<>'closed'",
      "CREATE INDEX IF NOT EXISTS support_user_list ON support_tickets(user_id,id DESC)",
      "CREATE INDEX IF NOT EXISTS support_thread ON support_ticket_messages(ticket_id,id DESC)",
      "CREATE UNIQUE INDEX IF NOT EXISTS deposits_redeem_once ON deposits(trx_id) WHERE method = 'REDEEM'",
      "CREATE INDEX IF NOT EXISTS inventory_available ON inventory(product_id, is_sold, id)",
      "CREATE INDEX IF NOT EXISTS inventory_order ON inventory(order_id, is_sold)",
      "CREATE INDEX IF NOT EXISTS deposits_user_history ON deposits(user_id,id DESC)",
      "CREATE INDEX IF NOT EXISTS orders_admin_transaction ON orders(UPPER(trx_id),user_id)",
      "CREATE INDEX IF NOT EXISTS deposits_admin_transaction ON deposits(UPPER(trx_id),user_id)",
      "CREATE INDEX IF NOT EXISTS orders_user_history ON orders(user_id, id DESC)",
      "CREATE INDEX IF NOT EXISTS mobile_pending_receipts ON mobile_payment_invoices(method,trx_id,status,submitted_at)",
      "CREATE INDEX IF NOT EXISTS orders_status ON orders(status)",
      "CREATE INDEX IF NOT EXISTS products_shop_active ON products(is_active, id)",
      "CREATE INDEX IF NOT EXISTS products_external ON products(external_id, is_external)",
      "CREATE INDEX IF NOT EXISTS preorders_product_status ON preorders(product_id, status)",
      "CREATE INDEX IF NOT EXISTS preorders_user_history ON preorders(user_id, id DESC)",
      "CREATE INDEX IF NOT EXISTS orders_payment_hash ON orders(LOWER(trx_id)) WHERE status = 'completed'",
      "CREATE INDEX IF NOT EXISTS deposits_payment_hash ON deposits(LOWER(trx_id)) WHERE status = 'completed'"
    ];
    if (typeof db.batch === "function") await db.batch(indexes.map(sql => db.prepare(sql)));
    else for (const sql of indexes) await db.prepare(sql).run();

    const defaults = [
      ['maintenance_mode', '0'],
      ['usd_to_bdt_rate', '125'],
      ['referral_commission_percent', '5'],
      ['support_admin', '@fojlaybd'],
      ['periodic_sync_enabled','1'],
      ...Object.entries(GUIDE_DEFAULTS),
      ['bkash_num', '017XXXXXXXX'],
      ['nagad_num', '017XXXXXXXX'],
      ['rocket_num', '017XXXXXXXX'],
      ['binance_id', '6029752069'],
      ['binance_auto_verify', '1'],
      ['binance_pay_api_key', ''],
      ['binance_pay_secret', ''],
      ['bep20_addr', '0x71C...YourWalletAddress'],
      ['external_api_url', 'https://207-148-64-141.sslip.io'],
      ['external_api_key', ''],
      ['channel_notice_price_drop','1'],['channel_notice_price_increase','1'],['channel_notifications_enabled','1'],['channel_notice_new_product','1'],['channel_notice_restock','1'],['channel_notice_sold_out','1'],['channel_notice_low_stock','1'],['channel_notice_purchase','1'],['channel_notice_deposit','1'],
      ['product_notifications_enabled','1'],['product_notice_new_product','1'],['product_notice_restock','1'],['product_notice_sold_out','1'],['product_notice_price_drop','1'],['product_notice_price_increase','1'],
      ['external_profit_margin', '20'],
      ['external_profit_margin_type', 'percent'],
      ['auto_order_enabled', '1'],
      ['force_channel_username', ''],
      ['force_group_username', ''],
      ['last_external_sync_time', '0']
    ];
    const settings = defaults.map(([k,v]) => db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").bind(k,v));
    if (typeof db.batch === "function") await db.batch(settings);
    else for (const statement of settings) await statement.run();

    const pc = await db.prepare("SELECT COUNT(*) as c FROM products").first();
    if (!pc || pc.c === 0) {
      await db.prepare(`INSERT INTO products (id, name, description, price_usd, price_bdt, is_active) VALUES 
        (1, '🤖 Lovable Pro 12m NW', 'Full Pro Access for 12 Months\\n- 5 daily credits\\n- Instant Automated Delivery', 45.50, 5688, 1),
        (2, '⚡ Lovable Lite 12m', 'Full Lite Access for 12 Months\\n- 300 Credits', 5.00, 625, 1),
        (3, '🛡️ NordVPN 3m', 'NordVPN 3 Months Premium Access', 2.50, 312, 1);`).run();
      await db.prepare(`INSERT INTO inventory (product_id, item_data) VALUES 
        (2, 'https://lovable.dev/redeem/LOV-300-KEY-001'),
        (2, 'https://lovable.dev/redeem/LOV-300-KEY-002'),
        (3, 'User: nord_user@mail.com | Pass: Nord#2026');`).run();
    }
    await db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('__schema_version', ?)").bind(DB_SCHEMA_VERSION).run();
    isDbInitialized = true;
  } catch (err) {
    console.error("Database initialization failed");
    throw err;
  }
}

async function setupDatabase(db) {
  isDbInitialized = false;
  await ensureDbReady(db, true);
}

// Safety & Utility Helpers
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Provider descriptions encode custom emoji as bracketed Telegram IDs.
function renderProductDescription(description) {
  return escapeHtml(String(description || "Digital License"))
    .replace(/\[(\d{15,22})\]/g, '<tg-emoji emoji-id="$1">▫️</tg-emoji>');
}

function fetchWithTimeout(url, options = {}, timeoutMs = 4000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

// ====================================================================
// Telegram API Helpers
// ====================================================================
const webhookBootstrapCache = new WeakMap();
async function telegramWebhookSecret(botToken) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`telibot:webhook:v1:${botToken}`));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function authenticateTelegramWebhook(request,env) {
  if (!env.BOT_TOKEN) return true;
  const expected=env.TELEGRAM_WEBHOOK_SECRET || await telegramWebhookSecret(env.BOT_TOKEN);
  return request.headers.get('X-Telegram-Bot-Api-Secret-Token')===expected;
}

async function repairTelegramWebhook(env, recoveryUrl = null) {
  if (!env.BOT_TOKEN) return false;
  const previous=webhookBootstrapCache.get(env.DB);
  if (!recoveryUrl && previous?.token===env.BOT_TOKEN && previous.until>Date.now()) return false;
  const reservation={token:env.BOT_TOKEN,until:Date.now()+10000};
  webhookBootstrapCache.set(env.DB,reservation);
  let repaired=false;
  try {
    const expected=env.TELEGRAM_WEBHOOK_SECRET || await telegramWebhookSecret(env.BOT_TOKEN);
    const info=await callTg(env,'getWebhookInfo',{});
    const target=recoveryUrl || (info.ok && info.result?.url);
    if (!target) return false;
    // Automatic repair keeps Telegram's registered URL. Explicit recovery is pinned
    // by /api/setup to the configured production bot origin, never a caller-supplied URL.
    const saved=new URL(target);
    if (saved.protocol!=='https:') return false;
    const response=await callTg(env,'setWebhook',{url:target,secret_token:expected,drop_pending_updates:false,max_connections:info.result?.max_connections||40});
    repaired=response.ok===true;
    return repaired;
  } finally {
    reservation.until=Date.now()+(repaired?60000:3000);
  }
}

async function callTg(env, method, payload) {
  if (!env.BOT_TOKEN) return { ok: false, error: "BOT_TOKEN missing" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), method === "answerCallbackQuery" ? 2500 : method === "sendDocument" ? 30000 : 8000);
  try {
    const upload=method==='sendDocument'&&payload.document?.content!==undefined;
    let body=JSON.stringify(payload),headers={"Content-Type":"application/json"};
    if(upload){
      body=new FormData();headers={};
      for(const [key,value] of Object.entries(payload)){
        if(key==='document')body.append(key,new Blob([value.content],{type:'text/plain;charset=utf-8'}),value.filename);
        else if(value!==undefined&&value!==null)body.append(key,typeof value==='object'?JSON.stringify(value):String(value));
      }
    }
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: "POST", headers, body, signal: controller.signal
    });
    const data = await res.json();
    if (!data.ok) {
      console.error(`Telegram API error in ${method}:`, JSON.stringify(data));
      const rows=payload.reply_markup?.inline_keyboard;
      if(data.error_code===400 && /emoji|icon_custom/i.test(data.description||'') && rows?.some(row=>row.some(button=>button.icon_custom_emoji_id))){
        const keyboard=rows.map(row=>row.map(button=>{const {icon_custom_emoji_id,...plain}=button;return plain;}));
        return await callTg(env,method,{...payload,reply_markup:{...payload.reply_markup,inline_keyboard:keyboard}});
      }
    }
    return data;
  } catch (e) {
    console.error(`Telegram API network error in ${method}:`, e.name);
    return { ok: false, error: "Telegram request unavailable" };
  } finally { clearTimeout(timer); }
}
async function sendMsg(env, chatId, text, keyboard = null) {
  const p = { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (keyboard) p.reply_markup = { inline_keyboard: keyboard };
  return await callTg(env, "sendMessage", p);
}
async function editMsg(env, chatId, messageId, text, keyboard = null) {
  const p = { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML", disable_web_page_preview: true };
  if (keyboard) p.reply_markup = { inline_keyboard: keyboard };
  const res = await callTg(env, "editMessageText", p);
  if (!res || !res.ok) {
    const desc = (res && res.description) || "";
    if (desc.includes("message is not modified")) return { ...res, ok: true };
    return await sendMsg(env, chatId, text, keyboard);
  }
  return res;
}
async function ansCb(env, id, text = null, showAlert = false) {
  const p = { callback_query_id: id };
  if (text) { p.text = text; p.show_alert = showAlert; }
  return await callTg(env, "answerCallbackQuery", p);
}
async function getSetting(env, key, defVal) {
  const cache = env.__requestSettings;
  try {
    if(env.__settingsLoaded&&!cache?.has(key))return defVal;
    let pending = cache?.get(key);
    if (!pending) {
      pending = env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first();
      cache?.set(key, pending);
    }
    const row = await pending;
    return row?.value ?? defVal;
  } catch (_) { cache?.delete(key); return defVal; }
}
async function clearAdminState(env, id) {
  await env.DB.prepare("DELETE FROM admin_states WHERE user_id = ?").bind(id).run();
}

// ====================================================================
// BEP20 USDT Blockchain Auto-Verification (BSC JSON-RPC)
// ====================================================================
const BSC_USDT_CONTRACT = "0x55d398326f99059ff775485246999027b3197955";
const BSC_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const BSC_REQUIRED_CONFIRMATIONS = 12;

async function bscRpc(url, method, params) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: controller.signal });
    const data = await response.json();
    if (!response.ok || data.error || !("result" in data)) throw new Error("RPC request rejected");
    return data.result;
  } finally { clearTimeout(timer); }
}

async function verifyBscUsdtTx(env, txHash, expectedUsd, invoice = null) {
  try {
    const hash = String(txHash).trim().toLowerCase();
    if (!/^0x[a-f0-9]{64}$/.test(hash)) return { success: false, reason: "invalid_format", message: "Send the full BEP20 transaction hash: 0x followed by 64 hex characters." };
    const createdAt = invoiceTimestamp(invoice?.created_at);
    if (!invoice || !["order", "deposit"].includes(invoice.type) || invoice.status !== "pending" ||
        !Number.isFinite(createdAt) || createdAt > Date.now() || Date.now() - createdAt > 7 * 86400000 ||
        !Number.isFinite(expectedUsd) || expectedUsd < 0) {
      return { success: false, reason: "invalid_invoice", message: "This invoice is not payable or is over 7 days old. Contact admin." };
    }
    const [usedOrder, usedDeposit, claim, address] = await Promise.all([
      env.DB.prepare("SELECT id FROM orders WHERE LOWER(trx_id) = ? AND status = 'completed'").bind(hash).first(),
      env.DB.prepare("SELECT id FROM deposits WHERE LOWER(trx_id) = ? AND status = 'completed'").bind(hash).first(),
      env.DB.prepare("SELECT tx_hash FROM bep20_payment_claims WHERE tx_hash = ? OR (invoice_type = ? AND invoice_id = ?)").bind(hash, invoice.type, invoice.id).first(),
      invoice.bep20_wallet ?? getSetting(env, "bep20_addr", "")
    ]);
    if (usedOrder || usedDeposit || claim) return { success: false, reason: "already_used", message: "This transaction or invoice has already been submitted. Contact admin if delivery is pending." };
    const wallet = String(address).trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(wallet) || /^0x0{40}$/.test(wallet)) return { success: false, reason: "no_wallet", message: "Admin must configure a valid BEP20 receive address." };
    const urls = env.BSC_RPC_URL ? [env.BSC_RPC_URL] : ["https://bsc-dataseed.bnbchain.org", "https://bsc-dataseed1.defibit.io"];
    let receipt, block, head, rpcWorked = false;
    for (const url of urls) {
      try {
        if (new URL(url).protocol !== "https:") continue;
        const [chain, candidate, latest] = await Promise.all([
          bscRpc(url, "eth_chainId", []), bscRpc(url, "eth_getTransactionReceipt", [hash]), bscRpc(url, "eth_blockNumber", [])
        ]);
        if (BigInt(chain) !== 56n) continue;
        rpcWorked = true;
        if (!candidate) continue;
        if (!/^0x[0-9a-f]+$/i.test(candidate.blockNumber || "") || !/^0x[0-9a-f]+$/i.test(latest || "")) continue;
        const candidateBlock = await bscRpc(url, "eth_getBlockByNumber", [candidate.blockNumber, false]);
        if (!candidateBlock || !/^0x[0-9a-f]{64}$/i.test(candidate.blockHash || "") || candidateBlock.hash?.toLowerCase() !== candidate.blockHash.toLowerCase() ||
            candidateBlock.number?.toLowerCase() !== candidate.blockNumber.toLowerCase()) continue;
        receipt = candidate; block = candidateBlock; head = BigInt(latest); break;
      } catch (_) { /* Retry a second public endpoint without exposing RPC credentials. */ }
    }
    if (!receipt) return { success: false, reason: rpcWorked ? "not_found" : "rpc_unavailable", message: rpcWorked ? "Transaction not confirmed on BNB Smart Chain yet. Wait briefly and retry the same hash." : "BNB Smart Chain RPC is unavailable. Retry later or contact admin; do not pay again." };
    if (receipt.transactionHash?.toLowerCase() !== hash || receipt.status !== "0x1") return { success: false, reason: "tx_failed", message: "The blockchain transaction failed or does not match this hash." };
    const confirmations = head - BigInt(receipt.blockNumber) + 1n;
    if (confirmations < BigInt(BSC_REQUIRED_CONFIRMATIONS)) return { success: false, reason: "confirmations", message: `Waiting for confirmations (${confirmations < 0n ? 0 : confirmations}/${BSC_REQUIRED_CONFIRMATIONS}). Retry the same TxHash shortly; do not pay again.` };
    if (!/^0x[0-9a-f]+$/i.test(block.timestamp || "") || Number(BigInt(block.timestamp)) * 1000 < createdAt || Number(BigInt(block.timestamp)) * 1000 > Date.now()) {
      return { success: false, reason: "old_payment", message: "The transfer must be made after this invoice was created." };
    }
    if(Date.now()-Number(BigInt(block.timestamp))*1000>10*60000)return {success:false,reason:'payment_expired',message:'Submit the TxHash within 10 minutes of paying. Contact admin for review; do not pay again.'};
    const recipientTopic = `0x${wallet.slice(2).padStart(64, "0")}`;
    let total = 0n;
    for (const log of receipt.logs || []) {
      if (log.removed || log.address?.toLowerCase() !== BSC_USDT_CONTRACT || log.topics?.length !== 3 ||
          log.topics[0]?.toLowerCase() !== BSC_TRANSFER_TOPIC || log.topics[2]?.toLowerCase() !== recipientTopic ||
          !/^0x[0-9a-f]{64}$/i.test(log.data || "")) continue;
      total += BigInt(log.data);
    }
    if (total <= 0n) return { success: false, reason: "recipient_mismatch", message: "No supported USDT (BEP20) transfer to the store address was found. Check the network, token and recipient." };
    const required = usdtUnits(expectedUsd.toFixed(8));
    if (required === null || total < required * 10000000000n) return { success: false, reason: "amount_low", message: "Received USDT is less than required. Network withdrawal fees must be covered by the sender." };
    try {
      await env.DB.prepare("INSERT INTO bep20_payment_claims (tx_hash, invoice_type, invoice_id, user_id, amount_wei) VALUES (?, ?, ?, ?, ?)")
        .bind(hash, invoice.type, invoice.id, invoice.user_id, total.toString()).run();
    } catch (_) { return { success: false, reason: "claim_failed", message: "Transaction could not be reserved. It may already be in use; contact admin." }; }
    return { success: true, paidAmount: Number(total) / 1e18, txHash: hash };
  } catch (_) { return { success: false, reason: "unavailable", message: "BEP20 verification is temporarily unavailable. Retry or contact admin; do not pay again." }; }
}

// ====================================================================
// Binance Pay Auto-Verification Engine
// ====================================================================
function normalizeMobileWalletNumber(method,text) {
  const raw=String(text).replace(/[০-৯]/g,digit=>String(digit.charCodeAt(0)-'০'.charCodeAt(0))).replace(/[\s()-]/g,'');
  const match=raw.match(/^(?:\+?88)?(01[3-9]\d{8,9})$/);
  if(!match)return null;
  const number=match[1];
  return method==='rocket'?(number.length===11||number.length===12?number:null):number.length===11?number:null;
}

async function handleMobileWalletSettingText(env,chatId,text,state) {
  if(String(chatId)!==String(env.ADMIN_ID))return false;
  const match=state.state.match(/^awaiting_setting_(bkash|nagad|rocket)$/);
  if(!match)return false;
  const method=match[1];
  const number=normalizeMobileWalletNumber(method,text);
  if(!number){await sendMsg(env,chatId,method==='rocket'?'Enter the receiving Rocket account number (11 or 12 digits), or /cancel.':'Enter the receiving mobile wallet number (11 digits), or /cancel.');return true;}
  await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(`${method}_num`,number).run();
  await clearAdminState(env,chatId);
  await sendMsg(env,chatId,`${PAYMENT_ICON_LABELS[method]} receive number updated: <code>${number}</code>`,[[{text:'Payment Settings',callback_data:'adm_payment_settings'}]]);
  return true;
}

async function handleBep20SettingText(env, chatId, text, state) {
  if (String(chatId) !== String(env.ADMIN_ID) || state.state !== "awaiting_setting_bep20") return false;
  if (text === "/cancel") { await clearAdminState(env, chatId); await sendMsg(env, chatId, "BEP20 address change cancelled."); return true; }
  const address = text.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address) || /^0x0{40}$/.test(address)) {
    await sendMsg(env, chatId, "Send your BNB Smart Chain USDT receive address (0x + 40 hex characters), or /cancel. Never send a private key or seed phrase.");
    return true;
  }
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('bep20_addr', ?)").bind(address).run();
  await clearAdminState(env, chatId);
  await sendMsg(env, chatId, "✅ BEP20 receive address updated.", [[{ text: "Payment Settings", callback_data: "adm_payment_settings" }]]);
  return true;
}

async function handleBinanceSettingText(env, chatId, text, state) {
  if (String(chatId) !== String(env.ADMIN_ID) || state.state !== "awaiting_setting_binance") return false;
  if (text === "/cancel") {
    await clearAdminState(env, chatId);
    await sendMsg(env, chatId, "Binance Pay ID change cancelled.");
    return true;
  }
  if (!/^\d{5,20}$/.test(text.trim())) {
    await sendMsg(env, chatId, "Send your numeric Binance Pay ID, or /cancel. Do not send an API key or Secret here.");
    return true;
  }
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('binance_id', ?)").bind(text.trim()).run();
  await clearAdminState(env, chatId);
  await sendMsg(env, chatId, "✅ Binance Pay ID updated.", [[{ text: "Payment Settings", callback_data: "adm_payment_settings" }]]);
  return true;
}

function invoiceTimestamp(value) {
  const normalized = String(value || "").replace(" ", "T");
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`);
}

function usdtUnits(value) {
  const text = String(value);
  if (!/^\d+(?:\.\d{1,8})?$/.test(text)) return null;
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, "0"));
}

async function verifyBinancePayOrder(env, transactionId, expectedUsd, invoice = null) {
  try {
    const cleanId = String(transactionId).trim();
    if (!/^[a-zA-Z0-9]{6,64}$/.test(cleanId)) {
      return { success: false, reason: "invalid_format", message: "Enter the exact Binance Pay Transaction ID from your receipt." };
    }
    if ((await getSetting(env, "binance_auto_verify", "1")) !== "1") {
      return { success: false, reason: "manual_approval", message: "Automatic verification is disabled; admin confirmation is required." };
    }
    const apiKey = env.BINANCE_API_KEY;
    const apiSecret = env.BINANCE_API_SECRET;
    if (!apiKey || !apiSecret) return { success: false, reason: "not_configured", message: "Binance verification is not configured. Please contact admin." };
    const createdAt = invoiceTimestamp(invoice?.created_at);
    const now = Date.now();
    if (!invoice || !["order", "deposit"].includes(invoice.type) || invoice.status !== "pending" ||
        !Number.isFinite(createdAt) || createdAt > now || createdAt < now - 7 * 86400000 ||
        !Number.isFinite(expectedUsd) || expectedUsd < 0) {
      return { success: false, reason: "invalid_invoice", message: "This invoice is not payable or is over 7 days old. Please contact admin." };
    }
    const [usedOrder, usedDeposit, claimed] = await Promise.all([
      env.DB.prepare("SELECT id FROM orders WHERE trx_id = ? AND status = 'completed'").bind(cleanId).first(),
      env.DB.prepare("SELECT id FROM deposits WHERE trx_id = ? AND status = 'completed'").bind(cleanId).first(),
      env.DB.prepare("SELECT transaction_id FROM binance_payment_claims WHERE transaction_id = ? OR (invoice_type = ? AND invoice_id = ?)").bind(cleanId, invoice.type, invoice.id).first()
    ]);
    if (usedOrder || usedDeposit || claimed) return { success: false, reason: "already_used", message: "This payment or invoice has already been submitted. Please contact admin if delivery is pending." };

    const params = new URLSearchParams({ startTime: String(createdAt), endTime: String(now), limit: "100", recvWindow: "10000", timestamp: String(now) });
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(params.toString()));
    const signature = Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");
    const response = await fetchWithTimeout(`https://api.binance.com/sapi/v1/pay/transactions?${params}&signature=${signature}`, {
      method: "GET", headers: { "X-MBX-APIKEY": apiKey }
    }, 6000);
    const data = await response.json();
    if (!response.ok || data.success !== true || data.code !== "000000" || !Array.isArray(data.data)) {
      return { success: false, reason: "api_rejected", message: "Binance could not verify payment. Admin should check API Read access, IP restrictions, account eligibility and regional access." };
    }
    const payment = data.data.find(row => typeof row.transactionId === "string" && row.transactionId === cleanId);
    if (!payment) return { success: false, reason: "not_found", message: "Payment not found in recent Binance Pay history. Use the Pay Transaction ID, wait briefly, then retry; contact admin if it persists." };
    // Official Pay history: positive amount = income; negative amount = expenditure.
    const amount = usdtUnits(payment.amount);
    const required = usdtUnits(expectedUsd.toFixed(8));
    if (!["PAY", "C2C"].includes(payment.orderType) || payment.currency !== "USDT" || amount === null || amount <= 0n ||
        !Number.isFinite(payment.transactionTime) || payment.transactionTime < createdAt || payment.transactionTime > now ||
        (payment.status !== undefined && !["SUCCESS", "COMPLETED", "PAID"].includes(payment.status))) {
      return { success: false, reason: "invalid_payment", message: "Payment must be incoming USDT sent after this invoice was created. Outgoing transfers, refunds and rewards are not accepted." };
    }
    if (now - payment.transactionTime > 10 * 60000) return { success: false, reason: "payment_expired", message: "Submit the Order ID within 10 minutes of paying. This payment needs admin review; do not pay again." };
    if (invoice.type === "deposit" && amount > 1000000000n) return { success: false, reason: "amount_high", message: "Binance Pay deposits are limited to $10.00. Contact admin about this payment; use USDT BEP20 for larger deposits." };
    if (required === null || amount < required) return { success: false, reason: "amount_low", message: "The received USDT amount is less than the invoice total." };
    // Database uniqueness serializes concurrent submissions across orders and deposits.
    try {
      await env.DB.prepare("INSERT INTO binance_payment_claims (transaction_id, invoice_type, invoice_id, user_id, amount_usdt) VALUES (?, ?, ?, ?, ?)")
        .bind(cleanId, invoice.type, invoice.id, invoice.user_id, payment.amount).run();
    } catch (_) {
      return { success: false, reason: "claim_failed", message: "This payment could not be reserved. It may already be in use; contact admin." };
    }
    return { success: true, paidAmount: Number(payment.amount), orderId: cleanId };
  } catch (_) {
    // Do not expose signed URLs, headers, account data or credentials in errors.
    return { success: false, reason: "unavailable", message: "Binance verification is temporarily unavailable. No automatic approval was issued. Please retry or contact admin." };
  }
}

// ====================================================================
// Order Completion Helper (Auto-Delivery for API & Local Inventory)
// ====================================================================
async function completeSuccessfulOrder(env, order, trxId, chatId) {
  const orderId = order.id;
  const displayId=orderDisplayId(order);
  const orderQty = order.quantity || 1;
  const dispatchClaim=await env.DB.prepare("UPDATE orders SET status='delivering',trx_id=? WHERE id=? AND status IN ('pending','paid_pending_delivery')").bind(trxId,orderId).run();
  if(!dispatchClaim.meta?.changes)return;

  if (order.is_external === 1) {
    const apiRes = await dispatchExternalOrder(env, order, orderQty, orderId);
    if (!apiRes.success) {
      await env.DB.prepare("UPDATE orders SET status='paid_pending_delivery',provider_error=?,provider_order_id=? WHERE id=? AND status='delivering'").bind(apiRes.message||'Delivery unconfirmed',apiRes.externalOrderId||null,orderId).run();
      if(apiRes.rejected&&order.payment_method==='WALLET'){
        await refundRejectedExternalWalletOrder(env,orderId,chatId);
        await sendMsg(env,chatId,`Provider rejected Order ID ${displayId}. Your wallet payment has been refunded.`);
        await notifyAdminForUser(env,chatId,`⚠️ Wallet Order ID ${displayId} refunded: ${escapeHtml(apiRes.message||'Provider rejection')}`);
        return;
      }
      await sendMsg(env, chatId, `✅ Payment verified for Order ID ${displayId}. Delivery is pending; admin has been notified. Do not pay again.`,[[{text:'Check Delivery',callback_data:`provider_retry_${orderId}`}]]);
      await notifyAdminForUser(env,chatId, `⚠️ Paid Order ID ${displayId}: ${escapeHtml(apiRes.message||'Delivery unconfirmed')}. Check provider history before retrying.`,[[{text:'Delivery Details',callback_data:`adm_delivery_view_${orderId}`}]]);
      return;
    }
    const creds = apiRes.credentials;
    await env.DB.prepare("UPDATE orders SET status = 'completed',delivery_data=? WHERE id = ?").bind(creds,orderId).run();
    if (apiRes.success) {
      await env.DB.prepare("UPDATE products SET api_stock = MAX(0, api_stock - ?) WHERE id = ?").bind(orderQty, order.product_id).run();
    }
    await sendMsg(env, chatId, `🎉 <b>Payment Verified! Your Order is Delivered</b>\n\nOrder ID: ${displayId}\nProduct: <b>${order.product_name}</b>\nQuantity: <b>${orderQty} item(s)</b>\nPayment Method: <b>${order.payment_method}</b>\nTrxID: <code>${trxId}</code>\n\n📄 Your product is delivered as a text document.`, [
      [{ text: "📦 View Orders", callback_data: "my_orders" }],
      [{ text: "🛒 Continue Shopping", callback_data: "shop" }]
    ]);
    await sendOrderDocument(env,chatId,{...order,public_order_id:displayId},creds);
    await notifyAdminForUser(env,chatId, `✅ <b>Order ID ${displayId} Auto-Verified & Delivered via API!</b>\nProduct: <b>${order.product_name}</b>\nMethod: ${order.payment_method}\nTrxID: <code>${trxId}</code>\nAmount: $${order.amount_usd} USD`);
    await processReferralCommission(env, chatId, order.amount_usd, order.product_name);
    return;
  }

  // Local Stock Order
  // Claim local inventory with one atomic write to prevent concurrent double delivery.
  await env.DB.prepare("UPDATE inventory SET is_sold = 1, order_id = ? WHERE id IN (SELECT id FROM inventory WHERE product_id = ? AND is_sold = 0 ORDER BY id LIMIT MAX(0, ? - (SELECT COUNT(*) FROM inventory WHERE order_id = ? AND is_sold = 1)))")
    .bind(orderId, order.product_id, orderQty, orderId).run();
  const { results: items } = await env.DB.prepare("SELECT * FROM inventory WHERE order_id = ? AND is_sold = 1").bind(orderId).all();
  if (items && items.length >= orderQty) {
    await env.DB.prepare("UPDATE orders SET status = 'completed', trx_id = ? WHERE id = ?").bind(trxId, orderId).run();
    const lines = items.map(item => item.item_data);
    await sendMsg(env, chatId, `🎉 <b>Payment Verified! Your Order is Delivered</b>\n\nOrder ID: ${displayId}\nProduct: <b>${order.product_name}</b>\nQuantity: <b>${orderQty} item(s)</b>\nPayment Method: <b>${order.payment_method}</b>\nTrxID: <code>${trxId}</code>\n\n📄 Your product is delivered as a text document.`, [
      [{ text: "📦 View Orders", callback_data: "my_orders" }],
      [{ text: "🛒 Continue Shopping", callback_data: "shop" }]
    ]);
    await sendOrderDocument(env,chatId,order,lines.join('\n\n'));
    await notifyAdminForUser(env,chatId, `✅ <b>Order ID ${displayId} Auto-Verified & Delivered from Stock!</b>\nProduct: <b>${order.product_name}</b>\nMethod: ${order.payment_method}\nTrxID: <code>${trxId}</code>\nAmount: $${order.amount_usd} USD`);
    await processReferralCommission(env, chatId, order.amount_usd, order.product_name);
  } else {
    await env.DB.prepare("UPDATE orders SET status = 'paid_pending_delivery', trx_id = ? WHERE id = ?").bind(trxId, orderId).run();
    await sendMsg(env, chatId, `✅ <b>Payment Verified!</b>\n\nOrder ID: ${displayId}\n⚠️ Local stock is being restocked. Admin has been notified to deliver your order immediately!`);
    await notifyAdminForUser(env,chatId, `🚨 <b>Order ID ${displayId} Verified but Local Stock Insufficient!</b> Please deliver manually.`,[[{text:'Delivery Details',callback_data:`adm_delivery_view_${orderId}`}]]);
  }
}

// ====================================================================
// Wallet Purchase Execution Helper
// ====================================================================
async function executeWalletPurchase(env, chatId, username, prod, qty, totalUsd, rate, messageId) {
  if(!Number.isSafeInteger(qty)||qty<1||!Number.isFinite(totalUsd)||totalUsd<=0||!Number.isFinite(rate)||rate<=0){await sendMsg(env,chatId,'Invalid purchase quantity or amount. No money was deducted.');return;}
  orderStage(env,'wallet.schema');
  await assertOrderWriteCompatible(env);
  const totalBdt = Math.round(totalUsd * rate);

  // External API Product Purchase
  if (prod.is_external === 1) {
    if ((prod.api_stock || 0) < qty) {
      await sendMsg(env, chatId, `📦 Available Stock: <b>0</b>\nThis API product has insufficient stock. Please refresh stock or choose another product.`, [
        [{ text: "🔄 Refresh Stock", callback_data: `prod_refresh_${prod.id}` }]
      ]);
      return;
    }

    orderStage(env,'wallet.reserve');
    const token='WALLET:'+crypto.randomUUID();
    const booked=await env.DB.batch([
      env.DB.prepare("INSERT INTO orders(user_id,username,product_id,quantity,payment_method,trx_id,amount_usd,amount_bdt,amount,product_name,currency,created_at,status) SELECT user_id,?,?,?,'WALLET',?,?,?,?,?,'USD',CURRENT_TIMESTAMP,'paid_pending_delivery' FROM users WHERE user_id=? AND COALESCE(is_blocked,0)=0 AND balance_usd>=?").bind(username,prod.id,qty,token,totalUsd,totalBdt,totalUsd,prod.name,chatId,totalUsd),
      env.DB.prepare(walletChangeSql("UPDATE users SET balance_usd=balance_usd-?,balance_bdt=balance_bdt-?,total_spent_usd=total_spent_usd+? WHERE user_id=? AND EXISTS(SELECT 1 FROM orders WHERE trx_id=? AND user_id=? AND status='paid_pending_delivery')",'purchase','wallet:'+token)).bind(totalUsd,totalBdt,totalUsd,chatId,token,chatId)
    ]);
    if(!booked[0].meta?.changes){await sendMsg(env,chatId,'Insufficient wallet balance. No money was deducted.');return;}
    const orderId=booked[0].meta.last_row_id;
    const displayId=await getPublicOrderId(env,orderId);

    orderStage(env,'provider.order',orderId);
    const apiResult = await dispatchExternalOrder(env, prod, qty, orderId);
    orderStage(env,'provider.result',orderId);
    if(!apiResult.success){
      await env.DB.prepare('UPDATE orders SET provider_error=?,provider_order_id=? WHERE id=?').bind(apiResult.message||'Delivery unconfirmed',apiResult.externalOrderId||null,orderId).run();
      if(apiResult.rejected){
        await refundRejectedExternalWalletOrder(env,orderId,chatId);
        await sendMsg(env,chatId,`Order ID ${displayId} was rejected by the provider. Your wallet payment has been refunded. Please contact admin before retrying.`);
        await notifyAdminForUser(env,chatId,`⚠️ Provider rejected wallet Order ID ${displayId}: ${escapeHtml(apiResult.message)}. Customer wallet refunded. Check the provider API configuration.`);
      }else{
        await sendMsg(env,chatId,`Payment recorded for Order ID ${displayId}. Provider delivery is unconfirmed; admin has been notified. Do not pay again.`,[[{text:'Check Delivery',callback_data:`provider_retry_${orderId}`}]]);
        await notifyAdminForUser(env,chatId,`⚠️ Wallet Order ID ${displayId}: ${escapeHtml(apiResult.message||'Delivery unconfirmed')}. Check provider history before retrying; no automatic refund because the provider may have accepted the order.`);
      }
      return;
    }
    const creds=apiResult.credentials;
    await env.DB.prepare("UPDATE orders SET status='completed',delivery_data=? WHERE id=?").bind(creds,orderId).run();
    await env.DB.prepare("UPDATE products SET api_stock = MAX(0, api_stock - ?) WHERE id = ?").bind(qty, prod.id).run();

    await editMsg(env, chatId, messageId, `🎉 <b>Purchase Successful! Instant Delivery</b>\n\nOrder ID: ${displayId}\nProduct: <b>${productDisplayName(prod)}</b>\nQuantity: <b>${qty} item(s)</b>\nTotal Paid: <b>$${totalUsd.toFixed(2)} USD</b>\n\n📄 Your product is delivered as a text document.`, [
      [{ text: "📦 View Orders", callback_data: "my_orders" }],
      [{ text: "🛒 Continue Shopping", callback_data: "shop" }]
    ]);
    await sendOrderDocument(env,chatId,{id:orderId,public_order_id:displayId,product_name:prod.name,quantity:qty},creds);
    await notifyAdminForUser(env,chatId,`✅ Wallet Order ID ${displayId} delivered. Customer: <code>${chatId}</code> · $${totalUsd.toFixed(2)} USD · ${escapeHtml(prod.name)}`);
  await processReferralCommission(env, chatId, totalUsd, prod.name);
    return;
  }

  // Local Stock Purchase
  const { results: items } = await env.DB.prepare("SELECT * FROM inventory WHERE product_id = ? AND is_sold = 0 LIMIT ?").bind(prod.id, qty).all();
  if (!items || items.length < qty) {
    await sendMsg(env, chatId, `❌ <b>Insufficient Stock!</b>\nOnly ${items ? items.length : 0} item(s) available. You can pre-order!`, [
      [{ text: "⏳ Pre-Order Now", callback_data: `preorder_${prod.id}` }]
    ]);
    return;
  }

  const token='WALLET:'+crypto.randomUUID();
  const localBooking=await env.DB.batch([
    env.DB.prepare("INSERT INTO orders(user_id,username,product_id,quantity,payment_method,trx_id,amount_usd,amount_bdt,amount,product_name,currency,created_at,status) SELECT user_id,?,?,?,'WALLET',?,?,?,?,?,'USD',CURRENT_TIMESTAMP,'completed' FROM users WHERE user_id=? AND COALESCE(is_blocked,0)=0 AND balance_usd>=? AND (SELECT COUNT(*) FROM inventory WHERE product_id=? AND is_sold=0)>=?").bind(username,prod.id,qty,token,totalUsd,totalBdt,totalUsd,prod.name,chatId,totalUsd,prod.id,qty),
    env.DB.prepare(walletChangeSql("UPDATE users SET balance_usd=balance_usd-?,balance_bdt=balance_bdt-?,total_spent_usd=total_spent_usd+? WHERE user_id=? AND EXISTS(SELECT 1 FROM orders WHERE trx_id=? AND user_id=? AND status='completed')",'purchase','wallet:'+token)).bind(totalUsd,totalBdt,totalUsd,chatId,token,chatId),
    env.DB.prepare("UPDATE inventory SET is_sold=1,order_id=(SELECT id FROM orders WHERE trx_id=?) WHERE id IN (SELECT id FROM inventory WHERE product_id=? AND is_sold=0 ORDER BY id LIMIT ?) AND EXISTS(SELECT 1 FROM orders WHERE trx_id=? AND user_id=? AND status='completed')").bind(token,prod.id,qty,token,chatId)
  ]);
  if(!localBooking[0].meta?.changes){await sendMsg(env,chatId,'Stock or wallet balance changed. No money was deducted. Refresh the product before trying again.');return;}
  const orderId=localBooking[0].meta.last_row_id;
  const displayId=await getPublicOrderId(env,orderId);
  const {results:allocated}=await env.DB.prepare('SELECT item_data FROM inventory WHERE order_id=? AND is_sold=1 ORDER BY id').bind(orderId).all();

  await editMsg(env, chatId, messageId, `🎉 <b>Purchase Successful! Instant Delivery</b>\n\nOrder ID: ${displayId}\nProduct: <b>${productDisplayName(prod)}</b>\nQuantity: <b>${qty} item(s)</b>\nTotal Paid: <b>$${totalUsd.toFixed(2)} USD</b>\n\n📄 Your product is delivered as a text document.`, [
    [{ text: "📦 View Orders", callback_data: "my_orders" }],
    [{ text: "🛒 Continue Shopping", callback_data: "shop" }]
  ]);
  await sendOrderDocument(env,chatId,{id:orderId,public_order_id:displayId,product_name:prod.name,quantity:qty},allocated.map(it=>it.item_data).join('\n\n'));
  await notifyAdminForUser(env,chatId,`✅ Wallet Order ID ${displayId} delivered. Customer: <code>${chatId}</code> · $${totalUsd.toFixed(2)} USD · ${escapeHtml(prod.name)}`);
  await processReferralCommission(env, chatId, totalUsd, prod.name);
}

const PAYMENT_ICON_METHODS = ['binance','bep20','bkash','nagad','rocket','redeem'];
const PAYMENT_ICON_LABELS = {binance:'Binance Pay',bep20:'BEP20 USDT',bkash:'bKash',nagad:'Nagad',rocket:'Rocket',redeem:'Redeem Code'};

async function loadPaymentIcons(env,methods=PAYMENT_ICON_METHODS) {
  const keys=methods.map(method=>`payment_icon_${method}`);
  const {results}=await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (${keys.map(()=>'?').join(',')})`).bind(...keys).all();
  const values=new Map(results.map(row=>[row.key,row.value]));
  const ids=new Map(methods.map(method=>[method,values.get(`payment_icon_${method}`)]));
  return (method,label,callbackData)=>{
    const id=ids.get(method);
    return {text:label,callback_data:callbackData,...(typeof id==='string'&&/^\d{15,22}$/.test(id)?{icon_custom_emoji_id:id}:{})};
  };
}

async function showPaymentIcons(env,chatId,messageId=null) {
  const button=await loadPaymentIcons(env);
  const keyboard=PAYMENT_ICON_METHODS.map(method=>[button(method,PAYMENT_ICON_LABELS[method],`adm_payicon_${method}`)]);
  keyboard.push([{text:'Back to Payment Settings',callback_data:'adm_payment_settings'}]);
  const text='<b>Payment Custom Emojis</b>\n\nChoose a method to set its Telegram Custom Emoji ID. No default emoji is added.';
  return messageId?await editMsg(env,chatId,messageId,text,keyboard):await sendMsg(env,chatId,text,keyboard);
}

async function handlePaymentIconText(env,chatId,text,state,message) {
  if(String(chatId)!==String(env.ADMIN_ID)||state.state!=='awaiting_payment_icon')return false;
  const method=state.data;
  if(!PAYMENT_ICON_METHODS.includes(method)){await clearAdminState(env,chatId);return true;}
  const custom=message.entities?.find(entity=>entity.type==='custom_emoji');
  const id=text.trim()==='/remove'?'':custom?.custom_emoji_id||text.trim();
  if(id!==''&&!/^\d{15,22}$/.test(id)){
    await sendMsg(env,chatId,'Send a Telegram custom emoji or its numeric Custom Emoji ID. Photos and ordinary emoji cannot be used here. Send /remove to clear the icon, or /cancel.');
    return true;
  }
  if(id!==''){
    const checked=await callTg(env,'getCustomEmojiStickers',{custom_emoji_ids:[id]});
    if(!checked.ok||!Array.isArray(checked.result)||!checked.result.some(sticker=>sticker.custom_emoji_id===id)){
      await sendMsg(env,chatId,'Telegram could not validate this Custom Emoji ID. Send the actual custom emoji or a valid ID, or use /remove.');return true;
    }
  }
  await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(`payment_icon_${method}`,id).run();
  await clearAdminState(env,chatId);
  await sendMsg(env,chatId,id?'Custom emoji saved.':'Custom emoji removed.');
  await showPaymentIcons(env,chatId);
  return true;
}

function redeemAmountCents(text) {
  const value=String(text).trim().replace(/^\$/, '');
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole,fraction='']=value.split('.');
  const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  return Number.isSafeInteger(cents)&&cents>0&&cents<=100000000 ? cents : null;
}

function normalizeRedeemCode(text) {
  let value=String(text).trim();
  if (/^https?:\/\//i.test(value)) {
    try {
      const url=new URL(value);
      if (!['t.me','telegram.me'].includes(url.hostname)) return null;
      value=url.searchParams.get('start')||'';
    } catch (_) {return null;}
  }
  value=value.replace(/^redeem_/i,'').toUpperCase();
  return /^RDM-[A-F0-9]{32}$/.test(value)?value:null;
}

async function redeemCodeHash(code) {
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code));
  return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}

async function createRedeemCode(env,chatId,amountCents) {
  if (String(chatId)!==String(env.ADMIN_ID)) throw new Error('Admin access required');
  if (!Number.isSafeInteger(amountCents)||amountCents<=0||amountCents>100000000) throw new Error('Invalid redeem amount');
  for (let attempt=0;attempt<3;attempt++) {
    const bytes=crypto.getRandomValues(new Uint8Array(16));
    const code='RDM-'+Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join('').toUpperCase();
    const hash=await redeemCodeHash(code);
    const result=await env.DB.prepare('INSERT OR IGNORE INTO redeem_codes (code_hash, amount_cents, created_by) VALUES (?, ?, ?)').bind(hash,amountCents,chatId).run();
    if (result.meta.changes===1) return code;
  }
  throw new Error('Could not generate a unique code');
}

async function handleRedeemAdminText(env,chatId,text,state) {
  if (String(chatId)!==String(env.ADMIN_ID)||state.state!=='awaiting_redeem_amount') return false;
  if (text.startsWith('/')) {await clearAdminState(env,chatId);await sendAdminDashboard(env,chatId);return true;}
  const cents=redeemAmountCents(text);
  if (cents===null) {await sendMsg(env,chatId,'Enter a USD amount from $0.01 to $1,000,000 with up to 2 decimal places (e.g. 5 or 10.50). Send /cancel to cancel.');return true;}
  let code;
  try {code=await createRedeemCode(env,chatId,cents);} catch (_) {await sendMsg(env,chatId,'Code could not be created. Please retry.');return true;}
  await clearAdminState(env,chatId);
  let username=env.BOT_USERNAME;
  if (!username) {const me=await callTg(env,'getMe',{});if(me.ok)username=me.result?.username;}
  if (typeof username==='string') username=username.replace(/^@/,'');
  const link=typeof username==='string'&&/^[A-Za-z0-9_]+$/.test(username)?`https://t.me/${username}?start=redeem_${code}`:null;
  const buttons=[[{text:'📋 Copy Code',copy_text:{text:code}}]];
  if(link)buttons.push([{text:'🔗 Copy Redeem Link',copy_text:{text:link}}]);
  buttons.push([{text:'➕ Generate Another',callback_data:'adm_redeem_generate'},{text:'🔙 Admin Panel',callback_data:'admin_panel'}]);
  await sendMsg(env,chatId,`🎁 <b>Redeem Code Created</b>\n\nAmount: <b>$${(cents/100).toFixed(2)} USD</b>\nCode: <code>${code}</code>${link?`\n\nRedeem link:\n${link}`:''}\n\n<i>Active immediately, no expiry. It can be redeemed once only. Save and share the code privately; anyone holding it can redeem the balance.</i>`,buttons);
  return true;
}

async function redeemWalletCode(env,chatId,text) {
  try {
    const code=normalizeRedeemCode(text);
    if (!code) return {success:false,message:'Invalid code. Paste the full redeem code or redeem link.'};
    const hash=await redeemCodeHash(code);
    const [voucher,rawRate]=await Promise.all([
      env.DB.prepare('SELECT amount_cents, redeemed_by FROM redeem_codes WHERE code_hash = ?').bind(hash).first(),
      getSetting(env,'usd_to_bdt_rate','125')
    ]);
    if (!voucher) return {success:false,message:'Redeem code not found. Please check the code.'};
    if (voucher.redeemed_by!==null) return {success:false,message:'This redeem code has already been used.'};
    const rate=Number(rawRate);
    if (!Number.isFinite(rate)||rate<=0) return {success:false,message:'Wallet exchange rate is unavailable. Please contact admin.'};
    const token=crypto.randomUUID();
    const proof='EXISTS (SELECT 1 FROM redeem_codes WHERE code_hash = ? AND redemption_token = ? AND redeemed_by = ?)';
    let results;
    try {
      results=await env.DB.batch([
        env.DB.prepare("UPDATE redeem_codes SET redeemed_by = ?, redeemed_at = CURRENT_TIMESTAMP, redemption_token = ?, redeemed_bdt = ROUND(amount_cents / 100.0 * ?) WHERE code_hash = ? AND redeemed_by IS NULL AND EXISTS (SELECT 1 FROM users WHERE user_id = ?)").bind(chatId,token,rate,hash,chatId),
        env.DB.prepare(walletChangeSql(`UPDATE users SET balance_usd = balance_usd + (SELECT amount_cents / 100.0 FROM redeem_codes WHERE code_hash = ? AND redemption_token = ?), balance_bdt = balance_bdt + (SELECT redeemed_bdt FROM redeem_codes WHERE code_hash = ? AND redemption_token = ?) WHERE user_id = ? AND ${proof}`,'redeem','redeem')).bind(hash,token,hash,token,chatId,hash,token,chatId),
        env.DB.prepare("INSERT INTO deposits (user_id, username, method, amount_usd, amount_bdt, trx_id, status) SELECT users.user_id, users.username, 'REDEEM', redeem_codes.amount_cents / 100.0, redeem_codes.redeemed_bdt, ?, 'completed' FROM users JOIN redeem_codes ON redeem_codes.redeemed_by = users.user_id WHERE users.user_id = ? AND redeem_codes.code_hash = ? AND redeem_codes.redemption_token = ?").bind(`REDEEM:${hash}`,chatId,hash,token)
      ]);
    } catch (_) {return {success:false,message:'Redemption could not be completed. Your code was not consumed if the transaction failed. Please retry or contact admin.'};}
    if (results[0].meta.changes!==1) return {success:false,message:'This code has already been redeemed or your account is unavailable.'};
    return {success:true,amountUsd:voucher.amount_cents/100};
  } catch (_) { return {success:false,message:'Redemption is temporarily unavailable. Please retry or contact admin.'}; }

}

async function submitRedeemCode(env,chatId,text,sessionData = null) {
  const result=await redeemWalletCode(env,chatId,text);
  if (!result.success) {await sendMsg(env,chatId,`⚠️ ${result.message}`,[[{text:'❌ Cancel',callback_data:'redeem_cancel'}]]);return;}
  if(sessionData !== null) await env.DB.prepare("DELETE FROM user_states WHERE user_id = ? AND state = 'awaiting_redeem_code' AND data = ?").bind(chatId,sessionData).run().catch(()=>{});
  const user=await env.DB.prepare('SELECT balance_usd FROM users WHERE user_id = ?').bind(chatId).first().catch(()=>null);
  await notifyAdminForUser(env,chatId,`✅ Redeem deposit credited $${result.amountUsd.toFixed(2)} USD. User: <code>${chatId}</code>`);
  await sendMsg(env,chatId,`🎁 <b>Redeem Successful!</b>\n\nAdded: <b>$${result.amountUsd.toFixed(2)} USD</b>${user?`\nWallet balance: <b>$${Number(user.balance_usd).toFixed(2)} USD</b>`:''}`,[[{text:'🛍️ Open Shop',callback_data:'shop'},{text:'💳 Deposit',callback_data:'deposit'}]]);
}

async function handleRedeemInput(env,chatId,text,state) {
  if (state?.state!=='awaiting_redeem_code') return false;
  if (text.startsWith('/')) {
    await clearBinanceInput(env,chatId);
    if(text==='/cancel'){await sendDeposit(env,chatId);return true;}
    return false;
  }
  await submitRedeemCode(env,chatId,text,state.data);
  return true;
}

// ====================================================================
// Deposit Instructions Renderer
// ====================================================================
const BINANCE_DEPOSIT_MAX = 10;

async function clearBinanceInput(env, chatId) {
  await env.DB.prepare("DELETE FROM user_states WHERE user_id = ? AND state IN ('awaiting_binance_amount', 'awaiting_binance_receipt', 'awaiting_bep20_amount', 'awaiting_bep20_hash', 'awaiting_redeem_code', 'awaiting_manual_deposit_amount', 'awaiting_mobile_receipt')").bind(chatId).run();
}

const DEPOSIT_PRESETS = [5,10,15,20,30,50];
const DEPOSIT_AMOUNT_METHODS = ['binance','bep20','bkash','nagad','rocket'];

async function showDepositAmounts(env,chatId,method,messageId=null,custom=false) {
  if(!DEPOSIT_AMOUNT_METHODS.includes(method))return;
  const state=method==='binance'?'awaiting_binance_amount':method==='bep20'?'awaiting_bep20_amount':'awaiting_manual_deposit_amount';
  await env.DB.prepare('INSERT OR REPLACE INTO user_states (user_id, state, data) VALUES (?, ?, ?)').bind(chatId,state,JSON.stringify({method})).run();
  const currency=['binance','bep20'].includes(method)?'USDT':'USD';
  const text=`<b>${PAYMENT_ICON_LABELS[method]} Deposit</b>\n\nHow much ${currency} would you like to deposit?\n\n${custom?'Type your custom amount in chat (e.g. 12.50).':'Choose an amount below, or select Custom Amount.'}${method==='binance'?'\n\n<i>Binance Pay supports deposits up to $10. Use BEP20 for larger amounts.</i>':''}`;
  const buttons=custom?[]:[
    DEPOSIT_PRESETS.slice(0,3).map(amount=>({text:`$${amount}`,callback_data:`dep_amount_${method}_${amount}`})),
    DEPOSIT_PRESETS.slice(3).map(amount=>({text:`$${amount}`,callback_data:`dep_amount_${method}_${amount}`})),
    [{text:'Custom Amount',callback_data:`dep_custom_${method}`}]
  ];
  buttons.push([{text:'Back',callback_data:custom?`dep_method_${method}`:'deposit'}]);
  return messageId?await editMsg(env,chatId,messageId,text,buttons):await sendMsg(env,chatId,text,buttons);
}

async function handleManualDepositAmount(env,chatId,username,text,state) {
  if(state?.state!=='awaiting_manual_deposit_amount')return false;
  if(text.startsWith('/')){await clearBinanceInput(env,chatId);return false;}
  let method;try{method=JSON.parse(state.data).method;}catch(_){await clearBinanceInput(env,chatId);return true;}
  if(!['bkash','nagad','rocket'].includes(method)){await clearBinanceInput(env,chatId);return true;}
  const amount=Number(text);
  if(!/^\d+(?:\.\d{1,2})?$/.test(text)||!Number.isFinite(amount)||amount<=0){await sendMsg(env,chatId,'Enter a positive USD amount with up to two decimal places, e.g. 5 or 12.50.');return true;}
  await clearBinanceInput(env,chatId);
  await renderDepositInstructions(env,chatId,username,method,amount);
  return true;
}

async function showBinanceInstructions(env, chatId, type, invoice, messageId = null) {
  const payId = String(await getSetting(env, "binance_id", ""));
  const text = `💳 <b>Binance Pay</b>\n\nSend <b>$${Number(invoice.amount_usd).toFixed(2)} USDT</b> to this Pay ID:\n<blockquote><code>${escapeHtml(payId)}</code></blockquote>\nThen tap <b>Enter Order ID</b> and paste the Order ID from your Binance Pay receipt.\n\n<i>Submit the Order ID within 10 minutes of paying.</i>`;
  const keyboard = [
    [{ text: "📋 Copy Pay ID", copy_text: { text: payId } }, { text: "⚡ Enter Order ID", callback_data: `binance_enter_${type}_${invoice.id}` }],
    [{ text: "⏪ Back", callback_data: type === "deposit" ? "deposit" : `prod_${invoice.product_id}` }]
  ];
  if (messageId) return await editMsg(env, chatId, messageId, text, keyboard);
  return await sendMsg(env, chatId, text, keyboard);
}

async function startBinanceDeposit(env, chatId, username, amount = 0, messageId = null) {
  await clearBinanceInput(env, chatId);
  if (!Number.isFinite(amount) || amount < 0 || amount > BINANCE_DEPOSIT_MAX) {
    const text = "❌ <b>Sorry!</b>\n\nBinance Pay supports deposits up to <b>$10.00</b> only.\nFor deposits above $10.00, please use <b>USDT (BEP20)</b>.";
    const paymentButton=await loadPaymentIcons(env,['bep20']);
    const buttons = [[paymentButton('bep20','Use USDT BEP20',`dep_setmeth_bep20_${Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : "0"}`)], [{ text: "⏪ Back", callback_data: "deposit" }]];
    return messageId ? await editMsg(env, chatId, messageId, text, buttons) : await sendMsg(env, chatId, text, buttons);
  }
  if (amount === 0) return await showDepositAmounts(env,chatId,'binance',messageId);
  const result = await env.DB.prepare("INSERT INTO deposits (user_id, username, method, amount_usd, status) VALUES (?, ?, 'BINANCE', ?, 'pending')").bind(chatId, username, amount).run();
  if (!result.meta?.last_row_id) throw new Error("Could not create Binance deposit invoice.");
  return await showBinanceInstructions(env, chatId, "deposit", { id: result.meta.last_row_id, amount_usd: amount }, messageId);
}

async function submitBinancePayment(env, chatId, type, invoice, receiptId) {
  if (!invoice || String(invoice.user_id) !== String(chatId) || invoice.status !== "pending" ||
      String(type === "order" ? invoice.payment_method : invoice.method).toUpperCase() !== "BINANCE") {
    await sendMsg(env, chatId, "This invoice is not payable by this account.");
    return;
  }
  await sendMsg(env, chatId, "🔍 Verifying your Binance Pay payment…");
  const result = await verifyBinancePayOrder(env, receiptId, invoice.amount_usd || 0, { ...invoice, type });
  await recordPaymentVerification(env,type,invoice.id,chatId,'BINANCE',receiptId,result.success?'verified':result.reason);
  if (!result.success) {
    await sendMsg(env, chatId, `⚠️ ${escapeHtml(result.message)}`, [[{ text: "❌ Cancel", callback_data: "binance_cancel" }]]);
    return;
  }
  if (type === "order") {
    await completeSuccessfulOrder(env, invoice, result.orderId, chatId);
  } else {
    const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
    const bdt = Math.round(result.paidAmount * rate);
    const settled=await env.DB.batch([
      env.DB.prepare(walletChangeSql("UPDATE users SET balance_usd = balance_usd + ?, balance_bdt = balance_bdt + ? WHERE user_id = ? AND EXISTS(SELECT 1 FROM deposits WHERE id=? AND user_id=? AND status='pending')",'deposit','deposit:'+invoice.id)).bind(result.paidAmount,bdt,chatId,invoice.id,chatId),
      env.DB.prepare("UPDATE deposits SET amount_usd = ?, amount_bdt = ?, trx_id = ?, status = 'completed' WHERE id = ? AND user_id=? AND status='pending'").bind(result.paidAmount,bdt,result.orderId,invoice.id,chatId)
    ]);
    if(!settled[0].meta?.changes){await sendMsg(env,chatId,'This deposit was already processed. No extra balance was added.');return;}
    await sendMsg(env, chatId, `✅ <b>Binance deposit verified!</b>\n\nWallet credited: <b>$${result.paidAmount.toFixed(2)} USDT</b>`, [[{ text: "🛍️ Open Shop", callback_data: "shop" }]]);
    await notifyAdminForUser(env,chatId, `✅ Binance deposit #${invoice.id} credited: $${result.paidAmount.toFixed(2)} USDT. User: ${chatId}`);
  }
  const stateData = JSON.stringify({ type, id: invoice.id });
  await env.DB.prepare("DELETE FROM user_states WHERE user_id = ? AND state = 'awaiting_binance_receipt' AND data = ?").bind(chatId, stateData).run();
}

async function handleBinanceInput(env, chatId, username, text, state) {
  if (!["awaiting_binance_amount", "awaiting_binance_receipt"].includes(state?.state)) return false;
  if (text.startsWith("/")) { await clearBinanceInput(env, chatId); return text === "/cancel" ? (await sendMsg(env, chatId, "Cancelled."), true) : false; }
  if (state.state === "awaiting_binance_amount") {
    if (!/^\d+(?:\.\d{1,2})?$/.test(text) || Number(text) <= 0) {
      await sendMsg(env, chatId, "Enter a positive USDT amount with up to 2 decimal places (e.g. 5 or 5.50).", [[{ text: "❌ Cancel", callback_data: "binance_cancel" }]]);
      return true;
    }
    await startBinanceDeposit(env, chatId, username, Number(text));
    return true;
  }
  const data = JSON.parse(state.data);
  if (!["order", "deposit"].includes(data.type)) { await clearBinanceInput(env, chatId); return true; }
  const invoice = data.type === "order"
    ? await env.DB.prepare("SELECT o.*, p.name as product_name, p.is_external, p.external_id FROM orders o JOIN products p ON o.product_id = p.id WHERE o.id = ?").bind(data.id).first()
    : await env.DB.prepare("SELECT * FROM deposits WHERE id = ?").bind(data.id).first();
  await submitBinancePayment(env, chatId, data.type, invoice, text);
  return true;
}

async function showBep20Instructions(env, chatId, type, invoice, messageId = null) {
  const address = String(invoice.bep20_wallet || await getSetting(env, 'bep20_addr', '')).trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address) || /^0x0{40}$/.test(address)) {
    await sendMsg(env,chatId,'BEP20 payment address is not configured. Please contact admin before sending funds.');
    return;
  }
  const table=type==='order'?'orders':'deposits';
  const saved=await env.DB.prepare(`UPDATE ${table} SET bep20_wallet = ? WHERE id = ? AND user_id = ? AND status = 'pending'`).bind(address,invoice.id,chatId).run();
  if (saved.meta.changes!==1) { await sendMsg(env,chatId,'This invoice is not payable.');return; }
  const text=`💵 <b>USDT BEP20 ${type==='order'?'Payment':'Deposit'}</b>\nNetwork: <b>BNB Smart Chain (BEP20)</b>\n\nSend <b>${Number(invoice.amount_usd).toFixed(2)} USDT</b> to:\n<blockquote><code>${escapeHtml(address)}</code></blockquote>\nAfter paying, tap <b>Enter TxHash</b> and paste the blockchain transaction hash from your receipt.\n\n<i>Submit the TxHash within 10 minutes of paying. Verification requires 12 confirmations. Cover withdrawal fees so the required USDT amount reaches this address. Use a TxHash, not a Binance Pay Order ID.</i>`;
  const buttons=[
    [{text:'📋 Copy Wallet Address',copy_text:{text:address}},{text:'⚡ Enter TxHash',callback_data:`bep20_enter_${type}_${invoice.id}`}],
    [{text:'⏪ Back',callback_data:type==='order'?`prod_${invoice.product_id}`:'deposit'}]
  ];
  return messageId ? await editMsg(env,chatId,messageId,text,buttons) : await sendMsg(env,chatId,text,buttons);
}

async function startBep20Deposit(env, chatId, username, amount = 0, messageId = null) {
  await clearBinanceInput(env,chatId);
  if (!Number.isFinite(amount) || amount<0) {await sendMsg(env,chatId,'Enter a positive USDT amount.');return;}
  if (amount===0) return await showDepositAmounts(env,chatId,'bep20',messageId);
  const address=String(await getSetting(env,'bep20_addr','')).trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(address) || /^0x0{40}$/.test(address)) {await sendMsg(env,chatId,'Admin must configure the BEP20 receive address before you deposit.');return;}
  const result=await env.DB.prepare("INSERT INTO deposits (user_id, username, method, amount_usd, bep20_wallet, status) VALUES (?, ?, 'BEP20', ?, ?, 'pending')").bind(chatId,username,amount,address).run();
  if (!result.meta?.last_row_id) throw new Error('Could not create BEP20 deposit invoice.');
  return await showBep20Instructions(env,chatId,'deposit',{id:result.meta.last_row_id,amount_usd:amount,bep20_wallet:address},messageId);
}

async function submitBep20Payment(env, chatId, type, invoice, txHash) {
  if (!invoice || String(invoice.user_id)!==String(chatId) || invoice.status!=='pending' || String(type==='order'?invoice.payment_method:invoice.method).toUpperCase()!=='BEP20') {
    await sendMsg(env,chatId,'This invoice is not payable by this account.');return;
  }
  await sendMsg(env,chatId,'🔍 Verifying the BEP20 USDT transfer…');
  const result=await verifyBscUsdtTx(env,txHash,invoice.amount_usd||0,{...invoice,type});
  await recordPaymentVerification(env,type,invoice.id,chatId,'BEP20',txHash,result.success?'verified':result.reason);
  if (!result.success) {
    await sendMsg(env,chatId,`⚠️ ${escapeHtml(result.message)}`,[[{text:'❌ Cancel',callback_data:'bep20_cancel'}]]);return;
  }
  if (type==='order') {
    const reserved=await env.DB.prepare("UPDATE orders SET status = 'paid_pending_delivery', trx_id = ? WHERE id = ? AND user_id = ? AND status = 'pending'").bind(result.txHash,invoice.id,chatId).run();
    if (reserved.meta.changes!==1) {await sendMsg(env,chatId,'This order has already been processed. Contact admin if delivery is pending.');return;}
    await completeSuccessfulOrder(env,invoice,result.txHash,chatId);
  } else {
    const bdt=Math.round(result.paidAmount*parseFloat(await getSetting(env,'usd_to_bdt_rate','125')));
    const settled=await env.DB.batch([
      env.DB.prepare(walletChangeSql("UPDATE users SET balance_usd = balance_usd + ?, balance_bdt = balance_bdt + ? WHERE user_id = ? AND EXISTS (SELECT 1 FROM deposits WHERE id = ? AND user_id = ? AND status = 'pending')",'deposit','deposit:'+invoice.id)).bind(result.paidAmount,bdt,chatId,invoice.id,chatId),
      env.DB.prepare("UPDATE deposits SET amount_usd = ?, amount_bdt = ?, trx_id = ?, status = 'completed' WHERE id = ? AND user_id = ? AND status = 'pending'").bind(result.paidAmount,bdt,result.txHash,invoice.id,chatId)
    ]);
    if (settled[0].meta.changes!==1) {await sendMsg(env,chatId,'This deposit has already been processed. Contact admin if the balance is incorrect.');return;}
    await sendMsg(env,chatId,`✅ <b>BEP20 deposit verified!</b>\n\n<b>${result.paidAmount.toFixed(2)} USDT</b> added to your wallet.`,[[{text:'🛍️ Open Shop',callback_data:'shop'}]]);
    await notifyAdminForUser(env,chatId,`✅ BEP20 deposit #${invoice.id}: ${result.paidAmount.toFixed(2)} USDT credited to user ${chatId}.`);
  }
  await env.DB.prepare("DELETE FROM user_states WHERE user_id = ? AND state = 'awaiting_bep20_hash' AND data = ?").bind(chatId,JSON.stringify({type,id:invoice.id})).run();
}

async function handleBep20Input(env,chatId,username,text,state) {
  if (!['awaiting_bep20_amount','awaiting_bep20_hash'].includes(state?.state)) return false;
  if (text.startsWith('/')) {
    await clearBinanceInput(env,chatId);
    if(text==='/cancel'){await sendMsg(env,chatId,'Cancelled.');return true;}
    return false;
  }
  if (state.state==='awaiting_bep20_amount') {
    if (!/^\d+(?:\.\d{1,2})?$/.test(text) || !Number.isFinite(Number(text)) || Number(text)<=0) {await sendMsg(env,chatId,'Enter a positive USDT amount with up to two decimal places, e.g. 50 or 50.01.');return true;}
    await startBep20Deposit(env,chatId,username,Number(text));return true;
  }
  const data=JSON.parse(state.data);
  if (!['order','deposit'].includes(data.type)) {await clearBinanceInput(env,chatId);return true;}
  const invoice=data.type==='order'
    ? await env.DB.prepare('SELECT o.*, p.name as product_name, p.is_external, p.external_id FROM orders o JOIN products p ON o.product_id = p.id WHERE o.id = ?').bind(data.id).first()
    : await env.DB.prepare('SELECT * FROM deposits WHERE id = ?').bind(data.id).first();
  await submitBep20Payment(env,chatId,data.type,invoice,text);
  return true;
}

async function renderDepositInstructions(env, chatId, username, method, neededAmount, messageId) {
  if(!DEPOSIT_AMOUNT_METHODS.includes(method)||!Number.isFinite(neededAmount)||neededAmount<0||!/^\d+(?:\.\d{1,2})?$/.test(String(neededAmount))){await sendMsg(env,chatId,'Invalid deposit method or amount. Please select a payment method again.');return;}
  if(neededAmount===0 && DEPOSIT_AMOUNT_METHODS.includes(method))return await showDepositAmounts(env,chatId,method,messageId);
  if (method === "bep20") return await startBep20Deposit(env, chatId, username, neededAmount, messageId);
  if (method === "binance") return await startBinanceDeposit(env, chatId, username, neededAmount, messageId);
  let mTitle = "bKash Personal";
  let accNum = await getSetting(env, "bkash_num", "017XXXXXXXX");
  let promptDetails = ["bkash","nagad"].includes(method)?"Send the exact BDT amount within <b>60 minutes</b>, then tap <b>Enter Transaction ID</b>. Verification uses the receiving phone’s payment SMS. Do not send your PIN or OTP.":"Send payment and <b>REPLY to this message</b> with your <b>Transaction ID within 60 minutes</b>.";

  if (method === "nagad") {
    mTitle = "Nagad Personal";
    accNum = await getSetting(env, "nagad_num", "017XXXXXXXX");
  } else if (method === "rocket") {
    mTitle = "Rocket Personal · Admin Verification";
    accNum = await getSetting(env, "rocket_num", "017XXXXXXXX");
    promptDetails="Rocket currently requires <b>admin verification</b>. "+promptDetails;
  }

  const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
  const bdt=Math.round(neededAmount*rate);
  if(!Number.isFinite(bdt)||bdt<=0){await sendMsg(env,chatId,'Payment amount is unavailable. Contact admin.');return;}
  const res = await env.DB.prepare("INSERT INTO deposits (user_id, username, method, amount_usd, amount_bdt, status) VALUES (?, ?, ?, ?, ?, 'pending')").bind(chatId, username, method.toUpperCase(), neededAmount, bdt).run();
  const depId = res.meta?.last_row_id;
  if(!depId)throw new Error('Deposit invoice creation failed');
  if(['bkash','nagad'].includes(method))await createMobileInvoice(env,'deposit',depId,chatId,method,accNum,neededAmount,bdt);

  const depPrompt = `💰 <b>Deposit Instructions — ${mTitle}</b>\n\n` +
    `Deposit ID: <b>#${depId}</b>\n` +
    (neededAmount > 0 ? `Target Deposit: <b>$${neededAmount.toFixed(2)} USD (৳${Math.round(neededAmount * rate)} BDT)</b>\n` : "") +
    `Send funds to:\n<blockquote><code>${accNum}</code></blockquote>\n` +
    `Exchange Rate: <b>1 USD = ${rate} BDT</b>\n\n` +
    `${promptDetails}`;

  const buttons=[];
  if(['bkash','nagad'].includes(method))buttons.push([{text:'Enter Transaction ID',callback_data:`mobile_enter_deposit_${depId}`}]);
  buttons.push([{ text: "◀️ Back to Deposit", callback_data: "deposit" }]);
  if(messageId)await editMsg(env,chatId,messageId,depPrompt,buttons);
  else await sendMsg(env,chatId,depPrompt,buttons);
}

// ====================================================================
// Telegram Update Processor
// ====================================================================
const MAINTENANCE_MESSAGE = `🔧 Bot Under Maintenance
┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅┅

⚙️ We are currently performing scheduled maintenance to improve your experience.

🕐 The bot will be back online shortly. Thank you for your patience!`;

async function showMaintenance(env,update,ctx) {
  const callback=update.callback_query;
  const chatId=update.message?.chat?.id ?? callback?.message?.chat?.id;
  if(callback?.id&&!env.__callbackAcknowledged){
    const acknowledgement=ansCb(env,callback.id).catch(()=>{});
    if(ctx&&typeof ctx.waitUntil==='function')ctx.waitUntil(acknowledgement);
    else await acknowledgement;
  }
  if(callback?.message?.message_id) return await editMsg(env,chatId,callback.message.message_id,MAINTENANCE_MESSAGE,[]);
  return await sendMsg(env,chatId,MAINTENANCE_MESSAGE);
}

async function denyBlockedUser(env,chatId,user,messageId=null){
  if(String(chatId)===String(env.ADMIN_ID)||Number(user?.is_blocked)!==1)return false;
  const text='🚫 <b>Account Blocked</b>\n\nYour access to this bot has been blocked by the administrator. Contact store support if you believe this is a mistake.';
  if(messageId)await editMsg(env,chatId,messageId,text,[]);else await sendMsg(env,chatId,text);
  return true;
}
async function handleUpdate(update, env, originUrl = "", ctx = null) {
  const actor = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
  if (String(actor) !== String(env.ADMIN_ID)) env = { ...env, __requestSettings: new Map() };
  await ensureDbReady(env.DB);
  if (actor !== undefined && actor !== null && String(actor) !== String(env.ADMIN_ID)) {
    // One fresh settings snapshot per customer update; no cross-request stale settings.
    const {results:settings}=await env.DB.prepare('SELECT key,value FROM settings').all();
    for(const row of settings)env.__requestSettings.set(row.key,Promise.resolve({value:row.value}));
    env.__settingsLoaded=settings.length>0;
    const mode=await getSetting(env,'maintenance_mode','0');
    if(mode==='1'){await showMaintenance(env,update,ctx);return;}
  }

  // 1. Text Messages Handler
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    let text = (msg.text || "").trim();
    const navigationCommand = text.match(/^\/(start|home|admin|shop|deposit|profile|orders|preorder|refer|support|help|guide|cancel)(?:@\w+)?(?=\s|$)/i);
    if (navigationCommand) text = text.replace(navigationCommand[0], `/${navigationCommand[1].toLowerCase()}`);
    const from = msg.from;
    const username = from.username ? `@${from.username}` : (from.first_name || "Customer");
    const firstName = from.first_name || "Customer";

    // User Registration / Loading & Referral Tracking
    const [storedUser, storedState] = await Promise.all([
      env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first(),
      env.DB.prepare("SELECT * FROM user_states WHERE user_id = ?").bind(chatId).first()
    ]);
    if(await denyBlockedUser(env,chatId,storedUser))return;
    const userState = navigationCommand ? null : storedState;
    if (navigationCommand && storedState) await env.DB.prepare("DELETE FROM user_states WHERE user_id = ?").bind(chatId).run();
    let user = storedUser;
    if (!user) {
      let refId = 0;
      if (text.startsWith("/start ref_")) {
        const parts = text.split("ref_");
        if (parts.length > 1) { refId = parseInt(parts[1]) || 0; if (refId === chatId) refId = 0; }
      }
      await env.DB.prepare("INSERT INTO users (user_id, username, first_name, referred_by) VALUES (?, ?, ?, ?)").bind(chatId, username, firstName, refId).run();
      user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
      if (refId > 0) {
        await env.DB.prepare("UPDATE users SET total_referrals = total_referrals + 1 WHERE user_id = ?").bind(refId).run();
        const commPct = await getSetting(env, "referral_commission_percent", "5");
        await sendMsg(env, refId, `👥 <b>New Referral Joined!</b>\n\nUser ${username} joined via your link.\nYou will earn <b>${commPct}% commission</b> on all their purchases! 🎉`);
      }
    } else if ((!user.referred_by || user.referred_by === 0) && text.startsWith("/start ref_")) {
      const parts = text.split("ref_");
      if (parts.length > 1) {
        const refId = parseInt(parts[1]) || 0;
        if (refId > 0 && refId !== chatId) {
          await env.DB.prepare("UPDATE users SET referred_by = ? WHERE user_id = ?").bind(refId, chatId).run();
          await env.DB.prepare("UPDATE users SET total_referrals = total_referrals + 1 WHERE user_id = ?").bind(refId).run();
          user.referred_by = refId;
          const commPct = await getSetting(env, "referral_commission_percent", "5");
          await sendMsg(env, refId, `👥 <b>New Referral Linked!</b>\n\nUser ${username} linked via your link. You will earn <b>${commPct}% commission</b> on all purchases! 🎉`);
        }
      }
    }

    if(user&&(user.username!==username||user.first_name!==firstName)){
      await env.DB.prepare('UPDATE users SET username=?,first_name=? WHERE user_id=?').bind(username,firstName,chatId).run();
      user={...user,username,first_name:firstName};
    }
    // Admin Text States
    if (String(chatId) === String(env.ADMIN_ID)) {
      let adminState = await env.DB.prepare("SELECT * FROM admin_states WHERE user_id = ?").bind(chatId).first();
      if (adminState && navigationCommand) {
        await clearAdminState(env,chatId);adminState=null;
        if (text==='/cancel') {await sendAdminDashboard(env,chatId);return;}
      }
      if (adminState && adminState.state) {
        if (await handleGuideText(env,chatId,text,adminState))return;
        if (await handleCategoryText(env,chatId,text,adminState,msg))return;
        if (await handleAdminCoreText(env,chatId,text,adminState))return;
        if (await handleOrderSearchText(env,chatId,text,adminState))return;
        if (await handleTicketText(env,chatId,text,adminState,true))return;
        if (await handleLocalProductText(env,chatId,text,adminState))return;
        if (await handlePricingText(env,chatId,text,adminState))return;
        if (await handleAdminUserSearch(env,chatId,text,adminState))return;
        if (await handlePaymentIconText(env,chatId,text,adminState,msg)) return;
        if (await handleRedeemAdminText(env,chatId,text,adminState)) return;
        if (await handleProductIconText(env, chatId, text, adminState)) return;
        if (await handleBinanceSettingText(env, chatId, text, adminState)) return;
        if (await handleBep20SettingText(env, chatId, text, adminState)) return;
        if (await handleMobileWalletSettingText(env,chatId,text,adminState)) return;
        // Older code created states with no text handler. Reset safely instead of
        // throwing ReferenceError and blocking every subsequent admin message.
        await clearAdminState(env,chatId);
        await sendMsg(env,chatId,'The previous admin action was reset. Please choose an option from the panel.');
        await sendAdminDashboard(env,chatId);
        return;
      }
    }

    if (text === '/cancel') {
      if (String(chatId) === String(env.ADMIN_ID)) await sendAdminDashboard(env,chatId);
      else await sendHomeDashboard(env,chatId,user,firstName);
      return;
    }

    // Customer Custom Quantity State
    if (userState && userState.state === "awaiting_custom_qty") {
      const prodId = userState.data;
      const qtyText=String(text).trim().replace(/[০-৯]/g,c=>String(c.charCodeAt(0)-'০'.charCodeAt(0)));
      const parsedQty=/^\d{1,4}$/.test(qtyText)?Number(qtyText):NaN;
      if(!Number.isSafeInteger(parsedQty)||parsedQty<1||parsedQty>1000){await sendMsg(env,chatId,'Enter a whole quantity from 1 to 1000.');return;}
      await env.DB.prepare("DELETE FROM user_states WHERE user_id = ?").bind(chatId).run();
      await sendOrderPreview(env, chatId, prodId, parsedQty > 0 ? parsedQty : 1);
      return;
    }

    // Mandatory Force Join Gate
    if (String(chatId) !== String(env.ADMIN_ID)) {
      const forceCheck = await checkForceJoin(env, chatId, Boolean(userState?.state === "awaiting_redeem_code" || /^\/start(?:@\w+)?\s+redeem_/i.test(text) || msg.reply_to_message || /^awaiting_(?:binance|bep20|mobile)_/.test(userState?.state || "")));
      if (!forceCheck.passed) { await sendForceJoinScreen(env, chatId, forceCheck); return; }
    }

    const productStart=text.match(/^\/start(?:@\w+)?\s+product_(\d+)$/i);
    if(productStart){await clearBinanceInput(env,chatId);await sendProductDetailView(env,chatId,productStart[1]);return;}
    const redeemStart=text.match(/^\/start(?:@\w+)?\s+redeem_(RDM-[A-Fa-f0-9]{32})$/i);
    if (redeemStart) {await clearBinanceInput(env,chatId);await submitRedeemCode(env,chatId,redeemStart[1]);return;}
    if (await handleTicketText(env,chatId,text,userState,false))return;
    if (await handleRedeemInput(env,chatId,text,userState)) return;
    if (await handleManualDepositAmount(env,chatId,username,text,userState))return;
    if (await handleMobileReceiptInput(env,chatId,text,userState)) return;
    if (await handleBep20Input(env, chatId, username, text, userState)) return;
    if (await handleBinanceInput(env, chatId, username, text, userState)) return;

    // Automatic Payment Verification upon Reply with TxID / Order ID
    if (!navigationCommand && msg.reply_to_message && msg.reply_to_message.text) {
      const rText = msg.reply_to_message.text;

      // 1. ORDER PAYMENT SUBMISSION
      if (rText.includes("Order ID:")) {
        const m = rText.match(/Order ID:\s*(#?)(\d+)/);
        if (m) {
          const lookup=m[1]==='#'?'o.id':'o.public_order_id';
          const order = await env.DB.prepare(`SELECT o.*, p.name as product_name, p.is_external, p.external_id, p.api_stock FROM orders o JOIN products p ON o.product_id=p.id WHERE ${lookup}=?`).bind(m[2]).first();
          const orderId=order?.id;
          if (order) {
            if (String(order.user_id) !== String(chatId) || order.status !== "pending") {
              await sendMsg(env, chatId, "This order is not payable by this account.");
              return;
            }
            const cleanText = text.trim();
            const method = (order.payment_method || "").toUpperCase();

            if (method === "BEP20") {
              await submitBep20Payment(env,chatId,"order",order,cleanText);
              return;
            }

            // Legacy Reply submissions use the same verification path as Enter Order ID.
            if (method === "BINANCE") {
              await submitBinancePayment(env, chatId, "order", order, cleanText);
              return;
            }

            if (['BKASH','NAGAD'].includes(method)) {await submitMobilePayment(env,chatId,'order',orderId,cleanText);return;}

            if(method==='ROCKET'&&Date.now()-invoiceTimestamp(order.created_at)>60*60000){await sendMsg(env,chatId,'The 60-minute Rocket payment window expired. If you paid, contact admin. Do not pay again.');return;}
            // C. Manual Payments (bKash, Nagad, Rocket)
            await env.DB.prepare("UPDATE orders SET trx_id = ? WHERE id = ?").bind(cleanText, orderId).run();
            await sendMsg(env, chatId, `✅ <b>Payment Details Received!</b>\n\nOrder ID: ${orderDisplayId(order)}\nMethod: <b>${order.payment_method}</b>\nTransaction ID: <code>${cleanText}</code>\n\nOur team is verifying your payment. Your product will be delivered automatically upon confirmation.`);
            await notifyAdminForUser(env,chatId, `🚨 <b>New Order Payment Verification!</b>\n\nOrder ID: ${orderDisplayId(order)}\nProduct: <b>${order.product_name}</b> (${order.quantity || 1} items)\nMethod: <b>${order.payment_method}</b>\nAmount: <b>$${order.amount_usd} USD (৳${order.amount_bdt} BDT)</b>\nTrxID: <code>${cleanText}</code>\nCustomer: ${order.username} (ID: <code>${order.user_id}</code>)`, [
              [{text:"View Pending Payment",callback_data:`adm_paydetail_order_${orderId}`} ]
            ]);
            return;
          }
        }
      }

      // 2. WALLET DEPOSIT SUBMISSION
      if (rText.includes("Deposit Instructions") || rText.includes("Deposit ID:")) {
        const m = rText.match(/Deposit ID:\s*#(\d+)/);
        const depId = m ? m[1] : 0;
        const cleanText = text.trim();
        const dRow = depId ? await env.DB.prepare("SELECT * FROM deposits WHERE id = ?").bind(depId).first() : null;

        if (dRow) {
          if (String(dRow.user_id) !== String(chatId) || dRow.status !== "pending") {
            await sendMsg(env, chatId, "This deposit is not payable by this account.");
            return;
          }
          const depMethod = (dRow.method || "").toUpperCase();

          if (depMethod === "BEP20") {
            await submitBep20Payment(env,chatId,"deposit",dRow,cleanText);
            return;
          }

          if (depMethod === "BINANCE") {
            await submitBinancePayment(env, chatId, "deposit", dRow, cleanText);
            return;
          }

          if (['BKASH','NAGAD'].includes(depMethod)) {await submitMobilePayment(env,chatId,'deposit',depId,cleanText);return;}

          if(depMethod==='ROCKET'&&Date.now()-invoiceTimestamp(dRow.created_at)>60*60000){await sendMsg(env,chatId,'The 60-minute Rocket payment window expired. If you paid, contact admin. Do not pay again.');return;}
          await env.DB.prepare("UPDATE deposits SET trx_id = ? WHERE id = ?").bind(cleanText, depId).run();
        }

        await sendMsg(env, chatId, `✅ <b>Deposit Submission Received!</b>\n\nTransaction Details: <code>${cleanText}</code>\n\nAdmin will verify the transaction and credit your wallet balance shortly.`);
        await notifyAdminForUser(env,chatId, `🚨 <b>New Wallet Deposit Verification!</b>\n\nDeposit ID: #${depId || "N/A"}\nCustomer: ${username} (ID: <code>${chatId}</code>)\nMethod: <b>${dRow ? dRow.method : "Payment"}</b>\nAmount: $${dRow ? dRow.amount_usd : "0"} USD\nTrxID: <code>${cleanText}</code>`, [
          depId ? [{text:"View Pending Payment",callback_data:`adm_paydetail_deposit_${depId}`}]
                : [{ text: "➕ Credit User", callback_data: `adm_credit_${chatId}` }]
        ]);
        return;
      }
    }

    // Standard Navigation Commands
    if (text.startsWith("/start") || text === "/home") { await sendHomeDashboard(env, chatId, user, firstName); return; }
    if (text === "/shop") {
      try {
        await showShopCategories(env, chatId);
      } catch (e) {
        console.error("Error in /shop command:", e);
        await sendMsg(env, chatId, `⚠️ <b>Error opening shop:</b> <code>${escapeHtml(e.message)}</code>`);
      }
      return;
    }
    if (text === "/deposit") { await sendDeposit(env, chatId); return; }
    if (text === "/profile") { await sendProfile(env, chatId, user); return; }
    if (text === "/orders") { await sendOrders(env, chatId); return; }
    if (text === "/preorder") { await sendUserPreorders(env, chatId); return; }
    if (text === "/refer") { await sendRefer(env, chatId, user); return; }
    if(text==='/help'||text==='/guide'){await showUserGuide(env,chatId);return;}
    if (text === "/support") { await sendSupport(env, chatId); return; }
    if (text === "/admin" && String(chatId) === String(env.ADMIN_ID)) { await sendAdminDashboard(env, chatId); return; }

    await sendHomeDashboard(env, chatId, user, firstName);
    return;
  }

  // 2. Inline Callback Queries
  if (update.callback_query) {
    const cb = update.callback_query;
    const data = cb.data;
    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    if ((data.startsWith("adm_") || data.startsWith("admin_")) && String(chatId) !== String(env.ADMIN_ID)) return;

    // Immediately acknowledge callback query to clear button loading spinner
    if(!env.__callbackAcknowledged){
      const acknowledgement = ansCb(env, cb.id).catch(() => {});
      if (ctx?.waitUntil) ctx.waitUntil(acknowledgement);
      else await acknowledgement;
    }

    let user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
    if(await denyBlockedUser(env,chatId,user,messageId))return;
    const firstName = cb.from.first_name || "Customer";
    const username = cb.from.username ? `@${cb.from.username}` : firstName;

    if(user&&(user.username!==username||user.first_name!==firstName)){
      await env.DB.prepare('UPDATE users SET username=?,first_name=? WHERE user_id=?').bind(username,firstName,chatId).run();
      user={...user,username,first_name:firstName};
    }
    const broadcastAction=data.match(/^adm_broadcast_send_([a-f0-9-]{36})$/);
    if(broadcastAction){await sendBroadcastBatch(env,chatId,broadcastAction[1]);return;}
    if(await handleAdminOrderDelete(env,chatId,data,messageId))return;
    const allOrdersPage=data.match(/^adm_orders_page_(\d+)$/),allOrderView=data.match(/^adm_orders_view_(\d+)_(\d+)$/),orderSearch=data.match(/^adm_order_search(?:_(\d+))?$/);
    const orderList=data.match(/^adm_orders_list_(pending|completed)_(\d+)$/),orderItem=data.match(/^adm_orders_item_(\d+)_(pending|completed)_(\d+)$/),filteredSearch=data.match(/^adm_order_search_(pending|completed)_(\d+)$/);
    if(data==='adm_order_find'){await showAdminOrdersMenu(env,chatId,messageId);return;}
    if(orderList){await showAllAdminOrders(env,chatId,orderList[2],messageId,orderList[1]);return;}
    if(orderItem){if(adminUserAccess(env,chatId)){await clearAdminState(env,chatId);await showDeliveryAdminOrder(env,chatId,orderItem[1],messageId,adminUserPage(orderItem[3]),orderItem[2]);}return;}
    if(filteredSearch){
      if(!adminUserAccess(env,chatId))return;
      const page=adminUserPage(filteredSearch[2]),filter=filteredSearch[1];
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'awaiting_order_search',?)").bind(chatId,JSON.stringify({page,filter})).run();
      await editMsg(env,chatId,messageId,'🔎 <b>Find Order</b>\n\nEnter the 5-digit Order ID. Search checks all orders.',[[{text:'Back to Orders',callback_data:adminOrdersListData(filter,page)}]]);return;
    }
    if(allOrdersPage){await showAllAdminOrders(env,chatId,allOrdersPage[1],messageId);return;}
    if(allOrderView){if(adminUserAccess(env,chatId)){await clearAdminState(env,chatId);await showDeliveryAdminOrder(env,chatId,allOrderView[1],messageId,adminUserPage(allOrderView[2]));}return;}
    if(orderSearch){
      if(!adminUserAccess(env,chatId))return;
      const page=adminUserPage(orderSearch[1]||0);
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'awaiting_order_search',?)").bind(chatId,String(page)).run();
      await editMsg(env,chatId,messageId,'🔎 <b>Find Order</b>\n\nSend the 5-digit Order ID, e.g. 58241. This is this store’s Order ID, not a payment transaction ID. Older #number references are also accepted.',[[{text:'Back to Orders',callback_data:`adm_orders_page_${page}`}]]);return;
    }
    let walletHistoryMatch=data.match(/^wallet_history_(\d+)$/);
    if(walletHistoryMatch){await showWalletHistory(env,chatId,chatId,walletHistoryMatch[1],messageId);return;}
    walletHistoryMatch=data.match(/^adm_wallet_history_(\d+)_(\d+)$/);
    if(walletHistoryMatch){if(adminUserAccess(env,chatId))await showWalletHistory(env,chatId,walletHistoryMatch[1],walletHistoryMatch[2],messageId);return;}
    if(await handleDeliveryAdminCallback(env,chatId,data,messageId))return;
    if(await handlePaymentDashboardCallback(env,chatId,data,messageId))return;
    if(/^adm_sales_(today|week|days30|month|all)$/.test(data)){await showAdminSalesReport(env,chatId,data.slice(10),messageId);return;}
    const localCostAction=data.match(/^adm_local_cost_(\d+)$/);
    if(localCostAction){
      if(!adminUserAccess(env,chatId))return;
      const product=await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(localCostAction[1]).first();
      if(!product||product.is_external){await sendMsg(env,chatId,'Purchase cost can be edited for local products only.');return;}
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'awaiting_local_cost',?)").bind(chatId,String(product.id)).run();
      await editMsg(env,chatId,messageId,'Enter the purchase cost per item in USD, e.g. 4.00. Zero is allowed for free stock. This changes future orders only.',[[{text:'Cancel',callback_data:`adm_prod_details_${product.id}`}]]);return;
    }
    if(await handlePricingCallback(env,chatId,data,messageId))return;
    if(await handleAdminUserCallback(env,chatId,data,messageId))return;

    if (["home", "deposit", "shop", "shop_refresh"].includes(data) || /^(?:shop_|prod_|dep_|pay_|direct_pay_|custom_qty_|buynow_)/.test(data)) await clearBinanceInput(env, chatId);
    if (data === "binance_cancel") {
      await clearBinanceInput(env, chatId);
      await sendDeposit(env, chatId, messageId);
      return;
    }
    const documentRequest=data.match(/^order_document_(\d+)$/);
    if(documentRequest){
      const order=await env.DB.prepare("SELECT * FROM orders WHERE id=? AND user_id=? AND status='completed'").bind(documentRequest[1],chatId).first();
      if(!order){await sendMsg(env,chatId,'Completed order not found in your account.');return;}
      await sendSavedOrderDocument(env,chatId,order);return;
    }
    const providerRetry=data.match(/^provider_retry_(\d+)$/);
    if(providerRetry){
      const order=await env.DB.prepare('SELECT o.*,p.name AS product_name,p.is_external,p.external_id FROM orders o JOIN products p ON p.id=o.product_id WHERE o.id=?').bind(providerRetry[1]).first();
      if(!order||(String(order.user_id)!==String(chatId)&&String(chatId)!==String(env.ADMIN_ID)))return;
      if(order.status!=='paid_pending_delivery'){await sendMsg(env,chatId,'This order is already delivered, closed or processing.');return;}
      if(!order.provider_request_id){await sendMsg(env,chatId,'This older order needs admin review. Check provider history first; do not pay or order again.');return;}
      const retry=await env.DB.prepare("UPDATE orders SET provider_retry_at=? WHERE id=? AND status='paid_pending_delivery' AND COALESCE(provider_retry_at,0)<?").bind(Date.now()+30000,order.id,Date.now()).run();
      if(!retry.meta?.changes){await sendMsg(env,chatId,'Please wait 30 seconds before checking again.');return;}
      await completeSuccessfulOrder(env,order,order.trx_id,order.user_id);
      return;
    }
    const mobileAction=data.match(/^mobile_(enter|retry)_(order|deposit)_(\d+)$/);
    if(mobileAction) {
      const [,action,type,id]=mobileAction;
      const invoice=await env.DB.prepare('SELECT * FROM mobile_payment_invoices WHERE invoice_type=? AND invoice_id=? AND user_id=?').bind(type,id,chatId).first();
      if(!invoice){await sendMsg(env,chatId,'This invoice is unavailable. Contact admin if you already paid. Do not pay again.');return;}
      if(action==='retry'&&invoice.trx_id){await submitMobilePayment(env,chatId,type,id,invoice.trx_id);return;}
      const target=await env.DB.prepare(type==='order'?'SELECT status FROM orders WHERE id=?':'SELECT status FROM deposits WHERE id=?').bind(id).first();
      if(invoice.status!=='pending'||target?.status!=='pending'){await sendMsg(env,chatId,'This payment is already processed or closed.');return;}
      await clearBinanceInput(env,chatId);
      await env.DB.prepare("INSERT OR REPLACE INTO user_states(user_id,state,data) VALUES(?,'awaiting_mobile_receipt',?)").bind(chatId,JSON.stringify({type,id:Number(id)})).run();
      await editMsg(env,chatId,messageId,'💳 <b>Enter Transaction ID</b>\n\nPaste only the TrxID / TxnID from your payment receipt. We will match it to the payment received.',[[{text:'◀️ Cancel',callback_data:type==='deposit'?'deposit':'shop'}]]);
      return;
    }
    if (data.startsWith("binance_enter_")) {
      const match = data.match(/^binance_enter_(order|deposit)_(\d+)$/);
      if (!match) return;
      const [, type, id] = match;
      const invoice = await env.DB.prepare(type === "order" ? "SELECT * FROM orders WHERE id = ?" : "SELECT * FROM deposits WHERE id = ?").bind(id).first();
      if (!invoice || String(invoice.user_id) !== String(chatId) || invoice.status !== "pending" ||
          String(type === "order" ? invoice.payment_method : invoice.method).toUpperCase() !== "BINANCE") {
        await sendMsg(env, chatId, "This invoice is not payable by this account.");
        return;
      }
      await env.DB.prepare("INSERT OR REPLACE INTO user_states (user_id, state, data) VALUES (?, 'awaiting_binance_receipt', ?)")
        .bind(chatId, JSON.stringify({ type, id: invoice.id })).run();
      await editMsg(env, chatId, messageId, "⚡ <b>Order ID</b>\n\nPaste the Order ID from your Binance Pay receipt below:", [[{ text: "❌ Cancel", callback_data: "binance_cancel" }]]);
      return;
    }

    if (data === 'bep20_cancel') {
      await clearBinanceInput(env,chatId);
      await sendDeposit(env,chatId,messageId);
      return;
    }
    const bep20Entry=data.match(/^bep20_enter_(order|deposit)_(\d+)$/);
    if (bep20Entry) {
      const [,type,id]=bep20Entry;
      const invoice=await env.DB.prepare(type==='order'?'SELECT * FROM orders WHERE id = ?':'SELECT * FROM deposits WHERE id = ?').bind(id).first();
      if (!invoice || String(invoice.user_id)!==String(chatId) || invoice.status!=='pending' || String(type==='order'?invoice.payment_method:invoice.method).toUpperCase()!=='BEP20') {
        await sendMsg(env,chatId,'This invoice is not payable by this account.');return;
      }
      await clearBinanceInput(env,chatId);
      await env.DB.prepare("INSERT OR REPLACE INTO user_states (user_id, state, data) VALUES (?, 'awaiting_bep20_hash', ?)").bind(chatId,JSON.stringify({type,id:invoice.id})).run();
      await editMsg(env,chatId,messageId,'⚡ <b>Transaction Hash (TxHash)</b>\n\nPaste the BEP20 blockchain TxHash from your receipt below (0x followed by 64 hex characters):',[[{text:'❌ Cancel',callback_data:'bep20_cancel'}]]);
      return;
    }

    // Force Join Check Button
    if (data === "check_force_join") {
      const forceCheck = await checkForceJoin(env, chatId, true);
      if (forceCheck.passed) {
        await ansCb(env, cb.id, "✅ Membership verified! Welcome to the store.", true);
        await sendHomeDashboard(env, chatId, user, firstName, messageId);
      } else {
        await ansCb(env, cb.id, "⚠️ You haven't joined both channels yet! Click the buttons above to join both and then tap Verify.", true);
      }
      return;
    }

    // Force Join Guard
    if (String(chatId) !== String(env.ADMIN_ID) && !data.startsWith("adm_") && !data.startsWith("admin_")) {
      const forceCheck = await checkForceJoin(env, chatId, /^(?:wallet_pay_check_|direct_pay_|pay_|dep_|redeem_)/.test(data));
      if (!forceCheck.passed) { await sendForceJoinScreen(env, chatId, forceCheck, messageId); return; }
    }

    if(await handleTicketCallback(env,chatId,data,messageId))return;
    if (data === 'redeem_open') {
      await clearBinanceInput(env,chatId);
      if(String(chatId)===String(env.ADMIN_ID))await clearAdminState(env,chatId);
      await env.DB.prepare("INSERT OR REPLACE INTO user_states (user_id, state, data) VALUES (?, 'awaiting_redeem_code', ?)").bind(chatId,JSON.stringify({sessionId:crypto.randomUUID()})).run();
      await editMsg(env,chatId,messageId,'🎁 <b>Redeem Code</b>\n\nPaste your redeem code or redeem link below. The assigned USD balance will be added to your wallet.\n\n<i>Each code works once only.</i>',[[{text:'❌ Cancel',callback_data:'redeem_cancel'}]]);
      return;
    }
    if (data === 'redeem_cancel') {
      await clearBinanceInput(env,chatId);
      await sendDeposit(env,chatId,messageId);
      return;
    }

    if(await handleCategoryCallback(env,chatId,data,messageId))return;
    if(await handleProductNoticeCallback(env,chatId,data,messageId))return;
    if(await handleGuideCallback(env,chatId,data,messageId))return;
    if(await handlePeriodicCallback(env,chatId,data,messageId))return;
    if(['profile','deposit'].includes(data)){await env.DB.prepare('DELETE FROM user_states WHERE user_id=?').bind(chatId).run();if(adminUserAccess(env,chatId))await clearAdminState(env,chatId);}
    const stockOut=data.match(/^stock_out_(\d+)$/);if(stockOut){await sendMsg(env,chatId,'Stock Out — this product is not available right now. Refresh stock to check again.',[[{text:'🔄 Refresh Stock',callback_data:`prod_refresh_${stockOut[1]}`}],[{text:'Back to Shop',callback_data:`shop_return_${stockOut[1]}`}]]);return;}
    // Navigation Callbacks
    if (data === "home") { await clearAdminState(env, chatId); await sendHomeDashboard(env, chatId, user, firstName, messageId); return; }
    const shopPage=data.match(/^shop_(page|refresh)_(\d+)$/);
    if (data === "shop" || data === "shop_refresh" || shopPage) {
      try {
        const page=shopPage?Number(shopPage[2]):0;
        const refresh=data==='shop_refresh'||shopPage?.[1]==='refresh';
        // Opening Shop sends a new message; page navigation edits that catalog message.
        await showShopCategories(env,chatId,data==='shop'?null:messageId,refresh,page);
      } catch (e) {
        console.error("Error in shop callback:", e);
        await sendMsg(env, chatId, `⚠️ <b>Error opening shop:</b> <code>${escapeHtml(e.message)}</code>`);
      }
      return;
    }
    const shopReturn=data.match(/^shop_return_(\d+)$/);
    if(shopReturn){
      const product=await env.DB.prepare('SELECT p.shop_category_id,c.name AS category_name FROM products p LEFT JOIN product_categories c ON c.id=p.shop_category_id WHERE p.id=?').bind(shopReturn[1]).first();
      const category=['subscription','others subscription'].includes(product?.category_name?.toLowerCase())?0:Number(product?.shop_category_id||0);
      const rank=await env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE is_active=1 AND (COALESCE(shop_category_id,0)=? OR (?=0 AND shop_category_id IN (SELECT id FROM product_categories WHERE LOWER(name) IN ('subscription','others subscription') AND is_deleted=0))) AND id<?").bind(category,category,shopReturn[1]).first();
      await sendCategoryProducts(env,chatId,category,Math.floor(Number(rank?.count||0)/10),messageId);
      return;
    }
    if (data === "profile") { await sendProfile(env, chatId, user, messageId); return; }
    if (data === "deposit") { await sendDeposit(env, chatId, messageId); return; }
    const orderPage=data.match(/^my_orders_page_(\d+)$/);
    if(orderPage){await clearTicketInput(env,chatId);await sendOrders(env,chatId,messageId,Number(orderPage[1]));return;}
    if (data === "my_orders") { await sendOrders(env, chatId, messageId); return; }
    if (data === "my_preorders") { await sendUserPreorders(env, chatId, messageId); return; }
    if (data === "refer") { await sendRefer(env, chatId, user, messageId); return; }
    if (data === "support") { await sendSupport(env, chatId, messageId); return; }

    // Pre-orders Registration
    if (data.startsWith("preorder_")) {
      const prodId = data.replace("preorder_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      if (prod) {
        if(prod.is_external){await sendMsg(env,chatId,'Pre-orders are not available for API products.',[[{text:'Back to Product',callback_data:`prod_${prod.id}`}]]);return;}
        const existingPo = await env.DB.prepare("SELECT id FROM preorders WHERE user_id = ? AND product_id = ? AND status = 'pending'").bind(chatId, prodId).first();
        if (!existingPo) await env.DB.prepare("INSERT INTO preorders (user_id, username, product_id, product_name, details, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)").bind(chatId, username, prodId, prod.name, JSON.stringify({product_name:prod.name,external_id:prod.is_external?String(prod.external_id):null,type:'stock_notification'})).run();
        await env.DB.prepare('INSERT OR IGNORE INTO product_follows(user_id,product_id) SELECT ?,id FROM products WHERE id=? AND is_active=1').bind(chatId,prodId).run();
        await editMsg(env, chatId, messageId, `⏳ <b>Stock Alert Registered</b>\n\nProduct: <b>${productDisplayName(prod)}</b>\nPrice: <b>$${Number(prod.price_usd).toFixed(2)} USD</b> (≈ ৳${prod.price_bdt} BDT)\n\n✅ Your stock alert is registered and you are now following this product. Unfollow it or turn alerts off from Profile at any time. No payment was taken and no supplier pre-order was placed. Stock updates are sent according to your Product Alerts setting.`, [
          [{ text: "🛒 Continue Shopping", callback_data: "shop" }],
          [{ text: "🏠 Main Menu", callback_data: "home" }]
        ]);
        await sendMsg(env, env.ADMIN_ID, `🔔 <b>New Stock Alert Request</b>\n\nCustomer: ${username} (ID: <code>${chatId}</code>)\nProduct: <b>${productDisplayName(prod)}</b>\nPrice: $${prod.price_usd} USD\n\n⚠️ Please restock this product using Admin Panel or Provider API!`, [
          [{ text: `➕ Add Stock for ${productDisplayName(prod)}`, callback_data: `adm_addstock_${prod.id}` }]
        ]);
      }
      return;
    }

    // Product Details & Quantity Selector
    if (data.startsWith("prod_refresh_")) { await sendProductDetailView(env, chatId, data.slice("prod_refresh_".length), messageId, true); return; }
    if (data.startsWith("prod_")) { await sendProductDetailView(env, chatId, data.replace("prod_", ""), messageId); return; }
    if (data.startsWith("buynow_")) {
      const parts = data.replace("buynow_", "").split("_");
      await sendOrderPreview(env, chatId, parts[0], Number(parts[1]));
      return;
    }
    if (data.startsWith("qty_")) {
      const parts = data.replace("qty_", "").split("_");
      await sendOrderPreview(env, chatId, parts[0], Number(parts[1]), messageId);
      return;
    }
    if (data.startsWith("custom_qty_")) {
      const prodId = data.replace("custom_qty_", "");
      await env.DB.prepare("INSERT OR REPLACE INTO user_states (user_id, state, data) VALUES (?, 'awaiting_custom_qty', ?)").bind(chatId, prodId).run();
      await editMsg(env, chatId, messageId, `✏️ <b>Enter Custom Quantity:</b>\n\nPlease type the exact number of items you wish to purchase (e.g. <code>5</code>):`, [
        [{ text: "◀️ Cancel", callback_data: `prod_${prodId}` }]
      ]);
      return;
    }

    // ----------------------------------------------------------------
    // WALLET PAYMENT CHECK (From Order Preview or Direct Pay)
    // ----------------------------------------------------------------
    if (data.startsWith("wallet_pay_check_")) {
      const parts = data.replace("wallet_pay_check_", "").split("_");
      const prodId = parts[0];
      const qty = Number(parts[1]);
      orderStage(env,'wallet.product');
      let prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      if (!prod){await sendMsg(env,chatId,'This product is no longer available. Open /shop again.');return;}
      orderStage(env,'wallet.live_stock');
      if (prod.is_external === 1) prod = await fetchLiveProductStock(env, prod);
      if (!await checkExternalStock(env, chatId, prod, qty)) return;

      const totalPrice = Number((prod.price_usd * qty).toFixed(2));
      if(!await guardCheckoutQuote(env,chatId,prod,qty,totalPrice))return;
      const userBal = user ? (user.balance_usd || 0) : 0;
      const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));

      if (userBal >= totalPrice) {
        // Sufficient Balance -> Execute Instant Order
        await executeWalletPurchase(env, chatId, username, prod, qty, totalPrice, rate, messageId);
        return;
      } else {
        // Insufficient Balance -> Prompt to deposit missing amount!
        const diff = Number((totalPrice - userBal).toFixed(2));
        const diffBdt = Math.round(diff * rate);
        await editMsg(env, chatId, messageId,
          `⚠️ <b>Insufficient Wallet Balance!</b>\n\n` +
          `Product: <b>${productDisplayName(prod)}</b> (${qty} items)\n` +
          `• Total Required: <b>$${totalPrice.toFixed(2)} USD</b>\n` +
          `• Current Wallet Balance: <b>$${userBal.toFixed(2)} USD</b>\n` +
          `• Shortage: <b>$${diff.toFixed(2)} USD (≈ ৳${diffBdt} BDT)</b>\n\n` +
          `Please deposit funds to your wallet to complete this purchase, or use Direct Payment below:`,
          [
            [{ text: `💳 Deposit $${diff.toFixed(2)} USD to Wallet`, callback_data: `dep_needed_${diff.toFixed(2)}` }],
            [{ text: `⚡ Switch to Direct Payment`, callback_data: `direct_pay_${prod.id}_${qty}` }],
            [{ text: "◀️ Back to Quantity", callback_data: `buynow_${prod.id}_${qty}` }]
          ]
        );
        return;
      }
    }

    // ----------------------------------------------------------------
    // DIRECT PAYMENT SELECTION MENU
    // ----------------------------------------------------------------
    if (data.startsWith("direct_pay_")) {
      const paymentButton=await loadPaymentIcons(env);
      const parts = data.replace("direct_pay_", "").split("_");
      const prodId = parts[0];
      const qty = Number(parts[1]);
      let prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      if (!prod) return;
      if (prod.is_external === 1) prod = await fetchLiveProductStock(env, prod);
      if (!await checkExternalStock(env, chatId, prod, qty)) return;

      const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
      const totalUsd = Number((prod.price_usd * qty).toFixed(2));
      await saveCheckoutQuote(env,chatId,prod.id,qty,totalUsd);
      const totalBdt = Math.round(totalUsd * rate);
      const userBal = user ? (user.balance_usd || 0) : 0;

      await editMsg(env, chatId, messageId,
        `💳 <b>Select Payment Method:</b>\n\n` +
        `Product: <b>${productDisplayName(prod)}</b>\n` +
        `Quantity: <b>${qty} item(s)</b>\n` +
        `Total Payable: <b>$${totalUsd.toFixed(2)} USD (৳${totalBdt} BDT)</b>\n\n` +
        `Choose your preferred payment method below:`,
        [
          [paymentButton("bkash","bKash",`pay_bkash_${prod.id}_${qty}`), paymentButton("nagad","Nagad",`pay_nagad_${prod.id}_${qty}`)],
          [paymentButton("rocket","Rocket",`pay_rocket_${prod.id}_${qty}`)],
          [paymentButton("binance","Binance Pay (Auto Verify)",`pay_binance_${prod.id}_${qty}`), paymentButton("bep20","BEP20 USDT (Auto Verify)",`pay_bep20_${prod.id}_${qty}`)],
          [{ text: `👛 Wallet Pay (Bal: $${userBal.toFixed(2)})`, callback_data: `wallet_pay_check_${prod.id}_${qty}` }],
          [{ text: "◀️ Back to Quantity", callback_data: `buynow_${prod.id}_${qty}` }]
        ]
      );
      return;
    }

    // ----------------------------------------------------------------
    // MANUAL & DIRECT PAYMENT CHECKOUT SCREENS
    // ----------------------------------------------------------------
    if (data.startsWith("pay_") && !data.startsWith("pay_balance_")) {
      const parts = data.split("_");
      const method = parts[1];
      if(!['bkash','nagad','rocket','binance','bep20'].includes(method)){await sendMsg(env,chatId,'Choose a supported payment method.');return;}
      const prodId = parts[2];
      const qty = Number(parts[3]);
      let prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      if (!prod) return;
      if (prod.is_external === 1) prod = await fetchLiveProductStock(env, prod);
      if (!await checkExternalStock(env, chatId, prod, qty)) return;
      const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
      const totalUsd = Number((prod.price_usd * qty).toFixed(2));
      if(!await guardCheckoutQuote(env,chatId,prod,qty,totalUsd))return;
      if(!Number.isFinite(rate)||rate<=0||!Number.isFinite(totalUsd)||totalUsd<=0){await sendMsg(env,chatId,'Payment amount is unavailable. Contact admin.');return;}
      const totalBdt = Math.round(totalUsd * rate);

      orderStage(env,'order.schema');
      await assertOrderWriteCompatible(env);
      const res = await env.DB.prepare("INSERT INTO orders (user_id, username, product_id, quantity, payment_method, amount_usd, amount_bdt, amount, product_name, trx_id, currency, created_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', 'USD', CURRENT_TIMESTAMP, 'pending')").bind(chatId, username, prodId, qty, method.toUpperCase(), totalUsd, totalBdt,totalUsd,prod.name).run();
      const orderId = res.meta ? res.meta.last_row_id : Math.floor(Math.random() * 10000);
      if (method === "bep20") {
        await showBep20Instructions(env, chatId, "order", { id: orderId, product_id: prod.id, amount_usd: totalUsd }, messageId);
        return;
      }
      if (method === "binance") {
        await showBinanceInstructions(env, chatId, "order", { id: orderId, product_id: prod.id, amount_usd: totalUsd }, messageId);
        return;
      }

      let mTitle = "Payment";
      let accNum = "";
      let customInstructions = "";

      if (method === "bkash") {
        mTitle = "bKash Personal";
        accNum = await getSetting(env, "bkash_num", "017XXXXXXXX");
        customInstructions = `👉 <b>Send Money (Personal) to:</b>\n<code>${accNum}</code>\n\n⚠️ After payment, please <b>REPLY to this message</b> with your <b>bKash Transaction ID (TrxID)</b>.`;
      } else if (method === "nagad") {
        mTitle = "Nagad Personal";
        accNum = await getSetting(env, "nagad_num", "017XXXXXXXX");
        customInstructions = `👉 <b>Send Money (Personal) to:</b>\n<code>${accNum}</code>\n\n⚠️ After payment, please <b>REPLY to this message</b> with your <b>Nagad Transaction ID</b>.`;
      } else if (method === "rocket") {
        mTitle = "Rocket Personal · Admin Verification";
        accNum = await getSetting(env, "rocket_num", "017XXXXXXXX");
        customInstructions = `👉 <b>Send Money to:</b>\n<code>${accNum}</code>\n\n⚠️ After payment, please <b>REPLY to this message</b> with your <b>Rocket Transaction ID within 60 minutes</b>.\n\nRocket requires admin verification. Delivery follows payment approval.`;
      }

      if(['bkash','nagad'].includes(method)) {
        await createMobileInvoice(env,'order',orderId,chatId,method,accNum,totalUsd,totalBdt);
        customInstructions=`👉 <b>Send Money (Personal) to:</b>\n<code>${escapeHtml(accNum)}</code>\n\nSend the exact BDT amount within <b>60 minutes</b>, then tap <b>Enter Transaction ID</b>. Payment is verified against our received transaction record. Never submit a PIN or OTP.`;
      }
      const checkoutText = `💳 <b>Payment Instructions — ${mTitle}</b>\n\n` +
        `Order ID: <b>${await getPublicOrderId(env,orderId)}</b>\n` +
        `Product: <b>${productDisplayName(prod)}</b> (${qty} item(s))\n` +
        `Total Payable: <b>$${totalUsd.toFixed(2)} USD (৳${totalBdt} BDT)</b>\n\n` +
        `${customInstructions}`;

      const checkoutButtons=[];
      if(['bkash','nagad'].includes(method))checkoutButtons.push([{text:'Enter Transaction ID',callback_data:`mobile_enter_order_${orderId}`}]);
      checkoutButtons.push([{text:'◀️ Cancel Order',callback_data:`prod_${prod.id}`}]);
      await editMsg(env,chatId,messageId,checkoutText,checkoutButtons);
      return;
    }

    // ----------------------------------------------------------------
    // DEPOSIT SELECTION & INSTRUCTIONS
    const depositPreset=data.match(/^dep_amount_(binance|bep20|bkash|nagad|rocket)_(\d+)$/);
    if(depositPreset){
      const [,method,rawAmount]=depositPreset;
      const amount=Number(rawAmount);
      if(DEPOSIT_PRESETS.includes(amount))await renderDepositInstructions(env,chatId,username,method,amount,messageId);
      return;
    }
    const depositCustom=data.match(/^dep_custom_(binance|bep20|bkash|nagad|rocket)$/);
    if(depositCustom){await showDepositAmounts(env,chatId,depositCustom[1],messageId,true);return;}
    // ----------------------------------------------------------------
    if (data.startsWith("dep_method_") || data.startsWith("dep_needed_")) {
      const isNeeded = data.startsWith("dep_needed_");
      const needed = isNeeded ? parseFloat(data.replace("dep_needed_", "")) || 5.00 : 0;

      if (isNeeded) {
        const paymentButton=await loadPaymentIcons(env);
        // Show deposit method selection with pre-filled needed amount
        const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
        const bdtNeeded = Math.round(needed * rate);
        await editMsg(env, chatId, messageId,
          `💳 <b>Add Funds to Wallet:</b>\n\n` +
          `• Required Amount: <b>$${needed.toFixed(2)} USD (≈ ৳${bdtNeeded} BDT)</b>\n\n` +
          `Select your payment method below to get deposit instructions:`,
          [
            [paymentButton("bkash","bKash",`dep_setmeth_bkash_${needed.toFixed(2)}`), paymentButton("nagad","Nagad",`dep_setmeth_nagad_${needed.toFixed(2)}`)],
            [paymentButton("rocket","Rocket",`dep_setmeth_rocket_${needed.toFixed(2)}`)],
            [paymentButton("binance","Binance Pay (Auto)",`dep_setmeth_binance_${needed.toFixed(2)}`), paymentButton("bep20","BEP20 USDT (Auto)",`dep_setmeth_bep20_${needed.toFixed(2)}`)],
            [{ text: "◀️ Cancel", callback_data: "home" }]
          ]
        );
        return;
      }

      const method = data.replace("dep_method_", "");
      await renderDepositInstructions(env, chatId, username, method, 0, messageId);
      return;
    }

    if (data.startsWith("dep_setmeth_")) {
      const parts = data.replace("dep_setmeth_", "").split("_");
      const method = parts[0];
      const amount = parseFloat(parts[1]) || 0;
      await renderDepositInstructions(env, chatId, username, method, amount, messageId);
      return;
    }

    // ----------------------------------------------------------------
    // ADMIN PANEL CALLBACKS (100% Button-Driven)
    // ----------------------------------------------------------------
    if (data === "admin_panel") {
      if (String(chatId) === String(env.ADMIN_ID)) { await clearAdminState(env, chatId); await sendAdminDashboard(env, chatId, messageId); }
      return;
    }

    if(data==='adm_payment_icons'){
      if(String(chatId)!==String(env.ADMIN_ID))return;
      await clearAdminState(env,chatId);
      await showPaymentIcons(env,chatId,messageId);return;
    }
    if(data.startsWith('adm_payicon_')){
      if(String(chatId)!==String(env.ADMIN_ID))return;
      const method=data.slice('adm_payicon_'.length);
      if(!PAYMENT_ICON_METHODS.includes(method))return;
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_payment_icon', ?)").bind(chatId,method).run();
      await editMsg(env,chatId,messageId,`<b>${PAYMENT_ICON_LABELS[method]} Custom Emoji</b>\n\nSend a Telegram custom emoji or its numeric Custom Emoji ID.\nSend /remove to remove it.`,[[{text:'Cancel',callback_data:'adm_payment_icons'}]]);return;
    }

    const maintenanceAction=data.match(/^adm_maintenance_(on|off)$/);
    if(maintenanceAction){
      if(String(chatId)!==String(env.ADMIN_ID))return;
      const enabled=maintenanceAction[1]==='on';
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('maintenance_mode', ?)").bind(enabled?'1':'0').run();
      await clearAdminState(env,chatId);
      await sendAdminDashboard(env,chatId,messageId);
      return;
    }

    if (data === 'adm_redeem_menu') {
      if(String(chatId)!==String(env.ADMIN_ID))return;
      await clearAdminState(env,chatId);
      await editMsg(env,chatId,messageId,'🎁 <b>Redeem Codes</b>\n\nGenerate a voucher with a USD amount. It is active immediately, has no expiry and can be redeemed once only.',[[{text:'➕ Generate Code',callback_data:'adm_redeem_generate'}],[{text:'🔙 Admin Panel',callback_data:'admin_panel'}]]);
      return;
    }
    if (data === 'adm_redeem_generate') {
      if(String(chatId)!==String(env.ADMIN_ID))return;
      await clearBinanceInput(env,chatId);
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_redeem_amount', '{}')").bind(chatId).run();
      await editMsg(env,chatId,messageId,'🎁 <b>Generate Redeem Code</b>\n\nEnter the amount in USD (e.g. <code>5</code> or <code>10.50</code>):',[[{text:'❌ Cancel',callback_data:'adm_redeem_menu'}]]);
      return;
    }

    if (data === "adm_stock_menu") {
      const { results: prods } = await env.DB.prepare("SELECT p.*, CASE WHEN p.is_external = 1 THEN COALESCE(p.api_stock, 0) ELSE (SELECT COUNT(*) FROM inventory i WHERE i.product_id = p.id AND i.is_sold = 0) END as stock_qty FROM products p WHERE p.is_active = 1").all();
      const buttons = prods.map(p => [productListButton(p, `adm_addstock_${p.id}`)]);
      buttons.push([{ text: "🔙 Admin Panel", callback_data: "admin_panel" }]);
      await editMsg(env, chatId, messageId, `📦 <b>Select Product to Add Stock:</b>\nClick any product below:`, buttons);
      return;
    }

    if (data.startsWith("adm_addstock_") || data.startsWith("adm_stockmulti_") || data.startsWith("adm_stockline_")) {
      const multiline = data.startsWith("adm_stockmulti_");
      const choosing = data.startsWith("adm_addstock_");
      const prodId = data.replace(/^adm_(?:addstock|stockmulti|stockline)_/, "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ? AND is_active=1").bind(prodId).first();
      if (!prod || prod.is_external) { await editMsg(env,chatId,messageId,'Choose an active local product to add stock.',[[{text:'Back',callback_data:'adm_stock_menu'}]]); return; }
      if (choosing) {
        await clearAdminState(env,chatId);
        await editMsg(env,chatId,messageId,`📥 <b>Add Stock · ${escapeHtml(prod.name)}</b>\n\nChoose how your stock is formatted.\nMultiline: one complete account with all its details.\nSingle-line: one key or account per line.`,[
          [{text:'📄 Multiline Accounts',callback_data:`adm_stockmulti_${prodId}`}],
          [{text:'🔑 Single-line Items',callback_data:`adm_stockline_${prodId}`}],
          [{text:'Cancel',callback_data:'adm_stock_menu'}]
        ]); return;
      }
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, ?, ?)").bind(chatId,multiline?'awaiting_stock_multiline':'awaiting_stock',prodId).run();
      await editMsg(env, chatId, messageId, `📥 <b>Add Stock · ${escapeHtml(prod.name)}</b>\n\n${multiline ? 'Paste all details of one account in one message. Line breaks and numbering will be kept in the delivered text document.\n\nFor multiple accounts, separate each complete account with a line containing <code>---</code>. Do not use this separator inside an account.' : 'Send one complete stock item per line.'}\n\nUp to 50 items, 1500 characters per item.`, [
        [{ text: "Back", callback_data: `adm_addstock_${prodId}` }],
        [{ text: "Cancel", callback_data: "adm_stock_menu" }]
      ]);
      return;
    }

    if(data==='adm_price_menu'){await showPricingProducts(env,chatId,0,messageId);return;}

    if (data.startsWith("adm_setprice_")) {
      const prodId = data.replace("adm_setprice_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();
      const liveStock = prod.is_external ? (prod.api_stock || 0) : (stock ? stock.count : 0);
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_new_price', ?)").bind(chatId, prodId).run();

      const costInfo = prod.is_external ? `\n• Provider Cost: <b>$${adminMoney(prod.cost_price_usd)} USD</b>` : prod.purchase_cost_usd==null?"\n• Purchase Cost: Not set":`\n• Purchase Cost: <b>$${adminMoney(prod.purchase_cost_usd)}</b>\n• Gross Profit / Item: <b>$${localProfitInfo(prod.purchase_cost_usd,prod.price_usd).profit}</b>`;
      await editMsg(env, chatId, messageId, `💰 <b>Set Custom Price for: ${prod ? prod.name : "Product"}</b>\n${costInfo}\n• Current Price: <b>$${prod.price_usd.toFixed(2)} USD</b> (≈ ৳${prod.price_bdt} BDT)\n• Live Stock: <b>${liveStock} items</b>\n\n👉 <b>Tap a Profit Margin % button below</b> OR <b>type a custom price / margin in chat</b>:`, [
        [
          { text: "+10% Profit", callback_data: `adm_quickmargin_${prod.id}_10` },
          { text: "+20% Profit", callback_data: `adm_quickmargin_${prod.id}_20` },
          { text: "+25% Profit", callback_data: `adm_quickmargin_${prod.id}_25` }
        ],
        [
          { text: "+30% Profit", callback_data: `adm_quickmargin_${prod.id}_30` },
          { text: "+40% Profit", callback_data: `adm_quickmargin_${prod.id}_40` },
          { text: "+50% Profit", callback_data: `adm_quickmargin_${prod.id}_50` }
        ],
        [
          { text: "+75% Profit", callback_data: `adm_quickmargin_${prod.id}_75` },
          { text: "+100% (2x)", callback_data: `adm_quickmargin_${prod.id}_100` }
        ],
        [{ text: "❌ Cancel", callback_data: "adm_price_menu" }]
      ]);
      return;
    }

    if (data.startsWith("adm_quickmargin_")) {
      const parts = data.replace("adm_quickmargin_", "").split("_");
      const prodId = parts[0];
      const marginPct = parseFloat(parts[1]) || 20;
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      if (!prod) return;
      const baseCost = prod.is_external ? prod.cost_price_usd : (prod.purchase_cost_usd ?? prod.price_usd);
      const newUsd = Number((baseCost * (1 + marginPct / 100)).toFixed(2));
      const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
      const newBdt = Math.round(newUsd * rate);

      await env.DB.prepare("UPDATE products SET price_usd = ?, price_bdt = ?, custom_price_usd = ? WHERE id = ?").bind(newUsd, newBdt, newUsd, prodId).run();
      await clearAdminState(env, chatId);

      const profitUsd = (newUsd - baseCost).toFixed(2);
      await editMsg(env, chatId, messageId, `✅ <b>Custom Price Updated!</b>\n\nProduct: <b>${productDisplayName(prod)}</b>\n• Profit Markup: <b>+${marginPct}%</b>\n• Base Cost: <b>$${baseCost.toFixed(2)} USD</b>\n• New Price: <b>$${newUsd.toFixed(2)} USD</b> (≈ ৳${newBdt} BDT)\n• Net Profit: <b>+$${profitUsd} USD</b> per sale! 🚀`, [
        [{ text: "💰 Set Another Price", callback_data: "adm_price_menu" }],
        [{ text: "👑 Admin Panel", callback_data: "admin_panel" }]
      ]);
      return;
    }

    if(data==='adm_add_product'||data.startsWith('adm_newicon_')){await showNewProductCategories(env,chatId,0,messageId);return;}
    const newCategoryPage=data.match(/^adm_newcategories_(\d+)$/);if(newCategoryPage){await showNewProductCategories(env,chatId,newCategoryPage[1],messageId);return;}
    const newProductCategory=data.match(/^adm_newcategory_(\d+)$/);if(newProductCategory){await beginProductInCategory(env,chatId,Number(newProductCategory[1]),messageId);return;}
    if(data==='adm_newcategory_create'){
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'awaiting_category_name','new_product')").bind(chatId).run();
      await editMsg(env,chatId,messageId,'Enter the new category name (1–60 characters). The new product will use this category.',[[{text:'Back',callback_data:'adm_add_product'}]]);return;
    }

    if (data.startsWith("adm_icon_") || data.startsWith("adm_iconpick_") || data.startsWith("adm_iconcustom_")) {
      if (String(chatId) !== String(env.ADMIN_ID)) return;
      if (data.startsWith("adm_iconpick_")) {
        const [productId, choice] = data.slice("adm_iconpick_".length).split("_");
        const icon = choice === "DEFAULT" ? null : choice === "NONE" ? "" : choice;
        if (icon !== null && icon !== "" && !validProductIcon(icon)) return;
        await saveProductIcon(env, chatId, productId, icon);
        return;
      }
      const custom = data.startsWith("adm_iconcustom_");
      const productId = data.slice(custom ? "adm_iconcustom_".length : "adm_icon_".length);
      const product = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(productId).first();
      if (!product) return;
      if (custom) {
        await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_product_icon', ?)").bind(chatId, productId).run();
        await editMsg(env, chatId, messageId, "Send one emoji for this product (e.g. 🎬). Send /cancel to cancel.", [
          [{ text: "❌ Cancel", callback_data: `adm_icon_${productId}` }]
        ]);
        return;
      }
      await clearAdminState(env, chatId);
      const icons = ["🎬", "🤖", "🛡️", "🎵", "🎓", "💎", "🎨", "🔑"];
      const keyboard = [];
      for (let i = 0; i < icons.length; i += 4) {
        keyboard.push(icons.slice(i, i + 4).map(icon => ({ text: icon, callback_data: `adm_iconpick_${productId}_${icon}` })));
      }
      keyboard.push([{ text: "✏️ Send Custom Emoji", callback_data: `adm_iconcustom_${productId}` }]);
      keyboard.push([{ text: "Remove Icon", callback_data: `adm_iconpick_${productId}_NONE` }, { text: "Use Original Icon", callback_data: `adm_iconpick_${productId}_DEFAULT` }]);
      keyboard.push([{ text: "🔙 Back", callback_data: `adm_prod_details_${productId}` }]);
      await editMsg(env, chatId, messageId, `Choose an icon for <b>${escapeHtml(productDisplayName(product))}</b>:`, keyboard);
      return;
    }

    if (data === "adm_manage_products") {
      const { results: prods } = await env.DB.prepare("SELECT p.*, CASE WHEN p.is_external = 1 THEN COALESCE(p.api_stock, 0) ELSE (SELECT COUNT(*) FROM inventory i WHERE i.product_id = p.id AND i.is_sold = 0) END as stock_qty FROM products p WHERE p.is_active = 1 ORDER BY p.id ASC").all();
      const buttons = prods.map(p => [productListButton(p, `adm_prod_details_${p.id}`)]);
      buttons.push([{ text: "🔄 Refresh", callback_data: "adm_manage_products" }, { text: "🔙 Admin Panel", callback_data: "admin_panel" }]);
      await editMsg(env, chatId, messageId, `🛍️ <b>Available Products</b>\n\n<i>Click any product below to view details or edit:</i>`, buttons);
      return;
    }

    const renameProduct=data.match(/^adm_rename_product_(\d+)$/);
    if(renameProduct){
      const product=await env.DB.prepare('SELECT * FROM products WHERE id=? AND is_active=1').bind(renameProduct[1]).first();
      if(!product||product.is_external){await sendMsg(env,chatId,'Choose an active local product to edit its name.');return;}
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'awaiting_product_rename',?)").bind(chatId,String(product.id)).run();
      await editMsg(env,chatId,messageId,`✏️ <b>Edit Product Name</b>\n\nCurrent name: <b>${escapeHtml(product.name)}</b>\n\nSend the new name in one line (1–120 characters). This changes the catalog name; existing orders keep their saved product name.`,[[{text:'Cancel',callback_data:`adm_prod_details_${product.id}`}]]);return;
    }

    if (data.startsWith("adm_prod_details_")) {
      await clearAdminState(env,chatId);
      const prodId = data.replace("adm_prod_details_", "");
      let prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      if (!prod) return;
      if (prod.is_external === 1) prod = await fetchLiveProductStock(env, prod);
      const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();
      const liveStock = prod.is_external ? (prod.api_stock || 0) : (stock ? stock.count : 0);

      const text = `📦 <b>${productDisplayName(prod)}</b>\n\n• Selling Price: <b>$${prod.price_usd.toFixed(2)} USD (≈ ৳${prod.price_bdt} BDT)</b>\n` +
        (prod.is_external ? `• Provider Cost: <b>$${prod.cost_price_usd.toFixed(2)} USD</b>\n• Origin: <b>External Bot API (Live Synced)</b>\n` : `• Purchase Cost: <b>${prod.purchase_cost_usd==null?'Not set':'$'+adminMoney(prod.purchase_cost_usd)}</b>\n• Gross Profit / Item: <b>${prod.purchase_cost_usd==null?'Unknown':'$'+localProfitInfo(prod.purchase_cost_usd,prod.price_usd).profit}</b>\n• Markup on Cost: <b>${prod.purchase_cost_usd==null?'Unknown':localProfitInfo(prod.purchase_cost_usd,prod.price_usd).markup}</b>\n• Origin: <b>Manual Store Stock</b>\n`) +
        `• Live Stock: <b>${liveStock} items</b>\n\n📝 <b>Description:</b>\n${renderProductDescription(prod.description)}`;

      const buttons = [
        prod.is_external?[]:[{text:"✏️ Edit Name",callback_data:`adm_rename_product_${prod.id}`}],
        [{ text: "💰 Set Custom Price", callback_data: `adm_setprice_${prod.id}` }],
        prod.is_external?[]:[{text:"💵 Set Purchase Cost",callback_data:`adm_local_cost_${prod.id}`}],
        [{ text: "🎨 Set Product Icon", callback_data: `adm_icon_${prod.id}` }],
        [{text:"📂 Set Category",callback_data:`adm_cat_product_${prod.id}_0`}],
        prod.is_external ? [] : [{ text: "➕ Add Stock", callback_data: `adm_addstock_${prod.id}` }],
        [{ text: "🗑️ Delete Product", callback_data: `adm_del_prod_${prod.id}` }],
        [{ text: "🔙 Back", callback_data: "adm_manage_products" }]
      ].filter(r => r.length > 0);
      await editMsg(env, chatId, messageId, text, buttons);
      return;
    }

    if (data.startsWith("adm_del_prod_")) {
      await env.DB.prepare("UPDATE products SET is_active = 0 WHERE id = ?").bind(data.replace("adm_del_prod_", "")).run();
      await editMsg(env, chatId, messageId, `✅ Product removed from store!`, [[{ text: "🔙 Products List", callback_data: "adm_manage_products" }]]);
      return;
    }

    if (data === "adm_view_preorders") {
      const { results: preorders } = await env.DB.prepare("SELECT po.*, p.name as product_name FROM preorders po JOIN products p ON po.product_id = p.id WHERE po.status = 'pending' ORDER BY po.id DESC LIMIT 10").all();
      let poText = `⏳ <b>Pending Pre-Orders:</b>\n\n`;
      if (!preorders || preorders.length === 0) poText += `There are no pending pre-orders.`;
      else preorders.forEach(po => { poText += `🔹 #${po.id} — <b>${po.product_name}</b>\nUser: ${po.username} (ID: <code>${po.user_id}</code>)\nDate: ${po.created_at}\n\n`; });
      await editMsg(env, chatId, messageId, poText, [[{ text: "🔙 Admin Panel", callback_data: "admin_panel" }]]);
      return;
    }

    // Rate, Commission & Support Settings
    if (data === "adm_set_rate") {
      const currentRate = await getSetting(env, "usd_to_bdt_rate", "125");
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_rate', '')").bind(chatId).run();
      await editMsg(env, chatId, messageId, `💱 <b>Set USD to BDT Rate:</b>\nCurrent: <b>1 USD = ${currentRate} BDT</b>\n\nEnter new exchange rate in BDT (e.g. <code>122</code>):`, [[{ text: "❌ Cancel", callback_data: "admin_panel" }]]);
      return;
    }

    if (data === "adm_set_ref_comm") {
      const currentPct = await getSetting(env, "referral_commission_percent", "5");
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_ref_comm', '')").bind(chatId).run();
      await editMsg(env, chatId, messageId, `🎁 <b>Set Referral Commission:</b>\nCurrent: <b>${currentPct}%</b> on purchases.\n\nEnter new percentage (e.g. <code>10</code>):`, [[{ text: "❌ Cancel", callback_data: "admin_panel" }]]);
      return;
    }

    if (data === "adm_set_support") {
      const currentSup = await getSetting(env, "support_admin", "@fojlaybd");
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_support_contact', '')").bind(chatId).run();
      await editMsg(env, chatId, messageId, `📞 <b>Set Support Contact:</b>\nCurrent: <b>${currentSup}</b>\n\nEnter Admin Telegram Username (e.g. <code>@fojlaybd</code>) or Chat ID:`, [[{ text: "❌ Cancel", callback_data: "admin_panel" }]]);
      return;
    }

    // Force Join Settings Menu
    if (data === "adm_force_menu") {
      const channel = await getSetting(env, "force_channel_username", "");
      const group = await getSetting(env, "force_group_username", "");
      const isActive = (channel || group);
      await editMsg(env, chatId, messageId, `🔒 <b>Mandatory Channel & Group Membership (Force Join):</b>\n\nStatus: ${isActive ? "🟢 <b>ACTIVE (Mandatory Join Enabled)</b>" : "⚪ <b>DISABLED (Open Access)</b>"}\n\n• <b>Announcement Channel:</b> ${channel ? `<code>${channel}</code>` : "<i>Not Set</i>"}\n• <b>Community Chat Group:</b> ${group ? `<code>${group}</code>` : "<i>Not Set</i>"}\n\n<blockquote>💡 Make sure your bot is an Administrator in both the channel and group so it can verify members!</blockquote>`, [
        [{ text: "📢 Set Channel Username / Link", callback_data: "adm_set_force_channel" }],
        [{ text: "💬 Set Group Username / Link", callback_data: "adm_set_force_group" }],
        isActive ? [{ text: "❌ Disable Force Join", callback_data: "adm_disable_force" }] : [],
        [{ text: "🔙 Admin Panel", callback_data: "admin_panel" }]
      ].filter(r => r.length > 0));
      return;
    }

    if (data === "adm_set_force_channel") {
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_force_channel', '')").bind(chatId).run();
      await editMsg(env, chatId, messageId, `📢 <b>Set Announcement Channel:</b>\n\nEnter the username (e.g. <code>@MyStoreChannel</code>) or link:\n<i>(Make sure the bot is an Admin in this channel!)</i>`, [[{ text: "❌ Cancel", callback_data: "adm_force_menu" }]]);
      return;
    }

    if (data === "adm_set_force_group") {
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_force_group', '')").bind(chatId).run();
      await editMsg(env, chatId, messageId, `💬 <b>Set Community Chat Group:</b>\n\nEnter the username (e.g. <code>@MyStoreGroup</code>) or link:\n<i>(Make sure the bot is an Admin in this group!)</i>`, [[{ text: "❌ Cancel", callback_data: "adm_force_menu" }]]);
      return;
    }

    if (data === "adm_disable_force") {
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('force_channel_username', '')").run();
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('force_group_username', '')").run();
      await editMsg(env, chatId, messageId, `✅ <b>Force Join Disabled!</b>\nUsers can now use the bot freely.`, [
        [{ text: "🔙 Force Join Menu", callback_data: "adm_force_menu" }],
        [{ text: "👑 Admin Panel", callback_data: "admin_panel" }]
      ]);
      return;
    }

    // VEXORIX Reseller API Management
    if (data === "adm_api_menu") {
      const apiUrl = await getSetting(env, "external_api_url", "https://207-148-64-141.sslip.io");
      const apiKey = await getSetting(env, "external_api_key", "");
      const margin = await getSetting(env, "external_profit_margin", "20");
      const marginType=await getSetting(env,'external_profit_margin_type','percent');
      const marginLabel=marginType==='fixed'?`+$${Number(margin).toFixed(2)} USD`:`${margin}%`;
      const autoOrder = await getSetting(env, "auto_order_enabled", "1") === "1";
      const apiProds = await env.DB.prepare("SELECT COUNT(*) as c FROM products WHERE is_external = 1 AND is_active = 1").first();
      const count = apiProds ? apiProds.c : 0;

      let balanceText = "⚠️ Not Connected";
      let statusText = "⚠️ Missing Key";
      if (apiKey) {
        const acc = await checkResellerAccount(env);
        if (acc && acc.wallet) { statusText = "✅ Connected & Verified"; balanceText = `$${Number(acc.wallet.balance || 0).toFixed(2)} ${acc.wallet.currency || "USDT"}`; }
        else { statusText = "✅ Key Set (Live Sync Ready)"; balanceText = "Active"; }
      }

      const apiText = `🔌 <b>Live External API Center</b>\n━━━━━━━━━━━━━━━━━━━━\n• <b>API Status:</b> ${statusText}\n• <b>Wallet:</b> <b>${balanceText}</b>\n• <b>Base URL:</b> <code>${apiUrl}</code>\n• <b>API Key:</b> <code>${apiKey ? apiKey.slice(0, 10) + "••••••••" : "Not Set"}</code>\n• <b>Profit Margin:</b> <b>${marginLabel}</b>\n• <b>Auto-Order:</b> <b>${autoOrder ? "✅ Enabled" : "⏸️ Disabled"}</b>\n• <b>Active Synced Products:</b> <b>${count} products (Live Stock Sync Enabled)</b>`;
      await editMsg(env, chatId, messageId, apiText, [
        [{ text: "🔄 Sync Products Now", callback_data: "adm_sync_api" }],
        [{ text: "🔑 Set API Key", callback_data: "adm_set_api_key" }, { text: "🔗 Set Base URL", callback_data: "adm_set_api_url" }],
        [{ text: "Default Percentage %", callback_data: "adm_set_api_margin" }, { text: `🤖 Auto-Order: ${autoOrder ? "ON" : "OFF"}`, callback_data: "adm_toggle_auto_order" }],
        [{text:'Default Fixed Profit +USD',callback_data:'adm_set_api_fixed_margin'}],
        [{ text: "💰 Set Custom Prices", callback_data: "adm_price_menu" }],
        [{ text: "🧪 Test Demo API", callback_data: "adm_setup_demo_api" }],
        [{ text: "🔙 Admin Panel", callback_data: "admin_panel" }]
      ]);
      return;
    }

    if (data === "adm_toggle_auto_order") {
      const cur = await getSetting(env, "auto_order_enabled", "1");
      const next = cur === "1" ? "0" : "1";
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('auto_order_enabled', ?)").bind(next).run();
      await ansCb(env, cb.id, `Auto-order ${next === "1" ? "Enabled" : "Disabled"}`);
      await sendAdminDashboard(env, chatId, messageId);
      return;
    }

    if (data === "adm_setup_demo_api") {
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('external_api_url', ?)").bind(`${originUrl}/api/mock-provider`).run();
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('external_api_key', 'vxr_live_demo_key_12345')").run();
      const syncResult = await syncExternalProducts(env, `${originUrl}/api/mock-provider`, "vxr_live_demo_key_12345", true);
      await editMsg(env, chatId, messageId, `🧪 <b>Demo API Connected & Products Synced!</b>\n\n${syncResult.message}`, [
        [{ text: "🛒 Open Shop to Test", callback_data: "shop" }],
        [{ text: "👑 Admin Panel", callback_data: "admin_panel" }]
      ]);
      return;
    }

    if (data === "adm_sync_api") {
      await ansCb(env, cb.id, "⏳ Syncing live products from provider API...");
      const syncResult = await syncExternalProducts(env, null, null, true);
      await sendMsg(env, chatId, syncResult.success ? `🎉 <b>API Sync Successful!</b>\n\n${syncResult.message}` : `❌ <b>API Sync Failed</b>\n\n${syncResult.message}`, [
        [{ text: "💰 Set Custom Prices", callback_data: "adm_price_menu" }],
        [{ text: "👑 Admin Panel", callback_data: "admin_panel" }]
      ]);
      return;
    }

    if (data === "adm_set_api_url" || data === "adm_set_api_key" || data === "adm_set_api_margin") {
      let stateName = "awaiting_api_url";
      let prompt = "Please enter External API Base URL (e.g. <code>https://207-148-64-141.sslip.io</code>):";
      if (data === "adm_set_api_key") { stateName = "awaiting_api_key"; prompt = "Please enter your External API Key (e.g. <code>vxr_live_...</code>):"; }
      else if (data === "adm_set_api_margin") { stateName = "awaiting_api_margin"; prompt = "Please enter default profit margin % for synced products (e.g. <code>25</code>):"; }
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, ?, '')").bind(chatId, stateName).run();
      await editMsg(env, chatId, messageId, `⚙️ <b>${prompt}</b>`, [[{ text: "❌ Cancel", callback_data: "adm_api_menu" }]]);
      return;
    }

    // Payment Accounts & Auto-Verification Settings
    if (data === "adm_payment_settings") {
      const bkash = await getSetting(env, "bkash_num", "017XXXXXXXX");
      const nagad = await getSetting(env, "nagad_num", "017XXXXXXXX");
      const rocket = await getSetting(env, "rocket_num", "017XXXXXXXX");
      const binance = await getSetting(env, "binance_id", "6029752069");
      const binanceAuto = (await getSetting(env, "binance_auto_verify", "1")) === "1";
      const bep20 = await getSetting(env, "bep20_addr", "0x71C...YourAddress");

      await editMsg(env, chatId, messageId, `⚙️ <b>Payment Accounts & Auto-Verification Settings:</b>\n\n• bKash: <code>${bkash}</code>\n• Nagad: <code>${nagad}</code>\n• Rocket: <code>${rocket}</code> · Manual review / Add Balance\n• Binance Pay ID: <code>${binance}</code>\n• Binance Auto-Verify: <b>${binanceAuto ? "🟢 Enabled (Personal Pay History API)" : "⚪ Manual Verification"}</b>\n• BEP20 USDT (BSC): <code>${bep20}</code> <i>(Auto-verified via Blockchain)</i>`, [
        [{ text: "✏️ Change bKash", callback_data: "adm_set_bkash" }, { text: "✏️ Change Nagad", callback_data: "adm_set_nagad" }],
        [{ text: "✏️ Change Rocket", callback_data: "adm_set_rocket" }, { text: "✏️ Change Binance Pay ID", callback_data: "adm_set_binance" }],
        [{ text: `🤖 Binance Auto-Verify: ${binanceAuto ? "ON" : "OFF"}`, callback_data: "adm_toggle_binance_auto" }],
        [{text:"📡 Payment & SMS Status",callback_data:"adm_payment_health"}],
        [{ text: "Payment Custom Emojis", callback_data: "adm_payment_icons" }],
        [{ text: "✏️ Change BEP20 Address", callback_data: "adm_set_bep20" }],
        [{ text: "🔙 Admin Panel", callback_data: "admin_panel" }]
      ]);
      return;
    }

    if (data === "adm_toggle_binance_auto") {
      const cur = await getSetting(env, "binance_auto_verify", "1");
      const next = cur === "1" ? "0" : "1";
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('binance_auto_verify', ?)").bind(next).run();
      await ansCb(env, cb.id, `Binance Auto-Verify is now ${next === "1" ? "ON" : "OFF"}`);
      await sendAdminDashboard(env, chatId, messageId);
      return;
    }

    if (data.startsWith("adm_set_") && !data.startsWith("adm_set_rate") && !data.startsWith("adm_set_ref") && !data.startsWith("adm_set_support") && !data.startsWith("adm_set_api") && !data.startsWith("adm_set_force")) {
      const field = data.replace("adm_set_", "");
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, ?, '')").bind(chatId, `awaiting_setting_${field}`).run();
      await editMsg(env, chatId, messageId, `✏️ <b>Enter new ${field.toUpperCase()} number/address:</b>`, [[{ text: "❌ Cancel", callback_data: "adm_payment_settings" }]]);
      return;
    }

    if (data === "adm_broadcast") {
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_broadcast', '')").bind(chatId).run();
      await editMsg(env, chatId, messageId, `📢 <b>Broadcast Announcement:</b>\n\nType your message below. It will be sent to all store users!`, [[{ text: "❌ Cancel", callback_data: "admin_panel" }]]);
      return;
    }

    // Admin Manual Order Approvals
    if (data.startsWith("admin_reject_")) {
      const orderId = data.replace("admin_reject_", "");
      const rejected=await env.DB.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status='pending'").bind(orderId).run();
      if(!rejected.meta?.changes){await editMsg(env,chatId,messageId,'This order is already processed or closed.');return;}
      const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();
      if (order) await sendMsg(env, order.user_id, `❌ <b>Order #${orderId} cancelled:</b> Payment details could not be verified.`);
      await editMsg(env, chatId, messageId, `❌ Order #${orderId} rejected.`);
      return;
    }

    if (data.startsWith("adm_rejdep_")) {
      const depId = data.replace("adm_rejdep_", "");
      const rejected=await env.DB.prepare("UPDATE deposits SET status = 'rejected' WHERE id = ? AND status='pending'").bind(depId).run();
      if(!rejected.meta?.changes){await editMsg(env,chatId,messageId,'This deposit is already processed or closed.');return;}
      const dep = await env.DB.prepare("SELECT * FROM deposits WHERE id = ?").bind(depId).first();
      if (dep) await sendMsg(env, dep.user_id, `❌ Deposit #${depId} could not be verified.`);
      await editMsg(env, chatId, messageId, `❌ Deposit #${depId} rejected.`);
      return;
    }
  }
}

// ====================================================================
// Real-Time Live Stock Engine & Reseller API
// ====================================================================
async function checkResellerAccount(env) {
  try {
    let baseUrl = (await getSetting(env, "external_api_url", "https://207-148-64-141.sslip.io")).trim().replace(/\/+$/, "");
    if (baseUrl.includes("/api/reseller")) baseUrl = baseUrl.split("/api/reseller")[0];
    const apiKey = await getSetting(env, "external_api_key", "");
    if (!apiKey) return null;
    const res = await fetchWithTimeout(`${baseUrl}/api/reseller/me`, { method: "GET", headers: { "X-Reseller-Key": apiKey, "Accept": "application/json", "User-Agent": "TelegramStoreBot/2.0" } }, 3000);
    if (!res.ok) return null;
    return await res.json();
  } catch (_) { return null; }
}

// Preserve the provider's branding instead of guessing an icon from the name.
function providerProductName(item) {
  const name = String(item.name || item.title || item.product_name || "External Product").trim();
  const icon = item.emoji ?? item.icon;
  // Button labels accept text emoji, not image URLs or custom-emoji IDs.
  if (typeof icon !== "string" || !/\p{Extended_Pictographic}/u.test(icon) ||
      /https?:\/\//i.test(icon) || /\p{Extended_Pictographic}/u.test(name)) return name;
  return `${icon.trim()} ${name}`;
}

// Telegram custom emoji IDs must remain strings to avoid integer precision loss.
function providerEmojiId(item) {
  const id = item.icon_custom_emoji_id ?? item.custom_emoji_id;
  return typeof id === "string" && /^\d+$/.test(id) ? id : null;
}

// Shared layout for customer and admin product lists.
function productListButton(product, callbackData, verified = true) {
  const stock = product.stock_qty || 0;
  const price = Number(product.price_usd).toFixed(2).replace(/\.00$/, "");
  // Old imports may already contain stock-status dots in the stored name.
  // Remove only leading status markers; retain the actual product branding.
  const name = productDisplayName(product).replace(/^(?:\s*[🔴🟢])+\s*/u, "").trim();
  return {
    text: `${name} - $${price} (${verified ? stock : "?"})`,
    ...productButtonIcon(product),
    ...(verified ? { style: stock > 0 ? "success" : "danger" } : {}),
    callback_data: callbackData
  };
}

function productButtonIcon(product) {
  if (product.custom_icon !== null && product.custom_icon !== undefined) return {};
  const id = providerEmojiId({ icon_custom_emoji_id: product.provider_emoji_id });
  return id ? { icon_custom_emoji_id: id } : {};
}

// NULL follows the provider; an empty string explicitly hides its leading icon.
function productDisplayName(product) {
  const name = String(product.name || "Product");
  if (product.custom_icon === null || product.custom_icon === undefined) return name;
  const segments = [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(name)];
  while (segments.length && (/^\s+$/u.test(segments[0].segment) ||
    /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(segments[0].segment))) segments.shift();
  const plainName = segments.map(part => part.segment).join("").trim() || "Product";
  return product.custom_icon ? `${product.custom_icon} ${plainName}` : plainName;
}

function validProductIcon(text) {
  return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text)].length === 1 &&
    /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20e3]/u.test(text);
}

async function saveProductIcon(env, chatId, productId, icon) {
  if (String(chatId) !== String(env.ADMIN_ID)) return false;
  const product = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(productId).first();
  if (!product) {
    await sendMsg(env, chatId, "⚠️ Product not found.");
    return false;
  }
  await env.DB.prepare("UPDATE products SET custom_icon = ? WHERE id = ?").bind(icon, productId).run();
  await clearAdminState(env, chatId);
  await sendMsg(env, chatId, `✅ Icon updated: <b>${escapeHtml(productDisplayName({ ...product, custom_icon: icon }))}</b>`, [
    [{ text: "🔙 Back to Product", callback_data: `adm_prod_details_${productId}` }]
  ]);
  return true;
}

async function handleProductIconText(env, chatId, text, state) {
  if (String(chatId) !== String(env.ADMIN_ID) || state.state !== "awaiting_product_icon") return false;
  if (text === "/cancel") {
    await clearAdminState(env, chatId);
    await sendMsg(env, chatId, "Icon change cancelled.");
    return true;
  }
  const icon = text.trim();
  if (!validProductIcon(icon)) {
    await sendMsg(env, chatId, "Please send one emoji, e.g. 🎬 or 🛡️. Send /cancel to cancel.");
    return true;
  }
  await saveProductIcon(env, chatId, state.data, icon);
  return true;
}

// Never invent stock when a provider omits its quantity.
function providerStock(item) {
  if (item.available === false || item.available === 0 || item.available === "false") return 0;
  const raw = item.stock ?? item.remains;
  if (raw === null || raw === undefined || raw === "" || typeof raw === "boolean") return 0;
  const count = Number(raw);
  return Number.isFinite(count) && count >= 0 ? Math.floor(count) : 0;
}

// Use the same provider formats and reconciliation for detail and checkout.
async function fetchLiveProductStock(env, prod, forceFresh = true) {
  if (!prod || prod.is_external !== 1 || !prod.external_id) return prod;
  const result = await syncExternalProducts(env, null, null, false, String(prod.external_id), forceFresh);
  if (!result.success) return { ...prod, stock_verified: false };
  const fresh = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prod.id).first();
  return { ...(fresh || prod), stock_verified: Boolean(fresh) };
}

async function checkExternalStock(env, chatId, prod, quantity) {
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>(prod.is_external?100:1000)){await sendMsg(env,chatId,`Enter a whole quantity from 1 to ${prod.is_external?100:1000}.`);return false;}
  if(prod.is_active===0||(prod.price_usd!=null&&(!Number.isFinite(Number(prod.price_usd))||Number(prod.price_usd)<=0))){await sendMsg(env,chatId,'This product is unavailable or has an invalid price.');return false;}
  if (prod.is_external !== 1) return true;
  if (!prod.stock_verified) {
    await sendMsg(env, chatId, "⚠️ Live stock could not be verified. Please refresh and try again.");
    return false;
  }
  if (prod.api_stock < quantity) {
    await sendMsg(env, chatId, `⚠️ Only ${prod.api_stock} item(s) currently available. Please refresh the product and choose a smaller quantity.`);
    return false;
  }
  return true;
}

// Five-second browsing cache, isolated by database and provider configuration.
// Checkout, manual sync and explicit Refresh always bypass cached results.
const providerCatalogCache = new WeakMap();
async function readProviderCatalog(db, baseUrl, key, forceFresh = true) {
  const cached = providerCatalogCache.get(db);
  const matches = cached && cached.baseUrl === baseUrl && cached.key === key;
  if (!forceFresh && matches && cached.items && Date.now() < cached.expiresAt) return cached.items;
  if (matches && cached.pending) return cached.pending;
  const entry = { baseUrl, key, items: null, expiresAt: 0, pending: null };
  providerCatalogCache.set(db, entry);
  entry.pending = fetchProviderCatalog(baseUrl, key);
  try {
    const items = await entry.pending;
    entry.items = items;
    entry.expiresAt = Date.now() + 5000;
    return items;
  } catch (error) {
    if (providerCatalogCache.get(db) === entry) providerCatalogCache.delete(db);
    throw error;
  } finally { entry.pending = null; }
}

async function fetchProviderCatalog(baseUrl, key) {
    let items = null;
    let isVexorix = false;

    try {
      const vResp = await fetchWithTimeout(`${baseUrl}/api/reseller/products`, {
        method: "GET",
        headers: { "X-Reseller-Key": key, "Accept": "application/json", "User-Agent": "TelegramStoreBot/2.0" }
      }, 3500);
      if (vResp.ok) {
        const vData = await vResp.json();
        if (vData && Array.isArray(vData.products)) {
          isVexorix = true;
          items = vData.products.map(p => ({
            id: p.id,
            name: p.name,
            category: p.category,
            category_name: p.category_name,
            emoji: p.emoji,
            icon: p.icon,
            icon_custom_emoji_id: p.icon_custom_emoji_id,
            custom_emoji_id: p.custom_emoji_id,
            desc: p.description ? (p.description + (p.how_to_use ? `\n\n📖 Instructions:\n${p.how_to_use}` : "")) : (p.how_to_use || "Digital License"),
            rate: p.price,
            stock: providerStock(p)
          }));
        }
      }
    } catch (_) {}

    if (!isVexorix) {
      try {
        const resp = await fetchWithTimeout(baseUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, action: "services" })
        }, 3500);
        if (resp.ok) {
          const d = await resp.json();
          items = Array.isArray(d) ? d : (d.services ?? d.products ?? d.data ?? null);
        }
      } catch (_) {}
    }

    if (!Array.isArray(items)) throw new Error("Could not fetch provider products.");
    return items;

}

// Full live sync for all external products
async function syncExternalProducts(env, apiUrl = null, apiKey = null, isManual = false, targetExternalId = null, forceFresh = true) {
  try {
    const [configuredUrl, configuredKey, configuredRate, configuredMargin, configuredMarginType] = await Promise.all([
      apiUrl ?? getSetting(env, "external_api_url", "https://207-148-64-141.sslip.io"),
      apiKey ?? getSetting(env, "external_api_key", ""),
      getSetting(env, "usd_to_bdt_rate", "125"),
      getSetting(env, "external_profit_margin", "20"),
      getSetting(env,"external_profit_margin_type","percent")
    ]);
    let baseUrl = configuredUrl.trim().replace(/\/+$/, "");
    if (baseUrl.includes("/api/reseller")) baseUrl = baseUrl.split("/api/reseller")[0];
    const key = configuredKey;
    if (!key) return { success: false, message: "Please configure your External API Key in Admin Panel." };

    const items = await readProviderCatalog(env.DB, baseUrl, key, forceFresh);
    const snapshot = providerCatalogCache.get(env.DB);
    if (!forceFresh && targetExternalId === null && snapshot?.items === items && snapshot.appliedRate === configuredRate && snapshot.appliedMargin === configuredMargin && snapshot.appliedMarginType === configuredMarginType) {
      return { success: true, message: "Recent stock snapshot reused." };
    }

    const rate = parseFloat(configuredRate);
    const margin = parseFloat(configuredMargin);
    // One catalog read replaces a database round trip for every provider item.
    const { results: externalProducts } = targetExternalId === null
      ? await env.DB.prepare("SELECT * FROM products WHERE is_external = 1").all()
      : await env.DB.prepare("SELECT * FROM products WHERE is_external = 1 AND external_id = ?").bind(targetExternalId).all();
    const existingByExternalId = new Map(externalProducts.map(p => [String(p.external_id), p]));
    const seenIds = new Set();
    let importedCount = 0;
    for (const item of items) {
      const extId = String(item.id ?? item.service ?? item.product_id ?? "");
      if (!extId) continue;
      if (targetExternalId !== null && extId !== targetExternalId) continue;

      const name = providerProductName(item);
      const emojiId = providerEmojiId(item);
      const desc = item.desc || item.description || `Automated digital product delivered via API. (ID: ${extId})`;
      const rawCost=item.rate ?? item.price ?? item.cost;
      const baseCostPrice=(typeof rawCost==='number'||typeof rawCost==='string'&&/^\d+(?:\.\d+)?$/.test(rawCost.trim()))?Number(rawCost):NaN;
      if(!Number.isFinite(baseCostPrice)||baseCostPrice<=0)continue;
      const apiStock = providerStock(item);


      const existing = existingByExternalId.get(extId);
      const finalPrice=externalSellingPrice(baseCostPrice,existing,margin,configuredMarginType);
      if(finalPrice<=0)continue;
      seenIds.add(extId);
      const priceBdt = Math.round(finalPrice * rate);

      let targetId = null;
      let prevStock = 0;
      if (existing) {
        targetId = existing.id;
        prevStock = existing.api_stock || 0;
        if (existing.name !== name || existing.description !== desc ||
            Number(existing.cost_price_usd) !== baseCostPrice || Number(existing.price_usd) !== finalPrice ||
            Number(existing.price_bdt) !== priceBdt || Number(existing.api_stock) !== apiStock || existing.is_active !== 1 ||
            (existing.provider_emoji_id ?? null) !== emojiId) {
          await env.DB.prepare("UPDATE products SET name = ?, description = ?, cost_price_usd = ?, price_usd = ?, price_bdt = ?, api_stock = ?, provider_emoji_id = ?, is_active = 1 WHERE id = ?")
          .bind(name, desc, baseCostPrice, finalPrice, priceBdt, apiStock, emojiId, existing.id).run();
        }
      } else {
        const imported=await env.DB.batch([
          env.DB.prepare("INSERT INTO products (name, description, price_usd, price_bdt, cost_price_usd, custom_price_usd, api_stock, is_active, is_external, external_id, provider_emoji_id) VALUES (?, ?, ?, ?, ?, 0, ?, 1, 1, ?, ?)").bind(name,desc,finalPrice,priceBdt,baseCostPrice,apiStock,extId,emojiId),
          env.DB.prepare('INSERT OR IGNORE INTO product_notice_state(product_id,stock) SELECT id,MAX(0,COALESCE(api_stock,0)) FROM products WHERE is_external=1 AND external_id=?').bind(extId),
          env.DB.prepare(channelNewProductInsert("p.is_external=1 AND p.external_id=?")).bind(extId)
        ]);
        targetId=imported[0]?.meta?.last_row_id??null;
      }

      if(existing&&(existing.provider_category_id!=null||!existing.category_override&&existing.shop_category_id!=null)){
        await env.DB.prepare('UPDATE products SET provider_category_id=NULL,shop_category_id=CASE WHEN category_override=1 THEN shop_category_id ELSE NULL END WHERE id=?').bind(existing.id).run();
      }
      importedCount++;
    }

    // A successful complete catalog is authoritative, including an empty catalog.
    for (const product of externalProducts) {
      if ((targetExternalId === null || String(product.external_id) === targetExternalId) &&
          !seenIds.has(String(product.external_id)) && Number(product.api_stock) !== 0) {
        await env.DB.prepare("UPDATE products SET api_stock = 0 WHERE id = ?").bind(product.id).run();
      }
    }

    if(importedCount>10&&env.__orderTrace)env.__orderTrace.noticeMaxRecipients=4;
    if (targetExternalId === null) {
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_external_sync_time', ?)").bind(String(Date.now())).run();
      if (snapshot?.items === items) { snapshot.appliedRate = configuredRate; snapshot.appliedMargin = configuredMargin; snapshot.appliedMarginType=configuredMarginType; }
    }
    return { success: true, message: `Successfully connected! Imported & updated <b>${importedCount} products</b> with live stock and pricing.` };
  } catch (err) {
    return { success: false, message: `Error connecting to API: ${err.message}` };
  }
}

async function dispatchExternalOrder(env,prod,quantity,orderId){
  let apiKey='',baseUrl='',requestId='';
  const clean=value=>String(value||'').split(apiKey||'\u0000').join('[redacted]').split(env.BOT_TOKEN||'\u0000').join('[redacted]').slice(0,300);
  const decode=body=>{
    if(!body||!Array.isArray(body.items))return null;
    if(body.external_order_id!=null&&String(body.external_order_id)!==requestId)return null;
    if(body.product_id!=null&&String(body.product_id)!==String(prod.external_id))return null;
    if(['failed','cancelled','rejected','error'].includes(String(body.status||'').toLowerCase()))return null;
    const items=body.items.filter(x=>typeof x.content==='string'&&x.content.trim());
    if(items.length<quantity)return null;
    return {success:true,externalOrderId:String(body.order_id||body.id||''),credentials:items.map(x=>x.content).join('\n\n'),message:'Provider delivery confirmed'};
  };
  const backoff=async(response,body)=>{
    if(![429,503].includes(response.status))return;
    const requested=Number(body?.error?.retry_after_seconds||body?.retry_after_seconds||response.headers?.get('Retry-After')||30);
    const delay=Number.isFinite(requested)?Math.max(30,Math.min(3600,requested)):30;
    await env.DB.prepare('UPDATE orders SET provider_retry_at=MAX(COALESCE(provider_retry_at,0),?) WHERE id=?').bind(Date.now()+delay*1000,orderId).run();
  };
  const lookup=async()=>{
    try{
      const response=await fetchWithTimeout(`${baseUrl}/api/reseller/orders?external_order_id=${encodeURIComponent(requestId)}`,{headers:{'X-Reseller-Key':apiKey,'Accept':'application/json'}},4000);
      const body=await response.json().catch(()=>null);
      await backoff(response,body);
      if(response.status===404&&body?.error?.code==='order_not_found')return {missing:true};
      if(!response.ok)return {message:`Order lookup HTTP ${response.status}`};
      const candidates=Array.isArray(body?.orders)?body.orders:Array.isArray(body)?body:body?.order?[body.order]:[body];
      const match=candidates.find(x=>x?.external_order_id===requestId);
      if(!match)return {message:'Provider lookup did not return the matching external_order_id'};
      return decode(match)||{externalOrderId:String(match.order_id||match.id||''),message:'Provider order exists; codes are not ready yet'};
    }catch{return {message:'Provider order lookup unavailable'};}
  };
  try{
    baseUrl=String(await getSetting(env,'external_api_url','')).trim().replace(/\/+$/,'');
    if(baseUrl.includes('/api/reseller'))baseUrl=baseUrl.split('/api/reseller')[0];
    apiKey=await getSetting(env,'external_api_key','');
    if(!apiKey)return {success:false,rejected:true,message:'External API Key is not set'};
    if(!Number.isSafeInteger(quantity)||quantity<1||quantity>100||!String(prod.external_id||'').trim())return {success:false,rejected:true,message:'Provider product ID or quantity is invalid (allowed 1–100)'};
    orderStage(env,'provider.prepare',orderId);
    const existing=await env.DB.prepare('SELECT provider_request_id FROM orders WHERE id=?').bind(orderId).first();
    if(!existing)return {success:false,rejected:true,message:'Local order is missing'};
    await env.DB.prepare('UPDATE orders SET provider_request_id=COALESCE(provider_request_id,?) WHERE id=?').bind('shop-'+crypto.randomUUID(),orderId).run();
    requestId=(await env.DB.prepare('SELECT provider_request_id FROM orders WHERE id=?').bind(orderId).first()).provider_request_id;
    if(existing.provider_request_id){const found=await lookup();if(found.success)return found;if(!found.missing)return {success:false,...found};}
    orderStage(env,'provider.post',orderId);
    const response=await fetchWithTimeout(`${baseUrl}/api/reseller/orders`,{method:'POST',headers:{'X-Reseller-Key':apiKey,'Content-Type':'application/json','Accept':'application/json','Idempotency-Key':requestId},body:JSON.stringify({product_id:String(prod.external_id),quantity,external_order_id:requestId})},8000);
    const body=await response.json().catch(()=>null);
    await backoff(response,body);
    if(response.ok){providerCatalogCache.delete(env.DB);return decode(body)||{success:false,externalOrderId:String(body?.order_id||body?.id||''),message:'Provider accepted the order but complete codes were not returned'};}
    const code=body?.error?.code;
    const terminal=['invalid_request','invalid_external_order_id','invalid_json','product_not_available','invalid_api_key','insufficient_funds','wallet_frozen','account_disabled','product_not_found','out_of_stock','insufficient_stock','payload_too_large'];
    const result={success:false,rejected:terminal.includes(code),message:`Provider HTTP ${response.status}${code?' '+clean(code):''}: ${clean(body?.error?.message||body?.message||'Request failed')}`};
    if(code==='duplicate_external_order_id'||response.status>=500){const found=await lookup();if(found.success)return found;return {...result,rejected:false,externalOrderId:found.externalOrderId||'',message:result.message+'; '+found.message};}
    return result;
  }catch{
    if(requestId){const found=await lookup();if(found.success)return found;return {success:false,externalOrderId:found.externalOrderId||'',message:'Provider request interrupted; '+(found.message||'No confirmed provider order found')};}
    return {success:false,message:'Provider request configuration is unavailable'};
  }
}

async function processReferralCommission(env, buyerChatId, orderAmountUsd, productName) {
  try {
    const buyer = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(buyerChatId).first();
    if (!buyer || !buyer.referred_by || buyer.referred_by === 0) return;
    const referrerId = buyer.referred_by;
    const commPct = parseFloat(await getSetting(env, "referral_commission_percent", "5"));
    const commissionUsd = Number(((orderAmountUsd * commPct) / 100).toFixed(2));
    if (commissionUsd <= 0) return;
    const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
    const commissionBdt = Math.round(commissionUsd * rate);

    await env.DB.prepare(walletChangeSql("UPDATE users SET balance_usd = balance_usd + ?, balance_bdt = balance_bdt + ? WHERE user_id = ?",'referral','buyer:'+buyerChatId)).bind(commissionUsd, commissionBdt, referrerId).run();
    await sendMsg(env, referrerId, `🎉 <b>Referral Commission Received!</b>\n\nYour referred friend completed a purchase of <b>${productName}</b>!\n💰 Added: <b>+$${commissionUsd.toFixed(2)} USD (≈ ৳${commissionBdt} BDT)</b> (${commPct}% commission) to your wallet balance.`);
  } catch (e) { console.error("Referral Commission Error:", e); }
}

// Preorder restock and follower alerts share the durable queue and recipient cursor.
async function notifyPreorders(env) {
  try { await drainAllNotices(env); }
  catch { console.error('Queued restock delivery paused; stock remains saved.'); }
}

const membershipCache = new WeakMap();
async function checkForceJoin(env, chatId, forceFresh = false) {
  if (String(chatId) === String(env.ADMIN_ID)) return { passed: true };
  const [channel, group] = await Promise.all([
    getSetting(env, "force_channel_username", ""),
    getSetting(env, "force_group_username", "")
  ]);
  if (!channel && !group) return { passed: true };
  let cache = membershipCache.get(env.DB);
  if (!cache) { cache = new Map(); membershipCache.set(env.DB,cache); }
  const cacheKey = JSON.stringify([String(chatId),channel,group]);
  if (!forceFresh && (cache.get(cacheKey) || 0) > Date.now()) return { passed: true };

  const validStatuses = ["creator", "administrator", "member", "restricted"];
  const isMissing = async target => {
    if (!target) return false;
    const chat = target.startsWith("-") || target.startsWith("@") ? target : `@${target}`;
    try {
      const response = await callTg(env, "getChatMember", { chat_id: chat, user_id: chatId });
      return !response.ok || !response.result || !validStatuses.includes(response.result.status);
    } catch (_) { return true; }
  };
  const [missingChannel, missingGroup] = await Promise.all([isMissing(channel), isMissing(group)]);

  if (missingChannel || missingGroup) { cache.delete(cacheKey); return { passed: false, channel, group, missingChannel, missingGroup }; }
  if (cache.size >= 5000) cache.clear();
  cache.set(cacheKey,Date.now()+15000);
  return { passed: true };
}

async function sendForceJoinScreen(env, chatId, forceInfo, editMessageId = null) {
  const channelLink = forceInfo.channel ? (forceInfo.channel.startsWith("http") ? forceInfo.channel : `https://t.me/${forceInfo.channel.replace("@", "")}`) : "";
  const groupLink = forceInfo.group ? (forceInfo.group.startsWith("http") ? forceInfo.group : `https://t.me/${forceInfo.group.replace("@", "")}`) : "";

  const text = `🔒 <b>Must Join Channels to Use This Bot!</b>\n\nWelcome! To browse products, check prices, and place orders, please join our official community:\n\n📢 <b>1. Announcement Channel:</b> Updates & offers\n💬 <b>2. Discussion Group:</b> Customer chat & support\n\n👇 <b>Click both links below to join, then click 'Verify & Enter':</b>`;
  const buttons = [];
  if (channelLink) buttons.push([{ text: "📢 Join Announcement Channel", url: channelLink }]);
  if (groupLink) buttons.push([{ text: "💬 Join Community Group", url: groupLink }]);
  buttons.push([{ text: "🔄 Verify & Enter Store", callback_data: "check_force_join" }]);

  if (editMessageId) await editMsg(env, chatId, editMessageId, text, buttons);
  else await sendMsg(env, chatId, text, buttons);
}

// ====================================================================
// User Interface Views
// ====================================================================
async function referralCommissionEarned(env,chatId){
  const row=await env.DB.prepare("SELECT COALESCE(SUM(usd_delta_cents),0) AS cents FROM wallet_history WHERE user_id=? AND reason='referral' AND usd_delta_cents>0").bind(chatId).first();
  return (Number(row?.cents||0)/100).toFixed(2);
}

async function sendHomeDashboard(env, chatId, user, firstName, editMessageId = null) {
  const referralEarned=await referralCommissionEarned(env,chatId);
  const usdBal = user ? (user.balance_usd || 0).toFixed(2) : "0.00";
  const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
  const bdtBal = user ? Math.round((user.balance_usd || 0) * rate) : 0;

  const welcome = `🛒 <b>Welcome to SMART SUBS STORE!</b>\n\n` +
    `Hello ${escapeHtml(firstName)}! 👋\n` +
    `Browse subscriptions, manage your wallet and track your orders.\n\n` +
    `<blockquote>💰 <b>Wallet Balance: $${usdBal}</b> ≈ ৳${bdtBal}\n🎁 Referral Earned: <b>$${referralEarned} USD</b></blockquote>\n\n` +
    `Choose an option below:`;

  const keyboard = [
    [{text:'🛍️ Browse Shop',callback_data:'shop',style:'primary'}],
    [{text:'📦 My Orders',callback_data:'my_orders'},{text:'⏳ Pre-Orders',callback_data:'my_preorders'}],
    [{text:'🎁 Refer & Earn',callback_data:'refer'},{text:'📖 Guide / FAQ',callback_data:'user_guide'}],
    [{text:'👤 My Profile',callback_data:'profile'},{text:'⭐ Followed Products',callback_data:'product_follows_0'}],
    [{text:'👛 Wallet',callback_data:'profile',style:'primary'},{text:'💳 Deposit',callback_data:'deposit',style:'success'}],
    [{text:'💬 Support',callback_data:'support'}]
  ];
  if(String(chatId)===String(env.ADMIN_ID))keyboard.push([{text:'⚙️ Admin Panel',callback_data:'admin_panel',style:'primary'}]);

  if (editMessageId) {
    const res = await editMsg(env, chatId, editMessageId, welcome, keyboard);
    if (res && res.ok) return res;
  }
  return await sendMsg(env, chatId, welcome, keyboard);
}

const SHOP_PAGE_SIZE = 10;
async function sendProductsDirectly(env, chatId, editMessageId = null, forceFresh = false, requestedPage = 0) {
  try {
    await ensureDbReady(env.DB);

    // Reuse a recent browsing result; explicit Refresh still fetches the provider.
    const stockSync = await syncExternalProducts(env, null, null, false, null, forceFresh);

    const counted=await env.DB.prepare('SELECT COUNT(*) AS count FROM products WHERE is_active = 1').first();
    const total=Number(counted?.count||0);
    const pages=Math.max(1,Math.ceil(total/SHOP_PAGE_SIZE));
    const page=Math.min(pages-1,Math.max(0,Number.isSafeInteger(requestedPage)?requestedPage:0));
    const offset=page*SHOP_PAGE_SIZE;
    // Fetch this page only; inventory counts use the existing covering index.
    let prods = [];
    try {
      const q = await env.DB.prepare(
        `SELECT p.*, CASE WHEN p.is_external = 1 THEN COALESCE(p.api_stock, 0) ELSE (SELECT COUNT(*) FROM inventory i WHERE i.product_id = p.id AND i.is_sold = 0) END as stock_qty FROM products p WHERE p.is_active = 1 ORDER BY p.id ASC LIMIT ? OFFSET ?`
      ).bind(SHOP_PAGE_SIZE,offset).all();
      prods = q && q.results ? q.results : [];
    } catch (dbErr) {
      console.error("Products query error, falling back:", dbErr);
      const q = await env.DB.prepare("SELECT *, api_stock AS stock_qty FROM products WHERE is_active = 1 ORDER BY id ASC LIMIT ? OFFSET ?").bind(SHOP_PAGE_SIZE,offset).all();
      prods = q && q.results ? q.results : [];
    }

    const keyboard = [];
    if (prods && prods.length > 0) {
      prods.forEach(prod => {
        const verified = !(prod.is_external && !stockSync.success);
        keyboard.push([productListButton(prod, `prod_${prod.id}`, verified)]);
      });
    }

    if(pages>1){
      const navigation=[];
      if(page>0)navigation.push({text:'◀️ Previous',callback_data:`shop_page_${page-1}`});
      navigation.push({text:`${page+1}/${pages}`,callback_data:`shop_page_${page}`});
      if(page<pages-1)navigation.push({text:'Next ▶️',callback_data:`shop_page_${page+1}`});
      keyboard.push(navigation);
    }
    keyboard.push([
      { text: "🔄 Refresh Stock", callback_data: `shop_refresh_${page}` },
      { text: "🏠 Main Menu", callback_data: "home" }
    ]);

    let text = "";
    if (!prods || prods.length === 0) {
      text = `🛍️ <b>Store Products</b>\n\n⚠️ Currently no products are available in the store.\n\nPlease check back later or contact admin @fojlaybd.`;
    } else {
      text = `🛍️ <b>Available Products</b>\n<b>Page ${page+1}/${pages}</b> · ${total} products\n\n<i>Click any product below to view details and order:</i>`;
    }

    if (editMessageId) {
      const res = await editMsg(env, chatId, editMessageId, text, keyboard);
      if (res && res.ok) return res;
    }
    return await sendMsg(env, chatId, text, keyboard);
  } catch (err) {
    console.error("sendProductsDirectly fatal error:", err);
    return await sendMsg(env, chatId, `⚠️ <b>Shop Error:</b> <code>${escapeHtml(err.message)}</code>\nPlease try again or contact support.`);
  }
}

async function sendProductDetailView(env, chatId, prodId, editMessageId = null, forceFresh = false) {
  try {
    let prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
    if (!prod) {
      await sendMsg(env, chatId, "⚠️ Product not found.", [[{ text: "◀️ Back to Shop", callback_data: "shop" }]]);
      return;
    }

    if (prod.is_external === 1) prod = await fetchLiveProductStock(env, prod, forceFresh);

    const stockRow = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();
    const stockCount = prod.is_external ? (prod.api_stock || 0) : (stockRow ? stockRow.count : 0);
    const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
    const priceBdt = Math.round(prod.price_usd * rate);

    const safeDesc = renderProductDescription(prod.description);
    const details = `💌 <b>${escapeHtml(productDisplayName(prod))}</b>\n\n` +
      `👛 Price: <b>$${Number(prod.price_usd).toFixed(2)} / item</b> (≈ ৳${priceBdt} BDT)\n` +
      `📦 Available Stock: <b>${prod.is_external && !prod.stock_verified ? "Unavailable — please refresh" : stockCount}</b>\n\n` +
      `📦 <b>Product Details:</b>\n<blockquote>${safeDesc}</blockquote>\n\n` +
      `<blockquote>Important Note:\nDelivery is instant and automated after payment confirmation.</blockquote>`;

    const buttons = [];
    if (prod.is_external && !prod.stock_verified) {
      buttons.push([{text:'Check Stock',callback_data:`prod_refresh_${prod.id}`}]);
    } else if (stockCount > 0) {
      buttons.push([{ text: "🛍️ Buy Now", callback_data: `buynow_${prod.id}_1` }]);
    } else {
      buttons.push([{text:"Stock Out",callback_data:`stock_out_${prod.id}`,style:"danger"}]);
      buttons.push([{text:"🛍️ Request Restock",callback_data:`restock_request_${prod.id}`}]);
    }
    const following=await env.DB.prepare('SELECT 1 FROM product_follows WHERE user_id=? AND product_id=?').bind(chatId,prod.id).first();
    buttons.push([{text:following?'🔕 Unfollow Product':'🔔 Follow Stock & Price',callback_data:`product_${following?'unfollow':'follow'}_${prod.id}`}]);
    buttons.push([
      { text: "🔄 Refresh Stock", callback_data: `prod_refresh_${prod.id}` },
      { text: "◀️ Back to Shop", callback_data: `shop_return_${prod.id}` }
    ]);

    if (editMessageId) {
      const res = await editMsg(env, chatId, editMessageId, details, buttons);
      if (res && res.ok) return res;
    }
    return await sendMsg(env, chatId, details, buttons);
  } catch (err) {
    console.error("sendProductDetailView error:", err);
    await sendMsg(env, chatId, `⚠️ Error loading product details: ${escapeHtml(err.message)}`, [[{ text: "◀️ Back to Shop", callback_data: "shop" }]]);
  }
}

// Order Preview Screen with 1-9 keypad & TWO clear payment options
async function sendOrderPreview(env, chatId, prodId, quantity = 1, editMessageId = null) {
  try {
    let prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
    if (!prod){await sendMsg(env,chatId,'This product is no longer available. Open /shop again.');return;}
    orderStage(env,'preview.live_stock');
    if (prod.is_external === 1) prod = await fetchLiveProductStock(env, prod, false);
    if (!await checkExternalStock(env, chatId, prod, quantity)) return;

    const user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
    const userBal = user ? (user.balance_usd || 0) : 0;
    const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));

    const qty = quantity > 0 ? quantity : 1;
    const unitPrice = Number(prod.price_usd);
    const totalPrice = Number((unitPrice * qty).toFixed(2));
    await saveCheckoutQuote(env,chatId,prod.id,qty,totalPrice);
    const totalBdt = Math.round(totalPrice * rate);

    const diff = Number((totalPrice - userBal).toFixed(2));
    const hasEnoughBal = diff <= 0;

    const previewText = `💌 <b>${escapeHtml(productDisplayName(prod))}</b>\n\n` +
      `📦 <b>Order Preview</b>\n\n` +
      `Quantity: <b>${qty} item(s)</b>\n` +
      `👛 Unit Price: <b>$${unitPrice.toFixed(2)}</b>\n` +
      `💼 Total: <b>$${totalPrice.toFixed(2)} USD</b> (≈ ৳${totalBdt} BDT)\n` +
      `👛 Wallet Balance: <b>$${userBal.toFixed(2)} USD</b>\n\n` +
      (hasEnoughBal
        ? `✅ <b>Wallet balance is sufficient.</b>\nTap <b>Wallet Payment</b> below to confirm the purchase.`
        : `⚠️ <b>Need $${diff.toFixed(2)} USD more in your wallet to pay with balance.</b>\nChoose Direct Payment or Wallet Payment below:`);

    // Keypad for 1-9 & Custom Quantity
    const keypad = [
      [
        { text: qty === 1 ? "· 1 ·" : "1", callback_data: `qty_${prod.id}_1` },
        { text: qty === 2 ? "· 2 ·" : "2", callback_data: `qty_${prod.id}_2` },
        { text: qty === 3 ? "· 3 ·" : "3", callback_data: `qty_${prod.id}_3` }
      ],
      [
        { text: qty === 4 ? "· 4 ·" : "4", callback_data: `qty_${prod.id}_4` },
        { text: qty === 5 ? "· 5 ·" : "5", callback_data: `qty_${prod.id}_5` },
        { text: qty === 6 ? "· 6 ·" : "6", callback_data: `qty_${prod.id}_6` }
      ],
      [
        { text: qty === 7 ? "· 7 ·" : "7", callback_data: `qty_${prod.id}_7` },
        { text: qty === 8 ? "· 8 ·" : "8", callback_data: `qty_${prod.id}_8` },
        { text: qty === 9 ? "· 9 ·" : "9", callback_data: `qty_${prod.id}_9` }
      ],
      [{ text: "📦 Custom Quantity", callback_data: `custom_qty_${prod.id}` }],
      // TWO CLEAR PAYMENT OPTIONS UNDER QUANTITIES
      [
        { text: `⚡ Direct Payment ($${totalPrice.toFixed(2)})`, callback_data: `direct_pay_${prod.id}_${qty}` }
      ],
      [
        { text: `👛 Wallet Payment ($${totalPrice.toFixed(2)})`, callback_data: `wallet_pay_check_${prod.id}_${qty}` }
      ],
      [{ text: "◀️ Back to Product", callback_data: `prod_${prod.id}` }]
    ];

    if (editMessageId) {
      const res = await editMsg(env, chatId, editMessageId, previewText, keypad);
      if (res && res.ok) return res;
    }
    orderStage(env,'preview.send');
    const sent=await sendMsg(env,chatId,previewText,keypad);
    if(!sent?.ok)throw new Error('Could not send order preview: '+(sent?.description||sent?.error||'Telegram rejected the message'));
    return sent;
  } catch (err) {
    throw err; // Report through the authenticated webhook error handler, including admin diagnostics.
  }
}

async function sendDeposit(env, chatId, editMessageId = null) {
  const [paymentButton,user,rawRate]=await Promise.all([
    loadPaymentIcons(env),
    env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first(),
    getSetting(env,"usd_to_bdt_rate","125")
  ]);
  const usdBal = user ? (user.balance_usd || 0).toFixed(2) : "0.00";
  const rate = parseFloat(rawRate);
  const bdtBal = user ? Math.round((user.balance_usd || 0) * rate) : 0;

  const text = `💳 <b>Deposit Funds to Wallet</b>\n\n` +
    `Current Wallet Balance: <b>$${usdBal} USD (≈ ৳${bdtBal} BDT)</b>\n` +
    `Current Rate: <b>1 USD = ${rate} BDT</b>\n\n` +
    `Select a payment method below to get deposit instructions:`;

  const buttons = [
    [paymentButton("binance","Binance Pay (Auto)","dep_method_binance")],
    [paymentButton("bep20","BEP20 USDT (Auto)","dep_method_bep20")],
    [paymentButton("bkash","bKash","dep_method_bkash")],
    [paymentButton("nagad","Nagad","dep_method_nagad")],
    [paymentButton("rocket","Rocket","dep_method_rocket")],
    [paymentButton("redeem","Redeem Code","redeem_open")],
    [{ text: "◀️ Main Menu", callback_data: "home" }]
  ];
  if (editMessageId) await editMsg(env, chatId, editMessageId, text, buttons);
  else await sendMsg(env, chatId, text, buttons);
}

async function sendAdminDashboard(env, chatId, editMessageId = null) {
  const [totalUsers, totalOrders, completed, stock, pendingPo, apiProds, rate, commPct, forceChan, forceGrp, maintenanceMode] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) as count FROM users").first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM orders").first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM orders WHERE status = 'completed'").first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE is_sold = 0").first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM preorders WHERE status = 'pending'").first(),
    env.DB.prepare("SELECT COUNT(*) as count FROM products WHERE is_external = 1 AND is_active = 1").first(),
    getSetting(env, "usd_to_bdt_rate", "125"),
    getSetting(env, "referral_commission_percent", "5"),
    getSetting(env, "force_channel_username", ""),
    getSetting(env, "force_group_username", ""),
    getSetting(env, "maintenance_mode", "0")
  ]);
  const forceStatus = (forceChan || forceGrp) ? "Active ✅" : "Off ❌";

  const maintenanceOn=maintenanceMode==='1';
  const report = `👑 <b>Store Administration Control Center</b>\n\n` +
    `📊 <b>Store Analytics:</b>\n` +
    `• Registered Users: <b>${totalUsers ? totalUsers.count : 0} members</b>\n` +
    `• Completed Deliveries: <b>${completed ? completed.count : 0}</b> / Total Orders: <b>${totalOrders ? totalOrders.count : 0}</b>\n` +
    `• In-Stock Items: <b>${stock ? stock.count : 0}</b> | Live Synced Products: <b>${apiProds ? apiProds.count : 0} active</b>\n` +
    `• Pending Pre-Orders: <b>${pendingPo ? pendingPo.count : 0}</b>\n\n` +
    `⚙️ <b>Rates:</b> 1 USD = ${rate} BDT | Referral: ${commPct}% | Force Join: <b>${forceStatus}</b>\n\n` +
    `🔧 <b>Maintenance: ${maintenanceOn?'ON — users paused':'OFF — bot online'}</b>\n\n` +
    `Select any button below to manage your store:`;

  const buttons = [
    [{text:'⏱️ Automatic Sync',callback_data:'adm_periodic'},{text:'📖 User Guide Settings',callback_data:'adm_guide'}],
    [{text:'👥 Users / Find Customer',callback_data:'adm_users'},{text:'📦 Orders',callback_data:'adm_order_find'}],
    [{text:'📊 Sales & Profit Reports',callback_data:'adm_sales_today'}],
    [{text:'💳 Payment Dashboard',callback_data:'adm_payments_home'},{text:'📡 Payment & SMS Status',callback_data:'adm_payment_health'}],
    [{text:'📦 Delivery Management',callback_data:'adm_delivery_list_pending_0'}],
    [{text:'🎫 Support Tickets',callback_data:'adm_tickets_open_0'}],
    [{text:'🔔 Product Notifications',callback_data:'adm_product_notices'},{text:'📢 Channel Alerts',callback_data:'adm_channel_notices'}],
    [{text:'📂 Categories',callback_data:'adm_categories_0'}],
    [{text:'🔍 API / Order Diagnostics',callback_data:'adm_diagnostics'},{text:'⚡ Speed Test',callback_data:'adm_speed'}],
    [{text:maintenanceOn?'🔧 Maintenance: ON • Turn OFF':'✅ Maintenance: OFF • Turn ON',callback_data:maintenanceOn?'adm_maintenance_off':'adm_maintenance_on',style:maintenanceOn?'danger':'success'}],
    [{ text: "➕ Add Stock", callback_data: "adm_stock_menu" }, { text: "➕ Add New Product", callback_data: "adm_add_product" }],
    [{ text: "💰 Custom Prices", callback_data: "adm_price_menu" }, { text: "📋 Manage Products", callback_data: "adm_manage_products" }],
    [{ text: `🔌 Live API Center (${apiProds ? apiProds.count : 0})`, callback_data: "adm_api_menu" }, { text: `⏳ Pre-Orders (${pendingPo ? pendingPo.count : 0})`, callback_data: "adm_view_preorders" }],
    [{ text: `🔒 Force Join (${forceStatus})`, callback_data: "adm_force_menu" }, { text: "📢 Broadcast Message", callback_data: "adm_broadcast" }],
    [{ text: `💱 1 USD = BDT (${rate})`, callback_data: "adm_set_rate" }, { text: `🎁 Referral % (${commPct}%)`, callback_data: "adm_set_ref_comm" }],
    [{ text: "⚙️ Payment & Auto-Verify", callback_data: "adm_payment_settings" }, { text: "📞 Support Contact", callback_data: "adm_set_support" }],
    [{ text: "🎁 Redeem Codes", callback_data: "adm_redeem_menu" }],
    [{ text: "🏪 Back to Store Home", callback_data: "home" }]
  ];
  if (editMessageId) await editMsg(env, chatId, editMessageId, report, buttons);
  else await sendMsg(env, chatId, report, buttons);
}

async function sendProfile(env, chatId, user, editMessageId = null) {
  const referralEarned=await referralCommissionEarned(env,chatId);
  const usdBal = user ? (user.balance_usd || 0).toFixed(2) : "0.00";
  const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
  const bdtBal = user ? Math.round((user.balance_usd || 0) * rate) : 0;

  const [orders,deposits,followed]=await Promise.all([
    env.DB.prepare("SELECT COUNT(*) placed,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) delivered,SUM(CASE WHEN status IN ('paid_pending_delivery','delivering') THEN 1 ELSE 0 END) awaiting_delivery,SUM(CASE WHEN status='refunded' THEN 1 ELSE 0 END) refunded,COALESCE(SUM(CASE WHEN status='completed' THEN ROUND(amount_usd*100) ELSE 0 END),0) spent_cents FROM orders WHERE user_id=?").bind(chatId).first(),
    env.DB.prepare("SELECT SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) successful,COALESCE(SUM(CASE WHEN status='completed' THEN ROUND(amount_usd*100) ELSE 0 END),0) deposited_cents FROM deposits WHERE user_id=?").bind(chatId).first(),
    env.DB.prepare('SELECT p.name,p.is_active,COUNT(*) OVER() total FROM product_follows f LEFT JOIN products p ON p.id=f.product_id WHERE f.user_id=? ORDER BY f.product_id DESC LIMIT 3').bind(chatId).all()
  ]);
  const followedCount=Number(followed.results?.[0]?.total||0);
  const favorites=(followed.results||[]).map(p=>`• ${escapeHtml(p.name||'Unavailable product')}${p.is_active===1?'':' (unavailable)'}`).join('\n');
  const profileText = `👤 <b>My Profile</b>\n\n` +
    `<b>${escapeHtml(user?.first_name||'Customer')}</b>${user?.username?' · @'+escapeHtml(user.username):''}\n` +
    `User ID: <code>${chatId}</code>\n` +
    `Member since: ${paymentDashboardTime(user?.created_at)} (Dhaka)\n\n` +
    `<blockquote>👛 <b>Wallet Balance</b>\n<b>$${usdBal} USD</b> ≈ ${bdtBal} BDT\n🎁 Referral Earned: <b>$${referralEarned} USD</b></blockquote>\n\n` +
    `📦 <b>Orders</b>\n` +
    `Placed: <b>${Number(orders?.placed||0)}</b> · Delivered: <b>${Number(orders?.delivered||0)}</b>\n` +
    `Awaiting delivery: <b>${Number(orders?.awaiting_delivery||0)}</b> · Refunded: <b>${Number(orders?.refunded||0)}</b>\n` +
    `Spent on delivered orders: <b>$${(Number(orders?.spent_cents||0)/100).toFixed(2)} USD</b>\n\n` +
    `💳 <b>Deposits</b>\nSuccessful deposits: <b>${Number(deposits?.successful||0)}</b>\n` +
    `Total deposited: <b>$${(Number(deposits?.deposited_cents||0)/100).toFixed(2)} USD</b>\n\n` +
    `⭐ <b>Followed Products (${followedCount})</b>\n${favorites||'No followed products yet.'}${followedCount>3?'\nOpen Followed Products to see all.':''}\n\n` +
    `🎁 Friends invited: <b>${Number(user?.total_referrals||0)}</b>`;

  const buttons = [
    [{ text: "💳 Deposit Funds", callback_data: "deposit" }],
    [{text:"📒 Balance History",callback_data:"wallet_history_0"}],
    [{text:`🔔 Product Alerts: ${user?.product_alerts===0?'OFF':user?.product_alert_scope==='following'?'Followed Only':'All Products'}`,callback_data:"product_alert_settings"}],
    [{text:`⭐ Followed Products (${followedCount})`,callback_data:'product_follows_0'}],
    [{ text: "📦 Order History", callback_data: "my_orders" }, { text: "⏳ My Pre-Orders", callback_data: "my_preorders" }],
    [{ text: "👥 Refer & Earn", callback_data: "refer" }],
    [{text:"📖 Guide / FAQ",callback_data:"user_guide"},{text:"💬 Support",callback_data:"support"}],
    [{ text: "◀️ Main Menu", callback_data: "home" }]
  ];
  if (editMessageId) await editMsg(env, chatId, editMessageId, profileText, buttons);
  else await sendMsg(env, chatId, profileText, buttons);
}

async function sendUserPreorders(env, chatId, editMessageId = null) {
  const { results: preorders } = await env.DB.prepare("SELECT po.*, p.name as product_name, p.price_usd FROM preorders po JOIN products p ON po.product_id = p.id WHERE po.user_id = ? ORDER BY po.id DESC LIMIT 10").bind(chatId).all();
  let text = `⏳ <b>Your Active Pre-Orders:</b>\n\n`;
  if (!preorders || preorders.length === 0) text += `You have not placed any pre-orders yet.`;
  else preorders.forEach(po => { text += `🔹 <b>${po.product_name}</b>\nPrice: $${po.price_usd.toFixed(2)} USD\nStatus: <b>${po.status.toUpperCase()}</b>\n\n`; });
  const buttons = [[{ text: "🛒 Open Shop", callback_data: "shop" }], [{ text: "◀️ Main Menu", callback_data: "home" }]];
  if (editMessageId) await editMsg(env, chatId, editMessageId, text, buttons);
  else await sendMsg(env, chatId, text, buttons);
}

async function sendOrders(env,chatId,editMessageId=null,requestedPage=0){
  const pageSize=5;
  const count=await env.DB.prepare("SELECT COUNT(*) total FROM orders WHERE user_id=? AND status IN ('completed','paid_pending_delivery','delivering','refunded')").bind(chatId).first();
  const total=Number(count?.total||0),pages=Math.max(1,Math.ceil(total/pageSize));
  const page=Math.min(pages-1,adminUserPage(requestedPage));
  const {results}=await env.DB.prepare("SELECT o.*,COALESCE(NULLIF(o.product_name,''),p.name,'Product unavailable') AS product_name FROM orders o LEFT JOIN products p ON p.id=o.product_id WHERE o.user_id=? AND o.status IN ('completed','paid_pending_delivery','delivering','refunded') ORDER BY o.id DESC LIMIT ? OFFSET ?").bind(chatId,pageSize,page*pageSize).all();
  let orderText=`📦 <b>Your Orders</b>\nPage ${page+1}/${pages} · ${total} ${total===1?'order':'orders'}\n\n`;const buttons=[];
  if(!results?.length)orderText+='You have no paid orders yet.';
  for(const order of results||[]){
    const orderLabel=`Order - ${String(order.user_order_number).padStart(2,'0')} Order ID- ${orderDisplayId(order)}`;
    buttons.push([{text:`${order.status==='completed'?'📄 Download':'🎫 Get Help'} · ${orderLabel}`,callback_data:order.status==='completed'?`order_document_${order.id}`:`ticket_new_${order.id}`}]);
    orderText+=`<b>${escapeHtml(order.product_name)}</b>\nOrder - ${String(order.user_order_number).padStart(2,'0')} Order ID- <code>${orderDisplayId(order)}</code>\nQuantity: ${order.quantity||1} | Amount: $${Number(order.amount_usd).toFixed(2)}\n`;
    if(order.status==='completed')orderText+='Delivery: Text document\n\n';
    else if(order.status==='refunded')orderText+='Status: Wallet payment refunded.\n\n';
    else{
      orderText+='Status: Payment recorded; delivery pending. Do not pay again.\n\n';
      if(order.provider_request_id&&order.status==='paid_pending_delivery')buttons.push([{text:`Check Delivery · ${orderDisplayId(order)}`,callback_data:`provider_retry_${order.id}`}]);
    }
  }
  const pager=[];if(page>0)pager.push({text:'‹ Previous',callback_data:`my_orders_page_${page-1}`});if(page<pages-1)pager.push({text:'Next ›',callback_data:`my_orders_page_${page+1}`});if(pager.length)buttons.push(pager);
  buttons.push([{text:'🎫 My Support Tickets',callback_data:'tickets_mine_0'}],[{text:'◀️ Main Menu',callback_data:'home'}]);
  if(editMessageId)await editMsg(env,chatId,editMessageId,orderText,buttons);else await sendMsg(env,chatId,orderText,buttons);
}

async function sendRefer(env, chatId, user, editMessageId = null) {
  const referralEarned=await referralCommissionEarned(env,chatId);
  const botInfo = await callTg(env, "getMe", {});
  const botUsername = botInfo.result ? botInfo.result.username : "bot";
  const refLink = `https://t.me/${botUsername}?start=ref_${chatId}`;
  const commPct = await getSetting(env, "referral_commission_percent", "5");

  const refText = `👥 <b>Refer & Earn Program</b>\n\n` +
    `Invite friends and earn <b>${commPct}% instant wallet commission</b> whenever your invited friend purchases any product!\n\n` +
    `🔗 <b>Your Personal Referral Link:</b>\n<code>${refLink}</code>\n\n` +
    `📊 <b>Your Statistics:</b>\n• Total Referred Members: <b>${user ? user.total_referrals : 0} members</b>\n• Commission Rate: <b>${commPct}% on all purchases</b>\n• Referral Earned: <b>$${referralEarned} USD</b>\n\nCommission is credited to your main wallet. The total earned is a lifetime summary, not an extra balance.`;

  const buttons = [
    [{ text: "📤 Share Referral Link", url: `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent("Check out this digital products store with instant automated delivery!")}` }],
    [{ text: "◀️ Main Menu", callback_data: "home" }]
  ];
  if (editMessageId) await editMsg(env, chatId, editMessageId, refText, buttons);
  else await sendMsg(env, chatId, refText, buttons);
}

async function sendSupport(env, chatId, editMessageId = null) {
  const supContact = await getSetting(env, "support_admin", "@fojlaybd");
  const cleanUsername = supContact.replace("@", "");
  const supText = `🕒 <b>Customer Support & Helpdesk</b>\n\nNeed help with an order or deposit?\nOur customer service team is ready to assist you!\n\n📞 <b>Support Handle:</b> <code>${supContact}</code>`;
  const buttons = [
    [{text:"📖 User Guide / FAQ",callback_data:"user_guide"}],
    [{text:"🎫 My Support Tickets",callback_data:"tickets_mine_0"}],
    [{text:"📦 Get Help with an Order",callback_data:"my_orders"}],
    [{ text: "💬 Chat with Support Admin", url: /^\d+$/.test(supContact)?`tg://user?id=${supContact}`:`https://t.me/${cleanUsername}` }],
    [{ text: "◀️ Main Menu", callback_data: "home" }]
  ];
  if (editMessageId) await editMsg(env, chatId, editMessageId, supText, buttons);
  else await sendMsg(env, chatId, supText, buttons);
}

// Device-authenticated SMS evidence. Only matched, atomically claimed invoices may settle.
async function receiveMobileBridgeReceipt(request, env, ctx) {
  const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(request.method!=='POST')return reply(405,{error:'method_not_allowed'});
  if(!env.MOBILE_BRIDGE_SECRET || env.MOBILE_BRIDGE_SECRET.length<32 || !env.MOBILE_BRIDGE_DEVICE_ID || !env.DB)return reply(503,{error:'bridge_not_configured'});
  if(Number(request.headers.get('Content-Length')||0)>4096)return reply(413,{error:'too_large'});
  const reader=request.body?.getReader();if(!reader)return reply(400,{error:'invalid_body'});
  let chunks=[],size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return reply(413,{error:'too_large'});}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const b of chunks){bytes.set(b,offset);offset+=b.length;}
  const raw=new TextDecoder().decode(bytes),ts=request.headers.get('X-Timestamp')||'',signature=request.headers.get('X-Signature')||'';
  if(!/^[0-9]{10}$/.test(ts)||Math.abs(Date.now()/1000-Number(ts))>300||!/^([0-9a-f]{64})$/.test(signature))return reply(401,{error:'unauthorized'});
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.MOBILE_BRIDGE_SECRET),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  const sig=Uint8Array.from(signature.match(/../g),x=>parseInt(x,16));
  if(!await crypto.subtle.verify('HMAC',key,sig,new TextEncoder().encode(raw+ts)))return reply(401,{error:'unauthorized'});
  let b;try{b=JSON.parse(raw);}catch{return reply(400,{error:'invalid_json'});}
  // Authenticated setup check: no receipt insertion, balance mutation or raw SMS.
  if(b?.type==='check') {
    if(b.deviceId!==env.MOBILE_BRIDGE_DEVICE_ID)return reply(403,{error:'device_mismatch'});
    if(b.version!==1||Object.keys(b).some(k=>!['type','version','deviceId','bkashAccount','nagadAccount'].includes(k))||typeof b.bkashAccount!=='string'||typeof b.nagadAccount!=='string'||(!b.bkashAccount&&!b.nagadAccount))return reply(400,{error:'invalid_setup'});
    try{
      for(const method of ['bkash','nagad']) {
        const number=b[method+'Account'];if(!number)continue;
        if(!/^01[3-9][0-9]{8}$/.test(number))return reply(400,{error:'invalid_account'});
        const setting=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(method+'_num').first();
        if(setting?.value!==number){await recordBridgeHealth(env,'receiving_account_mismatch',{last_check_ms:Date.now()});return reply(409,{error:'receiving_account_mismatch'});}
      }
      await recordBridgeHealth(env,'ok',{last_check_ms:Date.now()});
      return reply(200,{connected:true,deviceId:b.deviceId});
    }catch{return reply(503,{error:'bridge_storage_unavailable'});}
  }
  if(b?.type==='heartbeat'){
    if(b.deviceId!==env.MOBILE_BRIDGE_DEVICE_ID)return reply(403,{error:'device_mismatch'});
    const keys=['type','version','deviceId','appVersion','enabled','smsPermission','queuePending','batteryExempt','lastCaptureAt','lastCaptureState','lastCaptureMethod','bkashAccount','nagadAccount'];
    const states=['none','unknown','forwarding_off','format_mismatch','time_mismatch','invalid_account','queued','queue_full','capture_failed'];
    if(b.version!==1||Object.keys(b).some(k=>!keys.includes(k))||!/^\d{1,2}\.\d{1,2}$/.test(b.appVersion||'')||typeof b.enabled!=='boolean'||typeof b.smsPermission!=='boolean'||typeof b.batteryExempt!=='boolean'||!Number.isSafeInteger(b.queuePending)||b.queuePending<0||b.queuePending>10000||!Number.isSafeInteger(b.lastCaptureAt)||b.lastCaptureAt<0||b.lastCaptureAt>Date.now()+60000||!states.includes(b.lastCaptureState)||!['none','bkash','nagad'].includes(b.lastCaptureMethod)||typeof b.bkashAccount!=='string'||typeof b.nagadAccount!=='string')return reply(400,{error:'invalid_heartbeat'});
    let result='ok';
    try{for(const method of ['bkash','nagad']){
      const number=b[method+'Account'];if(!number)continue;
      if(!/^01[3-9][0-9]{8}$/.test(number)){result='invalid_account';break;}
      const configured=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(method+'_num').first();
      if(configured?.value!==number){result='receiving_account_mismatch';break;}
    }
    if(b.enabled&&!b.bkashAccount&&!b.nagadAccount)result='invalid_setup';
    }catch{return reply(503,{error:'bridge_storage_unavailable'});}
    const stored=await recordBridgeHealth(env,result,{last_heartbeat_ms:Date.now(),app_version:b.appVersion,forwarding_enabled:b.enabled?1:0,sms_permission:b.smsPermission?1:0,queue_pending:b.queuePending,battery_exempt:b.batteryExempt?1:0,last_capture_ms:b.lastCaptureAt,capture_state:b.lastCaptureState,capture_method:b.lastCaptureMethod});
    if(!stored)return reply(503,{error:'bridge_storage_unavailable'});
    return reply(200,{connected:true,heartbeat:true,deviceId:b.deviceId,configuration:result});
  }
  const allowed=['version','eventId','deviceId','method','account','trxId','amountMinor','receivedAt','paidAt'];
  if(!b||Array.isArray(b)||Object.keys(b).some(k=>!allowed.includes(k))||b.version!==1||b.deviceId!==env.MOBILE_BRIDGE_DEVICE_ID||!['bkash','nagad'].includes(b.method)||!/^[a-f0-9-]{36}$/.test(b.eventId||'')||!/^[A-Z0-9]{6,40}$/.test(b.trxId||'')||typeof b.account!=='string'||!Number.isSafeInteger(b.amountMinor)||b.amountMinor<=0||b.amountMinor>100000000||!Number.isSafeInteger(b.receivedAt)||b.receivedAt>Date.now()+60000||b.receivedAt<Date.now()-86400000||!Number.isSafeInteger(b.paidAt)||b.paidAt>b.receivedAt+300000||b.paidAt<b.receivedAt-86400000){if(b?.deviceId===env.MOBILE_BRIDGE_DEVICE_ID)await recordBridgeHealth(env,'invalid_receipt');return reply(400,{error:'invalid_receipt'});}
  try{
    const configured=await env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(b.method+'_num').first();
    if(!configured?.value||configured.value!==b.account){await recordBridgeHealth(env,'receiving_account_mismatch');return reply(409,{error:'receiving_account_mismatch'});}
    await env.DB.prepare(`CREATE TABLE IF NOT EXISTS mobile_bridge_receipts (
      event_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, method TEXT NOT NULL, account TEXT NOT NULL,
      trx_id TEXT NOT NULL, amount_minor INTEGER NOT NULL, received_at INTEGER NOT NULL, paid_at INTEGER NOT NULL,
      body_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'unverified_sms',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(method,trx_id))`).run();
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
    await env.DB.prepare(`INSERT INTO mobile_bridge_receipts(event_id,device_id,method,account,trx_id,amount_minor,received_at,paid_at,body_hash) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`).bind(b.eventId,b.deviceId,b.method,b.account,b.trxId,b.amountMinor,b.receivedAt,b.paidAt,digest).run();
    const saved=await env.DB.prepare('SELECT event_id,body_hash FROM mobile_bridge_receipts WHERE event_id=?').bind(b.eventId).first();
    if(!saved||saved.body_hash!==digest){await recordBridgeHealth(env,'receipt_conflict');return reply(409,{error:'receipt_conflict'});}
    await recordBridgeHealth(env,'ok',{last_receipt_ms:Date.now()});
    const resume=async()=>{
      try{await resumeMobilePayments(env,b.method,b.trxId);}catch{console.error('Mobile receipt settlement needs retry');}
      try{await drainAllNotices(env);}catch{console.error('Post-payment channel/product notice delivery paused');}
    };
    if(ctx?.waitUntil)ctx.waitUntil(resume());else await resume();
    return reply(200,{accepted:true,eventId:b.eventId,status:'stored'});
  }catch{return reply(503,{error:'receipt_storage_unavailable'});}
}

// Personal mobile-wallet verification: authenticated receiving-phone evidence, exact invoice snapshots.
async function createMobileInvoice(env,type,id,userId,method,account,usd,bdt) {
  const cents=Math.round(Number(usd)*100),minor=Math.round(Number(bdt)*100),now=Date.now();
  if(!['order','deposit'].includes(type)||!['bkash','nagad'].includes(method)||!Number.isSafeInteger(cents)||cents<=0||!Number.isSafeInteger(minor)||minor<=0)throw new Error('Invalid mobile invoice');
  await env.DB.prepare(`INSERT INTO mobile_payment_invoices(invoice_type,invoice_id,user_id,method,account,amount_minor,amount_cents,created_ms,expires_ms) VALUES(?,?,?,?,?,?,?,?,?)`)
    .bind(type,id,userId,method,account,minor,cents,now,now+60*60000).run();
}

async function mobileInvoiceTarget(env,type,id) {
  return await env.DB.prepare(type==='order'?
    'SELECT o.*,p.name AS product_name,p.is_external,p.external_id,p.api_stock FROM orders o JOIN products p ON p.id=o.product_id WHERE o.id=?':
    'SELECT * FROM deposits WHERE id=?').bind(id).first();
}

async function handleMobileReceiptInput(env,chatId,text,state) {
  if(state?.state!=='awaiting_mobile_receipt')return false;
  if(text.startsWith('/')){await clearBinanceInput(env,chatId);return false;}
  let data;try{data=JSON.parse(state.data);}catch{await clearBinanceInput(env,chatId);return true;}
  if(!['order','deposit'].includes(data.type)){await clearBinanceInput(env,chatId);return true;}
  await submitMobilePayment(env,chatId,data.type,data.id,text);
  return true;
}

async function submitMobilePayment(env,chatId,type,id,input) {
  if(!['order','deposit'].includes(type))return;
  const invoice=await env.DB.prepare('SELECT * FROM mobile_payment_invoices WHERE invoice_type=? AND invoice_id=? AND user_id=?').bind(type,id,chatId).first();
  if(!invoice){await sendMsg(env,chatId,'This invoice cannot be automatically verified. If you already paid, contact admin. Do not pay again.');return;}
  const target=await mobileInvoiceTarget(env,type,id);
  if(!target||String(target.user_id)!==String(chatId)||target.status!=='pending'||invoice.status!=='pending'){
    await sendMsg(env,chatId,target?.status==='completed'?'This payment is already completed.':'This payment is closed or awaiting delivery. Do not pay again.');return;
  }
  const trx=String(input||'').trim().toUpperCase();
  if(!(invoice.method==='bkash'?/^[A-Z0-9]{10}$/:/^[A-Z0-9]{8}$/).test(trx)){
    await recordPaymentVerification(env,type,id,chatId,invoice.method,trx,'invalid_format');
    await sendMsg(env,chatId,'Enter only the Transaction ID from your payment receipt. Do not send an amount, PIN or OTP.');return;
  }
  // First submission must be within the invoice window. An existing submission may retry late SMS.
  if(Date.now()>invoice.expires_ms&&(!invoice.submitted_at||invoice.trx_id!==trx)){
    await recordPaymentVerification(env,type,id,chatId,invoice.method,trx,'payment_expired');
    await sendMsg(env,chatId,'This payment window expired. If you paid, contact admin for review. Do not pay again.');return;
  }
  await env.DB.prepare("UPDATE mobile_payment_invoices SET trx_id=?,submitted_at=CASE WHEN trx_id=? AND submitted_at IS NOT NULL THEN submitted_at ELSE ? END WHERE invoice_type=? AND invoice_id=? AND user_id=? AND status='pending'")
    .bind(trx,trx,Date.now(),type,id,chatId).run();
  const outcome=await settleMobileInvoice(env,type,id);
  await recordPaymentVerification(env,type,id,chatId,invoice.method,trx,['completed','processing'].includes(outcome)?'verified':outcome);
  if(outcome==='completed'||outcome==='processing'||outcome==='membership')return;
  const messages={missing:'Payment SMS has not arrived yet. Keep the receiving phone online. We will automatically check again when its SMS arrives. You can also tap Check Payment.',mismatch:'The received payment does not match this invoice (method, account, amount or payment time). Contact admin if you paid. Do not pay again.',used:'This transaction has already been used for another payment. Contact admin if you need help.',unavailable:'Automatic verification is not available right now. Keep your payment receipt and retry. Do not pay again.',maintenance:'Verification is paused for maintenance. Retry after the bot reopens. Do not pay again.',closed:'This payment is already processed or closed. Do not pay again.'};
  await sendMsg(env,chatId,`⏳ ${messages[outcome]||messages.unavailable}`,[[{text:'Check Payment',callback_data:`mobile_retry_${type}_${id}`}],[{text:'Enter Transaction ID',callback_data:`mobile_enter_${type}_${id}`}]]);
}

async function settleMobileInvoice(env,type,id) {
  const invoice=await env.DB.prepare('SELECT * FROM mobile_payment_invoices WHERE invoice_type=? AND invoice_id=?').bind(type,id).first();
  if(!invoice||invoice.status!=='pending'||!invoice.trx_id)return 'closed';
  if(await getSetting(env,'maintenance_mode','0')==='1'&&String(invoice.user_id)!==String(env.ADMIN_ID))return 'maintenance';
  if(!env.MOBILE_BRIDGE_SECRET||env.MOBILE_BRIDGE_SECRET.length<32||!env.MOBILE_BRIDGE_DEVICE_ID)return 'unavailable';
  if(String(invoice.user_id)!==String(env.ADMIN_ID)){const gate=await checkForceJoin(env,invoice.user_id,true);if(!gate.passed){await sendForceJoinScreen(env,invoice.user_id,gate);return 'membership';}}
  const receipt=await env.DB.prepare('SELECT * FROM mobile_bridge_receipts WHERE method=? AND trx_id=?').bind(invoice.method,invoice.trx_id).first();
  if(!receipt)return 'missing';
  const used=await env.DB.prepare('SELECT invoice_type,invoice_id FROM mobile_payment_claims WHERE method=? AND trx_id=?').bind(invoice.method,invoice.trx_id).first();
  if(used)return used.invoice_type===type&&Number(used.invoice_id)===Number(id)?'processing':'used';
  if(receipt.device_id!==env.MOBILE_BRIDGE_DEVICE_ID||receipt.account!==invoice.account||receipt.amount_minor!==invoice.amount_minor||receipt.paid_at<Math.floor(invoice.created_ms/60000)*60000||receipt.paid_at>invoice.expires_ms||receipt.received_at<invoice.created_ms-60000||!invoice.submitted_at||invoice.submitted_at>invoice.expires_ms)return 'mismatch';
  const token=crypto.randomUUID(),table=type==='order'?'orders':'deposits',methodColumn=type==='order'?'payment_method':'method';
  // All eligibility checks are repeated inside the transaction. Each attempt has a fresh token;
  // only the attempt that inserted the unique claim can change a balance or dispatch an order.
  const conditions=`i.invoice_type=? AND i.invoice_id=? AND i.trx_id=? AND i.status='pending' AND t.status='pending' AND t.user_id=i.user_id AND UPPER(t.${methodColumn})=UPPER(i.method) AND ROUND(t.amount_usd*100)=i.amount_cents AND ROUND(t.amount_bdt*100)=i.amount_minor
    AND r.status='unverified_sms' AND r.device_id=? AND r.account=i.account AND r.amount_minor=i.amount_minor AND r.paid_at>=CAST(i.created_ms/60000 AS INTEGER)*60000 AND r.paid_at<=i.expires_ms AND r.received_at>=i.created_ms-60000 AND i.submitted_at<=i.expires_ms
    AND NOT EXISTS(SELECT 1 FROM orders o WHERE UPPER(o.payment_method)=UPPER(i.method) AND UPPER(o.trx_id)=i.trx_id AND o.status IN ('completed','paid_pending_delivery'))
    AND NOT EXISTS(SELECT 1 FROM deposits d WHERE UPPER(d.method)=UPPER(i.method) AND UPPER(d.trx_id)=i.trx_id AND d.status='completed')`;
  const claim=`EXISTS(SELECT 1 FROM mobile_payment_claims c WHERE c.token=?)`;
  const statements=[
    env.DB.prepare(`INSERT INTO mobile_payment_claims(method,trx_id,event_id,invoice_type,invoice_id,user_id,amount_minor,amount_cents,token)
      SELECT i.method,i.trx_id,r.event_id,i.invoice_type,i.invoice_id,i.user_id,i.amount_minor,i.amount_cents,? FROM mobile_payment_invoices i
      JOIN mobile_bridge_receipts r ON r.method=i.method AND r.trx_id=i.trx_id JOIN ${table} t ON t.id=i.invoice_id JOIN users u ON u.user_id=i.user_id
      WHERE ${conditions} ON CONFLICT DO NOTHING`).bind(token,type,id,invoice.trx_id,env.MOBILE_BRIDGE_DEVICE_ID),
    env.DB.prepare(`UPDATE ${table} SET status=?,trx_id=? WHERE id=? AND user_id=? AND status='pending' AND ${claim}`).bind(type==='order'?'paid_pending_delivery':'completed',invoice.trx_id,id,invoice.user_id,token),
    env.DB.prepare(`UPDATE mobile_payment_invoices SET status='paid' WHERE invoice_type=? AND invoice_id=? AND status='pending' AND ${claim}`).bind(type,id,token),
    env.DB.prepare(`UPDATE mobile_bridge_receipts SET status='claimed' WHERE event_id=? AND ${claim}`).bind(receipt.event_id,token)
  ];
  if(type==='deposit')statements.push(env.DB.prepare(walletChangeSql(`UPDATE users SET balance_usd=COALESCE(balance_usd,0)+?/100.0,balance_bdt=COALESCE(balance_bdt,0)+?/100.0 WHERE user_id=? AND ${claim}`,'deposit','deposit:'+id)).bind(invoice.amount_cents,invoice.amount_minor,invoice.user_id,token));
  await env.DB.batch(statements);
  const won=await env.DB.prepare('SELECT token FROM mobile_payment_claims WHERE token=?').bind(token).first();
  if(!won){
    const other=await env.DB.prepare('SELECT invoice_type,invoice_id FROM mobile_payment_claims WHERE method=? AND trx_id=?').bind(invoice.method,invoice.trx_id).first();
    if(other)return other.invoice_type===type&&Number(other.invoice_id)===Number(id)?'processing':'used';
    return 'mismatch';
  }
  // Payment is durably claimed before any network delivery. A failed delivery must never charge again.
  try{
    if(type==='order'){
      const order=await mobileInvoiceTarget(env,type,id);
      await completeSuccessfulOrder(env,order,invoice.trx_id,invoice.user_id);
    }else{
      await sendMsg(env,invoice.user_id,`✅ <b>Payment verified!</b>\n\n${invoice.method==='bkash'?'bKash':'Nagad'} deposit #${id}\nWallet credited: <b>$${(invoice.amount_cents/100).toFixed(2)} USD</b>\nTrxID: <code>${escapeHtml(invoice.trx_id)}</code>`,[[{text:'Open Shop',callback_data:'shop'}]]);
      await notifyAdminForUser(env,invoice.user_id,`✅ ${invoice.method} deposit #${id} automatically credited $${(invoice.amount_cents/100).toFixed(2)}. User: ${invoice.user_id}`);
    }
  }catch{
    if(type==='order'){
      await env.DB.prepare("UPDATE orders SET status='paid_pending_delivery' WHERE id=? AND status='delivering'").bind(id).run();
      await sendMsg(env,env.ADMIN_ID,`⚠️ Verified mobile payment for Order #${id} needs delivery review. Check provider history and local order records before retrying.`).catch(()=>{});
      await sendMsg(env,invoice.user_id,`Payment verified for Order #${id}. Check My Orders or contact admin if delivery is missing. Do not pay again.`).catch(()=>{});
    }
    console.error('Verified mobile payment notification or delivery needs admin review');
    // Never undo the claim/credit after a network failure. The ledger remains the source of truth.
  }
  await env.DB.prepare("DELETE FROM user_states WHERE user_id=? AND state='awaiting_mobile_receipt' AND data=?").bind(invoice.user_id,JSON.stringify({type,id:Number(id)})).run();
  return 'completed';
}

async function resumeMobilePayments(env,method,trx) {
  // On first deployment, the receiving phone may upload before bot migrations run.
  const exists=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mobile_payment_invoices'").first();
  if(!exists)return;
  const {results}=await env.DB.prepare("SELECT invoice_type,invoice_id,user_id FROM mobile_payment_invoices WHERE method=? AND trx_id=? AND status='pending' AND submitted_at IS NOT NULL ORDER BY submitted_at,invoice_id LIMIT 20").bind(method,trx).all();
  for(const row of results){
    const outcome=await settleMobileInvoice(env,row.invoice_type,row.invoice_id);
    await recordPaymentVerification(env,row.invoice_type,row.invoice_id,row.user_id,method,trx,['completed','processing'].includes(outcome)?'verified':outcome);
  }
}

async function refundRejectedExternalWalletOrder(env,orderId,chatId){
  await env.DB.batch([
    env.DB.prepare(walletChangeSql("UPDATE users SET balance_usd=balance_usd+(SELECT amount_usd FROM orders WHERE id=?),balance_bdt=balance_bdt+(SELECT amount_bdt FROM orders WHERE id=?),total_spent_usd=MAX(0,total_spent_usd-(SELECT amount_usd FROM orders WHERE id=?)) WHERE user_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=? AND user_id=? AND payment_method='WALLET' AND status='paid_pending_delivery')",'refund','order:'+orderId)).bind(orderId,orderId,orderId,chatId,orderId,chatId),
    env.DB.prepare("UPDATE orders SET status='refunded' WHERE id=? AND user_id=? AND payment_method='WALLET' AND status='paid_pending_delivery'").bind(orderId,chatId)
  ]);
}

function orderStage(env,stage,orderId=null){if(env.__orderTrace){env.__orderTrace.stage=stage;if(orderId)env.__orderTrace.orderId=orderId;}}
async function safeDiagnostic(env,value){
  let text=String(value||'Unknown failure');
  const values=[env.BOT_TOKEN,env.BINANCE_API_KEY,env.BINANCE_API_SECRET,env.MOBILE_BRIDGE_SECRET];
  try{values.push(await getSetting(env,'external_api_key',''));}catch{}
  for(const secret of values)if(secret)text=text.split(secret).join('[redacted]');
  return text.replace(/vxr_live_[A-Za-z0-9_]+/g,'[redacted]').slice(0,200);
}
async function ensureDiagnosticTable(db){await db.prepare('CREATE TABLE IF NOT EXISTS bot_runtime_errors(reference TEXT PRIMARY KEY,stage TEXT,chat_id TEXT,order_id INTEGER,detail TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP)').run();}
async function showSpeedDiagnostics(env,chatId){
  if(!adminUserAccess(env,chatId))return;
  const started=Date.now(),dbTimes=[];
  for(let i=0;i<3;i++){const at=Date.now();await env.DB.prepare('SELECT 1 AS ok').first();dbTimes.push(Date.now()-at);}
  const measure=async method=>{const at=Date.now();try{return {response:await callTg(env,method,{}),ms:Date.now()-at};}catch{return {response:{ok:false},ms:Date.now()-at};}};
  const [telegram,webhook]=await Promise.all([measure('getMe'),measure('getWebhookInfo')]);
  const info=webhook.response?.result,expected=new URL(env.BOT_PUBLIC_URL||'https://digital-product-telibot.pages.dev').origin;
  let configured=false;try{const url=new URL(info?.url);configured=url.origin===expected&&['/api/webhook','/'].includes(url.pathname);}catch{}
  const text=`⚡ <b>Live Speed Test</b>\n\nBuild: <code>${BOT_BUILD}</code>\nDatabase reads: <b>${dbTimes.join(' / ')} ms</b>\nTelegram API: <b>${telegram.ms} ms</b> (${telegram.response?.ok?'OK':'failed'})\nWebhook check: ${webhook.ms} ms\nWebhook: <b>${!webhook.response?.ok?'Check failed':configured?'Configured correctly':'Needs configuration'}</b>\nPending updates: ${Number(info?.pending_update_count||0)}\nLast webhook error: ${info?.last_error_message?escapeHtml(await safeDiagnostic(env,info.last_error_message)):'None reported'}\nTest duration: ${Date.now()-started} ms\n\nMeasured from the live worker. Telegram API timing is a getMe request; it does not measure phone-to-bot delivery. Shop navigation uses saved catalog data while syncing in the background. Explicit refresh and checkout wait for live verification.`;
  await sendMsg(env,chatId,text,[[{text:'Run Again',callback_data:'adm_speed'}],[{text:'Admin Panel',callback_data:'admin_panel'}]]);
}
async function processBotUpdate(update,env,origin,ctx){
  const chatId=update.message?.chat?.id??update.callback_query?.message?.chat?.id;
  const diagnosticCommand=/^\/diagnostics(?:@\w+)?\s*$/i.test(String(update.message?.text||'').replace(/[\u200B-\u200D\uFEFF]/g,'').trim())||update.callback_query?.data==='adm_diagnostics';
  const trace={stage:'database.initialize',orderId:null};const scoped={...env,__orderTrace:trace,__executionContext:ctx};
  try{
    if(update.callback_query?.id&&ctx?.waitUntil){
      scoped.__callbackAcknowledged=true;
      ctx.waitUntil(ansCb(scoped,update.callback_query.id).catch(()=>{}));
    }
    if(update.callback_query?.data==='adm_speed'||/^\/speed(?:@\w+)?\s*$/i.test(String(update.message?.text||'').trim())){
      if(adminUserAccess(env,chatId)){await ensureDbReady(env.DB);await showSpeedDiagnostics(scoped,chatId);}
      return;
    }
    if(diagnosticCommand){
      if(String(chatId)!==String(env.ADMIN_ID))return;
      if(update.callback_query?.id&&!scoped.__callbackAcknowledged)await ansCb(env,update.callback_query.id).catch(()=>{});
      await sendOrderDiagnostics(scoped,chatId);return;
    }
    await handleUpdate(update,scoped,origin,ctx);
    if(ctx?.waitUntil)ctx.waitUntil(drainAllNotices(scoped).catch(()=>console.error('Product notice delivery paused')));
  }catch(error){
    const reference='ERR-'+crypto.randomUUID().slice(0,8),detail=await safeDiagnostic(scoped,error?.message||error);
    console.error(`Bot error ${reference} at ${trace.stage}: ${detail}`);
    try{await ensureDiagnosticTable(env.DB);await env.DB.prepare('INSERT INTO bot_runtime_errors(reference,stage,chat_id,order_id,detail) VALUES(?,?,?,?,?)').bind(reference,trace.stage,String(chatId||''),trace.orderId,detail).run();}catch{console.error('Could not persist runtime diagnostic');}
    if(chatId)await sendMsg(env,chatId,`⚠️ Unable to complete this action. Reference: <code>${reference}</code>\n${trace.orderId?'Order #'+trace.orderId+'\n':''}Admin has been notified. Do not place the order or send payment again.`).catch(()=>{});
    if(env.ADMIN_ID)await sendMsg(env,env.ADMIN_ID,`⚠️ <b>Bot error ${reference}</b>\nBuild: <code>${BOT_BUILD}</code>\nStage: <code>${trace.stage}</code>\nOrder: ${trace.orderId||'not created'}\nReason: <code>${escapeHtml(detail)}</code>\nSend /diagnostics to check configuration and recent orders.`).catch(()=>{});
  }
}
async function sendOrderDiagnostics(env,chatId){
  if(String(chatId)!==String(env.ADMIN_ID))return;
  let report=`🔍 <b>API / Order Diagnostics</b>\nBuild: <code>${BOT_BUILD}</code>\n`;
  report+='Server time (Dhaka): '+new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',dateStyle:'short',timeStyle:'medium',hour12:false}).format(Date.now())+'\n';
  try{
    const {results:columns}=await env.DB.prepare('PRAGMA table_info(orders)').all();
    const names=new Set(columns.map(x=>x.name));const needed=['provider_request_id','provider_error','provider_order_id','provider_retry_at','delivery_data'];
    const missing=needed.filter(x=>!names.has(x));
    report+='Database: '+(missing.length?'missing columns: '+missing.join(', '):'order columns OK')+'\n';
    const required=columns.filter(c=>c.notnull&&(c.dflt_value==null||/^\(*\s*NULL\s*\)*$/i.test(String(c.dflt_value)))&&!(c.name==='id'&&String(c.type).toUpperCase()==='INTEGER'&&c.pk));
    report+='Required order fields: '+escapeHtml(required.map(c=>c.name).join(', ').slice(0,250)||'none')+'\n';
    const unsupported=unsupportedOrderColumns(columns);if(unsupported.length)report+='Unsupported required order fields: '+escapeHtml(unsupported.join(', ').slice(0,250))+'\n';
    for(const [table,required] of [['preorders',['id','user_id','product_id','status']],['inventory',['id','product_id','order_id','is_sold']]]){const {results:info}=await env.DB.prepare(`PRAGMA table_info(${table})`).all();const have=new Set(info.map(c=>c.name));const absent=required.filter(c=>!have.has(c));report+=table+': '+(absent.length?'missing '+absent.join(', '):'columns OK')+'\n';}
    const localWallet=await env.DB.prepare('SELECT balance_usd FROM users WHERE user_id=?').bind(chatId).first();
    report+='This bot wallet (your account): '+(localWallet?Number(localWallet.balance_usd||0).toFixed(2)+' USD':'not registered; send /start')+'\n';
    const key=await getSetting(env,'external_api_key','');let base=String(await getSetting(env,'external_api_url','')).trim().replace(/\/+$/,'');if(base.includes('/api/reseller'))base=base.split('/api/reseller')[0];
    report+='API key: '+(key?'configured':'NOT SET')+'\n';
    if(key&&base){
      try{
        const u=new URL(base);report+='API host: '+escapeHtml(u.hostname)+'\n';
        const response=await fetchWithTimeout(`${base}/api/reseller/me`,{headers:{'X-Reseller-Key':key,'Accept':'application/json'}},5000);
        const body=await response.json().catch(()=>null);
        report+=`Provider /me: HTTP ${response.status}\n`;
        if(body?.error?.code)report+='Provider error: '+escapeHtml(await safeDiagnostic(env,body.error.code))+'\n';
        const balance=body?.wallet?.balance??body?.balance;
        if(balance!==null&&balance!==undefined&&Number.isFinite(Number(balance)))report+='Provider wallet: '+Number(balance)+' USDT\n';
      }catch(error){report+='Provider connection: '+escapeHtml(await safeDiagnostic(env,error?.message))+'\n';}
    }else report+='Provider connection: missing URL or API key\n';
    const sql=missing.length?'SELECT id,status FROM orders ORDER BY id DESC LIMIT 5':'SELECT id,status,provider_error FROM orders ORDER BY id DESC LIMIT 5';
    const {results:orders}=await env.DB.prepare(sql).all();report+='\n<b>Recent orders</b>\n';
    if(!orders.length)report+='No local orders found.\n';
    for(const order of orders)report+=`#${order.id}: ${escapeHtml(order.status)}${order.provider_error?' — '+escapeHtml(await safeDiagnostic(env,order.provider_error)):''}\n`;
    report+='\n<b>Phone SMS receipts received by server</b>\n';
    try{
      const {results:receipts}=await env.DB.prepare('SELECT method,trx_id,amount_minor,status FROM mobile_bridge_receipts ORDER BY received_at DESC LIMIT 5').all();
      if(!receipts.length)report+='No signed payment SMS records received.\n';
      for(const r of receipts)report+=escapeHtml(r.method)+' · '+escapeHtml(r.trx_id)+' · '+(r.amount_minor/100).toFixed(2)+' BDT · '+escapeHtml(r.status)+'\n';
      const {results:waiting}=await env.DB.prepare("SELECT invoice_type,invoice_id,method,trx_id FROM mobile_payment_invoices WHERE status='pending' AND trx_id IS NOT NULL ORDER BY submitted_at DESC LIMIT 3").all();
      if(waiting.length){report+='Pending TrxID submissions:\n';for(const r of waiting)report+=r.invoice_type+' #'+r.invoice_id+' · '+r.method+' · '+r.trx_id+'\n';}
    }catch{report+='SMS tables not initialized; send /start.\n';}
    await ensureDiagnosticTable(env.DB);const {results:errors}=await env.DB.prepare('SELECT reference,stage,detail FROM bot_runtime_errors ORDER BY created_at DESC,rowid DESC LIMIT 3').all();
    if(errors.length){report+='\n<b>Recent runtime errors</b>\n';for(const error of errors)report+=`${error.reference}: ${escapeHtml(error.stage)} — ${escapeHtml(await safeDiagnostic(env,error.detail))}\n`;}
  }catch(error){report+='\nDatabase/configuration failure: '+escapeHtml(await safeDiagnostic(env,error?.message));}
  return await sendMsg(env,chatId,report,[[{text:'Refresh diagnostics',callback_data:'adm_diagnostics'}],[{text:'Admin Panel',callback_data:'admin_panel'}]]);
}

// Validate legacy NOT NULL constraints before any wallet debit or provider request.
const orderWriteSchemaCache=new WeakMap();
function unsupportedOrderColumns(columns){
  const supplied=new Set(['user_id','username','product_id','product_name','quantity','payment_method','trx_id','amount','amount_usd','amount_bdt','currency','status','created_at']);
  return columns.filter(c=>c.notnull&&(c.dflt_value==null||/^\(*\s*NULL\s*\)*$/i.test(String(c.dflt_value)))&&!supplied.has(c.name)&&!(c.name==='id'&&String(c.type).toUpperCase()==='INTEGER'&&c.pk)).map(c=>c.name);
}
async function assertOrderWriteCompatible(env){
  let columns=orderWriteSchemaCache.get(env.DB);
  if(!columns){const result=await env.DB.prepare('PRAGMA table_info(orders)').all();columns=result.results;orderWriteSchemaCache.set(env.DB,columns);}
  const missing=unsupportedOrderColumns(columns);
  if(missing.length)throw new Error('Unsupported required orders columns: '+missing.join(', ')+'. Wallet was not debited; review the legacy schema.');
}

// Read-only customer management. Only the configured Telegram admin may access these records.
function adminUserAccess(env,chatId){return String(chatId)===String(env.ADMIN_ID);}
function adminUserProfileButton(userId){return {text:'👤 View Customer',callback_data:`adm_user_view_${userId}`};}
async function notifyAdminForUser(env,userId,text,keyboard=[]){
  const delivery=sendMsg(env,env.ADMIN_ID,text,[...keyboard,[adminUserProfileButton(userId)]]);
  if(env.__executionContext?.waitUntil){env.__executionContext.waitUntil(delivery.catch(()=>console.error('Admin customer notification failed')));return {ok:true,queued:true};}
  return await delivery;
}
const ADMIN_USER_PAGE_SIZE=10;
function adminUserPage(value){return Math.min(100000,Math.max(0,Number.parseInt(value,10)||0));}
function adminSnippet(value,limit=100){let text='';for(const char of String(value??'')){const escaped=escapeHtml(char);if(text.length+escaped.length>limit)return text+'…';text+=escaped;}return text;}
function adminMoney(value){const n=Number(value);return Number.isFinite(n)?n.toFixed(2):'0.00';}
async function showAdminUsersMenu(env,chatId,messageId=null){
  if(!adminUserAccess(env,chatId))return;
  await clearAdminState(env,chatId);
  const overview=await env.DB.prepare("SELECT (SELECT COUNT(*) FROM users) AS users,(SELECT COUNT(DISTINCT user_id) FROM deposits WHERE status='completed') AS depositors,(SELECT COUNT(DISTINCT user_id) FROM orders) AS buyers").first();
  const text=`👥 <b>Users / Find Customer</b>\n\nAll users: <b>${overview?.users||0}</b> · Depositors: <b>${overview?.depositors||0}</b> · Customers with orders: <b>${overview?.buyers||0}</b>`+'\n\nFind by User ID, @username, name or Transaction ID.\nFor an invoice use <code>order:123</code> or <code>deposit:123</code>.\n\nOpen a customer to see wallet balance, deposits and orders.';
  const buttons=[[{text:'🔎 Search Customer',callback_data:'adm_user_search'}],[{text:'All Users',callback_data:'adm_user_list_all_0'}],[{text:'Recent Deposits',callback_data:'adm_user_list_deposits_0'},{text:'Recent Orders',callback_data:'adm_user_list_orders_0'}],[{text:'Admin Panel',callback_data:'admin_panel'}]];
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function showAdminUserList(env,chatId,mode,page=0,query='',messageId=null){
  if(!adminUserAccess(env,chatId))return;
  page=adminUserPage(page);let where='1=1',sort='u.user_id DESC',args=[];
  const q=String(query).trim().slice(0,100);
  if(mode==='deposits'){where="EXISTS(SELECT 1 FROM deposits d WHERE d.user_id=u.user_id AND d.status='completed')";sort="(SELECT MAX(id) FROM deposits d WHERE d.user_id=u.user_id AND d.status='completed') DESC,u.user_id DESC";}
  else if(mode==='orders'){where='EXISTS(SELECT 1 FROM orders o WHERE o.user_id=u.user_id)';sort='(SELECT MAX(id) FROM orders o WHERE o.user_id=u.user_id) DESC,u.user_id DESC';}
  else if(mode==='search'){
    const invoice=q.match(/^(order|deposit):\s*(\d+)$/i);
    if(invoice){const table=invoice[1].toLowerCase()==='order'?'orders':'deposits';where=`EXISTS(SELECT 1 FROM ${table} x WHERE x.user_id=u.user_id AND x.${table==='orders'&&invoice[2].length===5?'public_order_id':'id'}=?)`;args=[invoice[2]];}
    else{
      const needle=q.replace(/^@/,'').toLowerCase();
      where=`(CAST(u.user_id AS TEXT)=? OR instr(LOWER(COALESCE(u.username,'')),?)>0 OR instr(LOWER(COALESCE(u.first_name,'')),?)>0 OR EXISTS(SELECT 1 FROM orders o WHERE o.user_id=u.user_id AND UPPER(o.trx_id)=?) OR EXISTS(SELECT 1 FROM deposits d WHERE d.user_id=u.user_id AND UPPER(d.trx_id)=?))`;
      args=[q,needle,needle,q.toUpperCase(),q.toUpperCase()];
    }
  }else mode='all';
  const {results}=await env.DB.prepare(`SELECT u.user_id,u.username,u.first_name,u.balance_usd FROM users u WHERE ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`).bind(...args,ADMIN_USER_PAGE_SIZE+1,page*ADMIN_USER_PAGE_SIZE).all();
  const more=results.length>ADMIN_USER_PAGE_SIZE,items=results.slice(0,ADMIN_USER_PAGE_SIZE);
  const title=mode==='search'?'Search results':mode==='deposits'?'Customers with completed deposits':mode==='orders'?'Customers with orders':'All Users';
  let text=`👥 <b>${title}</b> · Page ${page+1}\n`+(q?`Search: <code>${escapeHtml(q)}</code>\n`:'')+'\n';
  if(!items.length)text+='No matching customers found.';
  else text+='Choose a customer below.';
  const buttons=items.map(user=>[{text:`${String(user.first_name||user.username||'Customer').slice(0,28)} · ${user.user_id} · $${adminMoney(user.balance_usd)}`,callback_data:`adm_user_view_${user.user_id}`}]);
  const pager=[];const prefix=mode==='search'?'adm_user_search_page_':`adm_user_list_${mode}_`;
  if(page>0)pager.push({text:'Previous',callback_data:prefix+(page-1)});if(more)pager.push({text:'Next',callback_data:prefix+(page+1)});if(pager.length)buttons.push(pager);
  buttons.push([{text:'🔎 New Search',callback_data:'adm_user_search'},{text:'Users Menu',callback_data:'adm_users'}]);
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function showAdminUserProfile(env,chatId,userId,messageId=null){
  if(!adminUserAccess(env,chatId))return;
  const user=await env.DB.prepare('SELECT * FROM users WHERE user_id=?').bind(userId).first();
  if(!user){await sendMsg(env,chatId,'Customer not found.');return;}
  const [dep,orders,latestDeposit,latestOrder]=await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(amount_usd),0) AS total FROM deposits WHERE user_id=? AND status='completed'").bind(userId).first(),
    env.DB.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(CASE WHEN status='completed' THEN amount_usd ELSE 0 END),0) AS total FROM orders WHERE user_id=?").bind(userId).first(),
    env.DB.prepare('SELECT id,amount_usd,method,status FROM deposits WHERE user_id=? ORDER BY id DESC LIMIT 1').bind(userId).first(),
    env.DB.prepare('SELECT id,amount_usd,status FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 1').bind(userId).first()
  ]);
  const name=String(user.first_name||'Customer').slice(0,80),username=String(user.username||'Not set').slice(0,80);
  let text=`👤 <b>Customer Profile</b>\n\nName: ${escapeHtml(name)}\nUsername: ${escapeHtml(username)}\nUser ID: <code>${user.user_id}</code>\n\nStatus: <b>${user.is_blocked?'Blocked':'Active'}</b>\nWallet: <b>$${adminMoney(user.balance_usd)} USD</b>\nCompleted deposits: ${dep?.count||0} · $${adminMoney(dep?.total)}\nOrders: ${orders?.count||0}\nCompleted purchases: $${adminMoney(orders?.total)}\nJoined: ${escapeHtml(String(user.created_at||'Unknown').slice(0,35))}`;
  if(latestDeposit)text+=`\n\nLatest deposit: #${latestDeposit.id} · $${adminMoney(latestDeposit.amount_usd)}\n${adminSnippet(latestDeposit.method,20)} · ${adminSnippet(latestDeposit.status,30)}`;
  if(latestOrder)text+=`\n\nLatest order: #${latestOrder.id} · $${adminMoney(latestOrder.amount_usd)} · ${adminSnippet(latestOrder.status,30)}`;
  const cleanUsername=String(user.username||'').replace(/^@/,'');
  const buttons=[[{text:user.is_blocked?'✅ Unblock User':'🚫 Block User',callback_data:`adm_access_${user.is_blocked?'unblock':'block'}_${user.user_id}`,style:user.is_blocked?'success':'danger'}],[{text:'📒 Balance History',callback_data:`adm_wallet_history_${user.user_id}_0`}],[{text:'➕ Add Balance',callback_data:`adm_wallet_add_${user.user_id}`,style:'success'},{text:'Reset Balance to Zero',callback_data:`adm_wallet_zero_${user.user_id}`,style:'danger'}],[{text:'🔄 Refresh Customer',callback_data:`adm_user_view_${user.user_id}`}],[{text:'Deposit History',callback_data:`adm_user_history_deposits_${user.user_id}_0`},{text:'Order History',callback_data:`adm_user_history_orders_${user.user_id}_0`}],[{text:'Open Telegram Profile',url:String(user.username||'').startsWith('@')&&/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(cleanUsername)?`https://t.me/${cleanUsername}`:`tg://user?id=${user.user_id}`}],[{text:'Users Menu',callback_data:'adm_users'},{text:'Search',callback_data:'adm_user_search'}]];
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function showAdminUserHistory(env,chatId,userId,type,page=0,messageId=null){
  if(!adminUserAccess(env,chatId)||!['orders','deposits'].includes(type))return;
  page=adminUserPage(page);const user=await env.DB.prepare('SELECT user_id FROM users WHERE user_id=?').bind(userId).first();if(!user){await sendMsg(env,chatId,'Customer not found.');return;}
  const {results}=await env.DB.prepare(`SELECT id,status,amount_usd,trx_id,created_at,${type==='orders'?'payment_method':'method'} AS method${type==='orders'?',product_name':''} FROM ${type} WHERE user_id=? ORDER BY id DESC LIMIT ? OFFSET ?`).bind(userId,ADMIN_USER_PAGE_SIZE+1,page*ADMIN_USER_PAGE_SIZE).all();
  let text=`📋 <b>${type==='orders'?'Order':'Deposit'} History</b> · Page ${page+1}\nUser: <code>${userId}</code>\n\n`;
  if(!results.length)text+='No records found.';
  for(const record of results.slice(0,ADMIN_USER_PAGE_SIZE))text+=`#${record.id} · $${adminMoney(record.amount_usd)} · ${adminSnippet(record.method,20)}\n${type==='orders'?adminSnippet(record.product_name||'Product unavailable',80)+'\n':''}${adminSnippet(record.status,30)} · ${adminSnippet(record.created_at,25)}\nTrxID: <code>${adminSnippet(record.trx_id||'Not submitted',100)}</code>\n\n`;
  const buttons=[],pager=[];if(page>0)pager.push({text:'Previous',callback_data:`adm_user_history_${type}_${userId}_${page-1}`});if(results.length>ADMIN_USER_PAGE_SIZE)pager.push({text:'Next',callback_data:`adm_user_history_${type}_${userId}_${page+1}`});if(pager.length)buttons.push(pager);
  buttons.push([{text:'Customer Profile',callback_data:`adm_user_view_${userId}`},{text:'Users Menu',callback_data:'adm_users'}]);
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function handleAdminUserSearch(env,chatId,text,state){
  if(!adminUserAccess(env,chatId)||!['awaiting_user_search','user_search_results'].includes(state.state))return false;
  const query=String(text).trim();if(!query||query.length>100){await sendMsg(env,chatId,'Enter a User ID, @username, name, Transaction ID, order:123 or deposit:123 (up to 100 characters).');return true;}
  await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'user_search_results',?)").bind(chatId,JSON.stringify({query})).run();
  await showAdminUserList(env,chatId,'search',0,query);return true;
}
async function handleAdminUserCallback(env,chatId,data,messageId){
  if(!adminUserAccess(env,chatId))return false;
  let access=data.match(/^adm_access_(block|unblock)_(\d+)$/);
  if(access){
    const user=await env.DB.prepare('SELECT * FROM users WHERE user_id=?').bind(access[2]).first();
    if(!user){await sendMsg(env,chatId,'Customer not found.');return true;}
    if(String(user.user_id)===String(env.ADMIN_ID)){await sendMsg(env,chatId,'The administrator account cannot be blocked.');return true;}
    const blocked=access[1]==='block'?1:0;
    if(Number(user.is_blocked||0)===blocked){await showAdminUserProfile(env,chatId,user.user_id,messageId);return true;}
    const token=crypto.randomUUID().replace(/-/g,''),draft=JSON.stringify({token,userId:user.user_id,blocked,expires:Date.now()+300000});
    await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'confirm_user_access',?)").bind(chatId,draft).run();
    await editMsg(env,chatId,messageId,`<b>${blocked?'Block':'Unblock'} User?</b>\n\n${escapeHtml(user.first_name||user.username||'Customer')}\nUser ID: <code>${user.user_id}</code>\n\n${blocked?'The user will be unable to use bot menus or start new purchases and deposits. Product alerts and broadcasts will stop.':'The user will be able to use the bot again.'}\nWallet funds and existing order/payment records are preserved. Already paid or submitted payments continue normal verification and fulfillment.`,[[{text:blocked?'Confirm Block':'Confirm Unblock',callback_data:`adm_access_ok_${token}`,style:blocked?'danger':'success'}],[{text:'Cancel',callback_data:`adm_user_view_${user.user_id}`}]]);return true;
  }
  access=data.match(/^adm_access_ok_([a-f0-9]{32})$/);
  if(access){
    const state=await env.DB.prepare("SELECT data FROM admin_states WHERE user_id=? AND state='confirm_user_access'").bind(chatId).first();let draft;try{draft=JSON.parse(state?.data||'null');}catch{}
    if(!draft||draft.token!==access[1]||draft.expires<Date.now()||String(draft.userId)===String(env.ADMIN_ID)){await sendMsg(env,chatId,'This confirmation has expired or was already used. Open the customer profile to start again.');return true;}
    const proof="EXISTS(SELECT 1 FROM admin_states WHERE user_id=? AND state='confirm_user_access' AND data=?)";
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO user_access_events(token,user_id,admin_id,is_blocked) SELECT ?,user_id,?,? FROM users WHERE user_id=? AND COALESCE(is_blocked,0)!=? AND ${proof}`).bind(draft.token,chatId,draft.blocked,draft.userId,draft.blocked,chatId,state.data),
      env.DB.prepare(`UPDATE users SET is_blocked=? WHERE user_id=? AND ${proof}`).bind(draft.blocked,draft.userId,chatId,state.data),
      env.DB.prepare(`DELETE FROM user_states WHERE user_id=? AND ?=1 AND ${proof}`).bind(draft.userId,draft.blocked,chatId,state.data),
      env.DB.prepare("DELETE FROM admin_states WHERE user_id=? AND state='confirm_user_access' AND data=?").bind(chatId,state.data)
    ]);
    await showAdminUserProfile(env,chatId,draft.userId,messageId);return true;
  }
  let credit=data.match(/^(?:adm_wallet_add|adm_credit)_(\d+)$/);
  if(credit){
    const user=await env.DB.prepare('SELECT * FROM users WHERE user_id=?').bind(credit[1]).first();
    if(!user){await sendMsg(env,chatId,'Customer not found.');return true;}
    await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'awaiting_wallet_credit',?)").bind(chatId,String(user.user_id)).run();
    await editMsg(env,chatId,messageId,`➕ <b>Add Wallet Balance</b>\n\nCustomer: ${escapeHtml(user.first_name||user.username||'Customer')}\nUser ID: <code>${user.user_id}</code>\nCurrent balance: <b>$${adminMoney(user.balance_usd)} USD</b>\n\nEnter the USD amount to add, e.g. 5.00. This adds to the existing balance. You will review and confirm before any funds are added.`,[[{text:'Cancel',callback_data:`adm_user_view_${user.user_id}`}]]);return true;
  }
  credit=data.match(/^adm_wallet_add_ok_([a-f0-9]{32})$/);
  if(credit){
    const state=await env.DB.prepare("SELECT data FROM admin_states WHERE user_id=? AND state='confirm_wallet_credit'").bind(chatId).first();let draft;try{draft=JSON.parse(state?.data||'null');}catch{}
    if(!draft||draft.token!==credit[1]||draft.expires<Date.now()){await sendMsg(env,chatId,'This confirmation has expired or was already used. Open the customer profile to start again.');return true;}
    const reference='admin:'+chatId+':credit:'+draft.token;
    const result=await env.DB.batch([
      env.DB.prepare(walletChangeSql("UPDATE users SET balance_usd=(ROUND(COALESCE(balance_usd,0)*100)+?)/100.0,balance_bdt=(ROUND(COALESCE(balance_bdt,0)*100)+?)/100.0 WHERE user_id=? AND EXISTS(SELECT 1 FROM admin_states WHERE user_id=? AND state='confirm_wallet_credit' AND data=?) AND NOT EXISTS(SELECT 1 FROM wallet_history WHERE user_id=? AND reason='admin_credit' AND reference=?)",'admin_credit',reference)).bind(draft.cents,draft.bdtMinor,draft.userId,chatId,state.data,draft.userId,reference),
      env.DB.prepare("DELETE FROM admin_states WHERE user_id=? AND state='confirm_wallet_credit' AND data=?").bind(chatId,state.data)
    ]);
    await sendMsg(env,chatId,result[0].meta?.changes?`✅ Added <b>$${(draft.cents/100).toFixed(2)} USD</b> to the customer's wallet. Recorded in Balance History.`:'Nothing was added. The customer is unavailable or this confirmation was already used.',[[{text:'Customer Profile',callback_data:`adm_user_view_${draft.userId}`}],[{text:'Balance History',callback_data:`adm_wallet_history_${draft.userId}_0`}]]);return true;
  }
  let reset=data.match(/^adm_wallet_zero_(\d+)$/);
  if(reset){
    const user=await env.DB.prepare('SELECT user_id,first_name,balance_usd,balance_bdt FROM users WHERE user_id=?').bind(reset[1]).first();
    if(!user){await sendMsg(env,chatId,'Customer not found.');return true;}
    const token=crypto.randomUUID().replace(/-/g,''),snapshot=JSON.stringify({userId:user.user_id,usd:Number(user.balance_usd||0),bdt:Number(user.balance_bdt||0),token,expires:Date.now()+300000});
    await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'confirm_wallet_zero',?)").bind(chatId,snapshot).run();
    await editMsg(env,chatId,messageId,`⚠️ <b>Reset Wallet Balance?</b>\n\nCustomer: ${escapeHtml(user.first_name||'Customer')}\nUser ID: <code>${user.user_id}</code>\nCurrent balance: <b>$${adminMoney(user.balance_usd)} USD</b> / ${adminMoney(user.balance_bdt)} BDT\nNew balance: <b>$0.00 USD / 0.00 BDT</b>\n\nThis removes the available wallet funds. The adjustment will be recorded in Balance History. Orders, deposits and total referral earnings stay unchanged.\n\nConfirmation expires in 5 minutes.`,[[{text:'Confirm Reset to Zero',callback_data:`adm_wallet_zero_ok_${token}`,style:'danger'}],[{text:'Cancel',callback_data:`adm_user_view_${user.user_id}`}]]);return true;
  }
  reset=data.match(/^adm_wallet_zero_ok_([a-f0-9]{32})$/);
  if(reset){
    const state=await env.DB.prepare("SELECT data FROM admin_states WHERE user_id=? AND state='confirm_wallet_zero'").bind(chatId).first();
    let snapshot;try{snapshot=JSON.parse(state?.data||'null');}catch{}
    if(!snapshot||snapshot.token!==reset[1]||snapshot.expires<Date.now()){await sendMsg(env,chatId,'This confirmation has expired or was already used. Open the customer profile to start again.');return true;}
    const result=await env.DB.batch([
      env.DB.prepare(walletChangeSql("UPDATE users SET balance_usd=0,balance_bdt=0 WHERE user_id=? AND COALESCE(balance_usd,0)=? AND COALESCE(balance_bdt,0)=? AND EXISTS(SELECT 1 FROM admin_states WHERE user_id=? AND state='confirm_wallet_zero' AND data=?)",'admin_reset','admin:'+chatId+':reset:'+snapshot.token)).bind(snapshot.userId,snapshot.usd,snapshot.bdt,chatId,state.data),
      env.DB.prepare("DELETE FROM admin_states WHERE user_id=? AND state='confirm_wallet_zero' AND data=?").bind(chatId,state.data)
    ]);
    await sendMsg(env,chatId,result[0].meta?.changes?'✅ Wallet balance reset to $0.00 USD / 0.00 BDT. The adjustment is recorded in Balance History.':'Balance was not reset because the customer balance changed or the confirmation was already used. Review the current balance and try again.',[[{text:'Customer Profile',callback_data:`adm_user_view_${snapshot.userId}`}],[{text:'Balance History',callback_data:`adm_wallet_history_${snapshot.userId}_0`}]]);return true;
  }
  if(data==='adm_users'){await showAdminUsersMenu(env,chatId,messageId);return true;}
  if(data==='adm_user_search'){
    await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'awaiting_user_search','')").bind(chatId).run();
    await editMsg(env,chatId,messageId,'🔎 <b>Find Customer</b>\n\nSend a User ID, @username, name or payment TrxID.\nInvoice search: <code>order:123</code> / <code>deposit:123</code>',[[{text:'Cancel',callback_data:'adm_users'}]]);return true;
  }
  let match=data.match(/^adm_user_list_(all|deposits|orders)_(\d+)$/);if(match){await clearAdminState(env,chatId);await showAdminUserList(env,chatId,match[1],match[2],'',messageId);return true;}
  match=data.match(/^adm_user_search_page_(\d+)$/);if(match){
    const state=await env.DB.prepare("SELECT data FROM admin_states WHERE user_id=? AND state='user_search_results'").bind(chatId).first();let query;try{query=JSON.parse(state?.data||'{}').query;}catch{}
    if(!query){await sendMsg(env,chatId,'Search session expired. Start a new search.');return true;}await showAdminUserList(env,chatId,'search',match[1],query,messageId);return true;
  }
  match=data.match(/^adm_user_view_(\d+)$/);if(match){await clearAdminState(env,chatId);await showAdminUserProfile(env,chatId,match[1],messageId);return true;}
  match=data.match(/^adm_user_history_(orders|deposits)_(\d+)_(\d+)$/);if(match){await showAdminUserHistory(env,chatId,match[2],match[1],match[3],messageId);return true;}
  return false;
}

// Markup is measured against the current provider cost, not against the previous selling price.
function externalSellingPrice(cost,product,globalMargin=20,globalType="percent"){
  const mode=product?.profit_margin_type||'global',value=Number(product?.profit_margin_value||0),base=Number(cost);
  let price;
  if(mode==='percent')price=base*(1+value/100);
  else if(mode==='fixed')price=base+value;
  else if(mode==='price')price=value;
  else if(Number(product?.custom_price_usd)>0)price=Number(product.custom_price_usd); // Preserve existing fixed-price overrides.
  else {const inherited=Number.isFinite(Number(globalMargin))?Number(globalMargin):20;price=globalType==='fixed'?base+inherited:base*(1+inherited/100);}
  if(!Number.isFinite(price)||price<0)throw new Error('Provider price or margin is invalid');
  return Number(price.toFixed(2));
}
function pricingModeLabel(product,globalMargin,globalType="percent"){
  if(product.profit_margin_type==='percent')return `Custom ${Number(product.profit_margin_value)}%`;
  if(product.profit_margin_type==='fixed')return `Fixed profit +$${Number(product.profit_margin_value).toFixed(2)}`;
  if(product.profit_margin_type==='price')return `Fixed selling price $${Number(product.profit_margin_value).toFixed(2)}`;
  if(Number(product.custom_price_usd)>0)return `Existing fixed selling price $${Number(product.custom_price_usd).toFixed(2)}`;
  return globalType==='fixed'?`Default fixed profit +$${Number(globalMargin).toFixed(2)}`:`Default ${globalMargin}%`;
}
async function showProductMargin(env,chatId,id,messageId=null){
  if(String(chatId)!==String(env.ADMIN_ID))return;
  const product=await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(id).first();if(!product||product.is_external!==1){await sendMsg(env,chatId,'API product not found.');return;}
  await clearAdminState(env,chatId);
  const [margin,globalType]=await Promise.all([getSetting(env,'external_profit_margin','20'),getSetting(env,'external_profit_margin_type','percent')]);
  const text=`📈 <b>Product Profit Margin</b>\n\n${escapeHtml(productDisplayName(product))}\nProvider cost: <b>$${Number(product.cost_price_usd).toFixed(2)}</b>\nSelling price: <b>$${Number(product.price_usd).toFixed(2)}</b>\nRule: <b>${escapeHtml(pricingModeLabel(product,margin,globalType))}</b>\n\nPercentage: $5 cost + 20% = $6\nFixed profit: $5 cost + $0.50 = $5.50\n\nPercentage/fixed-profit rules follow provider cost changes. A fixed selling price stays constant. Use Default removes this product’s custom rule. Other products keep their own settings.`;
  const buttons=[[{text:'Set Profit %',callback_data:`adm_margin_percent_${id}`}],[{text:'Set Profit +USD',callback_data:`adm_margin_fixed_${id}`}],[{text:`Use Default (${globalType==='fixed'?'+$'+Number(margin).toFixed(2):margin+'%'})`,callback_data:`adm_margin_global_${id}`}],[{text:'+10%',callback_data:`adm_quickmargin_${id}_10`},{text:'+20%',callback_data:`adm_quickmargin_${id}_20`},{text:'+30%',callback_data:`adm_quickmargin_${id}_30`}],[{text:'Fixed Selling Price (USD)',callback_data:`adm_margin_price_${id}`}],[{text:'Products',callback_data:'adm_price_menu'},{text:'Admin Panel',callback_data:'admin_panel'}]];
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function saveProductMargin(env,chatId,id,mode,value){
  if(String(chatId)!==String(env.ADMIN_ID))throw new Error('Admin access required');
  if(!['global','percent','fixed','price'].includes(mode)||!Number.isFinite(value)||value<0||value>(mode==='percent'?10000:1000000)||(mode==='price'&&value<=0))throw new Error('Invalid margin value');
  const product=await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(id).first();if(!product||product.is_external!==1)throw new Error('API product not found');
  const [margin,globalType,rateText]=await Promise.all([getSetting(env,'external_profit_margin','20'),getSetting(env,'external_profit_margin_type','percent'),getSetting(env,'usd_to_bdt_rate','125')]);
  const rate=Number(rateText);if(!Number.isFinite(rate)||rate<=0)throw new Error('Exchange rate is invalid');
  const updated={...product,profit_margin_type:mode,profit_margin_value:value,custom_price_usd:mode==='price'?value:0};
  const price=externalSellingPrice(product.cost_price_usd,updated,margin,globalType);
  if(price<=0)throw new Error('Provider cost is unavailable or selling price is zero');
  await env.DB.prepare('UPDATE products SET profit_margin_type=?,profit_margin_value=?,custom_price_usd=?,price_usd=?,price_bdt=? WHERE id=? AND is_external=1').bind(mode,value,updated.custom_price_usd,price,Math.round(price*rate),id).run();
  providerCatalogCache.delete(env.DB);
}
async function handlePricingCallback(env,chatId,data,messageId){
  if(String(chatId)!==String(env.ADMIN_ID))return false;
  const globalAction=data.match(/^adm_pricing_default_(percent|fixed)$/);
  if(globalAction){
    const type=globalAction[1];
    await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,?,?)").bind(chatId,type==='fixed'?'awaiting_api_fixed_margin':'awaiting_api_margin','').run();
    await editMsg(env,chatId,messageId,`<b>Set default margin</b>\n\nProducts without a custom margin use this default. Individual custom margins stay saved.\n\n${type==='percent'?'Enter a percentage, e.g. 20. A $5 product will sell for $6.':'Enter profit in USD, e.g. 0.50. A $5 product will sell for $5.50.'}`,[[{text:'Back to Custom Prices',callback_data:'adm_price_menu'}]]);return true;
  }
  if(data==='adm_set_api_fixed_margin'){
    await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'awaiting_api_fixed_margin','')").bind(chatId).run();
    await editMsg(env,chatId,messageId,'Enter default profit in USD to add to each API product cost, e.g. 0.50. Product-specific overrides stay unchanged.',[[{text:'Cancel',callback_data:'adm_api_menu'}]]);return true;
  }
  const page=data.match(/^adm_price_page_(\d+)$/);if(page){await showPricingProducts(env,chatId,Number(page[1]),messageId);return true;}
  let match=data.match(/^adm_setprice_(\d+)$/);
  if(match){const product=await env.DB.prepare('SELECT is_external FROM products WHERE id=?').bind(match[1]).first();if(product?.is_external===1){await showProductMargin(env,chatId,match[1],messageId);return true;}return false;}
  match=data.match(/^adm_margin_(global|percent|fixed|price)_(\d+)$/);
  if(match){
    const [,mode,id]=match;
    if(mode==='global'){await saveProductMargin(env,chatId,id,'global',0);await showProductMargin(env,chatId,id,messageId);return true;}
    const product=await env.DB.prepare('SELECT is_external FROM products WHERE id=?').bind(id).first();if(product?.is_external!==1){await sendMsg(env,chatId,'API product not found.');return true;}
    await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'awaiting_product_margin',?)").bind(chatId,JSON.stringify({id:Number(id),mode})).run();
    const prompt=mode==='percent'?'Enter profit percentage, e.g. 20 or 12.50. 0% is allowed.':mode==='fixed'?'Enter profit in USD to add to provider cost, e.g. 0.50. This is profit, not the final selling price.':'Enter the final fixed selling price in USD, e.g. 5.50.';
    await editMsg(env,chatId,messageId,prompt,[[{text:'Cancel',callback_data:`adm_setprice_${id}`}]]);return true;
  }
  match=data.match(/^adm_quickmargin_(\d+)_(\d+(?:\.\d+)?)$/);
  if(match){const product=await env.DB.prepare('SELECT is_external FROM products WHERE id=?').bind(match[1]).first();if(product?.is_external===1){await saveProductMargin(env,chatId,match[1],'percent',Number(match[2]));await showProductMargin(env,chatId,match[1],messageId);return true;}}
  return false;
}
function parseMarginInput(text){const value=String(text).trim().replace(/[০-৯]/g,c=>String(c.charCodeAt(0)-'০'.charCodeAt(0))).replace(/^\+\s*/,'').replace(/^\$\s*/,'').replace(/\s*%$/,'');return /^\d{1,7}(?:\.\d{1,2})?$/.test(value)?Number(value):NaN;}
async function handlePricingText(env,chatId,text,state){
  if(String(chatId)!==String(env.ADMIN_ID)||!['awaiting_product_margin','awaiting_api_margin','awaiting_api_fixed_margin','awaiting_new_price'].includes(state.state))return false;
  let value=parseMarginInput(text);
  if(!Number.isFinite(value)||value<0){await sendMsg(env,chatId,'Enter a non-negative number with up to 2 decimal places.');return true;}
  try{
    if(['awaiting_api_margin','awaiting_api_fixed_margin'].includes(state.state)){
      const globalType=state.state==='awaiting_api_fixed_margin'?'fixed':'percent';
      if(globalType==='fixed'&&String(text).trim().endsWith('%'))throw new Error('Enter a USD profit amount; choose percentage mode for %');
      if(globalType==='percent'&&String(text).trim().replace(/^\+\s*/,'').startsWith('$'))throw new Error('Enter a percentage, not a USD amount');
      if(value>(globalType==='fixed'?1000000:10000))throw new Error('Margin value is too large');
      const rate=Number(await getSetting(env,'usd_to_bdt_rate','125'));if(!Number.isFinite(rate)||rate<=0)throw new Error('Exchange rate is invalid');
      const {results}=await env.DB.prepare('SELECT * FROM products WHERE is_external=1').all();
      const statements=[env.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('external_profit_margin',?)").bind(String(value)),env.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('external_profit_margin_type',?)").bind(globalType)];
      const repriced=[];
      for(const product of results){const price=externalSellingPrice(product.cost_price_usd,product,value,globalType),bdt=Math.round(price*rate);if(Number(product.price_usd)!==price||Number(product.price_bdt)!==bdt)repriced.push({id:product.id,usd:price,bdt});}
      if(repriced.length)statements.push(env.DB.prepare(`WITH repriced AS (SELECT json_extract(value,'$.id') AS id,json_extract(value,'$.usd') AS usd,json_extract(value,'$.bdt') AS bdt FROM json_each(?)) UPDATE products SET price_usd=(SELECT r.usd FROM repriced r WHERE r.id=products.id),price_bdt=(SELECT r.bdt FROM repriced r WHERE r.id=products.id) WHERE is_external=1 AND id IN (SELECT id FROM repriced)`).bind(JSON.stringify(repriced)));
      await env.DB.batch(statements);providerCatalogCache.delete(env.DB);await clearAdminState(env,chatId);
      await sendMsg(env,chatId,`Default API profit margin saved: <b>${globalType==='fixed'?'+$'+value.toFixed(2):value+'%'}</b>. Individual custom margins are unchanged.`,[[{text:'Custom Prices',callback_data:'adm_price_menu'}]]);return true;
    }
    let id,mode;
    if(state.state==='awaiting_new_price'){
      id=Number(state.data);mode=String(text).trim().endsWith('%')?'percent':'price';
      const product=await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(id).first();
      if(product?.is_external!==1){
        if(!product||value<=0||mode!=='price')throw new Error('Enter a positive fixed selling price for this local product');
        const rate=Number(await getSetting(env,'usd_to_bdt_rate','125'));if(!Number.isFinite(rate)||rate<=0)throw new Error('Exchange rate is invalid');
        await env.DB.prepare('UPDATE products SET price_usd=?,price_bdt=?,custom_price_usd=? WHERE id=?').bind(value,Math.round(value*rate),value,id).run();await clearAdminState(env,chatId);await sendMsg(env,chatId,'Local product price saved.',[[{text:'Products',callback_data:'adm_price_menu'}]]);return true;
      }
    }else{const data=JSON.parse(state.data);id=data.id;mode=data.mode;}
    if(mode!=='percent'&&String(text).trim().endsWith('%'))throw new Error('This field expects USD; choose Custom Percentage for %');
    if(mode==='percent'&&String(text).trim().replace(/^\+\s*/,'').startsWith('$'))throw new Error('This field expects a percentage, not USD');
    await saveProductMargin(env,chatId,id,mode,value);await showProductMargin(env,chatId,id);return true;
  }catch(error){await sendMsg(env,chatId,`Price was not saved: ${escapeHtml(error.message)}. Please check and retry.`);return true;}
}

async function showPricingProducts(env,chatId,page=0,messageId=null){
  if(String(chatId)!==String(env.ADMIN_ID))return;
  await clearAdminState(env,chatId);page=adminUserPage(page);
  const {results}=await env.DB.prepare("SELECT p.*,CASE WHEN p.is_external=1 THEN COALESCE(p.api_stock,0) ELSE (SELECT COUNT(*) FROM inventory i WHERE i.product_id=p.id AND i.is_sold=0) END AS stock_qty FROM products p WHERE p.is_active=1 ORDER BY p.id LIMIT 11 OFFSET ?").bind(page*10).all();
  const buttons=results.slice(0,10).map(product=>[productListButton(product,`adm_setprice_${product.id}`)]),pager=[];
  if(page>0)pager.push({text:'Previous',callback_data:`adm_price_page_${page-1}`});if(results.length>10)pager.push({text:'Next',callback_data:`adm_price_page_${page+1}`});if(pager.length)buttons.push(pager);
  const [margin,type]=await Promise.all([getSetting(env,'external_profit_margin','20'),getSetting(env,'external_profit_margin_type','percent')]);
  const label=type==='fixed'?`+$${Number(margin).toFixed(2)}`:`${margin}%`;
  buttons.push([{text:`Default: ${label} · Change %`,callback_data:'adm_pricing_default_percent'},{text:'Default: Fixed +USD',callback_data:'adm_pricing_default_fixed'}]);
  buttons.push([{text:'Admin Panel',callback_data:'admin_panel'}]);
  const text=`📈 <b>Custom Prices & Profit</b> · Page ${page+1}\n\nChoose a product to set its own percentage or fixed dollar profit.\n\n<b>Default margin: ${label}</b>\nProducts without a custom rule use this default (initially 20%).\n\n<b>Change Default</b> keeps individual custom rules.\n\nAPI cost changes automatically update selling prices on sync using the saved margin.`;
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}


function salesReportPeriod(period,now=Date.now()){
  const local=new Date(now+6*3600000),year=local.getUTCFullYear(),month=local.getUTCMonth(),day=local.getUTCDate();
  const days=period==='week'?7:period==='days30'?30:1;
  const start=period==='all'?null:new Date(Date.UTC(year,month,period==='month'?1:day-days+1)-6*3600000).toISOString();
  return {start,end:new Date(now).toISOString(),label:period==='all'?'All Time':period==='month'?'This Month':period==='week'?'Last 7 Days':period==='days30'?'Last 30 Days':'Today'};
}
async function showAdminSalesReport(env,chatId,period='today',messageId=null){
  if(!adminUserAccess(env,chatId))return;
  if(!['today','week','days30','month','all'].includes(period))period='today';
  const range=salesReportPeriod(period),filter=range.start?' AND julianday(created_at)>=julianday(?)':'',args=range.start?[range.start,range.end]:[range.end];
  const row=await env.DB.prepare(`SELECT COUNT(*) AS completed,COALESCE(SUM(quantity),0) AS items,COALESCE(SUM(amount_usd),0) AS revenue,
    COALESCE(SUM(CASE WHEN sale_origin='api' THEN amount_usd ELSE 0 END),0) AS api_revenue,
    COALESCE(SUM(CASE WHEN sale_origin='local' THEN amount_usd ELSE 0 END),0) AS local_revenue,
    COALESCE(SUM(CASE WHEN sale_origin='api' AND provider_unit_cost_usd IS NOT NULL THEN ROUND(provider_unit_cost_usd*quantity*100) ELSE 0 END),0)/100.0 AS known_cost,
    COALESCE(SUM(CASE WHEN sale_origin='api' AND provider_unit_cost_usd IS NOT NULL THEN ROUND(amount_usd*100)-ROUND(provider_unit_cost_usd*quantity*100) ELSE 0 END),0)/100.0 AS gross_profit,
    SUM(CASE WHEN sale_origin='api' AND provider_unit_cost_usd IS NOT NULL THEN 1 ELSE 0 END) AS costed,
    COALESCE(SUM(CASE WHEN sale_origin='local' AND purchase_unit_cost_usd IS NOT NULL THEN ROUND(purchase_unit_cost_usd*quantity*100) ELSE 0 END),0)/100.0 AS local_cost,
    COALESCE(SUM(CASE WHEN sale_origin='local' AND purchase_unit_cost_usd IS NOT NULL THEN ROUND(amount_usd*100)-ROUND(purchase_unit_cost_usd*quantity*100) ELSE 0 END),0)/100.0 AS local_profit,
    SUM(CASE WHEN sale_origin IS NULL OR (sale_origin='api' AND provider_unit_cost_usd IS NULL) OR (sale_origin='local' AND purchase_unit_cost_usd IS NULL) THEN 1 ELSE 0 END) AS unknown
    FROM orders WHERE status='completed'${filter} AND julianday(created_at)<=julianday(?)`).bind(...args).first();
  const wallets=await env.DB.prepare(`SELECT COUNT(*) AS users,
    COALESCE(SUM(ROUND(COALESCE(balance_usd,0)*100)),0)/100.0 AS usd,
    COALESCE(SUM(ROUND(COALESCE(balance_bdt,0)*100)),0)/100.0 AS bdt,
    COALESCE(SUM(CASE WHEN COALESCE(balance_usd,0)>0 OR COALESCE(balance_bdt,0)>0 THEN 1 ELSE 0 END),0) AS funded FROM users`).first();
  const text=`📊 <b>Sales & Profit · ${range.label}</b>\nTimezone: Asia/Dhaka\nBy order creation date · completed orders only\n\n<b>Current Wallet Funds · All Users</b>\nTotal wallet balance: <b>$${adminMoney(wallets?.usd)} USD</b>\nStored BDT equivalent: <b>${adminMoney(wallets?.bdt)} BDT</b>\nWallets with funds: ${wallets?.funded||0} / ${wallets?.users||0}\nCurrent balances across all users, including admin. Independent of the report period; not added to sales or profit.\n\n<b>Sales</b>\nCompleted orders: <b>${row?.completed||0}</b> · Items: <b>${row?.items||0}</b>\nTotal sales: <b>$${adminMoney(row?.revenue)}</b>\nAPI sales: $${adminMoney(row?.api_revenue)}\nLocal product sales: $${adminMoney(row?.local_revenue)}\n\n<b>API product gross profit</b>\nRecorded provider cost: <b>$${adminMoney(row?.known_cost)}</b>\nGross profit: <b>$${adminMoney(row?.gross_profit)}</b>\nCost recorded for ${row?.costed||0} completed API orders.\nProfit = saved selling total − saved provider cost × quantity.\n\n<b>Local product profit</b>\nPurchase cost: <b>$${adminMoney(row?.local_cost)}</b>\nGross profit: <b>$${adminMoney(row?.local_profit)}</b>\n\n<b>Combined gross profit: $${adminMoney(Number(row?.gross_profit||0)+Number(row?.local_profit||0))}</b>\n\nOrders without origin/cost history: <b>${row?.unknown||0}</b> (profit excluded). Orders with missing cost are excluded from profit.\n\nAPI profit uses the API price saved when the order was created. Payment fees, referral commissions and other expenses are excluded. Deposits are not sales.`;
  const buttons=[[{text:'Today',callback_data:'adm_sales_today'},{text:'7 Days',callback_data:'adm_sales_week'},{text:'30 Days',callback_data:'adm_sales_days30'}],[{text:'This Month',callback_data:'adm_sales_month'},{text:'All Time',callback_data:'adm_sales_all'}],[{text:'🔄 Refresh',callback_data:`adm_sales_${period}`}],[{text:'Admin Panel',callback_data:'admin_panel'}]];
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}


function localProfitInfo(cost,price){
  const costCents=Math.round(Number(cost)*100),priceCents=Math.round(Number(price)*100),profit=priceCents-costCents;
  return {profit:(profit/100).toFixed(2),markup:costCents>0?(profit/costCents*100).toFixed(2)+'%':'N/A (zero cost)'};
}
async function handleLocalProductText(env,chatId,text,state){
  const steps=['awaiting_prod_name','awaiting_prod_desc','awaiting_prod_cost','awaiting_prod_sale','awaiting_local_cost'];
  if(!adminUserAccess(env,chatId)||!steps.includes(state.state))return false;
  const cancel=[[{text:'Cancel',callback_data:'admin_panel'}]];
  if(state.state==='awaiting_local_cost'){
    const value=parseMarginInput(text);
    if(!Number.isFinite(value)||value<0||value>1000000||String(text).trim().endsWith('%')){await sendMsg(env,chatId,'Enter purchase cost in USD with up to 2 decimal places, e.g. 4.00.',cancel);return true;}
    const product=await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(state.data).first();
    if(!product||product.is_external){await clearAdminState(env,chatId);await sendMsg(env,chatId,'Local product not found.');return true;}
    await env.DB.prepare('UPDATE products SET purchase_cost_usd=? WHERE id=? AND COALESCE(is_external,0)=0').bind(value,product.id).run();
    await clearAdminState(env,chatId);
    const info=localProfitInfo(value,product.price_usd);
    await sendMsg(env,chatId,`Purchase cost saved: <b>$${value.toFixed(2)}</b> per item.\nSelling price: $${adminMoney(product.price_usd)}\nGross profit: <b>$${info.profit}</b> per item\nMarkup on cost: ${info.markup}\nExisting orders keep their recorded costs.`,[[{text:'Product',callback_data:`adm_prod_details_${product.id}`}]]);return true;
  }
  let draft;try{draft=JSON.parse(state.data||'{}');}catch{await clearAdminState(env,chatId);await sendMsg(env,chatId,'Please restart Add New Product.');return true;}
  const next=async(step,prompt)=>{await env.DB.prepare('UPDATE admin_states SET state=?,data=? WHERE user_id=?').bind(step,JSON.stringify(draft),chatId).run();await sendMsg(env,chatId,prompt,cancel);};
  if(state.state==='awaiting_prod_name'){
    if(!text.trim()||text.length>150){await sendMsg(env,chatId,'Enter a product name up to 150 characters.',cancel);return true;}
    draft.name=text.trim();await next('awaiting_prod_desc','<b>Add Product · Step 3/5</b>\nSend the product description.');return true;
  }
  if(state.state==='awaiting_prod_desc'){
    if(!text.trim()||text.length>2000){await sendMsg(env,chatId,'Enter a description up to 2000 characters.',cancel);return true;}
    draft.description=text.trim();await next('awaiting_prod_cost','<b>Add Product · Step 4/5: Purchase Cost</b>\nEnter purchase cost per item in USD, e.g. 4.00. Zero is allowed.');return true;
  }
  const value=parseMarginInput(text);
  if(!Number.isFinite(value)||value<0||value>1000000||String(text).trim().endsWith('%')||(state.state==='awaiting_prod_sale'&&value===0)){await sendMsg(env,chatId,'Enter a valid USD amount with up to 2 decimal places. Selling price must be greater than zero.',cancel);return true;}
  if(state.state==='awaiting_prod_cost'){draft.cost=value;await next('awaiting_prod_sale',`<b>Add Product · Step 5/5: Selling Price</b>\nPurchase cost: $${value.toFixed(2)} per item.\nEnter selling price in USD, e.g. 5.00.`);return true;}
  if(!Number.isFinite(draft.cost)||!draft.name||!draft.description){await clearAdminState(env,chatId);await sendMsg(env,chatId,'Product draft is incomplete. Please restart Add New Product.');return true;}
  const rate=Number(await getSetting(env,'usd_to_bdt_rate','125'));
  if(!Number.isFinite(rate)||rate<=0){await sendMsg(env,chatId,'Set a valid USD to BDT exchange rate first.');return true;}
  const selectedCategory=Number(draft.categoryId||0);
  if(selectedCategory&&!await env.DB.prepare('SELECT id FROM product_categories WHERE id=? AND is_deleted=0').bind(selectedCategory).first()){await clearAdminState(env,chatId);await sendMsg(env,chatId,'The selected category was deleted. Start Add New Product and choose a category again.',[[{text:'Add New Product',callback_data:'adm_add_product'}]]);return true;}
  const name=(draft.icon?draft.icon+' ':'')+draft.name;
  const result=await env.DB.batch([
    env.DB.prepare("INSERT INTO products(name,description,price_usd,price_bdt,purchase_cost_usd,shop_category_id,category_override,is_external,is_active) SELECT ?,?,?,?,?,?,1,0,1 WHERE EXISTS(SELECT 1 FROM admin_states WHERE user_id=? AND state='awaiting_prod_sale' AND data=?) AND (? IS NULL OR EXISTS(SELECT 1 FROM product_categories WHERE id=? AND is_deleted=0))").bind(name,draft.description,value,Math.round(value*rate),draft.cost,selectedCategory||null,chatId,state.data,selectedCategory||null,selectedCategory||null),
    env.DB.prepare("DELETE FROM admin_states WHERE user_id=? AND state='awaiting_prod_sale' AND data=?").bind(chatId,state.data)
  ]);
  if(!result[0].meta?.changes){await sendMsg(env,chatId,'Product draft was already saved or cancelled.');return true;}
  const info=localProfitInfo(draft.cost,value),id=result[0].meta.last_row_id;
  await sendMsg(env,chatId,`✅ <b>Product Added</b>\n${escapeHtml(name)}\n\nPurchase cost: <b>$${draft.cost.toFixed(2)}</b>\nSelling price: <b>$${value.toFixed(2)}</b>\nGross profit per item: <b>$${info.profit}</b>\nMarkup on cost: <b>${info.markup}</b>\n\nCompleted sales will appear in Sales & Profit Reports.`,[[{text:'Add Stock',callback_data:`adm_addstock_${id}`}],[{text:'Set Category',callback_data:`adm_cat_product_${id}_0`}],[{text:'Product',callback_data:`adm_prod_details_${id}`}],[{text:'Admin Panel',callback_data:'admin_panel'}]]);return true;
}


async function recordPaymentVerification(env,type,id,userId,method,trx,reason){
  if(!['order','deposit'].includes(type))return;
  const code=/^[a-z_]{1,50}$/.test(String(reason))?String(reason):'unavailable';
  try{await env.DB.prepare(`INSERT INTO payment_verification_events(invoice_type,invoice_id,user_id,method,trx_id,reason) VALUES(?,?,?,?,?,?)
    ON CONFLICT(invoice_type,invoice_id) DO UPDATE SET trx_id=excluded.trx_id,reason=excluded.reason,attempts=attempts+1,updated_at=CURRENT_TIMESTAMP`)
    .bind(type,id,userId,String(method).slice(0,20),(/^[A-Za-z0-9]{6,100}$/.test(String(trx||''))?String(trx):''),code).run();
    if(!['verified','admin_approved','admin_cancelled','closed'].includes(code)&&/^[A-Za-z0-9]{6,100}$/.test(String(trx||''))){
      const alert=notifyPendingPaymentAdmin(env,type,id,userId,method,String(trx),code).catch(()=>console.error('Pending payment admin alert needs retry'));
      if(env.__executionContext?.waitUntil)env.__executionContext.waitUntil(alert);else await alert;
    }
  }catch{console.error('Payment dashboard event or admin alert could not be saved');}
}
async function notifyPendingPaymentAdmin(env,type,id,userId,method,trx,reason){
  if(!env.ADMIN_ID)return;
  const table=type==='order'?'orders':'deposits',invoice=await env.DB.prepare(`SELECT * FROM ${table} WHERE id=? AND user_id=? AND status='pending'`).bind(id,userId).first();
  if(!invoice)return;
  const key=trx.toUpperCase(),token=crypto.randomUUID(),now=Date.now();
  await env.DB.prepare('INSERT OR IGNORE INTO payment_pending_alerts(invoice_type,invoice_id,trx_key,reason) VALUES(?,?,?,?)').bind(type,id,key,reason).run();
  const claimed=await env.DB.prepare('UPDATE payment_pending_alerts SET lease_token=?,lease_until=? WHERE invoice_type=? AND invoice_id=? AND trx_key=? AND reason=? AND sent=0 AND lease_until<=?').bind(token,now+60000,type,id,key,reason,now).run();
  if(!claimed.meta?.changes)return;
  let delivered=false;
  try{
    const result=await sendMsg(env,env.ADMIN_ID,`⚠️ <b>Payment Pending · Verification Failed</b>\n\n${type==='order'?'Order':'Deposit'} ${type==='order'?orderDisplayId(invoice):id}\nCustomer: ${customerTelegramId(userId,invoice.username)}\nMethod: <b>${escapeHtml(String(method).toUpperCase())}</b>\nAmount: <b>$${adminMoney(invoice.amount_usd)} USD</b> · ${adminMoney(invoice.amount_bdt)} BDT\nTrxID: <code>${escapeHtml(trx)}</code>\n\nReason: ${escapeHtml(paymentDashboardReason(reason))}\n\nThis attempt did not verify the payment. Open Payment Details for the latest status.`,[[{text:'Payment Details',callback_data:`adm_paydetail_${type}_${id}`}],[{text:'View Customer',callback_data:`adm_user_view_${userId}`}]]);
    delivered=Boolean(result?.ok);
  }finally{
    await env.DB.prepare('UPDATE payment_pending_alerts SET sent=?,lease_until=0,lease_token=NULL WHERE invoice_type=? AND invoice_id=? AND trx_key=? AND reason=? AND lease_token=?').bind(delivered?1:0,type,id,key,reason,token).run();
  }
}
function customerTelegramUrl(userId,username=''){
  const name=String(username||'');
  if(/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name))return 'https://t.me/'+name.slice(1);
  return 'tg://user?id='+String(userId).replace(/[^0-9]/g,'');
}
function customerTelegramId(userId,username=''){
  return `<a href="${customerTelegramUrl(userId,username)}">${escapeHtml(String(userId))}</a>`;
}
function paymentDashboardSource(){return `(SELECT 'order' AS kind,id,user_id,payment_method AS method,amount_usd,amount_bdt,trx_id,status,created_at FROM orders WHERE UPPER(payment_method) NOT IN ('WALLET','REDEEM') UNION ALL SELECT 'deposit',id,user_id,method,amount_usd,amount_bdt,trx_id,status,created_at FROM deposits WHERE UPPER(method)<>'WALLET' AND (UPPER(method)<>'REDEEM' OR status='completed'))`;}
function paymentDashboardReason(code){return ({admin_approved:'Payment manually approved by the administrator.',admin_cancelled:'Pending payment cancelled by the administrator.',verified:'Payment verified. Check invoice status for credit/delivery.',missing:'Receiving-phone SMS record has not arrived.',mismatch:'SMS method, receiving account, amount or time did not match.',used:'Transaction was already used.',already_used:'Payment or invoice was already submitted.',not_found:'Transaction was not found in the payment network/history.',rpc_unavailable:'BNB Smart Chain RPC is unavailable.',tx_failed:'Blockchain transaction failed or its hash did not match.',confirmations:'Waiting for 12 blockchain confirmations.',old_payment:'Payment predates the invoice.',recipient_mismatch:'Supported USDT transfer to the receiving wallet was not found.',unconfirmed:'Waiting for blockchain confirmations.',pending:'Blockchain transaction is pending.',amount_low:'Received amount is below the required amount.',amount_high:'Payment exceeds this method’s limit.',invalid_format:'Submitted transaction ID format is invalid.',invalid_invoice:'Invoice is not payable or its time is invalid.',invalid_payment:'Transaction is not an eligible incoming USDT payment.',payment_expired:'Payment was submitted outside the allowed time.',api_rejected:'Binance API rejected verification; check API permissions/access.',not_configured:'Payment verification credentials are missing.',manual_approval:'Automatic verification is disabled.',no_wallet:'Receiving wallet is not configured.',unavailable:'Verification service is unavailable; retry may be needed.',maintenance:'Verification is paused during maintenance.',membership:'Required channel/group membership is missing.',closed:'Invoice was already processed or closed.',claim_failed:'Payment could not be reserved; check for prior use.'})[code]||`Verification result: ${String(code||'No saved attempt').replace(/[^a-z_ ]/gi,'').slice(0,60)}`;}
async function showPaymentDashboard(env,chatId,filter='menu',page=0,messageId=null,notice=null){
  if(!adminUserAccess(env,chatId))return;
  await clearAdminState(env,chatId);page=adminUserPage(page);
  const from=`${paymentDashboardSource()} x LEFT JOIN payment_verification_events e ON e.invoice_type=x.kind AND e.invoice_id=x.id LEFT JOIN mobile_payment_invoices m ON m.invoice_type=x.kind AND m.invoice_id=x.id LEFT JOIN users u ON u.user_id=x.user_id`;
  const hasTrx="COALESCE(NULLIF(TRIM(e.trx_id),''),NULLIF(TRIM(m.trx_id),''),NULLIF(TRIM(x.trx_id),''),'')<>''";
  const summary=await env.DB.prepare(`SELECT COUNT(*) AS total,SUM(CASE WHEN x.status='pending' AND ${hasTrx} THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN x.status IN ('paid_pending_delivery','delivering') THEN 1 ELSE 0 END) AS delivery,SUM(CASE WHEN x.status IN ('completed','paid_pending_delivery','delivering','wallet_credited') THEN 1 ELSE 0 END) AS completed FROM ${from}`).first();
  if(filter==='menu'){
    const text=`💳 <b>Payment Dashboard</b>\n\nChoose a payment list.`;
    const buttons=[[{text:`🔴 Pending Payments (${summary?.pending||0})`,callback_data:'adm_paydash_pending_0',style:'danger'}],[{text:`✅ Completed Payments (${summary?.completed||0})`,callback_data:'adm_paydash_completed_0',style:'success'}],[{text:'⬅️ Admin Panel',callback_data:'admin_panel'}]];
    return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
  }
  const where=filter==='cancelled'?"x.status IN ('cancelled','rejected')":filter==='completed'?"x.status IN ('completed','paid_pending_delivery','delivering','wallet_credited')":filter==='delivery'?"x.status IN ('paid_pending_delivery','delivering')":filter==='issues'?`x.status='pending' AND ${hasTrx} AND e.reason IS NOT NULL AND e.reason<>'verified'`:`x.status='pending' AND ${hasTrx}`;
  const {results}=await env.DB.prepare(`SELECT x.*,u.first_name AS customer_name,u.username AS customer_username,COALESCE(NULLIF(e.trx_id,''),NULLIF(m.trx_id,''),NULLIF(x.trx_id,'')) AS submitted_trx,e.reason FROM ${from} WHERE ${where} ORDER BY x.created_at DESC,x.kind,x.id DESC LIMIT 11 OFFSET ?`).bind(page*10).all();
  const titles={pending:'Pending',submitted:'IDs Submitted',issues:'Verification Issues',delivery:'Paid / Delivery Pending',completed:'Completed',cancelled:'Cancelled / Deleted'};
  let text=`${filter==='completed'?'✅ Completed Payments':'🔴 '+(filter==='pending'||filter==='submitted'?'Pending Payments':titles[filter]||'Pending Payments')}\n${notice?'\n✅ Pending payment deleted. The list is up to date.\n':''}\nPage ${page+1}\n${results.length?'':'No payments in this list.'}`;
  if(results.length)text+='\n\n'+results.slice(0,10).map(x=>`${x.method.toUpperCase()==='REDEEM'?'🎁 Redeem Credit':x.kind==='order'?'Order':'Deposit'} ${x.id} · ${escapeHtml(x.method)} · $${adminMoney(x.amount_usd)}\nCustomer: ${adminSnippet(x.customer_name||x.customer_username||'Customer',48)} · ID: ${customerTelegramId(x.user_id,x.customer_username)}\n${x.method.toUpperCase()==='REDEEM'?'Reference: Redeem '+x.id:'TrxID: <code>'+adminSnippet(x.submitted_trx||'Not submitted',100)+'</code>'}${x.status==='pending'?'\nReason: '+(x.reason?adminSnippet(paymentDashboardReason(x.reason),120):'No verification result recorded yet. Open Payment Details.') : ''}`).join('\n\n');
  const buttons=results.slice(0,10).map(x=>[
    {text:`${x.method.toUpperCase()==='REDEEM'?'🎁 Redeem':x.kind==='order'?'Order':'Deposit'} #${x.id} · ${x.method} · $${adminMoney(x.amount_usd)} · ${x.user_id}`,callback_data:`adm_paydetail_${x.kind}_${x.id}`,...(x.status==='pending'?{style:'danger'}:filter==='completed'?{style:'success'}:{})},
  ]);
  if(notice?.userId)buttons.push([{text:'View Customer / Add Balance',callback_data:`adm_user_view_${notice.userId}`}]);
  const pager=[];if(page>0)pager.push({text:'Previous',callback_data:`adm_paydash_${filter}_${page-1}`});if(results.length>10)pager.push({text:'Next',callback_data:`adm_paydash_${filter}_${page+1}`});if(pager.length)buttons.push(pager);
  buttons.push([{text:'🔄 Refresh',callback_data:`adm_paydash_${filter}_${page}`},{text:'⬅️ Payment Dashboard',callback_data:'adm_payments_home'}]);
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
function paymentDashboardTime(value){const ms=invoiceTimestamp(value);return Number.isFinite(ms)?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dhaka',dateStyle:'medium',timeStyle:'short'}).format(new Date(ms)):'Not recorded';}
async function showPaymentDashboardDetail(env,chatId,type,id,messageId=null){
  if(!adminUserAccess(env,chatId)||!['order','deposit'].includes(type))return;
  const invoice=await env.DB.prepare(`SELECT x.*,u.username AS customer_username FROM ${paymentDashboardSource()} x LEFT JOIN users u ON u.user_id=x.user_id WHERE x.kind=? AND x.id=?`).bind(type,id).first();
  if(!invoice){await sendMsg(env,chatId,'Payment not found.');return;}
  const [event,mobile]=await Promise.all([env.DB.prepare('SELECT * FROM payment_verification_events WHERE invoice_type=? AND invoice_id=?').bind(type,id).first(),env.DB.prepare('SELECT * FROM mobile_payment_invoices WHERE invoice_type=? AND invoice_id=?').bind(type,id).first()]);
  const isRedeem=String(invoice.method).toUpperCase()==='REDEEM';
  const receipt=isRedeem?'Redeem '+invoice.id:event?.trx_id||mobile?.trx_id||invoice.trx_id||'Not submitted';
  const review=await env.DB.prepare('SELECT * FROM admin_payment_reviews WHERE invoice_type=? AND invoice_id=?').bind(type,id).first();
  let result=invoice.status==='wallet_credited'?'Payment confirmed by admin. Amount added to wallet; original order closed without product delivery.':invoice.status==='completed'?'Completed.':['paid_pending_delivery','delivering'].includes(invoice.status)?'Payment recorded; product delivery is pending.':event?paymentDashboardReason(event.reason):mobile?.trx_id?'Transaction ID saved; no verification result was recorded.':'No verification attempt recorded. Older attempts may predate this dashboard.';
  if(mobile?.status==='paid'&&invoice.status==='pending')result='Payment matched by SMS; invoice processing needs review.';
  const smsEvidence=mobile?await describeMobileEvidence(env,mobile):'';
  const text=`💳 <b>${isRedeem?'🎁 Redeem Credit':type==='order'?'Order':'Deposit'} #${invoice.id}</b>\n\nCustomer: ${customerTelegramId(invoice.user_id,invoice.customer_username)}\nMethod: ${escapeHtml(invoice.method)}\nAmount: <b>$${adminMoney(invoice.amount_usd)}</b> · ${adminMoney(invoice.amount_bdt)} BDT\nStatus: <b>${escapeHtml(invoice.status)}</b>\nCreated: ${paymentDashboardTime(invoice.created_at)} (Dhaka)\n\n${isRedeem?'Redeem Reference':'Submitted ID'}: <code>${adminSnippet(receipt,100)}</code>\n\n<b>Last verification</b>\n${escapeHtml(result)}\nAttempts recorded: ${event?.attempts||0}\nLast attempt: ${paymentDashboardTime(event?.updated_at)} (Dhaka)${smsEvidence?`\n\n<b>SMS evidence</b>\n${escapeHtml(smsEvidence)}`:''}${mobile?`\nSMS invoice: ${adminSnippet(mobile.status,20)}\nPayment window: ${Date.now()>mobile.expires_ms?'Ended (not proof of payment failure)':'Open'}`:''}`;
  const buttons=[...(invoice.status==='pending'?[[{text:'🗑️ Delete Pending',callback_data:`adm_payreview_cancel_${type}_${id}`,style:'danger'},{text:'✅ Success',callback_data:`adm_paysuccess_${type}_${id}`,style:'success'}]]:[]),...(review?[[{text:`${review.action==='approve'?'Approved':'Cancelled'} by admin ${review.admin_id}`,callback_data:`adm_paydetail_${type}_${id}`}]]:[]),[adminUserProfileButton(invoice.user_id),{text:'💬 Message User',url:customerTelegramUrl(invoice.user_id,invoice.customer_username)}],...(type==='order'&&['paid_pending_delivery','delivering','completed'].includes(invoice.status)?[[{text:'Delivery Details',callback_data:`adm_delivery_view_${id}`}]]:[]),[{text:'🔄 Refresh',callback_data:`adm_paydetail_${type}_${id}`}],[{text:'Payment Dashboard',callback_data:'adm_payments_home'}]];
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function adminReviewInvoice(env,type,id){
  if(!['order','deposit'].includes(type))return null;
  return env.DB.prepare(`SELECT x.*,COALESCE(NULLIF(e.trx_id,''),NULLIF(m.trx_id,''),NULLIF(x.trx_id,''),'') AS submitted_trx FROM ${paymentDashboardSource()} x LEFT JOIN payment_verification_events e ON e.invoice_type=x.kind AND e.invoice_id=x.id LEFT JOIN mobile_payment_invoices m ON m.invoice_type=x.kind AND m.invoice_id=x.id WHERE x.kind=? AND x.id=?`).bind(type,id).first();
}
async function handlePendingPaymentSuccess(env,chatId,data,messageId){
  if(!adminUserAccess(env,chatId))return false;
  let match=data.match(/^adm_paysuccess_(order|deposit)_(\d+)$/);
  if(match){
    const type=match[1],invoice=await adminReviewInvoice(env,type,match[2]);
    if(!invoice||invoice.status!=='pending'){await sendMsg(env,chatId,'This payment is already processed, closed or unavailable.');return true;}
    if(!Number.isFinite(Number(invoice.amount_usd))||Number(invoice.amount_usd)<=0||!Number.isFinite(Number(invoice.amount_bdt))||Number(invoice.amount_bdt)<0||!/^[A-Za-z0-9]{6,100}$/.test(invoice.submitted_trx)){await sendMsg(env,chatId,'A positive payment amount and submitted transaction ID are required.');return true;}
    const token=crypto.randomUUID().replace(/-/g,''),draft=JSON.stringify({token,type,id:invoice.id,userId:invoice.user_id,method:invoice.method,trx:invoice.submitted_trx,usd:Number(invoice.amount_usd),bdt:Number(invoice.amount_bdt),expires:Date.now()+300000});
    await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'confirm_payment_success',?)").bind(chatId,draft).run();
    await editMsg(env,chatId,messageId,`✅ <b>Confirm Payment & Wallet Credit</b>\n\n${type==='order'?'Order':'Deposit'} ${invoice.id}\nCustomer: ${customerTelegramId(invoice.user_id)}\nMethod: ${escapeHtml(invoice.method)}\nTrxID: <code>${escapeHtml(invoice.submitted_trx)}</code>\nWallet credit: <b>+$${adminMoney(invoice.amount_usd)} USD</b>\nBDT credit: ${adminMoney(invoice.amount_bdt)} BDT\n\nConfirm only after checking that money was received. The saved payment amount will be added to the wallet. No product will be delivered; the original order, if any, will be closed. Do not confirm if you already credited this payment using Add Balance.\n\nConfirmation expires in 5 minutes.`,[[{text:`Confirm Success · $${adminMoney(invoice.amount_usd)}`,callback_data:`adm_paysuccess_ok_${token}`,style:'success'}],[{text:'Back',callback_data:`adm_paydetail_${type}_${invoice.id}`}]]);return true;
  }
  match=data.match(/^adm_paysuccess_ok_([a-f0-9]{32})$/);if(!match)return false;
  const state=await env.DB.prepare("SELECT data FROM admin_states WHERE user_id=? AND state='confirm_payment_success'").bind(chatId).first();let d;try{d=JSON.parse(state?.data||'null');}catch{}
  if(!d||!['order','deposit'].includes(d.type)||d.token!==match[1]||d.expires<Date.now()){await sendMsg(env,chatId,'This confirmation expired or was already used. Open the payment again.');return true;}
  const table=d.type==='order'?'orders':'deposits',methodColumn=d.type==='order'?'payment_method':'method';
  const method=String(d.method).toLowerCase(),key=String(d.trx).toLowerCase(),proof=`EXISTS(SELECT 1 FROM admin_payment_reviews WHERE invoice_type='${d.type}' AND invoice_id=? AND token=? AND action='approve')`;
  const result=await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO admin_payment_reviews(invoice_type,invoice_id,user_id,admin_id,action,method,trx_key,trx_id,amount_usd,amount_bdt,token)
      SELECT '${d.type}',id,user_id,?,'approve',?,?,?,?,?,? FROM ${table} WHERE id=? AND user_id=? AND status='pending' AND ${methodColumn}=? AND amount_usd=? AND COALESCE(amount_bdt,0)=?
      AND EXISTS(SELECT 1 FROM users WHERE user_id=${table}.user_id) AND EXISTS(SELECT 1 FROM admin_states WHERE user_id=? AND state='confirm_payment_success' AND data=?)
      AND COALESCE((SELECT NULLIF(trx_id,'') FROM payment_verification_events WHERE invoice_type='${d.type}' AND invoice_id=${table}.id),(SELECT NULLIF(trx_id,'') FROM mobile_payment_invoices WHERE invoice_type='${d.type}' AND invoice_id=${table}.id),NULLIF(trx_id,''),'')=?
      AND NOT EXISTS(SELECT 1 FROM mobile_payment_claims WHERE (invoice_type='${d.type}' AND invoice_id=${table}.id) OR (LOWER(method)=? AND LOWER(trx_id)=?))
      AND NOT EXISTS(SELECT 1 FROM binance_payment_claims WHERE (invoice_type='${d.type}' AND invoice_id=${table}.id) OR (?='binance' AND LOWER(transaction_id)=?))
      AND NOT EXISTS(SELECT 1 FROM bep20_payment_claims WHERE (invoice_type='${d.type}' AND invoice_id=${table}.id) OR (?='bep20' AND LOWER(tx_hash)=?))
      AND NOT EXISTS(SELECT 1 FROM manual_deposit_credits WHERE '${d.type}'='deposit' AND deposit_id=${table}.id)
      AND NOT EXISTS(SELECT 1 FROM orders WHERE LOWER(payment_method)=? AND LOWER(trx_id)=? AND status IN ('completed','paid_pending_delivery','delivering','wallet_credited'))
      AND NOT EXISTS(SELECT 1 FROM deposits other WHERE LOWER(other.method)=? AND LOWER(other.trx_id)=? AND other.status='completed')
      AND NOT EXISTS(SELECT 1 FROM mobile_payment_invoices WHERE invoice_type='${d.type}' AND invoice_id=${table}.id AND status='paid')`)
      .bind(chatId,method,key,d.trx,d.usd,d.bdt,d.token,d.id,d.userId,d.method,d.usd,d.bdt,chatId,state.data,d.trx,method,key,method,key,method,key,method,key,method,key),
    env.DB.prepare(walletChangeSql(`UPDATE users SET balance_usd=(ROUND(COALESCE(balance_usd,0)*100)+?)/100.0,balance_bdt=(ROUND(COALESCE(balance_bdt,0)*100)+?)/100.0 WHERE user_id=? AND EXISTS(SELECT 1 FROM ${table} WHERE id=? AND status='pending') AND ${proof}`,'deposit',d.type==='deposit'?'deposit:'+d.id:'order_wallet_credit:'+d.id)).bind(Math.round(d.usd*100),Math.round(d.bdt*100),d.userId,d.id,d.id,d.token),
    env.DB.prepare(`UPDATE ${table} SET status='${d.type==='order'?'wallet_credited':'completed'}',trx_id=? WHERE id=? AND status='pending' AND ${proof}`).bind(d.trx,d.id,d.id,d.token),
    env.DB.prepare(`UPDATE mobile_payment_invoices SET status='manual_paid' WHERE invoice_type='${d.type}' AND invoice_id=? AND status='pending' AND ${proof}`).bind(d.id,d.id,d.token),
    env.DB.prepare("DELETE FROM admin_states WHERE user_id=? AND state='confirm_payment_success' AND data=?").bind(chatId,state.data)
  ]);
  if(!result[0].meta?.changes){await sendMsg(env,chatId,'Nothing was credited. The payment or transaction is already processed/reserved, or its details changed.',[[{text:'Payment Details',callback_data:`adm_paydetail_${d.type}_${d.id}`}]]);return true;}
  await recordPaymentVerification(env,d.type,d.id,d.userId,d.method,d.trx,'admin_approved');
  await sendMsg(env,d.userId,`✅ <b>Payment Successful · Wallet Credited</b>\n\nAdmin confirmed your payment.\nAdded to wallet: <b>$${adminMoney(d.usd)} USD</b>\nTrxID: <code>${escapeHtml(d.trx)}</code>`);
  await showPaymentDashboardDetail(env,chatId,d.type,d.id,messageId);return true;
}
async function handleAdminPaymentReview(env,chatId,data,messageId){
  if(!adminUserAccess(env,chatId))return false;
  const oldDelete=data.match(/^(admin_reject|adm_rejdep)_(\d+)$/);
  if(oldDelete)return handleAdminPaymentReview(env,chatId,`adm_payreview_cancel_${oldDelete[1]==='admin_reject'?'order':'deposit'}_${oldDelete[2]}`,messageId);
  if(/^(?:adm_payreview_approve_|admin_approve_|adm_apprdep_)/.test(data)){
    await clearAdminState(env,chatId);
    await sendMsg(env,chatId,'Manual payment approval is disabled. Review the payment, delete its pending request, then use the customer profile → Add Balance after checking the received amount.',[[{text:'Payment Dashboard',callback_data:'adm_paydash_submitted_0'},{text:'Find Customer',callback_data:'adm_user_search'}]]);return true;
  }
  let match=data.match(/^adm_payreview_cancel_(order|deposit)_(\d+)$/);
  if(match){
    const [,type,id]=match,invoice=await adminReviewInvoice(env,type,id);
    if(invoice?.status==='cancelled'||invoice?.status==='rejected'){await showPaymentDashboard(env,chatId,'pending',0,messageId,{userId:invoice.user_id});return true;}
    if(!invoice||invoice.status!=='pending'){await sendMsg(env,chatId,'This payment is already processed, closed or unavailable.');return true;}
    const token=crypto.randomUUID().replace(/-/g,''),draft=JSON.stringify({token,action:'cancel',type,id:Number(id),userId:invoice.user_id,trx:invoice.submitted_trx,method:invoice.method,usd:Number(invoice.amount_usd||0),bdt:Number(invoice.amount_bdt||0),expires:Date.now()+300000});
    await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'confirm_payment_review',?)").bind(chatId,draft).run();
    await editMsg(env,chatId,messageId,`🗑️ <b>Delete Pending Payment?</b>\n\n${type==='order'?'Order':'Deposit'} ${id}\nCustomer: ${customerTelegramId(invoice.user_id,invoice.customer_username)}\nMethod: ${escapeHtml(invoice.method)}\nAmount: <b>$${adminMoney(invoice.amount_usd)} USD</b> · ${adminMoney(invoice.amount_bdt)} BDT\nTrxID: <code>${adminSnippet(invoice.submitted_trx||'Not submitted',100)}</code>\n\nThe request will leave the pending list and automatic processing for this invoice will stop. No wallet credit, refund or product delivery will be made. The cancellation record is kept.\n\nAfter verifying receipt of money, use View Customer → Add Balance to credit the amount yourself. Confirmation expires in 5 minutes.`,[[{text:'Confirm Delete Pending',callback_data:`adm_payreview_ok_${token}`,style:'danger'}],[{text:'Back',callback_data:`adm_paydetail_${type}_${id}`}]]);return true;
  }
  match=data.match(/^adm_payreview_ok_([a-f0-9]{32})$/);if(!match)return false;
  const state=await env.DB.prepare("SELECT data FROM admin_states WHERE user_id=? AND state='confirm_payment_review'").bind(chatId).first();let d;try{d=JSON.parse(state?.data||'null');}catch{}
  if(!d||d.action!=='cancel'||!['order','deposit'].includes(d.type)||d.token!==match[1]||d.expires<Date.now()){
    const deleted=await env.DB.prepare("SELECT user_id FROM admin_payment_reviews WHERE token=? AND action='cancel'").bind(match[1]).first();
    if(deleted){await showPaymentDashboard(env,chatId,'pending',0,messageId,{userId:deleted.user_id});return true;}
    await editMsg(env,chatId,messageId,'This confirmation has expired or is no longer active. Open the payment again to delete it.',[[{text:'Pending Payments',callback_data:'adm_paydash_pending_0'}]]);return true;
  }
  const table=d.type==='order'?'orders':'deposits',methodColumn=d.type==='order'?'payment_method':'method';
  const proof="EXISTS(SELECT 1 FROM admin_payment_reviews WHERE token=? AND invoice_type=? AND invoice_id=? AND action='cancel')";
  const writes=[env.DB.prepare(`INSERT OR IGNORE INTO admin_payment_reviews(invoice_type,invoice_id,user_id,admin_id,action,method,trx_key,trx_id,amount_usd,amount_bdt,token) SELECT ?,id,user_id,?,'cancel',?,?,?,?,?,? FROM ${table} WHERE id=? AND user_id=? AND status='pending' AND ${methodColumn}=? AND COALESCE(amount_usd,0)=? AND COALESCE(amount_bdt,0)=? AND EXISTS(SELECT 1 FROM admin_states WHERE user_id=? AND state='confirm_payment_review' AND data=?) AND NOT EXISTS(SELECT 1 FROM mobile_payment_claims WHERE invoice_type=? AND invoice_id=?) AND NOT EXISTS(SELECT 1 FROM binance_payment_claims WHERE invoice_type=? AND invoice_id=?) AND NOT EXISTS(SELECT 1 FROM bep20_payment_claims WHERE invoice_type=? AND invoice_id=?) AND NOT EXISTS(SELECT 1 FROM manual_deposit_credits WHERE ?='deposit' AND deposit_id=?) AND COALESCE((SELECT NULLIF(trx_id,'') FROM payment_verification_events WHERE invoice_type=? AND invoice_id=?),(SELECT NULLIF(trx_id,'') FROM mobile_payment_invoices WHERE invoice_type=? AND invoice_id=?),NULLIF(trx_id,''),'')=? AND NOT EXISTS(SELECT 1 FROM mobile_payment_invoices WHERE invoice_type=? AND invoice_id=? AND status='paid')`)
    .bind(d.type,chatId,String(d.method).toLowerCase(),String(d.trx).toLowerCase(),d.trx,d.usd,d.bdt,d.token,d.id,d.userId,d.method,d.usd,d.bdt,chatId,state.data,d.type,d.id,d.type,d.id,d.type,d.id,d.type,d.id,d.type,d.id,d.type,d.id,d.trx,d.type,d.id),
    env.DB.prepare(`UPDATE ${table} SET status='cancelled' WHERE id=? AND status='pending' AND ${proof}`).bind(d.id,d.token,d.type,d.id),
    env.DB.prepare(`UPDATE mobile_payment_invoices SET status='cancelled' WHERE invoice_type=? AND invoice_id=? AND status='pending' AND ${proof}`).bind(d.type,d.id,d.token,d.type,d.id),
    env.DB.prepare("DELETE FROM admin_states WHERE user_id=? AND state='confirm_payment_review' AND data=?").bind(chatId,state.data)
  ];
  const result=await env.DB.batch(writes);
  if(!result[0].meta?.changes){await sendMsg(env,chatId,'Nothing was deleted. The payment was processed, reserved, or its details changed. Refresh and review again.',[[{text:'Payment Details',callback_data:`adm_paydetail_${d.type}_${d.id}`}]]);return true;}
  await recordPaymentVerification(env,d.type,d.id,d.userId,d.method,d.trx,'admin_cancelled');
  await showPaymentDashboard(env,chatId,'pending',0,messageId,{userId:d.userId});return true;
}
async function handlePaymentDashboardCallback(env,chatId,data,messageId){
  if(!adminUserAccess(env,chatId))return false;
  if(await handlePendingPaymentSuccess(env,chatId,data,messageId))return true;
  if(await handleAdminPaymentReview(env,chatId,data,messageId))return true;
  if(data==='adm_payments_home'){await showPaymentDashboard(env,chatId,'menu',0,messageId);return true;}
  if(data==='adm_payment_health'){await showPaymentHealth(env,chatId,messageId);return true;}
  let match=data.match(/^adm_paydash_(pending|submitted|issues|delivery|completed|cancelled)_(\d+)$/);
  if(match){await showPaymentDashboard(env,chatId,match[1],match[2],messageId);return true;}
  match=data.match(/^adm_paydetail_(order|deposit)_(\d+)$/);if(match){await clearAdminState(env,chatId);await showPaymentDashboardDetail(env,chatId,match[1],match[2],messageId);return true;}return false;
}


async function showDeliveryAdminList(env,chatId,filter='pending',page=0,messageId=null){
  if(!adminUserAccess(env,chatId))return;
  await clearAdminState(env,chatId);page=adminUserPage(page);
  const status=filter==='processing'?'delivering':filter==='completed'?'completed':'paid_pending_delivery';
  const {results}=await env.DB.prepare('SELECT o.id,o.user_id,o.amount_usd,o.product_name,p.name FROM orders o LEFT JOIN products p ON p.id=o.product_id WHERE o.status=? AND COALESCE(o.admin_deleted,0)=0 ORDER BY o.id DESC LIMIT 11 OFFSET ?').bind(status,page*10).all();
  const title=filter==='processing'?'Processing':filter==='completed'?'Completed':'Paid / Delivery Pending';
  const text=`📦 <b>Delivery Management</b>\n\n<b>${title}</b> · Page ${page+1}\n\n${results.length?'Choose an order to see its latest delivery status.':'No orders in this list.'}\n\nCheck Delivery resumes the existing paid order. It does not charge the customer again. Processing orders are shown for review and cannot be restarted here.`;
  const buttons=results.slice(0,10).map(o=>[{text:`${orderDisplayId(o)} · ${String(o.product_name||o.name||'Product').slice(0,28)} · $${adminMoney(o.amount_usd)} · ${o.user_id}`,callback_data:`adm_delivery_view_${o.id}`}]);
  const pager=[];if(page>0)pager.push({text:'Previous',callback_data:`adm_delivery_list_${filter}_${page-1}`});if(results.length>10)pager.push({text:'Next',callback_data:`adm_delivery_list_${filter}_${page+1}`});if(pager.length)buttons.push(pager);
  buttons.push([{text:'Pending Delivery',callback_data:'adm_delivery_list_pending_0'},{text:'Processing',callback_data:'adm_delivery_list_processing_0'}],[{text:'Completed',callback_data:'adm_delivery_list_completed_0'},{text:'🔄 Refresh',callback_data:`adm_delivery_list_${filter}_${page}`}],[{text:'Admin Panel',callback_data:'admin_panel'}]);
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function handleAdminOrderDelete(env,chatId,data,messageId){
  if(!adminUserAccess(env,chatId))return false;
  let match=data.match(/^adm_order_delete_(\d+)$/);
  if(match){
    const order=await env.DB.prepare('SELECT * FROM orders WHERE id=? AND COALESCE(admin_deleted,0)=0').bind(match[1]).first();
    if(!order){await showAdminOrdersMenu(env,chatId,messageId);return true;}
    const token=crypto.randomUUID().replace(/-/g,''),draft=JSON.stringify({token,id:order.id,expires:Date.now()+300000});
    await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'confirm_order_delete',?)").bind(chatId,draft).run();
    await editMsg(env,chatId,messageId,`🗑️ <b>Delete Order ${orderDisplayId(order)}?</b>\n\nCustomer: ${customerTelegramId(order.user_id)}\nStatus: ${adminSnippet(order.status,35)}\nAmount: $${adminMoney(order.amount_usd)} USD\n\nThe order will be removed from admin order lists and search. Unpaid, unclaimed orders will be cancelled. Recorded payments, wallet balances, sales history and delivered files will be preserved. Paid or already-processing orders keep their existing payment/delivery handling. No refund or wallet credit is issued.\n\nConfirmation expires in 5 minutes.`,[[{text:'Confirm Delete Order',callback_data:`adm_order_delete_ok_${token}`,style:'danger'}],[{text:'Cancel',callback_data:`adm_orders_view_${order.id}_0`}]]);return true;
  }
  match=data.match(/^adm_order_delete_ok_([a-f0-9]{32})$/);if(!match)return false;
  const state=await env.DB.prepare("SELECT data FROM admin_states WHERE user_id=? AND state='confirm_order_delete'").bind(chatId).first();let d;try{d=JSON.parse(state?.data||'null');}catch{}
  if(!d||d.token!==match[1]||d.expires<Date.now()){await sendMsg(env,chatId,'This confirmation expired or was already used.',[[{text:'Orders',callback_data:'adm_order_find'}]]);return true;}
  const results=await env.DB.batch([
    env.DB.prepare("UPDATE orders SET admin_deleted=1,admin_deleted_by=?,admin_deleted_at=CURRENT_TIMESTAMP,admin_delete_token=? WHERE id=? AND COALESCE(admin_deleted,0)=0 AND EXISTS(SELECT 1 FROM admin_states WHERE user_id=? AND state='confirm_order_delete' AND data=?)").bind(String(chatId),d.token,d.id,chatId,state.data),
    env.DB.prepare("UPDATE orders SET status='cancelled' WHERE id=? AND admin_delete_token=? AND status='pending' AND NOT EXISTS(SELECT 1 FROM mobile_payment_claims WHERE invoice_type='order' AND invoice_id=orders.id) AND NOT EXISTS(SELECT 1 FROM binance_payment_claims WHERE invoice_type='order' AND invoice_id=orders.id) AND NOT EXISTS(SELECT 1 FROM bep20_payment_claims WHERE invoice_type='order' AND invoice_id=orders.id)").bind(d.id,d.token),
    env.DB.prepare("UPDATE mobile_payment_invoices SET status='cancelled' WHERE invoice_type='order' AND invoice_id=? AND status='pending' AND EXISTS(SELECT 1 FROM orders WHERE id=? AND admin_delete_token=? AND status='cancelled')").bind(d.id,d.id,d.token),
    env.DB.prepare("DELETE FROM admin_states WHERE user_id=? AND state='confirm_order_delete' AND data=?").bind(chatId,state.data)
  ]);
  await editMsg(env,chatId,messageId,results[0].meta?.changes?'✅ Order deleted from admin lists. Payment and balance records are preserved.':'This order was already deleted or the confirmation was replaced.',[[{text:'Orders',callback_data:'adm_order_find'}]]);return true;
}
function adminOrdersListData(filter,page){return filter==='all'?`adm_orders_page_${page}`:`adm_orders_list_${filter}_${page}`;}
function adminOrdersItemData(id,filter,page){return filter==='all'?`adm_orders_view_${id}_${page}`:`adm_orders_item_${id}_${filter}_${page}`;}
async function showAdminOrdersMenu(env,chatId,messageId=null){
  if(!adminUserAccess(env,chatId))return;
  await clearAdminState(env,chatId);
  const totals=await env.DB.prepare("SELECT SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed,SUM(CASE WHEN status IN ('pending','paid_pending_delivery','delivering') THEN 1 ELSE 0 END) pending FROM orders WHERE COALESCE(admin_deleted,0)=0").first();
  const text='📦 <b>Orders</b>\n\nView completed orders, review pending deliveries, or find a specific order by its ID.';
  const buttons=[[{text:`✅ Completed Orders (${totals?.completed||0})`,callback_data:'adm_orders_list_completed_0',style:'success'}],[{text:`⏳ Pending Orders (${totals?.pending||0})`,callback_data:'adm_orders_list_pending_0'}],[{text:'🔎 Find Order',callback_data:'adm_order_search_0'},{text:'Admin Panel',callback_data:'admin_panel'}]];
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
function pendingOrderLabel(order){
  if(order.status==='pending')return ({missing:'SMS missing',mismatch:'Payment mismatch',not_found:'Payment not found',payment_expired:'Payment expired',used:'TrxID already used',invalid_format:'Invalid TrxID'})[order.verification_reason]||'Payment pending';
  if(order.status==='delivering')return 'Delivery processing';
  if(order.status!=='paid_pending_delivery')return '';
  if(order.is_external==null)return 'Product unavailable';
  if(Number(order.provider_retry_at||0)>Date.now())return 'Retry cooldown';
  if(order.is_external===1)return order.provider_error?'Supplier issue':'Supplier delivery pending';
  if(Number(order.available_items||0)<Number(order.quantity||1))return 'Stock unavailable';
  return order.provider_error?'Delivery issue':'Awaiting delivery';
}
function pendingOrderExplanation(order){
  if(order.status==='pending'){
    if(order.verification_reason&&order.verification_reason!=='verified')return 'Payment is not confirmed. '+paymentDashboardReason(order.verification_reason);
    if(order.verification_reason==='verified')return 'A payment verification result was recorded, but order processing is not complete. Review Payment Details before retrying.';
    return 'Payment has not been confirmed. '+(order.trx_id||order.verification_trx?'A transaction ID is saved; check its payment verification details.':'No transaction ID is saved in this order; the customer may not have paid or submitted payment details yet.');
  }
  if(order.status==='delivering')return 'Delivery is processing or was interrupted. Do not create another purchase; check saved delivery and supplier status.';
  if(order.status!=='paid_pending_delivery')return '';
  if(order.is_external==null)return 'Payment is recorded, but the product record is missing. Admin review is required.';
  if(order.is_external===1)return 'Payment is recorded, but the supplier has not confirmed complete delivery. '+(order.provider_error?'The saved supplier issue is shown below.':'No specific supplier error was recorded; check the existing supplier request.');
  if(Number(order.available_items||0)<Number(order.quantity||1))return `Payment is recorded, but local stock is insufficient: ${Number(order.available_items||0)} item(s) available or reserved for this order; ${Number(order.quantity||1)} required.`;
  return 'Payment is recorded and local stock is now sufficient. Delivery has not completed; check the saved issue below and use Check Delivery.';
}
async function showAllAdminOrders(env,chatId,page=0,messageId=null,filter='all'){
  if(!adminUserAccess(env,chatId))return;
  await clearAdminState(env,chatId);
  const where="COALESCE(admin_deleted,0)=0 AND "+(filter==='completed'?"status='completed'":filter==='pending'?"status IN ('pending','paid_pending_delivery','delivering')":'1=1');
  const count=await env.DB.prepare(`SELECT COUNT(*) AS total FROM orders WHERE ${where}`).first(),total=Number(count?.total||0),pages=Math.max(1,Math.ceil(total/10));
  page=Math.min(pages-1,adminUserPage(page));
  const {results}=await env.DB.prepare(`SELECT o.*,u.first_name AS customer_name,p.is_external,v.trx_id AS verification_trx,v.reason AS verification_reason,(SELECT COUNT(*) FROM inventory i WHERE i.product_id=o.product_id AND (i.is_sold=0 OR i.order_id=o.id)) AS available_items FROM orders o LEFT JOIN users u ON u.user_id=o.user_id LEFT JOIN products p ON p.id=o.product_id LEFT JOIN payment_verification_events v ON v.invoice_type='order' AND v.invoice_id=o.id WHERE ${where.replace(/status/g,'o.status').replace(/admin_deleted/g,'o.admin_deleted')} ORDER BY o.id DESC LIMIT 10 OFFSET ?`).bind(page*10).all();
  let text=`📦 <b>${filter==='completed'?'Completed Orders':filter==='pending'?'Pending Orders':'All Orders'}</b>\nTotal: <b>${total}</b> · Page ${page+1}/${pages}\n\n${results.length?'Newest orders first. Open an order for details or use Find Order.':'No orders yet.'}`;

  const buttons=results.map(o=>[{text:`📦 Order ID ${orderDisplayId(o)} · ${pendingOrderLabel(o)||o.status}`,callback_data:adminOrdersItemData(o.id,filter,page)}]);
  const pager=[];if(page>0)pager.push({text:'Previous',callback_data:adminOrdersListData(filter,page-1)});if(page+1<pages)pager.push({text:'Next',callback_data:adminOrdersListData(filter,page+1)});if(pager.length)buttons.push(pager);
  buttons.push([{text:'🔎 Find Order',callback_data:filter==='all'?`adm_order_search_${page}`:`adm_order_search_${filter}_${page}`}],[{text:'🔄 Refresh',callback_data:adminOrdersListData(filter,page)},{text:'⬅️ Orders',callback_data:'adm_order_find'}]);
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function showDeliveryAdminOrder(env,chatId,id,messageId=null,listPage=null,listFilter='all'){
  if(!adminUserAccess(env,chatId))return;
  const order=await env.DB.prepare(`SELECT o.*,p.name,p.is_external,p.external_id,u.first_name AS customer_name,u.username AS customer_username,v.trx_id AS verification_trx,v.reason AS verification_reason,(SELECT COUNT(*) FROM inventory i WHERE i.product_id=o.product_id AND (i.is_sold=0 OR i.order_id=o.id)) AS available_items FROM orders o LEFT JOIN products p ON p.id=o.product_id LEFT JOIN users u ON u.user_id=o.user_id LEFT JOIN payment_verification_events v ON v.invoice_type='order' AND v.invoice_id=o.id WHERE o.id=? AND COALESCE(o.admin_deleted,0)=0`).bind(id).first();
  if(!order){await sendMsg(env,chatId,'Order not found or deleted.');return;}
  const source=order.sale_origin==='api'?'Supplier API':order.sale_origin==='local'?'Local store inventory':order.is_external===1?'Supplier API (current product)':order.is_external===0?'Local store inventory (current product)':'Not recorded';
  const error=order.provider_error?await safeDiagnostic(env,order.provider_error):'No provider error recorded.';
  const canRetry=order.status==='paid_pending_delivery'&&order.is_external!=null&&(!order.is_external||order.provider_request_id);
  let help=order.status==='wallet_credited'?'Payment amount was credited to the wallet by admin. This original order is closed and will not be delivered.':order.status==='completed'?'Delivered. No further purchase or stock allocation will be performed.':order.status==='delivering'?'Processing or interrupted during delivery. Check supplier history and refresh; automatic restart is blocked to avoid duplicate fulfillment.':order.status==='paid_pending_delivery'?(order.is_external&&!order.provider_request_id?'This older API order has no supplier request ID. Reconcile supplier history before taking further action.':order.is_external?'Check Delivery looks up the existing supplier request and resumes it safely. A provider rejection can refund a wallet order through the existing refund rules.':'Restock this local product, then Check Delivery. Previously allocated items are reused; only missing items are allocated.'):'This order is unpaid or closed; delivery cannot be started here.';
  if(order.is_external==null&&order.status==='paid_pending_delivery')help='Product record is missing. Admin reconciliation is required.';
  const text=`📦 <b>${listPage===null?'Delivery':'Order Details'} · Order ID ${orderDisplayId(order)}</b>\n\nCustomer: ${adminSnippet(order.customer_name||order.username||'Customer',80)}\nTelegram ID: ${customerTelegramId(order.user_id,order.customer_username)}\nSource: <b>${source}</b>\nProduct: ${adminSnippet(order.product_name||order.name||'Product unavailable',150)}\nQuantity: ${order.quantity||1}\nUnit price: $${adminMoney(Number(order.amount_usd||0)/Number(order.quantity||1))} USD\nOrder total: <b>$${adminMoney(order.amount_usd)} USD</b> · ${adminMoney(order.amount_bdt)} BDT\nMethod: ${adminSnippet(order.payment_method,30)}\nTransaction ID: <code>${adminSnippet(order.trx_id||'Not submitted',100)}</code>\nStatus: <b>${adminSnippet(order.status,35)}</b>\nCreated: ${paymentDashboardTime(order.created_at)} (Dhaka)${pendingOrderExplanation(order)?'\n\n<b>Why this order is pending</b>\n'+escapeHtml(pendingOrderExplanation(order)):''}\n\nProvider order: <code>${adminSnippet(order.provider_order_id||'Not recorded',80)}</code>\nSupplier request: <code>${adminSnippet(order.provider_request_id||'Not recorded',80)}</code>\n\n<b>Last delivery issue</b>\n${escapeHtml(error)}\n\n${help}\n\n${Date.now()<Number(order.provider_retry_at||0)?'Please wait for the existing retry cooldown.':''}`;
  const buttons=[];if(canRetry)buttons.push([{text:'🔎 Check Delivery',callback_data:`adm_delivery_retry_${order.id}`}]);
  if(order.status==='completed')buttons.push([{text:'Send Saved Delivery to Customer',callback_data:`adm_delivery_resend_${order.id}`}]);
  buttons.push([{text:'🗑️ Delete Order',callback_data:`adm_order_delete_${order.id}`,style:'danger'}]);
  buttons.push([adminUserProfileButton(order.user_id),{text:'💬 Message User',url:customerTelegramUrl(order.user_id,order.customer_username)}],[{text:'🔄 Refresh',callback_data:listPage===null?`adm_delivery_view_${order.id}`:adminOrdersItemData(order.id,listFilter,listPage)}],[listPage===null?{text:'Delivery List',callback_data:'adm_delivery_list_pending_0'}:{text:listFilter==='all'?'All Orders':listFilter==='pending'?'Pending Orders':'Completed Orders',callback_data:adminOrdersListData(listFilter,listPage)},{text:'Admin Panel',callback_data:'admin_panel'}]);
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function retryDeliveryAdmin(env,chatId,id,messageId){
  if(!adminUserAccess(env,chatId))return;
  const order=await env.DB.prepare('SELECT o.*,p.name AS product_name,p.is_external,p.external_id FROM orders o JOIN products p ON p.id=o.product_id WHERE o.id=?').bind(id).first();
  if(!order||order.status!=='paid_pending_delivery'||(order.is_external&&!order.provider_request_id)){await showDeliveryAdminOrder(env,chatId,id,messageId);return;}
  const claimed=await env.DB.prepare("UPDATE orders SET provider_retry_at=? WHERE id=? AND status='paid_pending_delivery' AND COALESCE(provider_retry_at,0)<?").bind(Date.now()+30000,id,Date.now()).run();
  if(!claimed.meta?.changes){await sendMsg(env,chatId,'Delivery is being checked or is in cooldown. Please wait before retrying.');return;}
  await sendMsg(env,chatId,`Checking delivery for Order ID ${orderDisplayId(order)}…`);
  await completeSuccessfulOrder(env,order,order.trx_id,order.user_id);
  await showDeliveryAdminOrder(env,chatId,id,messageId);
}
async function resendSavedDelivery(env,chatId,id,messageId){
  if(!adminUserAccess(env,chatId))return;
  const order=await env.DB.prepare("SELECT * FROM orders WHERE id=? AND status='completed'").bind(id).first();
  if(!order){await sendMsg(env,chatId,'Only completed orders can resend saved delivery.');return;}
  const claim=await env.DB.prepare("UPDATE orders SET provider_retry_at=? WHERE id=? AND status='completed' AND COALESCE(provider_retry_at,0)<?").bind(Date.now()+30000,id,Date.now()).run();
  if(!claim.meta?.changes){await sendMsg(env,chatId,'Please wait 30 seconds before resending.');return;}
  const sent=await sendSavedOrderDocument(env,order.user_id,order);
  await sendMsg(env,chatId,sent?.ok?`Saved delivery for Order ID ${orderDisplayId(order)} sent as a text document. No new purchase or wallet charge was made.`:'Telegram did not confirm the document. Saved order data is unchanged; retry after cooldown.');
}
async function handleDeliveryAdminCallback(env,chatId,data,messageId){
  if(!adminUserAccess(env,chatId))return false;
  let match=data.match(/^adm_delivery_list_(pending|processing|completed)_(\d+)$/);if(match){await showDeliveryAdminList(env,chatId,match[1],match[2],messageId);return true;}
  match=data.match(/^adm_delivery_(view|retry|resend)_(\d+)$/);if(!match)return false;
  if(match[1]==='retry')await retryDeliveryAdmin(env,chatId,match[2],messageId);else if(match[1]==='resend')await resendSavedDelivery(env,chatId,match[2],messageId);else await showDeliveryAdminOrder(env,chatId,match[2],messageId);return true;
}


async function showTickets(env,chatId,mode='mine',page=0,messageId=null){
  await clearTicketInput(env,chatId);
  const admin=adminUserAccess(env,chatId);if(mode!=='mine'&&!admin)return;
  page=adminUserPage(page);
  const where=mode==='mine'?'t.user_id=?':mode==='closed'?"t.status='closed'":"t.status<>'closed'",args=mode==='mine'?[chatId]:[];
  const {results}=await env.DB.prepare(`SELECT t.*,o.product_name,o.public_order_id,p.name FROM support_tickets t LEFT JOIN orders o ON o.id=t.order_id LEFT JOIN products p ON p.id=o.product_id WHERE ${where} ORDER BY t.updated_at DESC,t.id DESC LIMIT 11 OFFSET ?`).bind(...args,page*10).all();
  const prefix=mode==='mine'?'tickets_mine_':`adm_tickets_${mode}_`;
  const text=`🎫 <b>${mode==='mine'?'My Support Tickets':mode==='closed'?'Closed Support Tickets':'Active Support Tickets'}</b> · Page ${page+1}\n\n${results.length?'Choose a ticket to read the conversation or reply.':'No tickets found. Open Your Orders and choose Get Help to create a ticket.'}`;
  const buttons=results.slice(0,10).map(t=>[{text:`#${t.id} · Order ID ${t.public_order_id||String(t.order_id).padStart(5,'0')} · ${t.status} · ${String(t.product_name||t.name||'Product').slice(0,25)}`,callback_data:`ticket_view_${t.id}_0`}]);
  const pager=[];if(page>0)pager.push({text:'Previous',callback_data:prefix+(page-1)});if(results.length>10)pager.push({text:'Next',callback_data:prefix+(page+1)});if(pager.length)buttons.push(pager);
  if(admin&&mode!=='mine')buttons.push([{text:'Active',callback_data:'adm_tickets_open_0'},{text:'Closed',callback_data:'adm_tickets_closed_0'},{text:'Admin Panel',callback_data:'admin_panel'}]);
  else buttons.push([{text:'Your Orders',callback_data:'my_orders'},{text:'Main Menu',callback_data:'home'}]);
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function showTicket(env,chatId,id,page=0,messageId=null){
  const ticket=await env.DB.prepare('SELECT t.*,o.status AS order_status,o.amount_usd,o.product_name,o.public_order_id,p.name FROM support_tickets t LEFT JOIN orders o ON o.id=t.order_id LEFT JOIN products p ON p.id=o.product_id WHERE t.id=?').bind(id).first();
  if(!ticket||(!adminUserAccess(env,chatId)&&String(ticket.user_id)!==String(chatId))){await sendMsg(env,chatId,'Ticket unavailable.');return;}
  page=adminUserPage(page);
  const {results}=await env.DB.prepare('SELECT * FROM support_ticket_messages WHERE ticket_id=? ORDER BY id DESC LIMIT 2 OFFSET ?').bind(id,page).all();
  const msg=results[0];
  const text=`🎫 <b>Ticket #${ticket.id} · ${escapeHtml(ticket.status)}</b>\nOrder ID ${ticket.public_order_id||await getPublicOrderId(env,ticket.order_id)} · ${escapeHtml(ticket.order_status||'Unavailable')} · $${adminMoney(ticket.amount_usd)}\nProduct: ${adminSnippet(ticket.product_name||ticket.name||'Product unavailable',100)}\nCustomer: <code>${ticket.user_id}</code>\n\n${msg?`<b>${msg.is_admin?'Admin':'Customer'}</b> · ${paymentDashboardTime(msg.created_at)} (Dhaka)\n\n${escapeHtml(msg.body)}`:'No messages.'}`;
  const buttons=[],pager=[];if(page>0)pager.push({text:'Newer Message',callback_data:`ticket_view_${id}_${page-1}`});if(results.length>1)pager.push({text:'Older Message',callback_data:`ticket_view_${id}_${page+1}`});if(pager.length)buttons.push(pager);
  if(ticket.status!=='closed')buttons.push([{text:'✏️ Reply',callback_data:`ticket_reply_${id}`}],...(adminUserAccess(env,chatId)?[[{text:'✅ Close Ticket',callback_data:`adm_ticket_close_${id}`}]]:[]));
  if(adminUserAccess(env,chatId))buttons.push([adminUserProfileButton(ticket.user_id),{text:'Order Details',callback_data:`adm_delivery_view_${ticket.order_id}`}]);
  buttons.push([{text:'🔄 Refresh',callback_data:`ticket_view_${id}_0`},{text:'Tickets',callback_data:adminUserAccess(env,chatId)?'adm_tickets_open_0':'tickets_mine_0'}]);
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function clearTicketInput(env,chatId){
  await env.DB.prepare("DELETE FROM user_states WHERE user_id=? AND state='awaiting_ticket_body'").bind(chatId).run();
  if(adminUserAccess(env,chatId))await env.DB.prepare("DELETE FROM admin_states WHERE user_id=? AND state='awaiting_ticket_reply'").bind(chatId).run();
}
async function handleTicketCallback(env,chatId,data,messageId){
  if(['home','my_orders','support','shop','deposit'].includes(data))await clearTicketInput(env,chatId);
  let match=data.match(/^(?:tickets_mine|adm_tickets_(open|closed))_(\d+)$/);
  if(match){if(data.startsWith('adm_')&&!adminUserAccess(env,chatId))return true;await showTickets(env,chatId,match[1]||'mine',match[2],messageId);return true;}
  match=data.match(/^ticket_view_(\d+)_(\d+)$/);if(match){await env.DB.prepare("DELETE FROM user_states WHERE user_id=? AND state='awaiting_ticket_body'").bind(chatId).run();if(adminUserAccess(env,chatId))await env.DB.prepare("DELETE FROM admin_states WHERE user_id=? AND state='awaiting_ticket_reply'").bind(chatId).run();await showTicket(env,chatId,match[1],match[2],messageId);return true;}
  match=data.match(/^ticket_new_(\d+)$/);
  if(match){
    const order=await env.DB.prepare("SELECT * FROM orders WHERE id=? AND user_id=? AND status IN ('completed','paid_pending_delivery','delivering','refunded')").bind(match[1],chatId).first();
    if(!order){await sendMsg(env,chatId,'Choose one of your paid orders to open a ticket.');return true;}
    const existing=await env.DB.prepare("SELECT id FROM support_tickets WHERE order_id=? AND user_id=? AND status<>'closed'").bind(order.id,chatId).first();if(existing){await showTicket(env,chatId,existing.id,0,messageId);return true;}
    await env.DB.prepare("INSERT OR REPLACE INTO user_states(user_id,state,data) VALUES(?,'awaiting_ticket_body',?)").bind(chatId,JSON.stringify({orderId:order.id,token:crypto.randomUUID()})).run();
    await editMsg(env,chatId,messageId,`🎫 <b>Get Help · Order ID ${orderDisplayId(order)}</b>\n\nDescribe your issue in one text message (up to 500 characters). Do not send payment PINs, OTPs or account passwords.`,[[{text:'Cancel',callback_data:'my_orders'}]]);return true;
  }
  match=data.match(/^ticket_reply_(\d+)$/);
  if(match){
    const ticket=await env.DB.prepare("SELECT * FROM support_tickets WHERE id=? AND status<>'closed'").bind(match[1]).first();
    const admin=adminUserAccess(env,chatId);if(!ticket||(!admin&&String(ticket.user_id)!==String(chatId))){await sendMsg(env,chatId,'Ticket unavailable or closed.');return true;}
    const table=admin?'admin_states':'user_states',state=admin?'awaiting_ticket_reply':'awaiting_ticket_body';
    await env.DB.prepare(`INSERT OR REPLACE INTO ${table}(user_id,state,data) VALUES(?,?,?)`).bind(chatId,state,JSON.stringify({ticketId:ticket.id,token:crypto.randomUUID()})).run();
    await editMsg(env,chatId,messageId,'Send your reply as text (up to 500 characters). Do not send PINs, OTPs or passwords.',[[{text:'Cancel',callback_data:`ticket_view_${ticket.id}_0`}]]);return true;
  }
  match=data.match(/^adm_ticket_close_(\d+)$/);
  if(match){
    if(!adminUserAccess(env,chatId))return true;
    const ticket=await env.DB.prepare("SELECT * FROM support_tickets WHERE id=? AND status<>'closed'").bind(match[1]).first();
    if(ticket){const changed=await env.DB.prepare("UPDATE support_tickets SET status='closed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'closed'").bind(ticket.id).run();if(changed.meta?.changes)await sendMsg(env,ticket.user_id,`✅ Support Ticket #${ticket.id} for Order ID ${ticket.public_order_id||await getPublicOrderId(env,ticket.order_id)} was closed by admin.`,[[{text:'View Ticket',callback_data:`ticket_view_${ticket.id}_0`}]]);}
    await showTicket(env,chatId,match[1],0,messageId);return true;
  }
  return false;
}
async function handleTicketText(env,chatId,text,state,isAdminState){
  if(!state||!(isAdminState?state.state==='awaiting_ticket_reply'&&adminUserAccess(env,chatId):state.state==='awaiting_ticket_body'))return false;
  const body=String(text).trim();if(!body||body.length>500){await sendMsg(env,chatId,'Send a text message between 1 and 500 characters.');return true;}
  const data=JSON.parse(state.data),table=isAdminState?'admin_states':'user_states';
  let ticket;
  if(data.ticketId)ticket=await env.DB.prepare("SELECT * FROM support_tickets WHERE id=? AND status<>'closed'").bind(data.ticketId).first();
  else{
    const order=await env.DB.prepare("SELECT id FROM orders WHERE id=? AND user_id=? AND status IN ('completed','paid_pending_delivery','delivering','refunded')").bind(data.orderId,chatId).first();
    if(!order){await sendMsg(env,chatId,'Order unavailable.');return true;}
    await env.DB.prepare(`INSERT OR IGNORE INTO support_tickets(order_id,user_id) SELECT ?,? WHERE EXISTS(SELECT 1 FROM ${table} WHERE user_id=? AND state=? AND data=?)`).bind(order.id,chatId,chatId,state.state,state.data).run();
    ticket=await env.DB.prepare("SELECT * FROM support_tickets WHERE order_id=? AND user_id=? AND status<>'closed'").bind(order.id,chatId).first();
  }
  if(!ticket||(!isAdminState&&String(ticket.user_id)!==String(chatId))){await sendMsg(env,chatId,'Ticket unavailable or closed.');return true;}
  const result=await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO support_ticket_messages(ticket_id,sender_id,is_admin,body,submission_token) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM support_tickets WHERE id=? AND status<>'closed') AND EXISTS(SELECT 1 FROM ${table} WHERE user_id=? AND state=? AND data=?)`).bind(ticket.id,chatId,isAdminState?1:0,body,data.token,ticket.id,chatId,state.state,state.data),
    env.DB.prepare(`UPDATE support_tickets SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status<>'closed' AND EXISTS(SELECT 1 FROM support_ticket_messages WHERE submission_token=?) AND EXISTS(SELECT 1 FROM ${table} WHERE user_id=? AND state=? AND data=?)`).bind(isAdminState?'answered':'open',ticket.id,data.token,chatId,state.state,state.data),
    env.DB.prepare(`DELETE FROM ${table} WHERE user_id=? AND state=? AND data=?`).bind(chatId,state.state,state.data)
  ]);
  if(!result[0].meta?.changes){await sendMsg(env,chatId,'Message was already submitted, cancelled or the ticket closed.');return true;}
  const target=isAdminState?ticket.user_id:env.ADMIN_ID;
  const ticketOrder=await env.DB.prepare('SELECT o.*,p.name AS current_product_name FROM orders o LEFT JOIN products p ON p.id=o.product_id WHERE o.id=?').bind(ticket.order_id).first();
  const sent=await sendMsg(env,target,`🎫 <b>${isAdminState?'Admin Reply':'Customer Support Message'} · Ticket #${ticket.id}</b>\nOrder ID: <code>${ticketOrder?orderDisplayId(ticketOrder):await getPublicOrderId(env,ticket.order_id)}</code>\nProduct: ${adminSnippet(ticketOrder?.product_name||ticketOrder?.current_product_name||'Product unavailable',100)}\nCustomer: <code>${ticket.user_id}</code>\n\n${escapeHtml(body)}`,[[{text:'Open Ticket',callback_data:`ticket_view_${ticket.id}_0`}]]);
  await sendMsg(env,chatId,`✅ Message saved to Ticket #${ticket.id}.${sent?.ok?'':' The notification could not be confirmed; the message is available in the ticket.'}`,[[{text:'View Ticket',callback_data:`ticket_view_${ticket.id}_0`}]]);return true;
}


function walletChangeSql(sql,reason,reference){
  const literal=value=>"'"+String(value).replace(/'/g,"''")+"'";
  const ref=reason==='purchase'&&String(reference).startsWith('wallet:WALLET:')?`COALESCE((SELECT 'order:'||id FROM orders WHERE trx_id=${literal(String(reference).slice(7))}),${literal(reference)})`:literal(reference);
  return sql.replace(/ WHERE user_id\s*=/,`,wallet_change_reason=${literal(reason)},wallet_change_ref=${ref} WHERE user_id=`);
}
async function showWalletHistory(env,chatId,userId,page=0,messageId=null){
  if(!adminUserAccess(env,chatId)&&String(userId)!==String(chatId))return;
  const user=await env.DB.prepare('SELECT balance_usd,balance_bdt FROM users WHERE user_id=?').bind(userId).first();if(!user){await sendMsg(env,chatId,'Customer not found.');return;}
  page=adminUserPage(page);
  const {results}=await env.DB.prepare('SELECT * FROM wallet_history WHERE user_id=? ORDER BY id DESC LIMIT 11 OFFSET ?').bind(userId,page*10).all();
  const labels={opening:'Opening balance (history starts here)',deposit:'Deposit credited',purchase:'Wallet purchase',refund:'Order refund',redeem:'Redeem credit',referral:'Referral commission',admin_credit:'Admin balance credit',admin_reset:'Admin reset to zero',unspecified:'Other balance change'};
  const signed=value=>`${Number(value)>0?'+':''}${(Number(value)/100).toFixed(2)}`;
  let text=`📒 <b>Balance History</b> · Page ${page+1}\nUser: <code>${userId}</code>\nCurrent: <b>$${adminMoney(user.balance_usd)}</b> · ${adminMoney(user.balance_bdt)} BDT\n\n`;
  if(!results.length)text+='No entries on this page.';
  for(const row of results.slice(0,10))text+=`<b>#${row.id} · ${labels[row.reason]||'Other balance change'}</b>\n${paymentDashboardTime(row.created_at)} (Dhaka)\nUSD: <b>${signed(row.usd_delta_cents)}</b> · BDT: ${signed(row.bdt_delta_minor)}\nBalance: $${adminMoney(row.usd_before_cents/100)} → $${adminMoney(row.usd_after_cents/100)}${row.reference?'\nRef: '+adminSnippet(row.reference,90):''}\n\n`;
  text+='History begins when this feature was enabled. Opening balance is not a new deposit.';
  const prefix=adminUserAccess(env,chatId)?`adm_wallet_history_${userId}_`:'wallet_history_',buttons=[],pager=[];
  if(page>0)pager.push({text:'Previous',callback_data:prefix+(page-1)});if(results.length>10)pager.push({text:'Next',callback_data:prefix+(page+1)});if(pager.length)buttons.push(pager);
  buttons.push([{text:'🔄 Refresh',callback_data:prefix+page},{text:adminUserAccess(env,chatId)?'Customer Profile':'My Profile',callback_data:adminUserAccess(env,chatId)?`adm_user_view_${userId}`:'profile'}]);
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function handleOrderSearchText(env,chatId,text,state){
  if(!adminUserAccess(env,chatId)||state.state!=='awaiting_order_search')return false;
  const match=String(text).trim().match(/^(?:order[:# -]*|#)?(\d{1,15})$/i);
  if(!match){await sendMsg(env,chatId,'Enter this store’s 5-digit Order ID, e.g. 58241.');return true;}
  const digits=match[1],legacy=String(text).trim().startsWith('#')||digits.length!==5;
  const order=await env.DB.prepare(legacy?'SELECT id FROM orders WHERE id=? AND COALESCE(admin_deleted,0)=0':'SELECT id FROM orders WHERE public_order_id=? AND COALESCE(admin_deleted,0)=0').bind(digits).first();
  if(!order){await sendMsg(env,chatId,'No order found with this ID. Check the number and try again.');return true;}
  let context;try{context=JSON.parse(state.data);}catch{}
  const page=adminUserPage(context?.page??state.data),filter=['pending','completed'].includes(context?.filter)?context.filter:'all';
  await clearAdminState(env,chatId);await showDeliveryAdminOrder(env,chatId,order.id,null,page,filter);return true;
}


async function handleAdminCoreText(env,chatId,text,state){
  if(!adminUserAccess(env,chatId))return false;
  if(state.state==='awaiting_wallet_credit'){
    const amount=parseMarginInput(text);
    if(!Number.isFinite(amount)||amount<=0||amount>1000000||String(text).trim().endsWith('%')){await sendMsg(env,chatId,'Enter a positive USD amount with up to 2 decimal places (maximum $1,000,000).');return true;}
    const [user,rateValue]=await Promise.all([env.DB.prepare('SELECT * FROM users WHERE user_id=?').bind(state.data).first(),getSetting(env,'usd_to_bdt_rate','125')]);
    if(!user){await clearAdminState(env,chatId);await sendMsg(env,chatId,'Customer not found.');return true;}
    const rate=Number(rateValue);if(!Number.isFinite(rate)||rate<=0||rate>1000000){await sendMsg(env,chatId,'Set a valid USD to BDT exchange rate first.');return true;}
    const cents=Math.round(amount*100),bdtMinor=Math.round(cents*rate),token=crypto.randomUUID().replace(/-/g,''),draft=JSON.stringify({userId:user.user_id,cents,bdtMinor,rate,token,expires:Date.now()+300000});
    const saved=await env.DB.prepare("UPDATE admin_states SET state='confirm_wallet_credit',data=? WHERE user_id=? AND state=? AND data=?").bind(draft,chatId,state.state,state.data).run();
    if(!saved.meta?.changes){await sendMsg(env,chatId,'This entry session was already used. Open Add Balance again.');return true;}
    await sendMsg(env,chatId,`➕ <b>Confirm Wallet Credit</b>\n\nCustomer: ${escapeHtml(user.first_name||user.username||'Customer')}\nUser ID: <code>${user.user_id}</code>\nCurrent balance: <b>$${adminMoney(user.balance_usd)} USD</b>\nAmount to add: <b>+$${(cents/100).toFixed(2)} USD</b>\nBDT credit: ${adminMoney(bdtMinor/100)} BDT (1 USD = ${rate} BDT)\nBalance after addition: <b>$${adminMoney(Number(user.balance_usd||0)+cents/100)} USD</b>\n\nThe amount is added to the balance at confirmation time. This is an admin credit, not a verified deposit. Confirmation expires in 5 minutes.`,[[{text:`Confirm Add $${(cents/100).toFixed(2)}`,callback_data:`adm_wallet_add_ok_${token}`,style:'success'}],[{text:'Cancel',callback_data:`adm_user_view_${user.user_id}`}]]);return true;
  }
  if(state.state==='awaiting_product_rename'){
    const name=String(text).trim();
    if(!name||[...name].length>120||/[\r\n\x00-\x1f\x7f]/.test(name)){await sendMsg(env,chatId,'Enter a product name in one line, between 1 and 120 characters.');return true;}
    const saved=await env.DB.batch([
      env.DB.prepare("UPDATE products SET name=? WHERE id=? AND is_active=1 AND COALESCE(is_external,0)=0 AND EXISTS(SELECT 1 FROM admin_states WHERE user_id=? AND state=? AND data=?)").bind(name,state.data,chatId,state.state,state.data),
      env.DB.prepare('DELETE FROM admin_states WHERE user_id=? AND state=? AND data=?').bind(chatId,state.state,state.data)
    ]);
    await sendMsg(env,chatId,saved[0].meta?.changes?`✅ Product name updated to <b>${escapeHtml(name)}</b>.`:'Product unavailable or this edit session was already used.',[[{text:'Product',callback_data:`adm_prod_details_${state.data}`}],[{text:'Manage Products',callback_data:'adm_manage_products'}]]);return true;
  }
  const settingMap={awaiting_rate:'usd_to_bdt_rate',awaiting_ref_comm:'referral_commission_percent',awaiting_support_contact:'support_admin',awaiting_force_channel:'force_channel_username',awaiting_force_group:'force_group_username',awaiting_api_url:'external_api_url',awaiting_api_key:'external_api_key'};
  if(state.state==='awaiting_broadcast'){
    const body=String(text).trim();if(!body||body.length>500){await sendMsg(env,chatId,'Enter a broadcast text of 1–500 characters.');return true;}
    const id=crypto.randomUUID();
    const created=await env.DB.batch([env.DB.prepare("INSERT INTO broadcast_jobs(id,body,max_user_id) SELECT ?,?,COALESCE((SELECT MAX(user_id) FROM users),0) WHERE EXISTS(SELECT 1 FROM admin_states WHERE user_id=? AND state=? AND data=?)").bind(id,body,chatId,state.state,state.data),env.DB.prepare('DELETE FROM admin_states WHERE user_id=? AND state=? AND data=?').bind(chatId,state.state,state.data)]);
    if(created[0].meta?.changes)await sendMsg(env,chatId,`<b>Broadcast Preview</b>\n\n${escapeHtml(body)}\n\nSend to registered users in batches of 10. Nothing has been sent yet.`,[[{text:'Send First 10',callback_data:`adm_broadcast_send_${id}`}],[{text:'Cancel',callback_data:'admin_panel'}]]);return true;
  }
  const key=settingMap[state.state];
  if(key){
    let value=String(text).trim();
    if(['usd_to_bdt_rate','referral_commission_percent'].includes(key)){
      const n=parseMarginInput(value);if(!Number.isFinite(n)||n<0||(key==='usd_to_bdt_rate'?n===0||n>100000:n>100)||value.endsWith('%')&&key==='usd_to_bdt_rate'){await sendMsg(env,chatId,'Enter a valid number. Exchange rate must be positive; referral percentage must be 0–100.');return true;}value=String(n);
    }else if(key==='external_api_url'){
      try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error();value=url.origin+url.pathname.replace(/\/+$/,'');}catch{await sendMsg(env,chatId,'Enter a valid HTTPS provider URL without credentials or query parameters.');return true;}
    }else if(key==='external_api_key'){
      if(!/^[A-Za-z0-9_.:-]{8,250}$/.test(value)){await sendMsg(env,chatId,'Enter a valid API key without spaces.');return true;}
    }else{
      const numeric=key==='support_admin'&&/^\d{5,16}$/.test(value);
      if(!numeric){value=value.replace(/^https?:\/\/t\.me\//i,'').replace(/^@/,'').replace(/\/$/,'');if(!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(value)){await sendMsg(env,chatId,'Enter a public Telegram @username or t.me/username link. Support contact also accepts a numeric user ID.');return true;}value='@'+value;}
    }
    const writes=[env.DB.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').bind(key,value)];
    if(key==='usd_to_bdt_rate')writes.push(env.DB.prepare('UPDATE products SET price_bdt=ROUND(price_usd*?)').bind(Number(value)));
    writes.push(env.DB.prepare('DELETE FROM admin_states WHERE user_id=? AND state=? AND data=?').bind(chatId,state.state,state.data));await env.DB.batch(writes);providerCatalogCache.delete(env.DB);
    await sendMsg(env,chatId,key==='external_api_key'?'API key saved.':'Setting saved.',[[{text:key.startsWith('external_')?'API Center':'Admin Panel',callback_data:key.startsWith('external_')?'adm_api_menu':'admin_panel'}]]);return true;
  }
  if(state.state==='awaiting_stock'||state.state==='awaiting_stock_multiline'){
    const product=await env.DB.prepare('SELECT * FROM products WHERE id=? AND is_active=1').bind(state.data).first();
    if(!product||product.is_external){await clearAdminState(env,chatId);await sendMsg(env,chatId,'Choose an active local product to add stock.');return true;}
    const multiline=state.state==='awaiting_stock_multiline'||/^[ \t]*---[ \t]*$/m.test(String(text));
    if(!multiline&&/^(?:mail(?: reader)?|(?:lovable|outlook) password)\s*[-:]/im.test(String(text))&&String(text).includes('\n')){
      await sendMsg(env,chatId,'This looks like a multiline account. Nothing was added. Choose Multiline Accounts to keep all details together, or add a line containing --- after each complete account.',[[{text:'📄 Multiline Accounts',callback_data:`adm_stockmulti_${product.id}`}]]);return true;
    }
    const items=parseStockItems(text,multiline);
    if(!items.length||items.length>50||items.some(x=>x.length>1500)){await sendMsg(env,chatId,multiline?'Send 1–50 complete accounts (up to 1500 characters each). Separate accounts with a line containing ---; keep each account’s details together.':'Send 1–50 stock items, one per line (up to 1500 characters each).');return true;}
    const writes=items.map(item=>env.DB.prepare('INSERT INTO inventory(product_id,item_data) SELECT ?,? WHERE EXISTS(SELECT 1 FROM admin_states WHERE user_id=? AND state=? AND data=?)').bind(product.id,item,chatId,state.state,state.data));
    writes.push(env.DB.prepare('DELETE FROM admin_states WHERE user_id=? AND state=? AND data=?').bind(chatId,state.state,state.data));const saved=await env.DB.batch(writes);
    const added=saved.slice(0,-1).reduce((n,r)=>n+Number(r.meta?.changes||0),0);if(added>10)env.__noticeMaxRecipients=4;await sendMsg(env,chatId,`Stock added: ${added} item(s).`,[[{text:'Product',callback_data:`adm_prod_details_${product.id}`}]]);
    if(added)await notifyPreorders(env);return true;
  }
  if(state.state==='awaiting_deposit_amount'){
    await clearAdminState(env,chatId);await sendMsg(env,chatId,'Manual deposit approval is disabled. Use the customer profile → Add Balance after checking the payment.');return true;
  }

  return false;
}


async function sendBroadcastBatch(env,chatId,id){
  if(!adminUserAccess(env,chatId))return;
  const claim=await env.DB.prepare("UPDATE broadcast_jobs SET lease_until=? WHERE id=? AND status='ready' AND lease_until<?").bind(Date.now()+120000,id,Date.now()).run();
  if(!claim.meta?.changes){await sendMsg(env,chatId,'Broadcast is already finished or a batch is still sending.');return;}
  const job=await env.DB.prepare('SELECT * FROM broadcast_jobs WHERE id=?').bind(id).first();
  const {results}=await env.DB.prepare('SELECT user_id FROM users WHERE user_id>? AND user_id<=? AND COALESCE(is_blocked,0)=0 ORDER BY user_id LIMIT 10').bind(job.cursor,job.max_user_id).all();
  let cursor=job.cursor;
  for(const user of results){
    const sent=await sendMsg(env,user.user_id,escapeHtml(job.body));cursor=user.user_id;
    await env.DB.prepare('UPDATE broadcast_jobs SET cursor=?,sent=sent+?,failed=failed+? WHERE id=?').bind(cursor,sent?.ok?1:0,sent?.ok?0:1,id).run();
  }
  const done=results.length<10||cursor>=job.max_user_id;
  await env.DB.prepare('UPDATE broadcast_jobs SET status=?,lease_until=0 WHERE id=?').bind(done?'done':'ready',id).run();
  const latest=await env.DB.prepare('SELECT sent,failed FROM broadcast_jobs WHERE id=?').bind(id).first();
  await sendMsg(env,chatId,`Broadcast ${done?'finished':'batch finished'}.\nSent: ${latest.sent} · Failed: ${latest.failed}`,done?[[{text:'Admin Panel',callback_data:'admin_panel'}]]:[[{text:'Send Next 10',callback_data:`adm_broadcast_send_${id}`}],[{text:'Pause / Admin Panel',callback_data:'admin_panel'}]]);
}


async function saveCheckoutQuote(env,userId,productId,quantity,total){
  await env.DB.prepare('INSERT OR REPLACE INTO checkout_quotes(user_id,product_id,quantity,total_usd,created_ms) VALUES(?,?,?,?,?)').bind(userId,productId,quantity,total,Date.now()).run();
}
async function guardCheckoutQuote(env,chatId,product,quantity,total){
  const quote=await env.DB.prepare('SELECT * FROM checkout_quotes WHERE user_id=? AND product_id=? AND quantity=?').bind(chatId,product.id,quantity).first();
  if(quote&&(Math.round(Number(quote.total_usd)*100)!==Math.round(total*100)||Date.now()-quote.created_ms>15*60000)){
    await sendMsg(env,chatId,'The price changed or this preview expired. Review the updated total and confirm again. No payment was taken.');await sendOrderPreview(env,chatId,product.id,quantity);return false;
  }
  return true;
}


async function ensureCategory(env,name,restore=false){
  const alias=await env.DB.prepare('SELECT c.id,c.is_deleted FROM category_name_aliases a JOIN product_categories c ON c.id=a.category_id WHERE a.name=? COLLATE NOCASE').bind(name).first();
  if(alias&&!restore)return alias.is_deleted?null:alias.id;
  await env.DB.prepare('INSERT OR IGNORE INTO product_categories(name,admin_managed) VALUES(?,1)').bind(name).run();
  if(restore)await env.DB.prepare('UPDATE product_categories SET is_deleted=0,admin_managed=1 WHERE name=? COLLATE NOCASE').bind(name).run();
  const row=await env.DB.prepare('SELECT id,is_deleted FROM product_categories WHERE name=? COLLATE NOCASE').bind(name).first();
  return row?.is_deleted?null:row?.id;
}
const browsingCatalogSync=new WeakMap();
async function syncBrowsingCatalog(env,force=false){
  if(force||!env.__executionContext?.waitUntil)return syncExternalProducts(env,null,null,false,null,force);
  let pending=browsingCatalogSync.get(env.DB);
  if(!pending){
    pending=syncExternalProducts(env,null,null,false,null,false).catch(()=>({success:false})).finally(()=>browsingCatalogSync.delete(env.DB));
    browsingCatalogSync.set(env.DB,pending);
  }
  env.__executionContext.waitUntil(pending);
  return {success:true,cached:true};
}
async function showShopCategories(env,chatId,messageId=null,force=false,page=0){
  await syncBrowsingCatalog(env,force);
  const totals=await env.DB.prepare("SELECT (SELECT COUNT(*)+1 FROM product_categories WHERE is_deleted=0 AND LOWER(name) NOT IN ('subscription','others subscription')) AS categories,(SELECT COUNT(*) FROM products WHERE is_active=1) AS products,COALESCE((SELECT SUM(CASE WHEN is_external=1 THEN MAX(0,COALESCE(api_stock,0)) ELSE (SELECT COUNT(*) FROM inventory WHERE product_id=products.id AND is_sold=0) END) FROM products WHERE is_active=1),0) AS stock").first();
  const {results}=await env.DB.prepare("SELECT c.id,c.name,c.custom_icon,COUNT(p.id) AS count,0 AS sort_order FROM product_categories c LEFT JOIN products p ON p.shop_category_id=c.id AND p.is_active=1 WHERE c.is_deleted=0 AND LOWER(c.name) NOT IN ('subscription','others subscription') GROUP BY c.id UNION ALL SELECT 0 AS id,'Others Subscription' AS name,NULL AS custom_icon,COUNT(*) AS count,1 AS sort_order FROM products WHERE is_active=1 AND (shop_category_id IS NULL OR shop_category_id IN (SELECT id FROM product_categories WHERE LOWER(name) IN ('subscription','others subscription') AND is_deleted=0)) ORDER BY sort_order,name COLLATE NOCASE").all();
  const choices=results.map(c=>categoryButton(c,`shopcat_${c.id}_0`,true)),buttons=[];
  for(let i=0;i<choices.length;i+=2)buttons.push(choices.slice(i,i+2));
  buttons.push([{text:'🔄 Refresh',callback_data:'shop_refresh'},{text:'🏠 Main Menu',callback_data:'home'}]);
  const text=`🛍️ <b>Shop Categories</b>\n<b>${totals?.categories||0}</b> Categories  •  <b>${totals?.products||0}</b> Products  •  <b>${totals?.stock||0}</b> Stock`;
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function sendCategoryProducts(env,chatId,category,page=0,messageId=null,force=false){
  const sync=await syncBrowsingCatalog(env,force);
  const cat=category?await env.DB.prepare('SELECT name FROM product_categories WHERE id=? AND is_deleted=0').bind(category).first():{name:'Others Subscription'};
  if(['subscription','others subscription'].includes(cat?.name.toLowerCase())){category=0;cat.name='Others Subscription';}
  if(!cat){await showShopCategories(env,chatId,messageId);return;}
  const count=await env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE is_active=1 AND (COALESCE(shop_category_id,0)=? OR (?=0 AND shop_category_id IN (SELECT id FROM product_categories WHERE LOWER(name) IN ('subscription','others subscription') AND is_deleted=0)))").bind(category,category).first();
  const pages=Math.max(1,Math.ceil(Number(count.count)/10));page=Math.min(pages-1,adminUserPage(Number.isSafeInteger(Number(page))?page:0));
  const {results}=await env.DB.prepare("SELECT p.*,CASE WHEN is_external=1 THEN COALESCE(api_stock,0) ELSE (SELECT COUNT(*) FROM inventory WHERE product_id=p.id AND is_sold=0) END AS stock_qty FROM products p WHERE is_active=1 AND (COALESCE(shop_category_id,0)=? OR (?=0 AND shop_category_id IN (SELECT id FROM product_categories WHERE LOWER(name) IN ('subscription','others subscription') AND is_deleted=0))) ORDER BY p.id LIMIT 10 OFFSET ?").bind(category,category,page*10).all();
  const buttons=results.map(p=>[productListButton(p,`prod_${p.id}`,!(p.is_external&&!sync.success))]),pager=[];
  if(page>0)pager.push({text:'Previous',callback_data:`shopcat_${category}_${page-1}`});if(page<pages-1)pager.push({text:'Next',callback_data:`shopcat_${category}_${page+1}`});if(pager.length)buttons.push(pager);
  buttons.push([{text:'🔄 Refresh Stock',callback_data:`shopcatrefresh_${category}_${page}`}],[{text:'⬅️ Back to Categories',callback_data:'shop'},{text:'Main Menu',callback_data:'home'}]);
  const text=`🛍️ <b>${escapeHtml(cat.name)}</b>\nPage ${page+1}/${pages} · ${count.count} products\n\n${results.length?'Click any product below to view details and order:':'No products in this category yet.'}${sync.cached?'\nStock is from the latest saved sync. Open a product or Refresh Stock to check live availability.':''}`;
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function showAdminCategories(env,chatId,productId=null,page=0,messageId=null){
  if(!adminUserAccess(env,chatId))return;await clearAdminState(env,chatId);page=adminUserPage(page);
  const product=productId?await env.DB.prepare('SELECT * FROM products WHERE id=?').bind(productId).first():null;
  if(productId&&!product){await sendMsg(env,chatId,'Product not found.');return;}
  const {results}=await env.DB.prepare('SELECT * FROM product_categories WHERE is_deleted=0 ORDER BY name COLLATE NOCASE LIMIT 11 OFFSET ?').bind(page*10).all();
  const buttons=[[{text:'➕ Create New Category',callback_data:`adm_cat_create_${productId||0}`}],...results.slice(0,10).map(c=>[{text:c.name,callback_data:product?`adm_cat_assign_${productId}_${c.id}`:`adm_cat_view_${c.id}`}])],prefix=product?`adm_cat_product_${productId}_`:'adm_categories_',pager=[];
  if(page>0)pager.push({text:'Previous',callback_data:prefix+(page-1)});if(results.length>10)pager.push({text:'Next',callback_data:prefix+(page+1)});if(pager.length)buttons.push(pager);
  if(product)buttons.push([{text:'Others Subscription (Default)',callback_data:`adm_cat_assign_${productId}_0`}],[{text:'Reset to Others Subscription',callback_data:`adm_cat_default_${productId}`}]);
  buttons.push([{text:product?'Product':'Admin Panel',callback_data:product?`adm_prod_details_${productId}`:'admin_panel'}]);
  let current='';if(product){const c=product.shop_category_id?await env.DB.prepare('SELECT name FROM product_categories WHERE id=? AND is_deleted=0').bind(product.shop_category_id).first():null;current=`\nProduct: ${adminSnippet(productDisplayName(product),100)}\nCurrent: ${escapeHtml(c?.name||'Others Subscription')}\nRule: ${product.category_override?'Admin choice (kept after API sync)':'API category / default'}\n`;}
  const text=`📂 <b>${product?'Choose Product Category':'Manage Categories'}</b>\n${current}\n${product?'Choose a category below.':'Tap Create New Category above to add one. Select a category to view or delete it. Assign products from Manage Products → product → Set Category.'}`;
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function handleCategoryCallback(env,chatId,data,messageId){
  if(data==='shop_section_spacer'||data==='shop_section_heading')return true;
  let loose=data.match(/^(shoploose|shoplooserefresh)_(\d+)_(\d+)$/);if(loose){await clearBinanceInput(env,chatId);await clearTicketInput(env,chatId);await sendCategoryProducts(env,chatId,0,Number(loose[3]),messageId,loose[1]==='shoplooserefresh');return true;}
  let match=data.match(/^(shopcat|shopcatrefresh)_(\d+)_(\d+)$/);if(match){await clearBinanceInput(env,chatId);await clearTicketInput(env,chatId);await sendCategoryProducts(env,chatId,Number(match[2]),Number(match[3]),messageId,match[1]==='shopcatrefresh');return true;}
  if(!adminUserAccess(env,chatId))return false;
  orderStage(env,'category.manage');
  match=data.match(/^adm_categories_(\d+)$/);if(match){await showAdminCategories(env,chatId,null,match[1],messageId);return true;}
  match=data.match(/^adm_cat_product_(\d+)_(\d+)$/);if(match){await showAdminCategories(env,chatId,match[1],match[2],messageId);return true;}
  match=data.match(/^adm_cat_rename_(\d+)$/);if(match){
    const cat=await env.DB.prepare('SELECT * FROM product_categories WHERE id=? AND is_deleted=0').bind(match[1]).first();
    if(!cat){await showAdminCategories(env,chatId,null,0,messageId);return true;}
    await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'awaiting_category_rename',?)").bind(chatId,String(cat.id)).run();
    await editMsg(env,chatId,messageId,`✏️ <b>Edit Category Name</b>\n\nCurrent name: <b>${escapeHtml(cat.name)}</b>\n\nSend a unique name in one line (1–60 characters). Products will stay in this category.`,[[{text:'Cancel',callback_data:`adm_cat_view_${cat.id}`}]]);return true;
  }
  match=data.match(/^adm_cat_icon_(\d+)$/);if(match){await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'awaiting_category_icon',?)").bind(chatId,match[1]).run();await editMsg(env,chatId,messageId,'Send an emoji or a Telegram Custom Emoji ID. Send /remove to clear it. No icon is used by default.',[[{text:'Cancel',callback_data:`adm_cat_view_${match[1]}`}]]);return true;}
  match=data.match(/^adm_cat_create_(\d+)$/);if(match){await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'awaiting_category_name',?)").bind(chatId,match[1]).run();await editMsg(env,chatId,messageId,'Enter a category name (1–60 characters), e.g. AI Tools, VPN or Streaming.',[[{text:'Cancel',callback_data:match[1]==='0'?'adm_categories_0':`adm_cat_product_${match[1]}_0`}]]);return true;}
  match=data.match(/^adm_cat_assign_(\d+)_(\d+)$/);if(match){const category=Number(match[2]);if(category&&!await env.DB.prepare('SELECT id FROM product_categories WHERE id=? AND is_deleted=0').bind(category).first())return true;await env.DB.prepare('UPDATE products SET shop_category_id=?,category_override=1 WHERE id=?').bind(category||null,match[1]).run();await showAdminCategories(env,chatId,match[1],0,messageId);return true;}
  match=data.match(/^adm_cat_default_(\d+)$/);if(match){await env.DB.prepare('UPDATE products SET shop_category_id=NULL,provider_category_id=NULL,category_override=0 WHERE id=?').bind(match[1]).run();await showAdminCategories(env,chatId,match[1],0,messageId);return true;}
  match=data.match(/^adm_cat_view_(\d+)$/);if(match){await clearAdminState(env,chatId);await showCategoryAdminDetail(env,chatId,match[1],messageId);return true;}
  match=data.match(/^adm_cat_(delete|confirmdelete)_(\d+)$/);if(match){
    const cat=await env.DB.prepare('SELECT * FROM product_categories WHERE id=? AND is_deleted=0').bind(match[2]).first();if(!cat){await showAdminCategories(env,chatId,null,0,messageId);return true;}
    if(match[1]==='delete'){await editMsg(env,chatId,messageId,`Delete <b>${escapeHtml(cat.name)}</b>?\n\nProducts will remain and move to Others Subscription. API sync will not recreate this category unless you create it again.`,[[{text:'Delete Category',callback_data:`adm_cat_confirmdelete_${cat.id}`}],[{text:'Cancel',callback_data:`adm_cat_view_${cat.id}`}]]);return true;}
    await env.DB.batch([env.DB.prepare('UPDATE products SET shop_category_id=NULL,category_override=1 WHERE shop_category_id=?').bind(cat.id),env.DB.prepare('UPDATE products SET provider_category_id=NULL WHERE provider_category_id=?').bind(cat.id),env.DB.prepare('UPDATE product_categories SET is_deleted=1 WHERE id=?').bind(cat.id)]);
    providerCatalogCache.delete(env.DB);await showAdminCategories(env,chatId,null,0,messageId);return true;
  }return false;
}
async function handleCategoryText(env,chatId,text,state,msg=null){
  if(!adminUserAccess(env,chatId))return false;
  if(state.state==='awaiting_category_rename'){
    const name=String(text).trim();
    if(!name||[...name].length>60||/[\r\n\x00-\x1f\x7f]/.test(name)||['subscription','others subscription','অন্যান্য'].includes(name.toLowerCase())){await sendMsg(env,chatId,'Enter a unique category name in one line (1–60 characters). Others Subscription is reserved.');return true;}
    const cat=await env.DB.prepare('SELECT * FROM product_categories WHERE id=? AND is_deleted=0').bind(state.data).first();
    if(!cat){await clearAdminState(env,chatId);await sendMsg(env,chatId,'Category unavailable.');return true;}
    const conflict=await env.DB.prepare('SELECT id FROM product_categories WHERE name=? COLLATE NOCASE AND id!=? UNION ALL SELECT category_id AS id FROM category_name_aliases WHERE name=? COLLATE NOCASE AND category_id!=?').bind(name,cat.id,name,cat.id).first();
    if(conflict){await sendMsg(env,chatId,'This category name is already in use. Choose another name.');return true;}
    const proof="EXISTS(SELECT 1 FROM admin_states WHERE user_id=? AND state=? AND data=?)";
    const saved=await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO category_name_aliases(name,category_id) SELECT name,id FROM product_categories WHERE id=? AND is_deleted=0 AND ${proof}`).bind(cat.id,chatId,state.state,state.data),
      env.DB.prepare(`UPDATE product_categories SET name=?,admin_managed=1 WHERE id=? AND is_deleted=0 AND ${proof}`).bind(name,cat.id,chatId,state.state,state.data),
      env.DB.prepare('DELETE FROM admin_states WHERE user_id=? AND state=? AND data=?').bind(chatId,state.state,state.data)
    ]);
    providerCatalogCache.delete(env.DB);
    await sendMsg(env,chatId,saved[1].meta?.changes?`✅ Category name updated to <b>${escapeHtml(name)}</b>.`:'This edit session was already used.',[[{text:'Category',callback_data:`adm_cat_view_${cat.id}`}],[{text:'Categories',callback_data:'adm_categories_0'}]]);return true;
  }
  if(state.state==='awaiting_category_icon'){
    const entity=msg?.entities?.find(e=>e.type==='custom_emoji');
    const icon=text==='/remove'?null:entity?.custom_emoji_id||String(text).trim();
    if(icon!==null&&!/^\d{10,22}$/.test(icon)&&!validProductIcon(icon)){await sendMsg(env,chatId,'Send one emoji, a Custom Emoji ID, or /remove.');return true;}
    await env.DB.prepare('UPDATE product_categories SET custom_icon=?,admin_managed=1 WHERE id=? AND is_deleted=0').bind(icon,state.data).run();await clearAdminState(env,chatId);await showCategoryAdminDetail(env,chatId,state.data);return true;
  }
  if(state.state!=='awaiting_category_name')return false;
  const name=String(text).trim();if(!name||name.length>60||/[\r\n]/.test(name)||name==='অন্যান্য'){await sendMsg(env,chatId,'Enter a unique category name of 1–60 characters. This name is reserved for the default category.');return true;}
  const id=await ensureCategory(env,name,true);providerCatalogCache.delete(env.DB);await clearAdminState(env,chatId);
  if(state.data==='new_product'){await beginProductInCategory(env,chatId,id);return true;}
  if(Number(state.data)){await env.DB.prepare('UPDATE products SET shop_category_id=?,category_override=1 WHERE id=?').bind(id,state.data).run();await showAdminCategories(env,chatId,state.data);}else await showAdminCategories(env,chatId);
  return true;
}


async function showCategoryAdminDetail(env,chatId,id,messageId){
  if(!adminUserAccess(env,chatId))return;
  const cat=await env.DB.prepare('SELECT * FROM product_categories WHERE id=? AND is_deleted=0').bind(id).first();if(!cat){await showAdminCategories(env,chatId,null,0,messageId);return;}
  const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM products WHERE shop_category_id=? AND is_active=1').bind(id).first();
  await editMsg(env,chatId,messageId,`<b>${escapeHtml(cat.name)}</b>\n\nActive products: ${count.n}\n\nAssign products from Manage Products → product → Set Category. Deleting a category keeps its products.`,[[{text:'✏️ Edit Name',callback_data:`adm_cat_rename_${cat.id}`}],[{text:'View Products',callback_data:`shopcat_${cat.id}_0`}],[{text:'🎨 Set Category Icon',callback_data:`adm_cat_icon_${cat.id}`}],[{text:'🗑️ Delete Category',callback_data:`adm_cat_delete_${cat.id}`}],[{text:'⬅️ Back to Categories',callback_data:'adm_categories_0'}]]);
}


function categoryButton(category,callback,count=false){
  const icon=category.custom_icon,custom=typeof icon==='string'&&/^\d{10,22}$/.test(icon);
  return {text:`${icon&&!custom?icon+' ':''}${category.name}${count?' ('+category.count+')':''}`,callback_data:callback,style:'primary',...(custom?{icon_custom_emoji_id:icon}:{})};
}


async function showNewProductCategories(env,chatId,page=0,messageId=null){
  if(!adminUserAccess(env,chatId))return;await clearAdminState(env,chatId);page=adminUserPage(page);
  const {results}=await env.DB.prepare('SELECT * FROM product_categories WHERE is_deleted=0 ORDER BY name COLLATE NOCASE LIMIT 11 OFFSET ?').bind(page*10).all();
  const choices=results.slice(0,10).map(c=>categoryButton(c,`adm_newcategory_${c.id}`)),buttons=[];
  for(let i=0;i<choices.length;i+=2)buttons.push(choices.slice(i,i+2));
  const pager=[];if(page>0)pager.push({text:'Previous',callback_data:`adm_newcategories_${page-1}`});if(results.length>10)pager.push({text:'Next',callback_data:`adm_newcategories_${page+1}`});if(pager.length)buttons.push(pager);
  buttons.push([{text:'➕ Create New Category',callback_data:'adm_newcategory_create'}],[{text:'Others Subscription (Default)',callback_data:'adm_newcategory_0'}],[{text:'Cancel',callback_data:'admin_panel'}]);
  const text=`➕ <b>Add New Product · Step 1/5: Category</b>\n\n${results.length?'Choose one of your existing categories below.':'No categories created yet. Create a category or continue without one.'}\nThe product will be saved in the category you select.`;
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function beginProductInCategory(env,chatId,categoryId,messageId=null){
  if(!adminUserAccess(env,chatId))return;
  const category=categoryId?await env.DB.prepare('SELECT name FROM product_categories WHERE id=? AND is_deleted=0').bind(categoryId).first():{name:'Others Subscription'};
  if(!category){await showNewProductCategories(env,chatId,0,messageId);return;}
  await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'awaiting_prod_name',?)").bind(chatId,JSON.stringify({categoryId,icon:''})).run();
  const text=`➕ <b>Add Product · Step 2/5: Name</b>\n\nCategory: <b>${escapeHtml(category.name)}</b>\n\nEnter the product name.`;
  const buttons=[[{text:'Back to Categories',callback_data:'adm_add_product'}],[{text:'Cancel',callback_data:'admin_panel'}]];
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}


function parseStockItems(text,multiline=false){
  if(multiline||/^[ \t]*---[ \t]*$/m.test(String(text)))return String(text).replace(/\r\n?/g,'\n').split(/^[ \t]*---[ \t]*$/m).map(item=>item.trim()).filter(Boolean);
  return String(text).split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!/^[|:\-\s]+$/.test(line)&&!/^```/.test(line)).map(line=>line.startsWith('|')&&line.endsWith('|')?line.slice(1,-1).trim():line).filter(Boolean);
}
const noticeDrainRunning=new WeakMap();
async function drainProductNotices(env){
  if(!env.DB)return;
  if(noticeDrainRunning.has(env.DB))return noticeDrainRunning.get(env.DB);
  const work=(async()=>{const deadline=env.__noticeDeadline||Date.now()+18000,maxRecipients=env.__noticeMaxRecipients||env.__orderTrace?.noticeMaxRecipients||24;let attempted=0;for(let event=0;event<20&&attempted<maxRecipients&&Date.now()<deadline;event++){const sent=await deliverProductNoticeBatch(env,Math.min(4,maxRecipients-attempted),deadline);if(sent==null)break;attempted+=sent;}})().finally(()=>noticeDrainRunning.delete(env.DB));noticeDrainRunning.set(env.DB,work);return work;
}
async function deliverProductNoticeBatch(env,limit=4,deadline=Date.now()+18000){
  if(await getSetting(env,'product_notifications_enabled','1')!=='1')return null;
  const now=Date.now(),token=crypto.randomUUID();
  const claim=await env.DB.prepare("UPDATE product_notice_events SET lease_token=?,lease_until=? WHERE id=(SELECT id FROM product_notice_events WHERE status='pending' AND next_at<=? AND lease_until<? ORDER BY id LIMIT 1) AND lease_until<?").bind(token,now+60000,now,now,now).run();
  if(!claim.meta?.changes)return null;
  const event=await env.DB.prepare('SELECT * FROM product_notice_events WHERE lease_token=?').bind(token).first();
  const product=await env.DB.prepare('SELECT p.*,COALESCE(s.stock,CASE WHEN p.is_external=1 THEN p.api_stock ELSE (SELECT COUNT(*) FROM inventory WHERE product_id=p.id AND is_sold=0) END) AS stock FROM products p LEFT JOIN product_notice_state s ON s.product_id=p.id WHERE p.id=?').bind(event.product_id).first();
  if(!product||product.is_active===0||await getSetting(env,'product_notice_'+event.kind,'1')!=='1'||(event.kind==='restock'&&product.stock===0)||(event.kind==='sold_out'&&product.stock>0)){
    await env.DB.prepare("UPDATE product_notice_events SET status='superseded',lease_until=0 WHERE id=? AND lease_token=?").bind(event.id,token).run();return 0;
  }
  const titles={new_product:'🆕 New Product Added',restock:'✅ Stock Added',sold_out:'📦 Stock Finished',price_drop:'📉 Price Dropped',price_increase:'📈 Price Increased'};
  const text=`<b>${titles[event.kind]||'Product Update'}</b>\n\n${escapeHtml(productDisplayName(product))}\n${['price_drop','price_increase'].includes(event.kind)?`Price: <b>$${adminMoney(event.old_price_cents/100)} → $${adminMoney(event.new_price_cents/100)}</b>`:`Price: <b>$${adminMoney(product.price_usd)}</b>`}\n${event.kind==='sold_out'?'Stock: 0':'Available stock: '+Number(product.stock||0)}\n\n${paymentDashboardTime(event.created_at)} (Dhaka)`;
  const {results:users}=await env.DB.prepare(`SELECT u.user_id FROM users u WHERE u.user_id>? AND u.user_id<=? AND COALESCE(u.is_blocked,0)=0 AND COALESCE(u.product_alerts,1)=1 AND (COALESCE(u.product_alert_scope,'all')='all' OR EXISTS(SELECT 1 FROM product_follows f WHERE f.user_id=u.user_id AND f.product_id=?)) ORDER BY u.user_id LIMIT ?`).bind(event.cursor,event.max_user_id,event.product_id,limit).all();
  let cursor=event.cursor,attempted=0;
  for(const user of users){
    if(Date.now()>=deadline)break;
    attempted++;
    const sent=await sendMsg(env,user.user_id,text,[[{text:'View Product',callback_data:`prod_${product.id}`}],[{text:'🔔 Notification Settings',callback_data:'product_alert_settings'}]]);
    if(!sent?.ok&&![400,403].includes(sent?.error_code)){
      const delay=Math.max(30,Math.min(3600,Number(sent?.parameters?.retry_after)||30));
      await env.DB.prepare('UPDATE product_notice_events SET next_at=?,lease_until=0,retries=retries+1 WHERE id=? AND lease_token=?').bind(Date.now()+delay*1000,event.id,token).run();return null;
    }
    cursor=user.user_id;
    const progress=env.DB.prepare('UPDATE product_notice_events SET cursor=?,sent=sent+?,failed=failed+?,retries=0 WHERE id=? AND lease_token=?').bind(cursor,sent?.ok?1:0,sent?.ok?0:1,event.id,token);
    const writes=[progress];
    if(sent?.ok&&event.kind==='restock')writes.push(env.DB.prepare("UPDATE restock_requests SET status='notified' WHERE product_id=? AND user_id=? AND status='pending'").bind(product.id,user.user_id));
    if(sent?.ok&&event.kind==='restock'&&!product.is_external)writes.push(env.DB.prepare("UPDATE preorders SET status='notified' WHERE product_id=? AND user_id=? AND status='pending'").bind(product.id,user.user_id));
    await env.DB.batch(writes);
  }
  await env.DB.prepare('UPDATE product_notice_events SET status=?,lease_until=0 WHERE id=? AND lease_token=?').bind(attempted===users.length&&(users.length<limit||cursor>=event.max_user_id)?'done':'pending',event.id,token).run();
  return attempted;
}
async function showProductNoticeSettings(env,chatId,messageId=null){
  if(!adminUserAccess(env,chatId))return;
  const keys=['product_notifications_enabled','product_notice_new_product','product_notice_restock','product_notice_sold_out','product_notice_price_drop','product_notice_price_increase'];
  const values=await Promise.all(keys.map(k=>getSetting(env,k,'1'))),labels=['All Product Alerts','New Products','Stock Added','Stock Finished','Price Drops','Price Increases'];
  const pending=await env.DB.prepare("SELECT COUNT(*) AS n FROM product_notice_events WHERE status='pending'").first();
  const buttons=keys.map((k,i)=>[{text:`${labels[i]}: ${values[i]==='1'?'ON':'OFF'}`,callback_data:`adm_notice_toggle_${i}`}]);buttons.push([{text:'Send Pending Batch',callback_data:'adm_notice_drain'}],[{text:'Admin Panel',callback_data:'admin_panel'}]);
  const text=`🔔 <b>Product Notifications</b>\n\nPending events: ${pending.n}\n\nAll Products is the default for customers and admins. Users can choose Followed Only or turn private alerts off. Channel posts remain independent and cover the store catalog. They can manage or mute alerts from Profile. Repeated unchanged syncs do not create new alerts.\n\nDelivery runs in small background batches after bot activity/sync. Large queues may need more bot activity or scheduled sync calls to finish promptly.`;
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function handleProductNoticeCallback(env,chatId,data,messageId){
  if(await handleProductFollowCallback(env,chatId,data,messageId))return true;
  if(await handleChannelNoticeCallback(env,chatId,data,messageId))return true;
  if(data==='product_alert_off'||data==='product_alert_toggle'){
    await env.DB.prepare(data==='product_alert_off'?'UPDATE users SET product_alerts=0,product_alert_preference_set=1 WHERE user_id=?':'UPDATE users SET product_alerts=CASE WHEN COALESCE(product_alerts,1)=1 THEN 0 ELSE 1 END,product_alert_preference_set=1 WHERE user_id=?').bind(chatId).run();
    const user=await env.DB.prepare('SELECT * FROM users WHERE user_id=?').bind(chatId).first();await sendProfile(env,chatId,user,messageId);return true;
  }
  if(!adminUserAccess(env,chatId))return false;
  if(data==='adm_product_notices'){await showProductNoticeSettings(env,chatId,messageId);return true;}
  if(data==='adm_notice_drain'){await drainProductNotices(env);await showProductNoticeSettings(env,chatId,messageId);return true;}
  const match=data.match(/^adm_notice_toggle_([0-5])$/);if(match){const key=['product_notifications_enabled','product_notice_new_product','product_notice_restock','product_notice_sold_out','product_notice_price_drop','product_notice_price_increase'][Number(match[1])];await env.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,CASE WHEN COALESCE((SELECT value FROM settings WHERE key=?),'1')='1' THEN '0' ELSE '1' END)").bind(key,key).run();await showProductNoticeSettings(env,chatId,messageId);return true;}return false;
}


const channelDrainRunning=new WeakMap();
async function drainAllNotices(env){const scoped={...env,__noticeDeadline:Date.now()+18000};await drainChannelNotices(scoped);await drainProductNotices(scoped);}
async function drainChannelNotices(env){
  if(!env.DB)return;if(channelDrainRunning.has(env.DB))return channelDrainRunning.get(env.DB);
  const work=deliverChannelNotices(env).finally(()=>channelDrainRunning.delete(env.DB));channelDrainRunning.set(env.DB,work);return work;
}
async function deliverChannelNotices(env){
  if(await getSetting(env,'channel_notifications_enabled','1')!=='1')return;
  const current=await getSetting(env,'force_channel_username','');if(!normalizeNoticeChannel(current))return;
  const pending=await env.DB.prepare("SELECT id FROM channel_notice_events WHERE status='pending' AND next_at<=? AND lease_until<? LIMIT 1").bind(Date.now(),Date.now()).first();if(!pending)return;
  const me=await callTg(env,'getMe',{}),username=me?.result?.username;
  const link=typeof username==='string'&&/^[A-Za-z0-9_]+$/.test(username)?`https://t.me/${username}`:null;
  const deadline=Math.min(Date.now()+8000,env.__noticeDeadline||Infinity);
  let sentPosts=0;
  for(let inspected=0;inspected<100&&sentPosts<6&&Date.now()<deadline;inspected++){
    const token=crypto.randomUUID(),now=Date.now();
    const claim=await env.DB.prepare("UPDATE channel_notice_events SET lease_token=?,lease_until=? WHERE id=(SELECT id FROM channel_notice_events WHERE status='pending' AND next_at<=? AND lease_until<? ORDER BY id LIMIT 1) AND lease_until<?").bind(token,now+60000,now,now,now).run();if(!claim.meta?.changes)return;
    const event=await env.DB.prepare('SELECT * FROM channel_notice_events WHERE lease_token=?').bind(token).first();
    const product=event.product_id?await env.DB.prepare('SELECT p.*,COALESCE(s.stock,CASE WHEN p.is_external=1 THEN p.api_stock ELSE (SELECT COUNT(*) FROM inventory WHERE product_id=p.id AND is_sold=0) END) AS stock FROM products p LEFT JOIN product_notice_state s ON s.product_id=p.id WHERE p.id=?').bind(event.product_id).first():null;
    let text='',invalid=normalizeNoticeChannel(event.channel_id)!==normalizeNoticeChannel(current)||!normalizeNoticeChannel(current)||await getSetting(env,'channel_notice_'+event.kind,'1')!=='1';
    if(['price_drop','price_increase'].includes(event.kind)){
      const oldPrice=Number(event.old_price_cents),newPrice=Number(event.new_price_cents);
      invalid=invalid||(!product&&!event.product_name_snapshot)||!Number.isFinite(oldPrice)||!Number.isFinite(newPrice)||oldPrice<=0||newPrice<=0||oldPrice===newPrice;
      if(!invalid){const drop=newPrice<oldPrice,difference=Math.abs(newPrice-oldPrice);text=`${drop?'📉 Price Drop!':'📈 Price Increased'}\n\n<b>${escapeHtml(event.product_name_snapshot||productDisplayName(product))}</b>\nOld price: <b>$${adminMoney(oldPrice/100)}</b>\nNew price: <b>$${adminMoney(newPrice/100)}</b>\nChange: ${drop?'-':'+'}$${adminMoney(difference/100)} (${(difference/oldPrice*100).toFixed(2)}%)\n\nUpdated: ${paymentDashboardTime(event.created_at)} (Dhaka)`;}
    }else if(['new_product','restock','sold_out','low_stock'].includes(event.kind)){
      const snapshot=event.stock_snapshot!==null&&event.stock_snapshot!==undefined;
      invalid=invalid||(!snapshot&&(!product||product.is_active===0||(event.kind==='low_stock'&&!(product.stock>0&&product.stock<=5))||(event.kind==='sold_out'&&product.stock>0)||(event.kind==='restock'&&product.stock<=0)));
      const titles={new_product:'🆕 New Product',restock:'✅ Stock Added',sold_out:'📦 Sold Out',low_stock:'🔥 Last Chance to Purchase!'};
      const stock=snapshot?Number(event.stock_snapshot):Number(product?.stock||0),price=snapshot?Number(event.price_snapshot_cents)/100:product?.price_usd;
      const name=event.product_name_snapshot||product&&productDisplayName(product)||'Store Product';
      text=`<b>${titles[event.kind]}</b>\n\n${escapeHtml(name)}\nPrice: <b>$${adminMoney(price)}</b>\n${event.kind==='low_stock'?`Only <b>${stock}</b> left at this update — check live stock before buying!`:`Stock at update: <b>${stock}</b>`}\nUpdated: ${paymentDashboardTime(event.created_at)} (Dhaka)${product&&Number(product.stock)!==stock?`\nLatest stock: <b>${Number(product.stock||0)}</b>`:''}`;
    }else if(event.kind==='purchase'){
      const order=await env.DB.prepare("SELECT product_name,quantity,amount_usd FROM orders WHERE id=? AND status='completed'").bind(event.order_id).first();invalid=invalid||!order;
      if(order)text=`🛍️ <b>Purchase Completed!</b>\n\n${escapeHtml(order.product_name||product?.name||'Store Product')}\nQuantity: <b>${order.quantity||1}</b>\nTotal: <b>$${adminMoney(order.amount_usd)}</b>\n\nThank you for shopping with us!`;
    }else if(event.kind==='deposit'){
      const deposit=await env.DB.prepare("SELECT method,amount_usd FROM deposits WHERE id=? AND status='completed'").bind(event.deposit_id).first();invalid=invalid||!deposit;
      if(deposit)text=`💳 <b>Deposit Completed!</b>\n\nAmount: <b>$${adminMoney(deposit.amount_usd)}</b>\nMethod: ${escapeHtml(deposit.method==='REDEEM'?'Redeem Code':deposit.method)}\n\nWallet top-up confirmed.`;
    }else invalid=true;
    if(invalid){await env.DB.prepare("UPDATE channel_notice_events SET status='superseded',lease_until=0 WHERE id=? AND lease_token=?").bind(event.id,token).run();continue;}
    const productAvailable=Boolean(event.product_id&&product?.is_active===1);
    if(event.product_id&&!productAvailable)text+='\n\nThis product is currently unavailable in the store.';
    const keyboard=link?[[{text:productAvailable?'Open Product':'Open Store Bot',url:productAvailable?`${link}?start=product_${event.product_id}`:link}]]:null;
    const sent=await sendMsg(env,normalizeNoticeChannel(event.channel_id),text,keyboard);
    if(sent?.ok){sentPosts++;await env.DB.prepare("UPDATE channel_notice_events SET status='sent',sent_at=CURRENT_TIMESTAMP,lease_until=0,last_error=NULL,attempts=attempts+1 WHERE id=? AND lease_token=?").bind(event.id,token).run();}
    else{const delay=Math.max(30,Math.min(3600,Number(sent?.parameters?.retry_after)||300));await env.DB.prepare('UPDATE channel_notice_events SET next_at=?,lease_until=0,attempts=attempts+1,last_error=? WHERE id=? AND lease_token=?').bind(Date.now()+delay*1000,await channelPostError(env,sent),event.id,token).run();return;}
  }
}
async function showChannelNotices(env,chatId,messageId=null){
  if(!adminUserAccess(env,chatId))return;
  const channel=await getSetting(env,'force_channel_username',''),keys=['channel_notifications_enabled','channel_notice_new_product','channel_notice_restock','channel_notice_sold_out','channel_notice_low_stock','channel_notice_purchase','channel_notice_deposit','channel_notice_price_drop','channel_notice_price_increase'],labels=['All Channel Alerts','New Product','Stock Added','Stock Finished','Last 5 / Low Stock','Successful Purchase','Successful Deposit','Price Drops','Price Increases'];
  const [values,totals,recent,lastCheck,missing]=await Promise.all([
    Promise.all(keys.map(key=>getSetting(env,key,'1'))),
    env.DB.prepare("SELECT SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status='sent' THEN 1 ELSE 0 END) sent,SUM(CASE WHEN status='pending' AND kind='new_product' THEN 1 ELSE 0 END) new_pending FROM channel_notice_events").first(),
    env.DB.prepare('SELECT channel_id,last_error,sent_at FROM channel_notice_events WHERE last_error IS NOT NULL OR sent_at IS NOT NULL ORDER BY id DESC LIMIT 20').all(),
    getSetting(env,'__channel_connection_check',''),
    env.DB.prepare("SELECT COUNT(*) n FROM products p WHERE p.is_external=1 AND p.is_active=1 AND NOT EXISTS(SELECT 1 FROM channel_notice_events e WHERE e.event_key='new:'||p.id)").first()
  ]);
  const relevant=(recent.results||[]).filter(row=>normalizeNoticeChannel(row.channel_id)===normalizeNoticeChannel(channel));
  const issue=relevant.find(row=>row.last_error),lastSent=relevant.find(row=>row.sent_at);
  let checked;try{checked=JSON.parse(lastCheck);}catch{}
  const connection=checked&&normalizeNoticeChannel(checked.target)===normalizeNoticeChannel(channel)?`${checked.ok?'Ready to post':'Needs attention'} — ${checked.message} (${paymentDashboardTime(checked.checkedAt)})`:'Not checked. Tap Check Channel Connection.';
  const state=!channel?'No announcement channel configured':!normalizeNoticeChannel(channel)?'Invalid channel address':values[0]!=='1'?'All Channel Alerts is OFF':values[1]!=='1'?'New Product alerts are OFF':'Channel alerts enabled';
  const buttons=keys.map((key,i)=>[{text:`${labels[i]}: ${values[i]==='1'?'ON':'OFF'}`,callback_data:`adm_channel_toggle_${i}`}]);
  buttons.push([{text:'Enable All Channel Alerts',callback_data:'adm_channel_enable_all'}],[{text:'🔎 Check Channel Connection',callback_data:'adm_channel_check'}],[{text:'Retry Pending Channel Posts',callback_data:'adm_channel_retry'}],[{text:`Queue Missed API Products (${missing.n||0})`,callback_data:'adm_channel_recover_preview'}],[{text:'Automatic Sync Status',callback_data:'adm_periodic'}],[{text:'Force Channel Settings',callback_data:'adm_force_menu'},{text:'Admin Panel',callback_data:'admin_panel'}]);
  const text=`📢 <b>Channel Notifications</b>\n\nForce channel: <code>${escapeHtml(channel||'Not configured')}</code>\n<b>${escapeHtml(state)}</b>\nPending posts: ${totals?.pending||0} · New products pending: ${totals?.new_pending||0}\nSent posts: ${totals?.sent||0}\nLast sent to this channel: ${lastSent?paymentDashboardTime(lastSent.sent_at):'Not recorded'}\nLast issue: ${escapeHtml(issue?.last_error||'None recorded')}\n\n<b>Connection &amp; permissions</b>\n${escapeHtml(connection)}\n\nUnannounced API products: ${missing.n||0}\nRecovery queues only selected missing products; it never reposts recorded announcements. Automatic sync must run to discover supplier changes. Telegram errors remain queued for retry. No credentials or customer details are posted.`;
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}

async function handleChannelNoticeCallback(env,chatId,data,messageId){
  if(!adminUserAccess(env,chatId))return false;
  if(data==='adm_channel_enable_all'){
    await env.DB.batch(['channel_notifications_enabled','channel_notice_new_product','channel_notice_restock','channel_notice_sold_out','channel_notice_low_stock','channel_notice_purchase','channel_notice_deposit','channel_notice_price_drop','channel_notice_price_increase'].map(key=>env.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,'1')").bind(key)));
    await showChannelNotices(env,chatId,messageId);return true;
  }
  if(data==='adm_channel_check'){await checkChannelConnection(env);await showChannelNotices(env,chatId,messageId);return true;}
  if(data==='adm_channel_recover_preview'){await previewChannelRecovery(env,chatId,messageId);return true;}
  const recover=data.match(/^adm_channel_recover_run_([a-f0-9]{8})$/);
  if(recover){
    const saved=await env.DB.prepare("SELECT * FROM admin_states WHERE user_id=? AND state='channel_recovery_preview'").bind(chatId).first();
    let draft;try{draft=JSON.parse(saved?.data||'');}catch{}
    const channel=await getSetting(env,'force_channel_username','');
    if(!draft||draft.token!==recover[1]||Date.now()-draft.createdAt>600000||draft.channel!==normalizeNoticeChannel(channel)){await previewChannelRecovery(env,chatId,messageId);return true;}
    if(!normalizeNoticeChannel(channel)||await getSetting(env,'channel_notifications_enabled','1')!=='1'||await getSetting(env,'channel_notice_new_product','1')!=='1'){await showChannelNotices(env,chatId,messageId);return true;}
    const ids=draft.ids.filter(id=>Number.isSafeInteger(id)&&id>0).slice(0,10);
    if(ids.length)await env.DB.batch([
      env.DB.prepare(channelNewProductInsert(`p.id IN (${ids.map(()=>'?').join(',')}) AND p.is_external=1 AND (SELECT value FROM settings WHERE key='force_channel_username')=? AND EXISTS(SELECT 1 FROM admin_states WHERE user_id=? AND state='channel_recovery_preview' AND data=?)`)).bind(...ids,channel,chatId,saved.data),
      env.DB.prepare("DELETE FROM admin_states WHERE user_id=? AND state='channel_recovery_preview' AND data=?").bind(chatId,saved.data)
    ]);
    await drainChannelNotices(env);await showChannelNotices(env,chatId,messageId);return true;
  }
  if(data==='adm_channel_notices'){await showChannelNotices(env,chatId,messageId);return true;}
  if(data==='adm_channel_retry'){await env.DB.prepare("UPDATE channel_notice_events SET next_at=0 WHERE status='pending' AND lease_until<?").bind(Date.now()).run();await drainChannelNotices(env);await showChannelNotices(env,chatId,messageId);return true;}
  const match=data.match(/^adm_channel_toggle_([0-8])$/);if(match){const key=['channel_notifications_enabled','channel_notice_new_product','channel_notice_restock','channel_notice_sold_out','channel_notice_low_stock','channel_notice_purchase','channel_notice_deposit','channel_notice_price_drop','channel_notice_price_increase'][Number(match[1])];await env.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES(?,CASE WHEN COALESCE((SELECT value FROM settings WHERE key=?),'1')='1' THEN '0' ELSE '1' END)").bind(key,key).run();await showChannelNotices(env,chatId,messageId);return true;}return false;
}

function normalizeNoticeChannel(value){
  const text=String(value||'').trim();if(/^-[0-9]+$/.test(text))return text;if(/^@[A-Za-z0-9_]{5,32}$/.test(text))return text.toLowerCase();
  const match=text.match(/^https?:\/\/t\.me\/([A-Za-z0-9_]{5,32})\/?$/i);return match?'@'+match[1].toLowerCase():null;
}


const GUIDE_LEGACY_DEFAULTS={
  guide_title:'User Guide / FAQ',
  guide_intro:'প্রয়োজনীয় বিষয়টি বেছে নিন।',
  guide_payment:"বর্তমান রেট: 1 USD = {rate} BDT\n\n• Wallet Pay: আগে ডিপোজিট করুন, তারপর Wallet Payment দিয়ে কেনা নিশ্চিত করুন।\n• Direct Payment: অর্ডারের পেমেন্ট মাধ্যম বেছে দেখানো পরিমাণ পাঠান।\n• bKash/Nagad: দেখানো নম্বরে ঠিক পরিমাণ Send Money করুন। ৬০ মিনিটের মধ্যে রসিদের TrxID দিন। গ্রহণকারী ফোনের SMS-এর সঙ্গে মিললে ভেরিফাই হবে।\n• Rocket: রসিদের Transaction ID নির্দেশনায় Reply দিয়ে ৬০ মিনিটের মধ্যে জমা দিন; অ্যাডমিনের অনুমোদন লাগে।\n• Binance Pay: Pay ID-তে USDT পাঠিয়ে রসিদের Order/Transaction ID দিন। পেমেন্টের ১০ মিনিটের মধ্যে ID জমা দিন। ডিপোজিটে সর্বোচ্চ $10।\n• BEP20: শুধু USDT, BNB Smart Chain নেটওয়ার্কে দেখানো ঠিকানায় পুরো পরিমাণ পৌঁছাতে হবে। ফি আলাদা বহন করুন। পেমেন্টের ১০ মিনিটের মধ্যে TxHash দিন; ১২টি confirmation প্রয়োজন।\n• Redeem Code: ডিপোজিটের Redeem Code অপশনে বৈধ একবার-ব্যবহারযোগ্য কোড দিন।\n\nPIN, OTP বা private key দেবেন না। পেমেন্ট নিশ্চিত না হলে আবার টাকা পাঠাবেন না।",
  guide_delivery:'পেমেন্ট নিশ্চিত হলে উপলব্ধ প্রোডাক্ট স্বয়ংক্রিয়ভাবে ডেলিভারি হয়। সাপ্লায়ারের অর্ডার বা স্টক আটকে থাকলে সময় লাগতে পারে। Orders থেকে অবস্থা দেখুন। Check Delivery থাকলে ব্যবহার করুন অথবা Get Help দিয়ে সাপোর্ট টিকিট করুন। একই অর্ডারের জন্য আবার পেমেন্ট করবেন না।',
  guide_warranty:'ওয়ারেন্টি প্রোডাক্টভেদে আলাদা। কেনার আগে প্রোডাক্টের বিবরণে মেয়াদ, শর্ত ও নির্দেশনা পড়ুন। স্পষ্টভাবে উল্লেখ না থাকলে কেনার আগে সাপোর্টে নিশ্চিত করুন। সমস্যায় Order ID-সহ সাপোর্ট টিকিট দিন; PIN, OTP বা পাসওয়ার্ড পাঠাবেন না।',
  guide_refund:'রিফান্ডের আবেদন অর্ডারের সমস্যা ও সংশ্লিষ্ট প্রোডাক্টের শর্ত অনুযায়ী অ্যাডমিন যাচাই করবেন। Orders → Get Help থেকে টিকিট দিন। শুধু আবেদন করলেই স্বয়ংক্রিয় রিফান্ড নিশ্চিত নয়। পেমেন্ট আটকে থাকলে আবার টাকা না পাঠিয়ে একই Order ID দিয়ে সাপোর্ট নিন।',
  guide_faq:'• টাকা কেটেছে, প্রোডাক্ট আসেনি? Orders দেখুন; Check Delivery থাকলে ব্যবহার করুন, না হলে Get Help দিন।\n• ডিপোজিট হয়নি? সঠিক মাধ্যম, পরিমাণ ও রসিদের ID মিলিয়ে দেখুন; PIN/OTP দেবেন না।\n• একই TxID আবার ব্যবহার করা যায়? সম্পন্ন পেমেন্টের ID দ্বিতীয়বার ক্রেডিট হয় না।\n• দাম বদলেছে? API-এর দাম/স্টক sync হলে আপডেট হয়। কেনার আগে সর্বশেষ মোট মূল্য দেখুন।\n• ব্যালেন্সের হিসাব? Profile → Balance History দেখুন।'
};
const GUIDE_PREVIOUS_INTRO="প্রথমবার ব্যবহার করছেন? নিচের বিষয়গুলো থেকে প্রয়োজনীয়টি বেছে নিন।\n\nপেমেন্টের নিয়ম → টাকা পাঠানো ও ভেরিফিকেশন\nঅর্ডার ও ডেলিভারি → কেনা ও ফাইল ডাউনলোড\nওয়ারেন্টি → প্রোডাক্টের শর্ত ও সহায়তা\nরিফান্ড → সমস্যা হলে করণীয়\nFAQ → সাধারণ প্রশ্নের উত্তর";
const GUIDE_BENGALI_DEFAULTS={
  "guide_title": "User Guide / FAQ",
  "guide_intro": "কেনাকাটা, পেমেন্ট ও ডেলিভারি—প্রয়োজনীয় নির্দেশনা এক জায়গায়।\n\nনিচের বাটন থেকে আপনার প্রয়োজনীয় বিষয়টি বেছে নিন।",
  "guide_payment": "বর্তমান রেট: 1 USD = {rate} BDT\n\nWallet Payment:\nDeposit থেকে ব্যালেন্স যোগ করুন। প্রোডাক্ট ও পরিমাণ বেছে Wallet Payment চাপুন।\n\nDirect Payment:\nঅর্ডারে দেখানো মাধ্যম, নম্বর/ঠিকানা ও পরিমাণ মিলিয়ে টাকা পাঠান। তারপর সেই পেমেন্টের ID জমা দিন।\n\nbKash / Nagad:\nদেখানো নম্বরে Send Money করুন। ৬০ মিনিটের মধ্যে রসিদের TrxID দিন। টাকা পাওয়ার SMS মিললে ভেরিফাই হবে।\n\nRocket:\n৬০ মিনিটের মধ্যে নির্দেশনায় Reply দিয়ে রসিদের Transaction ID দিন। অ্যাডমিন যাচাই করবেন।\n\nBinance Pay:\nদেখানো Pay ID-তে USDT পাঠান। পেমেন্টের ১০ মিনিটের মধ্যে রসিদের Order/Transaction ID দিন। ডিপোজিটে সর্বোচ্চ $10।\n\nBEP20 USDT:\nশুধু BNB Smart Chain-এ দেখানো ঠিকানায় পাঠান। পুরো পরিমাণ পৌঁছাতে হবে; ফি আলাদা। ১০ মিনিটের মধ্যে TxHash দিন। ১২টি confirmation প্রয়োজন।\n\nRedeem Code:\nDeposit → Redeem Code-এ বৈধ কোড দিন। একই কোড একবার ব্যবহার করা যাবে।\n\nপেমেন্ট আটকে গেলে:\nCheck Payment চাপুন। আবার টাকা পাঠাবেন না; প্রয়োজনে Support নিন। PIN, OTP বা private key দেবেন না।",
  "guide_delivery": "যেভাবে কিনবেন:\n১. Browse Shop থেকে ক্যাটেগরি ও প্রোডাক্ট বেছে নিন।\n২. বিবরণ, দাম ও স্টক দেখুন। Buy Now চাপুন।\n৩. পরিমাণ বেছে পেমেন্ট নিশ্চিত করুন।\n\nযেভাবে ডেলিভারি পাবেন:\nপেমেন্ট নিশ্চিত হলে উপলব্ধ প্রোডাক্ট .txt ডকুমেন্টে পাঠানো হবে। এতে আপনার কেনা অ্যাকাউন্ট, কোড বা লিংক থাকবে।\n\nআবার ফাইল নিতে চাইলে:\nMy Orders খুলে সংশ্লিষ্ট অর্ডারের Download বাটন চাপুন। আবার পেমেন্ট করতে হবে না। ডকুমেন্টের Copy Order ID দিয়ে অর্ডার ID কপি করতে পারবেন।\n\nডেলিভারি না এলে:\nMy Orders-এ অবস্থা দেখুন। Check Delivery থাকলে চাপুন। সাপ্লায়ার বা স্টকের সমস্যায় সময় লাগতে পারে। একই অর্ডারে আবার টাকা পাঠাবেন না।\n\nসহায়তা লাগলে:\nডকুমেন্টের Get Help চাপুন। সমস্যাটি লিখে পাঠান। অ্যাডমিন আপনার অর্ডার ও প্রোডাক্টসহ অভিযোগ দেখবেন এবং টিকিটে উত্তর দিতে পারবেন।",
  "guide_warranty": "কেনার আগে:\nপ্রোডাক্টের বিবরণে ওয়ারেন্টির মেয়াদ, শর্ত ও ব্যবহারের নির্দেশনা দেখুন। প্রোডাক্টভেদে শর্ত আলাদা হতে পারে।\n\nশর্ত পরিষ্কার না হলে:\nকেনার আগে Support থেকে নিশ্চিত হয়ে নিন।\n\nসমস্যা হলে:\nসংশ্লিষ্ট অর্ডারের Get Help থেকে কী সমস্যা হচ্ছে লিখুন। অ্যাডমিন সেই প্রোডাক্টের শর্ত অনুযায়ী যাচাই করবেন।\n\nযা পাঠাবেন না:\nPIN, OTP বা অ্যাকাউন্টের পাসওয়ার্ড সাপোর্টে পাঠাবেন না।",
  "guide_refund": "রিফান্ড চাইতে হলে:\nসংশ্লিষ্ট অর্ডারের Get Help চাপুন। কী সমস্যা হয়েছে ও কখন হয়েছে, সংক্ষেপে লিখুন।\n\nযেভাবে যাচাই হবে:\nঅ্যাডমিন অর্ডার, পেমেন্ট ও প্রোডাক্টের শর্ত দেখে সিদ্ধান্ত জানাবেন। টিকিট করলেই রিফান্ড নিশ্চিত হয় না।\n\nউত্তর কোথায় পাবেন:\nMy Support Tickets থেকে টিকিটের অবস্থা ও অ্যাডমিনের উত্তর দেখুন।\n\nপেমেন্ট আটকে থাকলে:\nএকই অর্ডারে আবার টাকা পাঠাবেন না। পেমেন্টের রসিদ সংরক্ষণ করুন এবং Support নিন।",
  "guide_faq": "• টাকা কেটেছে, প্রোডাক্ট আসেনি? My Orders-এ অবস্থা দেখুন। Check Delivery থাকলে চাপুন। প্রয়োজন হলে সংশ্লিষ্ট অর্ডারের Get Help থেকে সমস্যা জানান।\n• কেনা প্রোডাক্ট আবার ডাউনলোড করব কীভাবে? My Orders খুলে সংশ্লিষ্ট অর্ডারের Download বাটন চাপুন। নতুন করে পেমেন্ট লাগবে না।\n• ডিপোজিট যোগ হয়নি, কী করব? মাধ্যম, পরিমাণ ও রসিদের ID মিলিয়ে Check Payment চাপুন। না হলে Support নিন; আবার টাকা পাঠাবেন না।\n• একই TrxID আবার ব্যবহার করা যায়? না। একবার ভেরিফাই হওয়া পেমেন্টের ID দিয়ে আবার ব্যালেন্স যোগ বা অন্য অর্ডার পেমেন্ট করা যায় না।\n• প্রোডাক্টের দাম বদলায় কেন? সাপ্লায়ার দাম বদলালে এখানে আপডেট হয়। পেমেন্টের আগে সর্বশেষ মোট দাম দেখে নিন।\n• ব্যালেন্সের হিসাব কোথায় পাব? Profile → Balance History-তে টাকা যোগ ও কাটার হিসাব দেখুন।"
};
const GUIDE_DEFAULTS={
  "guide_title": "User Guide / FAQ",
  "guide_intro": "Everything you need to know about shopping, payments and delivery.\n\nChoose a topic below to get started.",
  "guide_payment": "Current rate: 1 USD = {rate} BDT\n\nWallet Payment:\nAdd funds through Deposit. Select a product and quantity, then confirm with Wallet Payment.\n\nDirect Payment:\nUse the method, account and exact amount shown on your order. Submit the ID from that payment receipt.\n\nbKash / Nagad:\nUse Send Money to the number shown. Submit the TrxID within 60 minutes. Verification uses the SMS received by the store.\n\nRocket:\nReply to the payment instructions with your Transaction ID within 60 minutes. Admin approval is required.\n\nBinance Pay:\nSend USDT to the Pay ID shown. Submit the receipt Order/Transaction ID within 10 minutes of payment. Maximum deposit: $10.\n\nBEP20 USDT:\nUse BNB Smart Chain only. The full amount must arrive; pay fees separately. Submit the TxHash within 10 minutes. Requires 12 confirmations.\n\nRedeem Code:\nOpen Deposit → Redeem Code and enter a valid code. Each code can be used once.\n\nPayment not confirmed?\nTap Check Payment. Do not pay again. Contact Support if needed. Never share PINs, OTPs or private keys.",
  "guide_delivery": "Place an order:\n1. Open Browse Shop and select a category and product.\n2. Check the description, price and stock. Tap Buy Now.\n3. Choose the quantity and confirm your payment.\n\nReceive your product:\nAfter payment confirmation, available products are sent as a .txt document containing your purchased accounts, codes or links.\n\nDownload again:\nOpen My Orders and tap the order’s Download button. No new payment is needed. Use Copy Order ID below the document to copy your ID.\n\nDelivery pending?\nCheck the status in My Orders. Tap Check Delivery if available. Supplier or stock issues may cause a delay. Do not pay for the same order again.\n\nNeed help?\nTap Get Help below the document and describe the issue. Admin can see your order and product, and reply through the ticket.",
  "guide_warranty": "Before buying:\nRead the product description for warranty duration, terms and usage instructions. Terms may differ by product.\n\nUnsure about the terms?\nContact Support before purchasing.\n\nHaving a problem?\nUse Get Help on the relevant order and describe the issue. Admin will review it against the product’s terms.\n\nKeep your account safe:\nDo not send PINs, OTPs or account passwords to support.",
  "guide_refund": "Request a review:\nTap Get Help on the relevant order. Briefly describe what happened and when.\n\nHow requests are reviewed:\nAdmin checks your order, payment and product terms before giving a decision. Opening a ticket does not guarantee a refund.\n\nFind the reply:\nOpen My Support Tickets to check the ticket status and admin’s response.\n\nPayment pending?\nDo not pay for the same order again. Keep your receipt and contact Support.",
  "guide_faq": "• Payment taken but no product? Check My Orders. Tap Check Delivery if available, or use Get Help on the relevant order.\n• How do I download my product again? Open My Orders and tap the order’s Download button. No new payment is needed.\n• My deposit has not arrived. What should I do? Check the payment method, amount and receipt ID, then tap Check Payment. Contact Support if needed. Do not pay again.\n• Can I reuse a TrxID? No. A verified payment ID cannot credit your balance again or pay for another order.\n• Why did the price change? Supplier price changes are reflected in the store. Check the latest total before paying.\n• Where can I check my balance history? Open Profile → Balance History to see funds added and deducted."
};
function formatGuideBody(value){
  return escapeHtml(value).replace(/^([^\n]+[:：])$/gm,'<b>$1</b>');
}
function formatGuideFaq(value){
  return String(value).trim().split(/\n\s*\n|\n(?=\s*[•●])/).map(block=>{
    const plain=block.trim().replace(/^[•●]\s*/,''),end=plain.search(/[?؟]/);
    if(end<0)return escapeHtml(plain);
    const question=plain.slice(0,end+1).replace(/^(?:প্রশ্ন|Question|Q)\s*[:：]\s*/i,''),answer=plain.slice(end+1).trim().replace(/^(?:উত্তর|Answer|A)\s*[:：]\s*/i,'');
    return `<b>Question: ${escapeHtml(question)}</b>${answer?'\nAnswer: '+escapeHtml(answer):''}`;
  }).join('\n\n');
}
async function showUserGuide(env,chatId,section='menu',messageId=null){
  const labels={payment:'Payment Rules',delivery:'Orders & Delivery',warranty:'Warranty',refund:'Refund Policy',faq:'FAQ'};
  const title=await getSetting(env,'guide_title',GUIDE_DEFAULTS.guide_title),intro=await getSetting(env,'guide_intro',GUIDE_DEFAULTS.guide_intro);
  let text=`📖 <b>${escapeHtml(title)}</b>\n\n<blockquote>${escapeHtml(intro)}</blockquote>`;
  if(section==='payment'){
    const rate=await getSetting(env,'usd_to_bdt_rate','125'),body=await getSetting(env,'guide_payment',GUIDE_DEFAULTS.guide_payment);
    text=`💳 <b>Payment Rules</b>\n\n${formatGuideBody(body.replaceAll('{rate}',String(rate)))}`;
  }else if(section==='faq'){
    text=`📖 <b>FAQ</b>\n\n${formatGuideFaq(await getSetting(env,'guide_faq',GUIDE_DEFAULTS.guide_faq))}`;
  }else if(labels[section])text=`📖 <b>${labels[section]}</b>\n\n${formatGuideBody(await getSetting(env,'guide_'+section,GUIDE_DEFAULTS['guide_'+section]))}`;
  const buttons=section==='menu'?[
    [{text:'💳 Payment Rules',callback_data:'guide_payment',style:'primary'},{text:'📦 Orders & Delivery',callback_data:'guide_delivery',style:'primary'}],
    [{text:'🛡️ Warranty',callback_data:'guide_warranty'},{text:'↩️ Refund Policy',callback_data:'guide_refund'}],
    [{text:'❓ Questions & Answers',callback_data:'guide_faq',style:'primary'}]
  ]:[[{text:'‹ Back to Guide',callback_data:'user_guide'}]];
  buttons.push([{text:'🛍️ Browse Shop',callback_data:'shop'},{text:'💬 Support',callback_data:'support'}],[{text:'🏠 Main Menu',callback_data:'home'}]);
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function handleGuideCallback(env,chatId,data,messageId){
  if(data==='user_guide'){await clearBinanceInput(env,chatId);await clearTicketInput(env,chatId);if(adminUserAccess(env,chatId))await clearAdminState(env,chatId);await showUserGuide(env,chatId,'menu',messageId);return true;}
  let match=data.match(/^guide_(payment|delivery|warranty|refund|faq)$/);if(match){await showUserGuide(env,chatId,match[1],messageId);return true;}
  if(!adminUserAccess(env,chatId))return false;
  if(data==='adm_guide'){await clearAdminState(env,chatId);await editMsg(env,chatId,messageId,'📖 <b>User Guide Settings</b>\n\nCustomize the guide title, introduction, payment instructions, delivery, warranty, refund and FAQ text. Editing these descriptions does not change payment verification rules.',Object.keys(GUIDE_DEFAULTS).map(key=>[{text:'Edit '+key.slice(6),callback_data:'adm_edit_'+key}]).concat([[{text:'Preview Guide',callback_data:'user_guide'},{text:'Admin Panel',callback_data:'admin_panel'}]]));return true;}
  match=data.match(/^adm_edit_(guide_(title|intro|payment|delivery|warranty|refund|faq))$/);if(match){const current=await getSetting(env,match[1],GUIDE_DEFAULTS[match[1]]);await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'awaiting_guide_text',?)").bind(chatId,match[1]).run();await editMsg(env,chatId,messageId,`Current text:\n${escapeHtml(current)}\n\nSend replacement plain text (up to ${match[1]==='guide_title'?80:1200} characters).${match[1]==='guide_payment'?' Use {rate} to show the current BDT rate.':''}`,[[{text:'Reset to Default',callback_data:`adm_reset_${match[1]}`}],[{text:'Cancel',callback_data:'adm_guide'}]]);return true;}
  match=data.match(/^adm_reset_(guide_(title|intro|payment|delivery|warranty|refund|faq))$/);if(match){await env.DB.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').bind(match[1],GUIDE_DEFAULTS[match[1]]).run();await clearAdminState(env,chatId);await sendMsg(env,chatId,'Guide section restored to default.',[[{text:'Preview',callback_data:['guide_title','guide_intro'].includes(match[1])?'user_guide':match[1]},{text:'Guide Settings',callback_data:'adm_guide'}]]);return true;}return false;
}
async function handleGuideText(env,chatId,text,state){
  if(!adminUserAccess(env,chatId)||state.state!=='awaiting_guide_text')return false;
  const value=String(text).trim();if(!Object.hasOwn(GUIDE_DEFAULTS,state.data)||!value||value.length>(state.data==='guide_title'?80:1200)||escapeHtml(value).length>2800){await sendMsg(env,chatId,'Send non-empty plain text: title up to 80 characters, other sections up to 1200 characters.');return true;}
  await env.DB.batch([env.DB.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').bind(state.data,value),env.DB.prepare("DELETE FROM admin_states WHERE user_id=? AND state='awaiting_guide_text' AND data=?").bind(chatId,state.data)]);await sendMsg(env,chatId,'Guide text saved.',[[{text:'Preview',callback_data:['guide_title','guide_intro'].includes(state.data)?'user_guide':state.data},{text:'Guide Settings',callback_data:'adm_guide'}]]);return true;
}
async function runPeriodicSync(env,force=false){
  try{
    await ensureDbReady(env.DB);if(!env.DB)return {status:503,body:{success:false,error:'Database unavailable'}};
    if(!force&&await getSetting(env,'periodic_sync_enabled','1')!=='1')return {status:200,body:{success:true,skipped:true,reason:'paused'}};
    const token=crypto.randomUUID(),now=Date.now();
    const claim=await env.DB.prepare('UPDATE periodic_sync_status SET lease_token=?,lease_until=?,last_attempt_ms=? WHERE id=1 AND lease_until<?').bind(token,now+90000,now,now).run();
    if(!claim.meta?.changes)return {status:202,body:{success:true,skipped:true,reason:'already_running'}};
    try{
      const result=await syncExternalProducts(env,null,null,false,null,true);
      const error=result.success?null:await safeDiagnostic(env,result.message||'Provider sync failed');
      await env.DB.prepare('UPDATE periodic_sync_status SET lease_until=0,last_success_ms=CASE WHEN ?=1 THEN ? ELSE last_success_ms END,last_error=? WHERE id=1 AND lease_token=?').bind(result.success?1:0,Date.now(),error,token).run();
      return {status:result.success?200:502,body:{success:result.success,message:result.success?'Catalog sync completed.':'Catalog sync failed; check admin sync status.'}};
    }catch(error){await env.DB.prepare('UPDATE periodic_sync_status SET lease_until=0,last_error=? WHERE id=1 AND lease_token=?').bind(await safeDiagnostic(env,error?.message),token).run();return {status:502,body:{success:false,message:'Catalog sync failed; check admin sync status.'}};}
  }catch{return {status:503,body:{success:false,message:'Sync service unavailable'}};}
}
async function showPeriodicStatus(env,chatId,messageId=null){
  if(!adminUserAccess(env,chatId))return;await clearAdminState(env,chatId);const enabled=await getSetting(env,'periodic_sync_enabled','1'),state=await env.DB.prepare('SELECT * FROM periodic_sync_status WHERE id=1').first();
  const time=ms=>ms?paymentDashboardTime(new Date(ms).toISOString()):'Not recorded';
  const text=`⏱️ <b>Automatic Sync</b>\n\nProcessing: ${enabled==='1'?'ON':'OFF'}\nLast attempt: ${time(state?.last_attempt_ms)} (Dhaka)\nLast successful sync: ${time(state?.last_success_ms)} (Dhaka)\nState: ${state?.lease_until>Date.now()?'Running':'Idle'}\nLast issue: ${escapeHtml(state?.last_error||'None recorded')}\n\nThe repository scheduler requests sync approximately every 5 minutes when GitHub Actions is enabled. GitHub may delay scheduled jobs. ON allows processing; the timestamps confirm whether an external schedule actually reached this bot. The job also resumes queued notifications.`;
  const buttons=[[{text:enabled==='1'?'Pause Auto Sync':'Enable Auto Sync',callback_data:'adm_periodic_toggle'}],[{text:'Run Now',callback_data:'adm_periodic_run'}],[{text:'🔄 Refresh',callback_data:'adm_periodic'},{text:'Admin Panel',callback_data:'admin_panel'}]];
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function handlePeriodicCallback(env,chatId,data,messageId){
  if(!adminUserAccess(env,chatId)||!['adm_periodic','adm_periodic_toggle','adm_periodic_run'].includes(data))return false;
  if(data==='adm_periodic_toggle')await env.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('periodic_sync_enabled',CASE WHEN COALESCE((SELECT value FROM settings WHERE key='periodic_sync_enabled'),'1')='1' THEN '0' ELSE '1' END)").run();
  if(data==='adm_periodic_run'){await runPeriodicSync(env,true);if(env.__executionContext?.waitUntil)env.__executionContext.waitUntil(drainAllNotices(env).catch(()=>{}));}
  await showPeriodicStatus(env,chatId,messageId);return true;
}


function orderDisplayId(order){return /^[1-9]\d{4}$/.test(String(order?.public_order_id||''))?String(order.public_order_id):String(order?.id||'').padStart(5,'0');}
async function getPublicOrderId(env,id){const row=await env.DB.prepare('SELECT id,public_order_id FROM orders WHERE id=?').bind(id).first();return orderDisplayId(row||{id});}

async function sendOrderDocument(env,chatId,order,content){
  const displayId=orderDisplayId(order);
  if(!content){await sendMsg(env,chatId,'Delivery file unavailable. Please contact support with your Order ID.');return {ok:false};}
  const document={filename:`Order-${displayId}.txt`,content:`Order ID: ${displayId}\nProduct: ${order.product_name||order.name||'Product'}\nQuantity: ${order.quantity||1}\n\n${content}`};
  const result=await callTg(env,'sendDocument',{chat_id:chatId,document,caption:`📄 Your purchased product · Order ID <code>${displayId}</code>`,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'📋 Copy Order ID',copy_text:{text:displayId}}],[{text:'📦 View Orders',callback_data:'my_orders'},{text:'🎫 Get Help',callback_data:`ticket_new_${order.id}`}]]}});
  if(!result?.ok)await sendMsg(env,chatId,`Your payment and product are saved. Telegram could not confirm the file for Order ID ${displayId}. Download it again from My Orders; do not pay again.`,[[{text:'📄 Download Document',callback_data:`order_document_${order.id}`}]]);
  return result;
}
async function sendSavedOrderDocument(env,chatId,order){
  let content=order.delivery_data;
  if(!content){const {results}=await env.DB.prepare('SELECT item_data FROM inventory WHERE order_id=? AND is_sold=1 ORDER BY id').bind(order.id).all();content=results.map(item=>item.item_data).join('\n\n');}
  return sendOrderDocument(env,chatId,order,content);
}

async function showProductAlertPreferences(env,chatId,messageId=null){
  const user=await env.DB.prepare('SELECT product_alerts,product_alert_scope FROM users WHERE user_id=?').bind(chatId).first();
  const count=await env.DB.prepare('SELECT COUNT(*) n FROM product_follows WHERE user_id=?').bind(chatId).first();
  const mode=user?.product_alerts===0?'off':user?.product_alert_scope==='following'?'following':'all';
  const options=[['all','All Products (Default)'],['following','Followed Only'],['off','Turn Off Alerts']];
  const buttons=options.map(([key,label])=>[{text:`${mode===key?'✓ ':''}${label}`,callback_data:`product_alert_mode_${key}`}]);
  buttons.push([{text:`⭐ Followed Products (${count.n})`,callback_data:'product_follows_0'}],[{text:'👤 My Profile',callback_data:'profile'}]);
  const text=`🔔 <b>Product Notifications</b>\n\nCurrent: <b>${options.find(([key])=>key===mode)[1]}</b>\n\n<b>Followed Only</b> — stock added, stock finished and price changes only for products you follow. With no follows, you receive no private product alerts.\n\n<b>All Products (Default)</b> — new products, stock updates and price changes across the store, including products you do not follow.\n\n<b>Turn Off Alerts</b> — pause all private product alerts without removing your follows.\n\nTo receive only selected products, choose Followed Only and manage your follows below. Following or unfollowing a product never changes your notification mode or turns alerts on. Only Notification Settings can switch to Followed Only. Channel updates for all products are separate.`;
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function showFollowedProducts(env,chatId,page=0,messageId=null){
  page=adminUserPage(page);
  const {results}=await env.DB.prepare('SELECT f.product_id,p.name,p.is_active FROM product_follows f LEFT JOIN products p ON p.id=f.product_id WHERE f.user_id=? ORDER BY f.product_id DESC LIMIT 11 OFFSET ?').bind(chatId,page*10).all();
  const buttons=[];
  for(const product of results.slice(0,10)){
    buttons.push([{text:product.is_active===1?String(product.name).slice(0,100):`Unfollow · ${String(product.name||'Unavailable product').slice(0,70)}`,callback_data:product.is_active===1?`prod_${product.product_id}`:`product_unfollow_list_${product.product_id}_${page}`}]);
  }
  if(page>0||results.length>10)buttons.push([{text:'‹ Previous',callback_data:`product_follows_${Math.max(0,page-1)}`},{text:'Next ›',callback_data:`product_follows_${results.length>10?page+1:page}`}]);
  buttons.push([{text:'🔔 Notification Settings',callback_data:'product_alert_settings'},{text:'🛍️ Browse Shop',callback_data:'shop'}],[{text:'👤 My Profile',callback_data:'profile'},{text:'🏠 Main Menu',callback_data:'home'}]);
  const text=`⭐ <b>Followed Products</b> · Page ${page+1}\n\n${results.length?'Open a product to view details or tap Unfollow Product inside it.':'No followed products on this page. Open a product in the shop and tap Follow Stock &amp; Price.'}`;
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}
async function handleProductFollowCallback(env,chatId,data,messageId){
  const restock=data.match(/^restock_request_(\d+)$/);
  if(restock){
    const product=await env.DB.prepare('SELECT p.*,CASE WHEN p.is_external=1 THEN COALESCE(p.api_stock,0) ELSE (SELECT COUNT(*) FROM inventory WHERE product_id=p.id AND is_sold=0) END AS current_stock FROM products p WHERE p.id=? AND p.is_active=1').bind(restock[1]).first();
    if(!product){await sendMsg(env,chatId,'This product is no longer available.',[[{text:'Back to Shop',callback_data:'shop'}]]);return true;}
    if(Number(product.current_stock)>0){await sendProductDetailView(env,chatId,product.id,messageId);return true;}
    const saved=await env.DB.batch([
      env.DB.prepare("INSERT INTO restock_requests(user_id,product_id) VALUES(?,?) ON CONFLICT(user_id,product_id) DO UPDATE SET status='pending',created_at=CURRENT_TIMESTAMP WHERE restock_requests.status!='pending'").bind(chatId,product.id),
      env.DB.prepare('INSERT OR IGNORE INTO product_follows(user_id,product_id) VALUES(?,?)').bind(chatId,product.id)
    ]);
    if(saved[0].meta?.changes)await sendMsg(env,env.ADMIN_ID,`🔔 <b>Restock Requested</b>\n\nProduct: <b>${escapeHtml(productDisplayName(product))}</b>\nCustomer ID: <code>${chatId}</code>\nSource: ${product.is_external?'Supplier API':'Local inventory'}\n\nNo payment or order was created.`,[[{text:product.is_external?'API Center':'Add Stock',callback_data:product.is_external?'adm_api_menu':`adm_addstock_${product.id}`}]]);
    const user=await env.DB.prepare('SELECT product_alerts FROM users WHERE user_id=?').bind(chatId).first();
    await editMsg(env,chatId,messageId,`✅ <b>Restock Request Saved</b>\n\n${escapeHtml(productDisplayName(product))}\n\nYou are now following this product. ${user?.product_alerts===0?'Your private alerts are OFF. Turn them on in Notification Settings to receive stock updates.':'We will notify you when stock returns, according to your Notification Settings.'}\n\nNo payment was taken and no order was placed.`,[[{text:'Back to Product',callback_data:`prod_${product.id}`}],[{text:'🔔 Notification Settings',callback_data:'product_alert_settings'}]]);return true;
  }

  if(data==='product_alert_settings'){await showProductAlertPreferences(env,chatId,messageId);return true;}
  let match=data.match(/^product_alert_mode_(all|following|off)$/);
  if(match){await env.DB.prepare("UPDATE users SET product_alerts=?,product_alert_scope=CASE WHEN ?='off' THEN product_alert_scope ELSE ? END,product_alert_preference_set=1 WHERE user_id=?").bind(match[1]==='off'?0:1,match[1],match[1],chatId).run();await showProductAlertPreferences(env,chatId,messageId);return true;}
  match=data.match(/^product_follows_(\d+)$/);if(match){await showFollowedProducts(env,chatId,match[1],messageId);return true;}
  match=data.match(/^product_unfollow_list_(\d+)_(\d+)$/);
  if(match){await env.DB.prepare('DELETE FROM product_follows WHERE user_id=? AND product_id=?').bind(chatId,match[1]).run();await showFollowedProducts(env,chatId,match[2],messageId);return true;}
  match=data.match(/^product_(follow|unfollow)_(\d+)$/);if(!match)return false;
  if(match[1]==='follow'){
    await env.DB.prepare('INSERT OR IGNORE INTO product_follows(user_id,product_id) SELECT ?,id FROM products WHERE id=? AND is_active=1').bind(chatId,match[2]).run();
  }else await env.DB.prepare('DELETE FROM product_follows WHERE user_id=? AND product_id=?').bind(chatId,match[2]).run();
  await sendProductDetailView(env,chatId,match[2],messageId);return true;
}


const MOBILE_BRIDGE_HEALTH_SCHEMA=`CREATE TABLE IF NOT EXISTS mobile_bridge_health(device_id TEXT PRIMARY KEY,last_contact_ms INTEGER NOT NULL DEFAULT 0,last_result TEXT,last_check_ms INTEGER NOT NULL DEFAULT 0,last_heartbeat_ms INTEGER NOT NULL DEFAULT 0,last_receipt_ms INTEGER NOT NULL DEFAULT 0,app_version TEXT,forwarding_enabled INTEGER,sms_permission INTEGER,queue_pending INTEGER,battery_exempt INTEGER,last_capture_ms INTEGER NOT NULL DEFAULT 0,capture_state TEXT,capture_method TEXT,last_error TEXT,last_error_ms INTEGER NOT NULL DEFAULT 0)`;
async function recordBridgeHealth(env,result,fields={}){
  try{
    await env.DB.prepare(MOBILE_BRIDGE_HEALTH_SCHEMA).run();
    const values={last_contact_ms:Date.now(),last_result:result,...fields,...(result==='ok'?{}:{last_error:result,last_error_ms:Date.now()})};
    const keys=Object.keys(values);
    await env.DB.prepare(`INSERT INTO mobile_bridge_health(device_id,${keys.join(',')}) VALUES(?,${keys.map(()=>'?').join(',')}) ON CONFLICT(device_id) DO UPDATE SET ${keys.map(key=>`${key}=excluded.${key}`).join(',')}`).bind(env.MOBILE_BRIDGE_DEVICE_ID,...Object.values(values)).run();
    return true;
  }catch{console.error('Bridge health recording unavailable; payment handling continues.');return false;}
}
function bridgeHealthTime(ms){return Number(ms)>0?paymentDashboardTime(new Date(Number(ms)).toISOString())+' (Dhaka)':'Not received';}
function bridgeHealthFlag(value){return value===1?'ON':value===0?'OFF':'Unknown';}
function bridgeIssueDescription(code){return ({receiving_account_mismatch:'App receiving number differs from bot Payment Settings',invalid_account:'Receiving number in app is invalid',invalid_setup:'No receiving account configured in app',receipt_conflict:'An event/transaction conflicts with an existing SMS record',invalid_receipt:'Payment receipt format or timestamps were rejected'})[code]||String(code||'None');}
function bridgeCaptureDescription(code){return ({none:'No company SMS reported yet',unknown:'Older app capture; update required for details',forwarding_off:'Company SMS arrived while forwarding was OFF',format_mismatch:'Company SMS arrived, but incoming-payment format did not match',time_mismatch:'SMS date/time did not match the phone clock',invalid_account:'Receiving number missing or invalid in app',queued:'Payment SMS parsed and saved to encrypted queue',queue_full:'Phone queue full; payment record could not be saved',capture_failed:'Phone could not process or store the SMS'})[code]||'Not reported';}
function bridgeMaskedAccount(value){return /^01[3-9]\d{8}$/.test(String(value))?String(value).slice(0,3)+'*****'+String(value).slice(-3):'Not configured';}
async function describeMobileEvidence(env,invoice){
  if(!invoice.trx_id)return Date.now()>invoice.expires_ms?'No Transaction ID submitted; payment window has ended.':'Waiting for the customer to submit a Transaction ID.';
  const receipt=await env.DB.prepare('SELECT * FROM mobile_bridge_receipts WHERE method=? AND trx_id=?').bind(invoice.method,invoice.trx_id).first();
  if(!receipt)return 'No matching payment SMS has reached the server for this method and Transaction ID.';
  const prefix=`SMS received by server: ${paymentDashboardTime(receipt.created_at)} (Dhaka). `;
  const claim=await env.DB.prepare('SELECT invoice_type,invoice_id FROM mobile_payment_claims WHERE method=? AND trx_id=?').bind(invoice.method,invoice.trx_id).first();
  if(claim)return prefix+(claim.invoice_type===invoice.invoice_type&&Number(claim.invoice_id)===Number(invoice.invoice_id)?'Already matched to this invoice.':'Transaction already used for another invoice.');
  if(receipt.device_id!==env.MOBILE_BRIDGE_DEVICE_ID)return prefix+'Receiving device does not match the enrolled phone.';
  if(receipt.account!==invoice.account)return prefix+'Receiving account does not match the invoice.';
  if(receipt.amount_minor!==invoice.amount_minor)return prefix+`Amount mismatch: expected ${(invoice.amount_minor/100).toFixed(2)} BDT; received ${(receipt.amount_minor/100).toFixed(2)} BDT.`;
  if(receipt.paid_at<Math.floor(invoice.created_ms/60000)*60000)return prefix+'Payment was made before this invoice was created.';
  if(receipt.paid_at>invoice.expires_ms)return prefix+'Payment was made after the invoice payment window ended.';
  if(receipt.received_at<invoice.created_ms-60000)return prefix+'Phone SMS timestamp predates this invoice.';
  if(!invoice.submitted_at)return prefix+'Transaction ID submission time is missing.';
  if(invoice.submitted_at>invoice.expires_ms)return prefix+'Transaction ID was submitted after the payment window ended.';
  return prefix+'SMS fields match. Check the last verification result, invoice status and delivery status; this screen does not approve payments.';
}
async function showPaymentHealth(env,chatId,messageId=null){
  if(!adminUserAccess(env,chatId))return;
  const [health,sms,summary,issues,bkash,nagad,rocket,binance,bep20,auto]=await Promise.all([
    env.DB.prepare('SELECT * FROM mobile_bridge_health WHERE device_id=?').bind(env.MOBILE_BRIDGE_DEVICE_ID||'').first(),
    env.DB.prepare('SELECT method,trx_id,amount_minor,status,created_at,received_at FROM mobile_bridge_receipts WHERE device_id=? ORDER BY created_at DESC,received_at DESC,event_id DESC LIMIT 3').bind(env.MOBILE_BRIDGE_DEVICE_ID||'').all(),
    env.DB.prepare(`SELECT COUNT(*) pending,COUNT(*) submitted FROM mobile_payment_invoices m JOIN ${paymentDashboardSource()} x ON x.kind=m.invoice_type AND x.id=m.invoice_id LEFT JOIN payment_verification_events e ON e.invoice_type=m.invoice_type AND e.invoice_id=m.invoice_id WHERE m.status='pending' AND x.status='pending' AND COALESCE(NULLIF(TRIM(m.trx_id),''),NULLIF(TRIM(e.trx_id),''),NULLIF(TRIM(x.trx_id),''),'')<>''`).first(),
    env.DB.prepare(`SELECT e.*,o.public_order_id FROM payment_verification_events e JOIN ${paymentDashboardSource()} x ON x.kind=e.invoice_type AND x.id=e.invoice_id LEFT JOIN orders o ON e.invoice_type='order' AND o.id=e.invoice_id WHERE e.reason<>'verified' AND x.status='pending' ORDER BY e.updated_at DESC,e.invoice_type,e.invoice_id DESC LIMIT 3`).all(),
    getSetting(env,'bkash_num',''),getSetting(env,'nagad_num',''),getSetting(env,'rocket_num',''),getSetting(env,'binance_id',''),getSetting(env,'bep20_addr',''),getSetting(env,'binance_auto_verify','1')
  ]);
  const configured=Boolean(env.MOBILE_BRIDGE_SECRET?.length>=32&&env.MOBILE_BRIDGE_DEVICE_ID);
  const fresh=Number(health?.last_heartbeat_ms)>Date.now()-45*60000;
  const state=!configured?'Not configured':!health?.last_contact_ms?'No authenticated contact recorded since tracking began':!health.last_heartbeat_ms?'Contact recorded; heartbeat unavailable':!fresh?'Heartbeat stale — check the phone':health.last_result!=='ok'?'Phone contacted server; configuration needs attention':health.forwarding_enabled===0?'Phone reported forwarding OFF':health.sms_permission===0?'Phone reported SMS permission missing':'Recent heartbeat received';
  let text=`📡 <b>Payment &amp; SMS Bridge Status</b>\n\n<b>${escapeHtml(state)}</b>\nLast contact: ${bridgeHealthTime(health?.last_contact_ms)}\nLast heartbeat: ${bridgeHealthTime(health?.last_heartbeat_ms)}\nApp: ${escapeHtml(health?.app_version||'Not reported')} · Queue: ${health?.queue_pending??'Unknown'}\nForwarding: ${bridgeHealthFlag(health?.forwarding_enabled)} · SMS permission: ${bridgeHealthFlag(health?.sms_permission)}\nBattery unrestricted: ${bridgeHealthFlag(health?.battery_exempt)}\n\n<b>Phone SMS capture</b>\n${health?.capture_method==='bkash'?'bKash · ':health?.capture_method==='nagad'?'Nagad · ':''}${escapeHtml(bridgeCaptureDescription(health?.capture_state))}\nReported at: ${bridgeHealthTime(health?.last_capture_ms)}\nLast accepted SMS upload: ${health?.last_receipt_ms?bridgeHealthTime(health.last_receipt_ms):sms.results?.[0]?paymentDashboardTime(sms.results[0].created_at)+' (Dhaka; historical record)':'Not received'}\n`;
  if(health?.last_error)text+=`Last bridge issue: ${escapeHtml(bridgeIssueDescription(health.last_error))}\nIssue time: ${bridgeHealthTime(health.last_error_ms)}\n`;
  text+=`\n<b>Payment configuration</b>\nbKash: ${bridgeMaskedAccount(bkash)} · ${configured?'Bridge configured':'Bridge missing'}\nNagad: ${bridgeMaskedAccount(nagad)} · ${configured?'Bridge configured':'Bridge missing'}\nRocket: ${bridgeMaskedAccount(rocket)} · Manual review / Add Balance\nBinance Pay: ${auto==='1'?(env.BINANCE_API_KEY&&env.BINANCE_API_SECRET&&/^\d+$/.test(binance)?'API credentials configured':'Setup incomplete'):'Manual verification'}\nBEP20: ${/^0x[a-fA-F0-9]{40}$/.test(bep20)?'Receiving address configured':'Setup incomplete'}\n\n<b>Mobile payments</b>\nPending: ${summary?.pending||0} · IDs submitted: ${summary?.submitted||0}\n`;
  if(sms.results?.length){text+='\n<b>Latest server SMS records</b>\n';for(const row of sms.results)text+=`${row.method.toUpperCase()} · ${(row.amount_minor/100).toFixed(2)} BDT · <code>${escapeHtml(row.trx_id)}</code> · ${row.status==='claimed'?'Matched':'Not matched'}\n`;}
  else text+='\nNo payment SMS records stored for the enrolled phone.\n';
  if(issues.results?.length){text+='\n<b>Recent verification issues</b>\n';for(const issue of issues.results)text+=`${issue.invoice_type==='order'?'Order':'Deposit'} ${issue.public_order_id||issue.invoice_id} · ${escapeHtml(issue.method)}: ${escapeHtml(paymentDashboardReason(issue.reason))}\n`;}
  text+='\nBridge v0.8 or later is required for periodic phone status; older apps can still send payment receipts. Heartbeat updates approximately every 15 minutes; Android may delay background jobs. A recent report does not prove the phone is online now. Configuration checks do not test live Binance/RPC access.';
  const buttons=[[{text:'🔄 Refresh Status',callback_data:'adm_payment_health'}],[{text:'Verification Issues',callback_data:'adm_paydash_issues_0'},{text:'Pending Payments',callback_data:'adm_paydash_pending_0'}],[{text:'Payment Settings',callback_data:'adm_payment_settings'},{text:'Admin Panel',callback_data:'admin_panel'}],[{text:'📱 Bridge v1.1 APK',url:'https://github.com/fajlayrabby0k/Digital-Product-TeliBot/raw/refs/heads/main/downloads/telibot-receipt-bridge-v1.1.apk'}]];
  for(const issue of issues.results||[])buttons.splice(1,0,[{text:`Inspect ${issue.invoice_type==='order'?'Order':'Deposit'} ${issue.public_order_id||issue.invoice_id}`,callback_data:`adm_paydetail_${issue.invoice_type}_${issue.invoice_id}`}]);
  return messageId?editMsg(env,chatId,messageId,text,buttons):sendMsg(env,chatId,text,buttons);
}


function channelNewProductInsert(where){return `INSERT OR IGNORE INTO channel_notice_events(event_key,product_id,kind,channel_id) SELECT 'new:'||p.id,p.id,'new_product',(SELECT value FROM settings WHERE key='force_channel_username') FROM products p WHERE ${where} AND p.is_active=1 AND COALESCE((SELECT value FROM settings WHERE key='force_channel_username'),'')<>'' AND COALESCE((SELECT value FROM settings WHERE key='channel_notifications_enabled'),'1')='1' AND COALESCE((SELECT value FROM settings WHERE key='channel_notice_new_product'),'1')='1'`;}
async function channelPostError(env,result){const code='Telegram '+(Number(result?.error_code)||'unavailable'),detail=result?.description||result?.error;return detail?code+': '+await safeDiagnostic(env,detail):code;}
async function checkChannelConnection(env){
  const target=await getSetting(env,'force_channel_username',''),normalized=normalizeNoticeChannel(target);
  let ok=false,message;
  if(!normalized)message='Set a public @channel username, public t.me link or numeric channel ID.';
  else{
    const [me,chat]=await Promise.all([callTg(env,'getMe',{}),callTg(env,'getChat',{chat_id:normalized})]);
    if(!me?.ok||!me.result?.id)message=await channelPostError(env,me);
    else if(!chat?.ok)message=await channelPostError(env,chat);
    else{
      const membership=await callTg(env,'getChatMember',{chat_id:chat.result.id,user_id:me.result.id}),member=membership?.result;
      if(!membership?.ok)message=await channelPostError(env,membership);
      else if(!['administrator','creator'].includes(member?.status))message='The bot is not an administrator in this channel.';
      else if(chat.result.type==='channel'&&member.status!=='creator'&&member.can_post_messages!==true)message='The bot is an admin but Post Messages permission is OFF.';
      else{ok=true;message=`${String(chat.result.title||'Channel').slice(0,100)} · ${chat.result.type||'chat'} · posting permission available`;}
    }
  }
  const result={target,ok,message,checkedAt:new Date().toISOString()};await env.DB.prepare("INSERT OR REPLACE INTO settings(key,value) VALUES('__channel_connection_check',?)").bind(JSON.stringify(result)).run();return result;
}
async function previewChannelRecovery(env,chatId,messageId){
  if(!adminUserAccess(env,chatId))return;
  const {results}=await env.DB.prepare("SELECT p.id,p.name FROM products p WHERE p.is_external=1 AND p.is_active=1 AND NOT EXISTS(SELECT 1 FROM channel_notice_events e WHERE e.event_key='new:'||p.id) ORDER BY p.id DESC LIMIT 10").all();
  const draft={ids:results.map(p=>Number(p.id)),channel:normalizeNoticeChannel(await getSetting(env,'force_channel_username','')),token:crypto.randomUUID().slice(0,8),createdAt:Date.now()};
  await env.DB.prepare("INSERT OR REPLACE INTO admin_states(user_id,state,data) VALUES(?,'channel_recovery_preview',?)").bind(chatId,JSON.stringify(draft)).run();
  const text=`📢 <b>Recover Missing API Announcements</b>\n\n${results.length?'The following products have no recorded new-product announcement. Some may be older products imported before notifications were enabled.\n\n'+results.map(p=>'• '+escapeHtml(String(p.name).slice(0,100))).join('\n'):'No missing API announcements found.'}\n\nQueueing creates up to 10 channel posts. Existing announcements are not repeated. Pending posts use the normal delivery queue.`;
  const buttons=[];if(results.length)buttons.push([{text:`Queue These ${results.length} Products`,callback_data:`adm_channel_recover_run_${draft.token}`}]);buttons.push([{text:'Back to Channel Alerts',callback_data:'adm_channel_notices'}]);return editMsg(env,chatId,messageId,text,buttons);
}

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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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
            { command: "support", description: "24/7 Customer Helpdesk" }
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
      try {
        const res = await syncExternalProducts(env, null, null, true);
        return new Response(JSON.stringify(res), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
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
          ctx.waitUntil(handleUpdate(update, env, url.origin, ctx).catch(error => console.error("Webhook processing error:", error)));
        } else {
          await handleUpdate(update, env, url.origin, ctx);
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
    ctx.waitUntil(syncExternalProducts(env));
  }
};

// ====================================================================
// Database Setup & Migrations
// ====================================================================
// Bump this version whenever schema/default/index migrations change.
const DB_SCHEMA_VERSION = "2026-11-speed-3-maintenance";
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
      `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER UNIQUE NOT NULL, username TEXT, first_name TEXT, balance_usd REAL DEFAULT 0, balance_bdt REAL DEFAULT 0, referred_by INTEGER DEFAULT 0, total_referrals INTEGER DEFAULT 0, total_spent_usd REAL DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, price_usd REAL NOT NULL, price_bdt REAL NOT NULL, is_active INTEGER DEFAULT 1, is_external INTEGER DEFAULT 0, external_id TEXT DEFAULT '', cost_price_usd REAL DEFAULT 0, custom_price_usd REAL DEFAULT 0, api_stock INTEGER DEFAULT 0);`,
      `CREATE TABLE IF NOT EXISTS inventory (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL, item_data TEXT NOT NULL, is_sold INTEGER DEFAULT 0, order_id INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id));`,
      `CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, username TEXT, product_id INTEGER NOT NULL, quantity INTEGER DEFAULT 1, payment_method TEXT NOT NULL, trx_id TEXT DEFAULT '', amount_usd REAL NOT NULL DEFAULT 0, amount_bdt REAL NOT NULL DEFAULT 0, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id));`,
      `CREATE TABLE IF NOT EXISTS preorders (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, username TEXT, product_id INTEGER NOT NULL, status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (product_id) REFERENCES products(id));`,
      `CREATE TABLE IF NOT EXISTS deposits (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, username TEXT, method TEXT NOT NULL, amount_usd REAL NOT NULL DEFAULT 0, amount_bdt REAL NOT NULL DEFAULT 0, trx_id TEXT DEFAULT '', status TEXT DEFAULT 'pending', created_at DATETIME DEFAULT CURRENT_TIMESTAMP);`,
      `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);`,
      `CREATE TABLE IF NOT EXISTS admin_states (user_id INTEGER PRIMARY KEY, state TEXT, data TEXT);`,
      `CREATE TABLE IF NOT EXISTS user_states (user_id INTEGER PRIMARY KEY, state TEXT, data TEXT);`,
      `CREATE TABLE IF NOT EXISTS redeem_codes (code_hash TEXT PRIMARY KEY, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), created_by INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, redeemed_by INTEGER DEFAULT NULL, redeemed_at DATETIME DEFAULT NULL, redemption_token TEXT UNIQUE DEFAULT NULL, redeemed_bdt INTEGER DEFAULT NULL);`,
      `CREATE TABLE IF NOT EXISTS bep20_payment_claims (tx_hash TEXT PRIMARY KEY, invoice_type TEXT NOT NULL, invoice_id INTEGER NOT NULL, user_id INTEGER NOT NULL, amount_wei TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(invoice_type, invoice_id));`,
      `CREATE TABLE IF NOT EXISTS binance_payment_claims (transaction_id TEXT PRIMARY KEY, invoice_type TEXT NOT NULL, invoice_id INTEGER NOT NULL, user_id INTEGER NOT NULL, amount_usdt TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(invoice_type, invoice_id));`
    ];
    if (typeof db.batch === "function") await db.batch(schema.map(q => db.prepare(q)));
    else for (const q of schema) await db.prepare(q).run();

    const alters = [
      "ALTER TABLE users ADD COLUMN balance_usd REAL DEFAULT 0;",
      "ALTER TABLE users ADD COLUMN balance_bdt REAL DEFAULT 0;",
      "ALTER TABLE users ADD COLUMN total_spent_usd REAL DEFAULT 0;",
      "ALTER TABLE products ADD COLUMN is_external INTEGER DEFAULT 0;",
      "ALTER TABLE products ADD COLUMN external_id TEXT DEFAULT '';",
      "ALTER TABLE products ADD COLUMN cost_price_usd REAL DEFAULT 0;",
      "ALTER TABLE products ADD COLUMN custom_price_usd REAL DEFAULT 0;",
      "ALTER TABLE products ADD COLUMN api_stock INTEGER DEFAULT 0;",
      "ALTER TABLE products ADD COLUMN custom_icon TEXT DEFAULT NULL;",
      "ALTER TABLE products ADD COLUMN provider_emoji_id TEXT DEFAULT NULL;",
      "ALTER TABLE orders ADD COLUMN bep20_wallet TEXT DEFAULT NULL;",
      "ALTER TABLE deposits ADD COLUMN bep20_wallet TEXT DEFAULT NULL;",
      "ALTER TABLE orders ADD COLUMN quantity INTEGER DEFAULT 1;",
      "ALTER TABLE orders ADD COLUMN amount_usd REAL DEFAULT 0;",
      "ALTER TABLE orders ADD COLUMN amount_bdt REAL DEFAULT 0;"
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
    const indexes = [
      "CREATE UNIQUE INDEX IF NOT EXISTS deposits_redeem_once ON deposits(trx_id) WHERE method = 'REDEEM'",
      "CREATE INDEX IF NOT EXISTS inventory_available ON inventory(product_id, is_sold, id)",
      "CREATE INDEX IF NOT EXISTS inventory_order ON inventory(order_id, is_sold)",
      "CREATE INDEX IF NOT EXISTS orders_user_history ON orders(user_id, id DESC)",
      "CREATE INDEX IF NOT EXISTS orders_status ON orders(status)",
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
      ['external_profit_margin', '20'],
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
    console.error("ensureDbReady error:", err);
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
  const timer = setTimeout(() => controller.abort(), method === "answerCallbackQuery" ? 2500 : 8000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal
    });
    const data = await res.json();
    if (!data.ok) {
      console.error(`Telegram API error in ${method}:`, JSON.stringify(data));
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
  const orderQty = order.quantity || 1;

  if (order.is_external === 1) {
    await env.DB.prepare("UPDATE orders SET status = 'paid_pending_delivery', trx_id = ? WHERE id = ?").bind(trxId, orderId).run();
    const apiRes = await dispatchExternalOrder(env, order, orderQty, orderId);
    if (!apiRes.success) {
      await sendMsg(env, chatId, `✅ Payment verified for Order #${orderId}. Delivery is pending; admin has been notified. Do not pay again.`);
      await sendMsg(env, env.ADMIN_ID, `⚠️ Paid Order #${orderId} needs manual delivery. Provider delivery was not confirmed. Check provider order history before retrying.`);
      return;
    }
    const creds = apiRes.credentials;
    await env.DB.prepare("UPDATE orders SET status = 'completed' WHERE id = ?").bind(orderId).run();
    if (apiRes.success) {
      await env.DB.prepare("UPDATE products SET api_stock = MAX(0, api_stock - ?) WHERE id = ?").bind(orderQty, order.product_id).run();
    }
    await sendMsg(env, chatId, `🎉 <b>Payment Verified! Your Order is Delivered</b>\n\nOrder ID: #${orderId}\nProduct: <b>${order.product_name}</b>\nQuantity: <b>${orderQty} item(s)</b>\nPayment Method: <b>${order.payment_method}</b>\nTrxID: <code>${trxId}</code>\n\n🔑 <b>Your License / Credentials:</b>\n<blockquote><code>${creds}</code></blockquote>`, [
      [{ text: "📦 View Orders", callback_data: "my_orders" }],
      [{ text: "🛒 Continue Shopping", callback_data: "shop" }]
    ]);
    await sendMsg(env, env.ADMIN_ID, `✅ <b>Order #${orderId} Auto-Verified & Delivered via API!</b>\nProduct: <b>${order.product_name}</b>\nMethod: ${order.payment_method}\nTrxID: <code>${trxId}</code>\nAmount: $${order.amount_usd} USD`);
    await processReferralCommission(env, chatId, order.amount_usd, order.product_name);
    return;
  }

  // Local Stock Order
  // Claim local inventory with one atomic write to prevent concurrent double delivery.
  await env.DB.prepare("UPDATE inventory SET is_sold = 1, order_id = ? WHERE id IN (SELECT id FROM inventory WHERE product_id = ? AND is_sold = 0 ORDER BY id LIMIT ?)")
    .bind(orderId, order.product_id, orderQty).run();
  const { results: items } = await env.DB.prepare("SELECT * FROM inventory WHERE order_id = ? AND is_sold = 1").bind(orderId).all();
  if (items && items.length >= orderQty) {
    await env.DB.prepare("UPDATE orders SET status = 'completed', trx_id = ? WHERE id = ?").bind(trxId, orderId).run();
    const lines = items.map(item => item.item_data);
    await sendMsg(env, chatId, `🎉 <b>Payment Verified! Your Order is Delivered</b>\n\nOrder ID: #${orderId}\nProduct: <b>${order.product_name}</b>\nQuantity: <b>${orderQty} item(s)</b>\nPayment Method: <b>${order.payment_method}</b>\nTrxID: <code>${trxId}</code>\n\n🔑 <b>Your License / Credentials:</b>\n<blockquote><code>${lines.join("\n\n")}</code></blockquote>`, [
      [{ text: "📦 View Orders", callback_data: "my_orders" }],
      [{ text: "🛒 Continue Shopping", callback_data: "shop" }]
    ]);
    await sendMsg(env, env.ADMIN_ID, `✅ <b>Order #${orderId} Auto-Verified & Delivered from Stock!</b>\nProduct: <b>${order.product_name}</b>\nMethod: ${order.payment_method}\nTrxID: <code>${trxId}</code>\nAmount: $${order.amount_usd} USD`);
    await processReferralCommission(env, chatId, order.amount_usd, order.product_name);
  } else {
    await env.DB.prepare("UPDATE orders SET status = 'paid_pending_delivery', trx_id = ? WHERE id = ?").bind(trxId, orderId).run();
    await sendMsg(env, chatId, `✅ <b>Payment Verified!</b>\n\nOrder ID: #${orderId}\n⚠️ Local stock is being restocked. Admin has been notified to deliver your order immediately!`);
    await sendMsg(env, env.ADMIN_ID, `🚨 <b>Order #${orderId} Verified but Local Stock Insufficient!</b> Please deliver manually.`);
  }
}

// ====================================================================
// Wallet Purchase Execution Helper
// ====================================================================
async function executeWalletPurchase(env, chatId, username, prod, qty, totalUsd, rate, messageId) {
  const totalBdt = Math.round(totalUsd * rate);

  // External API Product Purchase
  if (prod.is_external === 1) {
    if ((prod.api_stock || 0) < qty) {
      await sendMsg(env, chatId, `📦 Available Stock: <b>0</b>\nYou can pre-order and you will be notified the instant it's restocked!`, [
        [{ text: "⏳ Pre-Order Now", callback_data: `preorder_${prod.id}` }]
      ]);
      return;
    }

    await env.DB.prepare("UPDATE users SET balance_usd = balance_usd - ?, balance_bdt = balance_bdt - ?, total_spent_usd = total_spent_usd + ? WHERE user_id = ?").bind(totalUsd, totalBdt, totalUsd, chatId).run();
    const res = await env.DB.prepare("INSERT INTO orders (user_id, username, product_id, quantity, payment_method, trx_id, amount_usd, amount_bdt, status) VALUES (?, ?, ?, ?, 'WALLET', 'AUTO_DISPATCH', ?, ?, 'completed')").bind(chatId, username, prod.id, qty, totalUsd, totalBdt).run();
    const orderId = res.meta ? res.meta.last_row_id : Math.floor(Math.random() * 10000);

    const apiResult = await dispatchExternalOrder(env, prod, qty, orderId);
    const creds = apiResult.success ? apiResult.credentials : "Order registered with external provider. Details arriving shortly.";
    if (apiResult.success) await env.DB.prepare("UPDATE products SET api_stock = MAX(0, api_stock - ?) WHERE id = ?").bind(qty, prod.id).run();

    await editMsg(env, chatId, messageId, `🎉 <b>Purchase Successful! Instant Delivery</b>\n\nOrder: #${orderId}\nProduct: <b>${productDisplayName(prod)}</b>\nQuantity: <b>${qty} item(s)</b>\nTotal Paid: <b>$${totalUsd.toFixed(2)} USD</b>\n\n🔑 <b>Credentials:</b>\n<blockquote><code>${creds}</code></blockquote>`, [
      [{ text: "📦 View Orders", callback_data: "my_orders" }],
      [{ text: "🛒 Continue Shopping", callback_data: "shop" }]
    ]);
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

  await env.DB.prepare("UPDATE users SET balance_usd = balance_usd - ?, balance_bdt = balance_bdt - ?, total_spent_usd = total_spent_usd + ? WHERE user_id = ?").bind(totalUsd, totalBdt, totalUsd, chatId).run();
  const res = await env.DB.prepare("INSERT INTO orders (user_id, username, product_id, quantity, payment_method, trx_id, amount_usd, amount_bdt, status) VALUES (?, ?, ?, ?, 'WALLET', 'LOCAL_STOCK', ?, ?, 'completed')").bind(chatId, username, prod.id, qty, totalUsd, totalBdt).run();
  const orderId = res.meta ? res.meta.last_row_id : Math.floor(Math.random() * 10000);

  const itemStrings = [];
  for (const it of items) {
    await env.DB.prepare("UPDATE inventory SET is_sold = 1, order_id = ? WHERE id = ?").bind(orderId, it.id).run();
    itemStrings.push(it.item_data);
  }

  await editMsg(env, chatId, messageId, `🎉 <b>Purchase Successful! Instant Delivery</b>\n\nOrder: #${orderId}\nProduct: <b>${productDisplayName(prod)}</b>\nQuantity: <b>${qty} item(s)</b>\nTotal Paid: <b>$${totalUsd.toFixed(2)} USD</b>\n\n🔑 <b>Credentials:</b>\n<blockquote><code>${itemStrings.join("\n\n")}</code></blockquote>`, [
    [{ text: "📦 View Orders", callback_data: "my_orders" }],
    [{ text: "🛒 Continue Shopping", callback_data: "shop" }]
  ]);
  await processReferralCommission(env, chatId, totalUsd, prod.name);
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
        env.DB.prepare(`UPDATE users SET balance_usd = balance_usd + (SELECT amount_cents / 100.0 FROM redeem_codes WHERE code_hash = ? AND redemption_token = ?), balance_bdt = balance_bdt + (SELECT redeemed_bdt FROM redeem_codes WHERE code_hash = ? AND redemption_token = ?) WHERE user_id = ? AND ${proof}`).bind(hash,token,hash,token,chatId,hash,token,chatId),
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
  await env.DB.prepare("DELETE FROM user_states WHERE user_id = ? AND state IN ('awaiting_binance_amount', 'awaiting_binance_receipt', 'awaiting_bep20_amount', 'awaiting_bep20_hash', 'awaiting_redeem_code')").bind(chatId).run();
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
    const buttons = [[{ text: "🔄 Use USDT BEP20", callback_data: `dep_setmeth_bep20_${Number.isFinite(amount) && amount > 0 ? amount.toFixed(2) : "0"}` }], [{ text: "⏪ Back", callback_data: "deposit" }]];
    return messageId ? await editMsg(env, chatId, messageId, text, buttons) : await sendMsg(env, chatId, text, buttons);
  }
  if (amount === 0) {
    await env.DB.prepare("INSERT OR REPLACE INTO user_states (user_id, state, data) VALUES (?, 'awaiting_binance_amount', '{}')").bind(chatId).run();
    const text = "💳 <b>Binance Pay</b>\n\nHow much USDT would you like to deposit?\n\n<i>Type the amount in the chat (e.g. 5).</i>";
    const buttons = [[{ text: "⏪ Back", callback_data: "deposit" }]];
    return messageId ? await editMsg(env, chatId, messageId, text, buttons) : await sendMsg(env, chatId, text, buttons);
  }
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
  if (!result.success) {
    await sendMsg(env, chatId, `⚠️ ${escapeHtml(result.message)}`, [[{ text: "❌ Cancel", callback_data: "binance_cancel" }]]);
    return;
  }
  if (type === "order") {
    await completeSuccessfulOrder(env, invoice, result.orderId, chatId);
  } else {
    const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
    const bdt = Math.round(result.paidAmount * rate);
    await env.DB.batch([
      env.DB.prepare("UPDATE deposits SET amount_usd = ?, amount_bdt = ?, trx_id = ?, status = 'completed' WHERE id = ?").bind(result.paidAmount, bdt, result.orderId, invoice.id),
      env.DB.prepare("UPDATE users SET balance_usd = balance_usd + ?, balance_bdt = balance_bdt + ? WHERE user_id = ?").bind(result.paidAmount, bdt, chatId)
    ]);
    await sendMsg(env, chatId, `✅ <b>Binance deposit verified!</b>\n\nWallet credited: <b>$${result.paidAmount.toFixed(2)} USDT</b>`, [[{ text: "🛍️ Open Shop", callback_data: "shop" }]]);
    await sendMsg(env, env.ADMIN_ID, `✅ Binance deposit #${invoice.id} credited: $${result.paidAmount.toFixed(2)} USDT. User: ${chatId}`);
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
  const text=`💵 <b>USDT BEP20 ${type==='order'?'Payment':'Deposit'}</b>\nNetwork: <b>BNB Smart Chain (BEP20)</b>\n\nSend <b>${Number(invoice.amount_usd).toFixed(2)} USDT</b> to:\n<blockquote><code>${escapeHtml(address)}</code></blockquote>\nAfter paying, tap <b>Enter TxHash</b> and paste the blockchain transaction hash from your receipt.\n\n<i>Verification requires 12 confirmations. Cover withdrawal fees so the required USDT amount reaches this address. Use a TxHash, not a Binance Pay Order ID.</i>`;
  const buttons=[
    [{text:'📋 Copy Wallet Address',copy_text:{text:address}},{text:'⚡ Enter TxHash',callback_data:`bep20_enter_${type}_${invoice.id}`}],
    [{text:'⏪ Back',callback_data:type==='order'?`prod_${invoice.product_id}`:'deposit'}]
  ];
  return messageId ? await editMsg(env,chatId,messageId,text,buttons) : await sendMsg(env,chatId,text,buttons);
}

async function startBep20Deposit(env, chatId, username, amount = 0, messageId = null) {
  await clearBinanceInput(env,chatId);
  if (!Number.isFinite(amount) || amount<0) {await sendMsg(env,chatId,'Enter a positive USDT amount.');return;}
  if (amount===0) {
    await env.DB.prepare("INSERT OR REPLACE INTO user_states (user_id, state, data) VALUES (?, 'awaiting_bep20_amount', '{}')").bind(chatId).run();
    const text='💵 <b>USDT BEP20 Deposit</b>\n\nHow much USDT would you like to deposit?\n\n<i>Type the amount in chat (e.g. 50).</i>';
    const buttons=[[{text:'⏪ Back',callback_data:'deposit'}]];
    return messageId ? await editMsg(env,chatId,messageId,text,buttons) : await sendMsg(env,chatId,text,buttons);
  }
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
      env.DB.prepare("UPDATE users SET balance_usd = balance_usd + ?, balance_bdt = balance_bdt + ? WHERE user_id = ? AND EXISTS (SELECT 1 FROM deposits WHERE id = ? AND user_id = ? AND status = 'pending')").bind(result.paidAmount,bdt,chatId,invoice.id,chatId),
      env.DB.prepare("UPDATE deposits SET amount_usd = ?, amount_bdt = ?, trx_id = ?, status = 'completed' WHERE id = ? AND user_id = ? AND status = 'pending'").bind(result.paidAmount,bdt,result.txHash,invoice.id,chatId)
    ]);
    if (settled[0].meta.changes!==1) {await sendMsg(env,chatId,'This deposit has already been processed. Contact admin if the balance is incorrect.');return;}
    await sendMsg(env,chatId,`✅ <b>BEP20 deposit verified!</b>\n\n<b>${result.paidAmount.toFixed(2)} USDT</b> added to your wallet.`,[[{text:'🛍️ Open Shop',callback_data:'shop'}]]);
    await sendMsg(env,env.ADMIN_ID,`✅ BEP20 deposit #${invoice.id}: ${result.paidAmount.toFixed(2)} USDT credited to user ${chatId}.`);
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
  if (method === "bep20") return await startBep20Deposit(env, chatId, username, neededAmount, messageId);
  if (method === "binance") return await startBinanceDeposit(env, chatId, username, neededAmount, messageId);
  let mTitle = "bKash Personal";
  let accNum = await getSetting(env, "bkash_num", "017XXXXXXXX");
  let promptDetails = "After sending, please <b>REPLY to this message</b> with the amount and <b>Transaction ID</b>.";

  if (method === "nagad") {
    mTitle = "Nagad Personal";
    accNum = await getSetting(env, "nagad_num", "017XXXXXXXX");
  } else if (method === "rocket") {
    mTitle = "Rocket Personal";
    accNum = await getSetting(env, "rocket_num", "017XXXXXXXX");
  }

  const res = await env.DB.prepare("INSERT INTO deposits (user_id, username, method, amount_usd, status) VALUES (?, ?, ?, ?, 'pending')").bind(chatId, username, method.toUpperCase(), neededAmount).run();
  const depId = res.meta ? res.meta.last_row_id : Math.floor(Math.random() * 1000);
  const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));

  const depPrompt = `💰 <b>Deposit Instructions — ${mTitle}</b>\n\n` +
    `Deposit ID: <b>#${depId}</b>\n` +
    (neededAmount > 0 ? `Target Deposit: <b>$${neededAmount.toFixed(2)} USD (≈ ৳${Math.round(neededAmount * rate)} BDT)</b>\n` : "") +
    `Send funds to:\n<blockquote><code>${accNum}</code></blockquote>\n` +
    `Exchange Rate: <b>1 USD = ${rate} BDT</b>\n\n` +
    `${promptDetails}`;

  await editMsg(env, chatId, messageId, depPrompt, [[{ text: "◀️ Back to Deposit", callback_data: "deposit" }]]);
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
  if(callback?.id){
    const acknowledgement=ansCb(env,callback.id).catch(()=>{});
    if(ctx&&typeof ctx.waitUntil==='function')ctx.waitUntil(acknowledgement);
    else await acknowledgement;
  }
  if(callback?.message?.message_id) return await editMsg(env,chatId,callback.message.message_id,MAINTENANCE_MESSAGE,[]);
  return await sendMsg(env,chatId,MAINTENANCE_MESSAGE);
}

async function handleUpdate(update, env, originUrl = "", ctx = null) {
  const actor = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
  if (String(actor) !== String(env.ADMIN_ID)) env = { ...env, __requestSettings: new Map() };
  await ensureDbReady(env.DB);
  if (actor !== undefined && actor !== null && String(actor) !== String(env.ADMIN_ID)) {
    // Read on every update so admin changes take effect across Pages instances immediately.
    const mode=await env.DB.prepare("SELECT value FROM settings WHERE key = 'maintenance_mode'").first();
    if(mode?.value==='1'){await showMaintenance(env,update,ctx);return;}
  }

  // 1. Text Messages Handler
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    let text = (msg.text || "").trim();
    const navigationCommand = text.match(/^\/(start|home|admin|shop|deposit|profile|orders|preorder|refer|support|cancel)(?:@\w+)?(?=\s|$)/i);
    if (navigationCommand) text = text.replace(navigationCommand[0], `/${navigationCommand[1].toLowerCase()}`);
    const from = msg.from;
    const username = from.username ? `@${from.username}` : (from.first_name || "Customer");
    const firstName = from.first_name || "Customer";

    // User Registration / Loading & Referral Tracking
    const [storedUser, storedState] = await Promise.all([
      env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first(),
      env.DB.prepare("SELECT * FROM user_states WHERE user_id = ?").bind(chatId).first()
    ]);
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

    // Admin Text States
    if (String(chatId) === String(env.ADMIN_ID)) {
      let adminState = await env.DB.prepare("SELECT * FROM admin_states WHERE user_id = ?").bind(chatId).first();
      if (adminState && navigationCommand) {
        await clearAdminState(env,chatId);adminState=null;
        if (text==='/cancel') {await sendAdminDashboard(env,chatId);return;}
      }
      if (adminState && adminState.state) {
        if (await handleRedeemAdminText(env,chatId,text,adminState)) return;
        if (await handleProductIconText(env, chatId, text, adminState)) return;
        if (await handleBinanceSettingText(env, chatId, text, adminState)) return;
        if (await handleBep20SettingText(env, chatId, text, adminState)) return;
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
      const parsedQty = parseInt(text.replace(/[^0-9]/g, "")) || 1;
      await env.DB.prepare("DELETE FROM user_states WHERE user_id = ?").bind(chatId).run();
      await sendOrderPreview(env, chatId, prodId, parsedQty > 0 ? parsedQty : 1);
      return;
    }

    // Mandatory Force Join Gate
    if (String(chatId) !== String(env.ADMIN_ID)) {
      const forceCheck = await checkForceJoin(env, chatId, Boolean(userState?.state === "awaiting_redeem_code" || /^\/start(?:@\w+)?\s+redeem_/i.test(text) || msg.reply_to_message || /^awaiting_(?:binance|bep20)_/.test(userState?.state || "")));
      if (!forceCheck.passed) { await sendForceJoinScreen(env, chatId, forceCheck); return; }
    }

    const redeemStart=text.match(/^\/start(?:@\w+)?\s+redeem_(RDM-[A-Fa-f0-9]{32})$/i);
    if (redeemStart) {await clearBinanceInput(env,chatId);await submitRedeemCode(env,chatId,redeemStart[1]);return;}
    if (await handleRedeemInput(env,chatId,text,userState)) return;
    if (await handleBep20Input(env, chatId, username, text, userState)) return;
    if (await handleBinanceInput(env, chatId, username, text, userState)) return;

    // Automatic Payment Verification upon Reply with TxID / Order ID
    if (!navigationCommand && msg.reply_to_message && msg.reply_to_message.text) {
      const rText = msg.reply_to_message.text;

      // 1. ORDER PAYMENT SUBMISSION
      if (rText.includes("Order ID:")) {
        const m = rText.match(/Order ID:\s*#(\d+)/);
        if (m) {
          const orderId = m[1];
          const order = await env.DB.prepare("SELECT o.*, p.name as product_name, p.is_external, p.external_id, p.api_stock FROM orders o JOIN products p ON o.product_id = p.id WHERE o.id = ?").bind(orderId).first();
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

            // C. Manual Payments (bKash, Nagad, Rocket)
            await env.DB.prepare("UPDATE orders SET trx_id = ? WHERE id = ?").bind(cleanText, orderId).run();
            await sendMsg(env, chatId, `✅ <b>Payment Details Received!</b>\n\nOrder ID: #${orderId}\nMethod: <b>${order.payment_method}</b>\nTransaction ID: <code>${cleanText}</code>\n\nOur team is verifying your payment. Your product will be delivered automatically upon confirmation.`);
            await sendMsg(env, env.ADMIN_ID, `🚨 <b>New Order Payment Verification!</b>\n\nOrder ID: #${order.id}\nProduct: <b>${order.product_name}</b> (${order.quantity || 1} items)\nMethod: <b>${order.payment_method}</b>\nAmount: <b>$${order.amount_usd} USD (৳${order.amount_bdt} BDT)</b>\nTrxID: <code>${cleanText}</code>\nCustomer: ${order.username} (ID: <code>${order.user_id}</code>)`, [
              [{ text: "✅ Approve Order", callback_data: `admin_approve_${orderId}` }, { text: "❌ Reject Order", callback_data: `admin_reject_${orderId}` }]
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

          await env.DB.prepare("UPDATE deposits SET trx_id = ? WHERE id = ?").bind(cleanText, depId).run();
        }

        await sendMsg(env, chatId, `✅ <b>Deposit Submission Received!</b>\n\nTransaction Details: <code>${cleanText}</code>\n\nAdmin will verify the transaction and credit your wallet balance shortly.`);
        await sendMsg(env, env.ADMIN_ID, `🚨 <b>New Wallet Deposit Verification!</b>\n\nDeposit ID: #${depId || "N/A"}\nCustomer: ${username} (ID: <code>${chatId}</code>)\nMethod: <b>${dRow ? dRow.method : "Payment"}</b>\nAmount: $${dRow ? dRow.amount_usd : "0"} USD\nTrxID: <code>${cleanText}</code>`, [
          depId ? [{ text: "✅ Approve Deposit", callback_data: `adm_apprdep_${depId}` }, { text: "❌ Reject Deposit", callback_data: `adm_rejdep_${depId}` }]
                : [{ text: "➕ Credit User", callback_data: `adm_credit_${chatId}` }]
        ]);
        return;
      }
    }

    // Standard Navigation Commands
    if (text.startsWith("/start") || text === "/home") { await sendHomeDashboard(env, chatId, user, firstName); return; }
    if (text === "/shop") {
      try {
        await sendProductsDirectly(env, chatId);
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
    const acknowledgement = ansCb(env, cb.id).catch(() => {});
    if (ctx) ctx.waitUntil(acknowledgement);
    else await acknowledgement;

    let user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
    const firstName = cb.from.first_name || "Customer";
    const username = cb.from.username ? `@${cb.from.username}` : firstName;

    if (["home", "deposit", "shop", "shop_refresh"].includes(data) || /^(?:prod_|dep_|pay_|direct_pay_|custom_qty_|buynow_)/.test(data)) await clearBinanceInput(env, chatId);
    if (data === "binance_cancel") {
      await clearBinanceInput(env, chatId);
      await sendDeposit(env, chatId, messageId);
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

    // Navigation Callbacks
    if (data === "home") { await clearAdminState(env, chatId); await sendHomeDashboard(env, chatId, user, firstName, messageId); return; }
    if (data === "shop" || data === "shop_refresh") {
      try {
        await sendProductsDirectly(env, chatId, messageId, data === "shop_refresh");
      } catch (e) {
        console.error("Error in shop callback:", e);
        await sendMsg(env, chatId, `⚠️ <b>Error opening shop:</b> <code>${escapeHtml(e.message)}</code>`);
      }
      return;
    }
    if (data === "profile") { await sendProfile(env, chatId, user, messageId); return; }
    if (data === "deposit") { await sendDeposit(env, chatId, messageId); return; }
    if (data === "my_orders") { await sendOrders(env, chatId, messageId); return; }
    if (data === "my_preorders") { await sendUserPreorders(env, chatId, messageId); return; }
    if (data === "refer") { await sendRefer(env, chatId, user, messageId); return; }
    if (data === "support") { await sendSupport(env, chatId, messageId); return; }

    // Pre-orders Registration
    if (data.startsWith("preorder_")) {
      const prodId = data.replace("preorder_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      if (prod) {
        const existingPo = await env.DB.prepare("SELECT id FROM preorders WHERE user_id = ? AND product_id = ? AND status = 'pending'").bind(chatId, prodId).first();
        if (!existingPo) await env.DB.prepare("INSERT INTO preorders (user_id, username, product_id, status) VALUES (?, ?, ?, 'pending')").bind(chatId, username, prodId).run();
        await editMsg(env, chatId, messageId, `⏳ <b>Pre-Order Confirmed!</b>\n\nProduct: <b>${productDisplayName(prod)}</b>\nPrice: <b>$${Number(prod.price_usd).toFixed(2)} USD</b> (≈ ৳${prod.price_bdt} BDT)\n\n✅ Your pre-order is registered! As soon as new stock is added or synced via API, you will receive an instant notification with a direct purchase link. ❤️`, [
          [{ text: "🛒 Continue Shopping", callback_data: "shop" }],
          [{ text: "🏠 Main Menu", callback_data: "home" }]
        ]);
        await sendMsg(env, env.ADMIN_ID, `🚨 <b>New Pre-Order Placed!</b>\n\nCustomer: ${username} (ID: <code>${chatId}</code>)\nProduct: <b>${productDisplayName(prod)}</b>\nPrice: $${prod.price_usd} USD\n\n⚠️ Please restock this product using Admin Panel or Provider API!`, [
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
      await sendOrderPreview(env, chatId, parts[0], parseInt(parts[1]) || 1, messageId);
      return;
    }
    if (data.startsWith("qty_")) {
      const parts = data.replace("qty_", "").split("_");
      await sendOrderPreview(env, chatId, parts[0], parseInt(parts[1]) || 1, messageId);
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
      const qty = parseInt(parts[1]) || 1;
      let prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      if (!prod) return;
      if (prod.is_external === 1) prod = await fetchLiveProductStock(env, prod);
      if (!await checkExternalStock(env, chatId, prod, qty)) return;

      const totalPrice = Number((prod.price_usd * qty).toFixed(2));
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
      const parts = data.replace("direct_pay_", "").split("_");
      const prodId = parts[0];
      const qty = parseInt(parts[1]) || 1;
      let prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      if (!prod) return;
      if (prod.is_external === 1) prod = await fetchLiveProductStock(env, prod);
      if (!await checkExternalStock(env, chatId, prod, qty)) return;

      const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
      const totalUsd = Number((prod.price_usd * qty).toFixed(2));
      const totalBdt = Math.round(totalUsd * rate);
      const userBal = user ? (user.balance_usd || 0) : 0;

      await editMsg(env, chatId, messageId,
        `💳 <b>Select Payment Method:</b>\n\n` +
        `Product: <b>${productDisplayName(prod)}</b>\n` +
        `Quantity: <b>${qty} item(s)</b>\n` +
        `Total Payable: <b>$${totalUsd.toFixed(2)} USD (≈ ৳${totalBdt} BDT)</b>\n\n` +
        `Choose your preferred payment method below:`,
        [
          [{ text: "🟢 bKash", callback_data: `pay_bkash_${prod.id}_${qty}` }, { text: "🟠 Nagad", callback_data: `pay_nagad_${prod.id}_${qty}` }],
          [{ text: "🟣 Rocket", callback_data: `pay_rocket_${prod.id}_${qty}` }],
          [{ text: "Binance Pay (Auto Verify)", callback_data: `pay_binance_${prod.id}_${qty}` }, { text: "🔵 BEP20 USDT (Auto Verify)", callback_data: `pay_bep20_${prod.id}_${qty}` }],
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
      const prodId = parts[2];
      const qty = parseInt(parts[3]) || 1;
      let prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      if (!prod) return;
      if (prod.is_external === 1) prod = await fetchLiveProductStock(env, prod);
      if (!await checkExternalStock(env, chatId, prod, qty)) return;
      const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
      const totalUsd = Number((prod.price_usd * qty).toFixed(2));
      const totalBdt = Math.round(totalUsd * rate);

      const res = await env.DB.prepare("INSERT INTO orders (user_id, username, product_id, quantity, payment_method, amount_usd, amount_bdt, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')").bind(chatId, username, prodId, qty, method.toUpperCase(), totalUsd, totalBdt).run();
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
        mTitle = "Rocket Personal";
        accNum = await getSetting(env, "rocket_num", "017XXXXXXXX");
        customInstructions = `👉 <b>Send Money to:</b>\n<code>${accNum}</code>\n\n⚠️ After payment, please <b>REPLY to this message</b> with your <b>Rocket Transaction ID</b>.`;
      }

      const checkoutText = `💳 <b>Payment Instructions — ${mTitle}</b>\n\n` +
        `Order ID: <b>#${orderId}</b>\n` +
        `Product: <b>${productDisplayName(prod)}</b> (${qty} item(s))\n` +
        `Total Payable: <b>$${totalUsd.toFixed(2)} USD (≈ ৳${totalBdt} BDT)</b>\n\n` +
        `${customInstructions}`;

      await editMsg(env, chatId, messageId, checkoutText, [
        [{ text: "◀️ Cancel Order", callback_data: `prod_${prod.id}` }]
      ]);
      return;
    }

    // ----------------------------------------------------------------
    // DEPOSIT SELECTION & INSTRUCTIONS
    // ----------------------------------------------------------------
    if (data.startsWith("dep_method_") || data.startsWith("dep_needed_")) {
      const isNeeded = data.startsWith("dep_needed_");
      const needed = isNeeded ? parseFloat(data.replace("dep_needed_", "")) || 5.00 : 0;

      if (isNeeded) {
        // Show deposit method selection with pre-filled needed amount
        const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
        const bdtNeeded = Math.round(needed * rate);
        await editMsg(env, chatId, messageId,
          `💳 <b>Add Funds to Wallet:</b>\n\n` +
          `• Required Amount: <b>$${needed.toFixed(2)} USD (≈ ৳${bdtNeeded} BDT)</b>\n\n` +
          `Select your payment method below to get deposit instructions:`,
          [
            [{ text: "🟢 bKash", callback_data: `dep_setmeth_bkash_${needed.toFixed(2)}` }, { text: "🟠 Nagad", callback_data: `dep_setmeth_nagad_${needed.toFixed(2)}` }],
            [{ text: "🟣 Rocket", callback_data: `dep_setmeth_rocket_${needed.toFixed(2)}` }],
            [{ text: "Binance Pay (Auto)", callback_data: `dep_setmeth_binance_${needed.toFixed(2)}` }, { text: "🔵 BEP20 USDT (Auto)", callback_data: `dep_setmeth_bep20_${needed.toFixed(2)}` }],
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

    if (data.startsWith("adm_addstock_")) {
      const prodId = data.replace("adm_addstock_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_stock', ?)").bind(chatId, prodId).run();
      await editMsg(env, chatId, messageId, `📥 <b>Add Stock for: ${prod ? prod.name : "Product"}</b>\n\nPlease send the license key or account credentials below.\n<i>💡 You can send multiple items separated by new lines!</i>`, [
        [{ text: "❌ Cancel", callback_data: "adm_stock_menu" }]
      ]);
      return;
    }

    if (data === "adm_price_menu") {
      const { results: prods } = await env.DB.prepare("SELECT p.*, CASE WHEN p.is_external = 1 THEN COALESCE(p.api_stock, 0) ELSE (SELECT COUNT(*) FROM inventory i WHERE i.product_id = p.id AND i.is_sold = 0) END as stock_qty FROM products p WHERE p.is_active = 1").all();
      const buttons = prods.map(p => [productListButton(p, `adm_setprice_${p.id}`)]);
      buttons.push([{ text: "🔙 Admin Panel", callback_data: "admin_panel" }]);
      await editMsg(env, chatId, messageId, `💰 <b>Select Product to Set Custom Price or Profit Margin:</b>\n\nClick any product below:`, buttons);
      return;
    }

    if (data.startsWith("adm_setprice_")) {
      const prodId = data.replace("adm_setprice_", "");
      const prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();
      const liveStock = prod.is_external ? (prod.api_stock || 0) : (stock ? stock.count : 0);
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_new_price', ?)").bind(chatId, prodId).run();

      const costInfo = (prod.is_external && prod.cost_price_usd > 0) ? `\n• Provider Cost: <b>$${prod.cost_price_usd.toFixed(2)} USD</b>` : "";
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
      const baseCost = (prod.is_external && prod.cost_price_usd > 0) ? prod.cost_price_usd : prod.price_usd;
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

    if (data === "adm_add_product") {
      await editMsg(env, chatId, messageId, `➕ <b>Add New Product — Step 1/4: Choose an Icon</b>\n\nSelect an attractive icon for this product from the presets below, or choose 'Skip' to type your own:`, [
        [
          { text: "🤖 AI Tool", callback_data: "adm_newicon_🤖" },
          { text: "🍿 Streaming", callback_data: "adm_newicon_🍿" },
          { text: "🎵 Music", callback_data: "adm_newicon_🎵" }
        ],
        [
          { text: "🛡️ VPN", callback_data: "adm_newicon_🛡️" },
          { text: "🎨 Design", callback_data: "adm_newicon_🎨" },
          { text: "🔑 License", callback_data: "adm_newicon_🔑" }
        ],
        [
          { text: "📺 OTT / Video", callback_data: "adm_newicon_📺" },
          { text: "🎓 Education", callback_data: "adm_newicon_🎓" },
          { text: "💎 Premium", callback_data: "adm_newicon_💎" }
        ],
        [
          { text: "⚡ General", callback_data: "adm_newicon_⚡" },
          { text: "🛍️ Digital", callback_data: "adm_newicon_🛍️" },
          { text: "⏩ Skip / Type Own", callback_data: "adm_newicon_NONE" }
        ],
        [{ text: "❌ Cancel", callback_data: "admin_panel" }]
      ]);
      return;
    }

    if (data.startsWith("adm_newicon_")) {
      const icon = data.replace("adm_newicon_", "");
      const iconData = { icon: icon === "NONE" ? "" : icon };
      await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_prod_name', ?)").bind(chatId, JSON.stringify(iconData)).run();
      await editMsg(env, chatId, messageId, `➕ <b>Add Product — Step 2/4: Product Name</b>\n\nSelected Icon: <b>${icon === "NONE" ? "None / Custom" : icon}</b>\n\nPlease enter the <b>Name</b> of the product:\n<i>(Example: Amazon Prime 6 Months)</i>`, [
        [{ text: "❌ Cancel", callback_data: "admin_panel" }]
      ]);
      return;
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

    if (data.startsWith("adm_prod_details_")) {
      const prodId = data.replace("adm_prod_details_", "");
      let prod = await env.DB.prepare("SELECT * FROM products WHERE id = ?").bind(prodId).first();
      if (!prod) return;
      if (prod.is_external === 1) prod = await fetchLiveProductStock(env, prod);
      const stock = await env.DB.prepare("SELECT COUNT(*) as count FROM inventory WHERE product_id = ? AND is_sold = 0").bind(prodId).first();
      const liveStock = prod.is_external ? (prod.api_stock || 0) : (stock ? stock.count : 0);

      const text = `📦 <b>${productDisplayName(prod)}</b>\n\n• Selling Price: <b>$${prod.price_usd.toFixed(2)} USD (≈ ৳${prod.price_bdt} BDT)</b>\n` +
        (prod.is_external ? `• Provider Cost: <b>$${prod.cost_price_usd.toFixed(2)} USD</b>\n• Origin: <b>External Bot API (Live Synced)</b>\n` : `• Origin: <b>Manual Store Stock</b>\n`) +
        `• Live Stock: <b>${liveStock} items</b>\n\n📝 <b>Description:</b>\n${renderProductDescription(prod.description)}`;

      const buttons = [
        [{ text: "💰 Set Custom Price", callback_data: `adm_setprice_${prod.id}` }],
        [{ text: "🎨 Set Product Icon", callback_data: `adm_icon_${prod.id}` }],
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

      const apiText = `🔌 <b>Live External API Center</b>\n━━━━━━━━━━━━━━━━━━━━\n• <b>API Status:</b> ${statusText}\n• <b>Wallet:</b> <b>${balanceText}</b>\n• <b>Base URL:</b> <code>${apiUrl}</code>\n• <b>API Key:</b> <code>${apiKey ? apiKey.slice(0, 10) + "••••••••" : "Not Set"}</code>\n• <b>Profit Margin:</b> <b>${margin}%</b>\n• <b>Auto-Order:</b> <b>${autoOrder ? "✅ Enabled" : "⏸️ Disabled"}</b>\n• <b>Active Synced Products:</b> <b>${count} products (Live Stock Sync Enabled)</b>`;
      await editMsg(env, chatId, messageId, apiText, [
        [{ text: "🔄 Sync Products Now", callback_data: "adm_sync_api" }],
        [{ text: "🔑 Set API Key", callback_data: "adm_set_api_key" }, { text: "🔗 Set Base URL", callback_data: "adm_set_api_url" }],
        [{ text: `📈 Profit Margin (${margin}%)`, callback_data: "adm_set_api_margin" }, { text: `🤖 Auto-Order: ${autoOrder ? "ON" : "OFF"}`, callback_data: "adm_toggle_auto_order" }],
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

      await editMsg(env, chatId, messageId, `⚙️ <b>Payment Accounts & Auto-Verification Settings:</b>\n\n• bKash: <code>${bkash}</code>\n• Nagad: <code>${nagad}</code>\n• Rocket: <code>${rocket}</code>\n• Binance Pay ID: <code>${binance}</code>\n• Binance Auto-Verify: <b>${binanceAuto ? "🟢 Enabled (Personal Pay History API)" : "⚪ Manual Verification"}</b>\n• BEP20 USDT (BSC): <code>${bep20}</code> <i>(Auto-verified via Blockchain)</i>`, [
        [{ text: "✏️ Change bKash", callback_data: "adm_set_bkash" }, { text: "✏️ Change Nagad", callback_data: "adm_set_nagad" }],
        [{ text: "✏️ Change Rocket", callback_data: "adm_set_rocket" }, { text: "✏️ Change Binance Pay ID", callback_data: "adm_set_binance" }],
        [{ text: `🤖 Binance Auto-Verify: ${binanceAuto ? "ON" : "OFF"}`, callback_data: "adm_toggle_binance_auto" }],
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
    if (data.startsWith("admin_approve_")) {
      const orderId = data.replace("admin_approve_", "");
      const order = await env.DB.prepare("SELECT o.*, p.name as product_name, p.is_external, p.external_id FROM orders o JOIN products p ON o.product_id = p.id WHERE o.id = ?").bind(orderId).first();
      if (order && order.status === "pending") {
        await completeSuccessfulOrder(env, order, order.trx_id || "MANUAL_APPROVAL", order.user_id);
        await editMsg(env, chatId, messageId, `✅ <b>Order #${orderId} approved and delivered!</b>`);
      }
      return;
    }

    if (data.startsWith("admin_reject_")) {
      const orderId = data.replace("admin_reject_", "");
      await env.DB.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").bind(orderId).run();
      const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ?").bind(orderId).first();
      if (order) await sendMsg(env, order.user_id, `❌ <b>Order #${orderId} cancelled:</b> Payment details could not be verified.`);
      await editMsg(env, chatId, messageId, `❌ Order #${orderId} rejected.`);
      return;
    }

    if (data.startsWith("adm_apprdep_")) {
      const depId = data.replace("adm_apprdep_", "");
      const dep = await env.DB.prepare("SELECT * FROM deposits WHERE id = ?").bind(depId).first();
      if (dep && dep.status === "pending") {
        await env.DB.prepare("INSERT OR REPLACE INTO admin_states (user_id, state, data) VALUES (?, 'awaiting_deposit_amount', ?)").bind(chatId, depId).run();
        await sendMsg(env, chatId, `💰 <b>Approve Deposit #${depId}</b>\nCustomer: ${dep.username} (ID: <code>${dep.user_id}</code>)\nMethod: ${dep.method}\nTrxID: <code>${dep.trx_id}</code>\n\nEnter amount in <b>USD</b> to credit (e.g. <code>10.00</code>):`, [
          [{ text: "❌ Cancel", callback_data: "admin_panel" }]
        ]);
      }
      return;
    }

    if (data.startsWith("adm_rejdep_")) {
      const depId = data.replace("adm_rejdep_", "");
      await env.DB.prepare("UPDATE deposits SET status = 'rejected' WHERE id = ?").bind(depId).run();
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
    const [configuredUrl, configuredKey, configuredRate, configuredMargin] = await Promise.all([
      apiUrl ?? getSetting(env, "external_api_url", "https://207-148-64-141.sslip.io"),
      apiKey ?? getSetting(env, "external_api_key", ""),
      getSetting(env, "usd_to_bdt_rate", "125"),
      getSetting(env, "external_profit_margin", "20")
    ]);
    let baseUrl = configuredUrl.trim().replace(/\/+$/, "");
    if (baseUrl.includes("/api/reseller")) baseUrl = baseUrl.split("/api/reseller")[0];
    const key = configuredKey;
    if (!key) return { success: false, message: "Please configure your External API Key in Admin Panel." };

    const items = await readProviderCatalog(env.DB, baseUrl, key, forceFresh);
    const snapshot = providerCatalogCache.get(env.DB);
    if (!forceFresh && targetExternalId === null && snapshot?.items === items && snapshot.appliedRate === configuredRate && snapshot.appliedMargin === configuredMargin) {
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
      seenIds.add(extId);
      if (targetExternalId !== null && extId !== targetExternalId) continue;

      const name = providerProductName(item);
      const emojiId = providerEmojiId(item);
      const desc = item.desc || item.description || `Automated digital product delivered via API. (ID: ${extId})`;
      const baseCostPrice = parseFloat(item.rate || item.price || item.cost || 1.0);
      const apiStock = providerStock(item);

      const existing = existingByExternalId.get(extId);
      let finalPrice = (existing && existing.custom_price_usd && existing.custom_price_usd > 0)
        ? existing.custom_price_usd
        : Number((baseCostPrice * (1 + margin / 100)).toFixed(2));
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
        const ins = await env.DB.prepare("INSERT INTO products (name, description, price_usd, price_bdt, cost_price_usd, custom_price_usd, api_stock, is_active, is_external, external_id, provider_emoji_id) VALUES (?, ?, ?, ?, ?, 0, ?, 1, 1, ?, ?)")
          .bind(name, desc, finalPrice, priceBdt, baseCostPrice, apiStock, extId, emojiId).run();
        targetId = ins.meta ? ins.meta.last_row_id : null;
      }

      // Restock Alert for Pre-orders
      if (prevStock === 0 && apiStock > 0 && targetId) {
        await notifyPreorders(env, targetId, name, apiStock);
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

    if (targetExternalId === null) {
      await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_external_sync_time', ?)").bind(String(Date.now())).run();
      if (snapshot?.items === items) { snapshot.appliedRate = configuredRate; snapshot.appliedMargin = configuredMargin; }
    }
    return { success: true, message: `Successfully connected! Imported & updated <b>${importedCount} products</b> with live stock and pricing.` };
  } catch (err) {
    return { success: false, message: `Error connecting to API: ${err.message}` };
  }
}

async function dispatchExternalOrder(env, prod, quantity, orderId) {
  try {
    let baseUrl = (await getSetting(env, "external_api_url", "https://207-148-64-141.sslip.io")).trim().replace(/\/+$/, "");
    if (baseUrl.includes("/api/reseller")) baseUrl = baseUrl.split("/api/reseller")[0];
    const apiKey = await getSetting(env, "external_api_key", "");
    if (!apiKey) return { success: false, message: "External API Key is not set." };

    const vexorixOrderUrl = `${baseUrl}/api/reseller/orders`;
    const vResp = await fetch(vexorixOrderUrl, {
      method: "POST",
      headers: { "X-Reseller-Key": apiKey, "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({ product_id: String(prod.external_id), quantity, external_order_id: `shop-${orderId}-${Date.now().toString(36)}` })
    });

    if (vResp.ok || vResp.status === 201 || vResp.status === 200) {
      const resData = await vResp.json();
      providerCatalogCache.delete(env.DB);
      const items = Array.isArray(resData.items) ? resData.items : [];
      const delivered = items.filter(item => typeof item.content === "string" && item.content.trim());
      if (delivered.length < quantity || (resData.status && !["completed", "success", "delivered"].includes(String(resData.status).toLowerCase()))) {
        return { success: false, externalOrderId: String(resData.order_id || ""), message: "Provider order accepted but product delivery is not confirmed." };
      }
      const credentials = delivered.map(item => item.content).join("\n\n");
      return { success: true, externalOrderId: String(resData.order_id || ""), credentials, message: "Delivered via Provider API." };
    }
    return { success: false, message: `API status ${vResp.status}` };
  } catch (err) { return { success: false, message: err.message }; }
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

    await env.DB.prepare("UPDATE users SET balance_usd = balance_usd + ?, balance_bdt = balance_bdt + ? WHERE user_id = ?").bind(commissionUsd, commissionBdt, referrerId).run();
    await sendMsg(env, referrerId, `🎉 <b>Referral Commission Received!</b>\n\nYour referred friend completed a purchase of <b>${productName}</b>!\n💰 Added: <b>+$${commissionUsd.toFixed(2)} USD (≈ ৳${commissionBdt} BDT)</b> (${commPct}% commission) to your wallet balance.`);
  } catch (e) { console.error("Referral Commission Error:", e); }
}

async function notifyPreorders(env, productId, productName, stockCount) {
  try {
    const { results: pendingPreorders } = await env.DB.prepare("SELECT * FROM preorders WHERE product_id = ? AND status = 'pending'").bind(productId).all();
    if (pendingPreorders && pendingPreorders.length > 0) {
      for (const po of pendingPreorders) {
        await sendMsg(env, po.user_id, `🔔 <b>Good News! Pre-Ordered Product Restocked!</b>\n\nProduct: <b>${productName}</b>\n⚡ Available Stock: <b>${stockCount} items</b>\n\nTap below to complete your order:`, [
          [{ text: `🛍️ Buy ${productName} Now`, callback_data: `prod_${productId}` }],
          [{ text: "🛒 Open Shop", callback_data: "shop" }]
        ]);
      }
      await env.DB.prepare("UPDATE preorders SET status = 'notified' WHERE product_id = ? AND status = 'pending'").bind(productId).run();
    }
  } catch (e) { console.error("notifyPreorders Error:", e); }
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
async function sendHomeDashboard(env, chatId, user, firstName, editMessageId = null) {
  const usdBal = user ? (user.balance_usd || 0).toFixed(2) : "0.00";
  const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
  const bdtBal = user ? Math.round((user.balance_usd || 0) * rate) : 0;

  const welcome = `🛒 <b>Welcome to SMART SUBS STORE!</b>\n\n` +
    `Hello ${escapeHtml(firstName)}! 👋\n\n` +
    `We offer high-quality digital products and software licenses with fast, secure, and automated delivery.\n\n` +
    `<blockquote>🛒 <b>Shop</b> — Browse & buy products\n` +
    `💰 <b>Deposit</b> — Add funds to your wallet\n` +
    `👤 <b>Profile</b> — View wallet balance & orders</blockquote>\n\n` +
    `💰 <b>Wallet Balance:</b> $${usdBal} USD (≈ ৳${bdtBal} BDT)\n\n` +
    `Select an option below to continue:`;

  const keyboard = [
    [{ text: "🛒 Shop", callback_data: "shop" }],
    [{ text: "👤 Profile", callback_data: "profile" }, { text: "💰 Deposit", callback_data: "deposit" }],
    [{ text: "📦 Orders", callback_data: "my_orders" }, { text: "⏳ Pre-Orders", callback_data: "my_preorders" }],
    [{ text: "👥 Refer & Earn", callback_data: "refer" }]
  ];
  if (String(chatId) === String(env.ADMIN_ID)) keyboard.push([{ text: "👑 Admin Panel", callback_data: "admin_panel" }]);

  if (editMessageId) {
    const res = await editMsg(env, chatId, editMessageId, welcome, keyboard);
    if (res && res.ok) return res;
  }
  return await sendMsg(env, chatId, welcome, keyboard);
}

async function sendProductsDirectly(env, chatId, editMessageId = null, forceFresh = false) {
  try {
    await ensureDbReady(env.DB);

    // Reuse a recent browsing result; explicit Refresh still fetches the provider.
    const stockSync = await syncExternalProducts(env, null, null, false, null, forceFresh);

    // Defensively query products
    let prods = [];
    try {
      const q = await env.DB.prepare(
        `SELECT p.*, CASE WHEN p.is_external = 1 THEN COALESCE(p.api_stock, 0) ELSE (SELECT COUNT(*) FROM inventory i WHERE i.product_id = p.id AND i.is_sold = 0) END as stock_qty FROM products p WHERE p.is_active = 1 ORDER BY p.id ASC`
      ).all();
      prods = q && q.results ? q.results : [];
    } catch (dbErr) {
      console.error("Products query error, falling back:", dbErr);
      const q = await env.DB.prepare("SELECT * FROM products WHERE is_active = 1 ORDER BY id ASC").all();
      prods = q && q.results ? q.results : [];
    }

    const keyboard = [];
    if (prods && prods.length > 0) {
      prods.forEach(prod => {
        const verified = !(prod.is_external && !stockSync.success);
        keyboard.push([productListButton(prod, `prod_${prod.id}`, verified)]);
      });
    }

    keyboard.push([
      { text: "🔄 Refresh Stock", callback_data: "shop_refresh" },
      { text: "🏠 Main Menu", callback_data: "home" }
    ]);

    let text = "";
    if (!prods || prods.length === 0) {
      text = `🛍️ <b>Store Products</b>\n\n⚠️ Currently no products are available in the store.\n\nPlease check back later or contact admin @fojlaybd.`;
    } else {
      text = `🛍️ <b>Available Products</b>\n\n<i>Click any product below to view details and order:</i>`;
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
      // Keep Refresh available without offering checkout on stale stock.
    } else if (stockCount > 0) {
      buttons.push([{ text: "🛍️ Buy Now", callback_data: `buynow_${prod.id}_1` }]);
    } else {
      buttons.push([{ text: "⏳ Pre-Order Now", callback_data: `preorder_${prod.id}` }]);
    }
    buttons.push([
      { text: "🔄 Refresh Stock", callback_data: `prod_refresh_${prod.id}` },
      { text: "◀️ Back to Shop", callback_data: "shop" }
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
    if (!prod) return;
    if (prod.is_external === 1) prod = await fetchLiveProductStock(env, prod, false);
    if (!await checkExternalStock(env, chatId, prod, quantity)) return;

    const user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
    const userBal = user ? (user.balance_usd || 0) : 0;
    const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));

    const qty = quantity > 0 ? quantity : 1;
    const unitPrice = Number(prod.price_usd);
    const totalPrice = Number((unitPrice * qty).toFixed(2));
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
        ? `✅ <b>Wallet balance is sufficient for this order!</b>`
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
    return await sendMsg(env, chatId, previewText, keypad);
  } catch (err) {
    console.error("sendOrderPreview error:", err);
    await sendMsg(env, chatId, `⚠️ Error loading order preview: ${escapeHtml(err.message)}`);
  }
}

async function sendDeposit(env, chatId, editMessageId = null) {
  const user = await env.DB.prepare("SELECT * FROM users WHERE user_id = ?").bind(chatId).first();
  const usdBal = user ? (user.balance_usd || 0).toFixed(2) : "0.00";
  const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
  const bdtBal = user ? Math.round((user.balance_usd || 0) * rate) : 0;

  const text = `💳 <b>Deposit Funds to Wallet</b>\n\n` +
    `Current Wallet Balance: <b>$${usdBal} USD (≈ ৳${bdtBal} BDT)</b>\n` +
    `Current Rate: <b>1 USD = ${rate} BDT</b>\n\n` +
    `Select a payment method below to get deposit instructions:`;

  const buttons = [
    [{ text: "Binance Pay (Auto)", callback_data: "dep_method_binance" }],
    [{ text: "🔵 BEP20 USDT (Auto)", callback_data: "dep_method_bep20" }],
    [{ text: "🟢 bKash", callback_data: "dep_method_bkash" }],
    [{ text: "🟠 Nagad", callback_data: "dep_method_nagad" }],
    [{ text: "🟣 Rocket", callback_data: "dep_method_rocket" }],
    [{ text: "🎁 Redeem Code", callback_data: "redeem_open" }],
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
  const usdBal = user ? (user.balance_usd || 0).toFixed(2) : "0.00";
  const rate = parseFloat(await getSetting(env, "usd_to_bdt_rate", "125"));
  const bdtBal = user ? Math.round((user.balance_usd || 0) * rate) : 0;

  const profileText = `👤 <b>Customer Profile & Wallet</b>\n\n` +
    `🆔 <b>User ID:</b> <code>${chatId}</code>\n` +
    `👤 <b>Name:</b> ${user ? user.first_name : "Customer"}\n\n` +
    `💰 <b>Available Wallet Balance:</b>\n` +
    `• USD: <b>$${usdBal} USD</b>\n` +
    `• BDT: <b>≈ ৳${bdtBal} BDT</b>\n\n` +
    `📊 <b>Account Statistics:</b>\n` +
    `• Total Spent: <b>$${(user ? user.total_spent_usd || 0 : 0).toFixed(2)} USD</b>\n` +
    `• Total Invited Friends: <b>${user ? user.total_referrals : 0} members</b>`;

  const buttons = [
    [{ text: "💳 Deposit Funds", callback_data: "deposit" }],
    [{ text: "📦 Order History", callback_data: "my_orders" }, { text: "⏳ My Pre-Orders", callback_data: "my_preorders" }],
    [{ text: "👥 Refer & Earn", callback_data: "refer" }],
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

async function sendOrders(env, chatId, editMessageId = null) {
  const { results } = await env.DB.prepare("SELECT o.*, p.name as product_name, i.item_data FROM orders o JOIN products p ON o.product_id = p.id LEFT JOIN inventory i ON o.id = i.order_id WHERE o.user_id = ? AND o.status = 'completed' ORDER BY o.id DESC LIMIT 5").bind(chatId).all();
  let orderText = `📦 <b>Your Completed Orders:</b>\n\n`;
  if (!results || results.length === 0) orderText += `You have not completed any purchases yet.`;
  else results.forEach(o => { orderText += `🔹 <b>${o.product_name}</b>\nOrder: #${o.id} | Quantity: ${o.quantity || 1} | Amount: $${o.amount_usd} USD\nCredentials: <code>${o.item_data || o.trx_id || "Delivered"}</code>\n\n`; });
  const buttons = [[{ text: "◀️ Main Menu", callback_data: "home" }]];
  if (editMessageId) await editMsg(env, chatId, editMessageId, orderText, buttons);
  else await sendMsg(env, chatId, orderText, buttons);
}

async function sendRefer(env, chatId, user, editMessageId = null) {
  const botInfo = await callTg(env, "getMe", {});
  const botUsername = botInfo.result ? botInfo.result.username : "bot";
  const refLink = `https://t.me/${botUsername}?start=ref_${chatId}`;
  const commPct = await getSetting(env, "referral_commission_percent", "5");

  const refText = `👥 <b>Refer & Earn Program</b>\n\n` +
    `Invite friends and earn <b>${commPct}% instant wallet commission</b> whenever your invited friend purchases any product!\n\n` +
    `🔗 <b>Your Personal Referral Link:</b>\n<code>${refLink}</code>\n\n` +
    `📊 <b>Your Statistics:</b>\n• Total Referred Members: <b>${user ? user.total_referrals : 0} members</b>\n• Commission Rate: <b>${commPct}% on all purchases</b>`;

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
    [{ text: "💬 Chat with Support Admin", url: `https://t.me/${cleanUsername}` }],
    [{ text: "◀️ Main Menu", callback_data: "home" }]
  ];
  if (editMessageId) await editMsg(env, chatId, editMessageId, supText, buttons);
  else await sendMsg(env, chatId, supText, buttons);
}
